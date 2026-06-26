//go:build autopipe
// +build autopipe

package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	benchmarkSliceCacheTTL      = 7 * 24 * time.Hour
	benchmarkSitemapDBTTL       = 12 * time.Hour
)

var (
	benchmarkDBReadyOnce sync.Once
	benchmarkDBReadyVal  bool
)

func benchmarkNewID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func benchmarkURLHash(canonicalURL string) string {
	sum := sha256.Sum256([]byte(canonicalURL))
	return hex.EncodeToString(sum[:])
}

func canonicalBenchmarkURL(target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return target
	}
	if !strings.HasSuffix(target, "/") {
		target += "/"
	}
	return target
}

func benchmarkContentHash(pageProps map[string]interface{}) string {
	b, err := json.Marshal(pageProps)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func benchmarkCountDataPoints(pp map[string]interface{}) int {
	if pp == nil {
		return 0
	}
	keys := []string{"section1Data", "section2Data", "section3Data", "section4Data", "section5Data"}
	n := 0
	for _, key := range keys {
		sec, ok := pp[key].(map[string]interface{})
		if !ok {
			continue
		}
		for _, raw := range sec {
			metric, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			data, ok := metric["data"].([]interface{})
			if ok {
				n += len(data)
			}
		}
	}
	return n
}

func benchmarkSectionsMask(pp map[string]interface{}) string {
	if pp == nil {
		return ""
	}
	type pair struct {
		key string
		id  string
	}
	pairs := []pair{
		{"section1Data", "trends"},
		{"section2Data", "performance"},
		{"section3Data", "top_countries"},
		{"section4Data", "change"},
		{"section5Data", "extra"},
	}
	var parts []string
	for _, p := range pairs {
		sec, ok := pp[p.key].(map[string]interface{})
		if ok && len(sec) > 0 {
			parts = append(parts, p.id)
		}
	}
	return strings.Join(parts, ",")
}

func (r *Runner) benchmarkDBReady() bool {
	benchmarkDBReadyOnce.Do(func() {
		if r.DB == nil {
			benchmarkDBReadyVal = false
			return
		}
		var one int
		err := r.DB.QueryRow(`SELECT 1 FROM benchmark_slices LIMIT 1`).Scan(&one)
		benchmarkDBReadyVal = err == nil
		if err != nil {
			log.Printf("benchmark: MySQL tables not ready (create benchmark_* tables in DB): %v", err)
		}
	})
	return benchmarkDBReadyVal
}

type benchmarkSitemapMeta struct {
	LoadedAt  time.Time
	ExpiresAt time.Time
	Count     int
	Source    string
}

func (r *Runner) benchmarkSitemapMetaFromDB() (benchmarkSitemapMeta, bool) {
	if !r.benchmarkDBReady() {
		return benchmarkSitemapMeta{}, false
	}
	var count int
	err := r.DB.QueryRow(`SELECT COUNT(*) FROM benchmark_slices WHERE is_active = 1`).Scan(&count)
	if err != nil || count == 0 {
		return benchmarkSitemapMeta{}, false
	}

	var finishedAt sql.NullTime
	var sitemapCount sql.NullInt64
	_ = r.DB.QueryRow(`
		SELECT finished_at, sitemap_count
		FROM benchmark_sync_runs
		WHERE status = 'success'
		ORDER BY finished_at DESC
		LIMIT 1
	`).Scan(&finishedAt, &sitemapCount)

	loadedAt := time.Now().UTC()
	if finishedAt.Valid {
		loadedAt = finishedAt.Time
	}
	expiresAt := loadedAt.Add(benchmarkSitemapDBTTL)
	return benchmarkSitemapMeta{LoadedAt: loadedAt, ExpiresAt: expiresAt, Count: count, Source: "db"}, true
}

func (r *Runner) benchmarkIsSitemapDBFresh() bool {
	meta, ok := r.benchmarkSitemapMetaFromDB()
	if !ok {
		return false
	}
	return time.Now().Before(meta.ExpiresAt)
}

func (r *Runner) benchmarkLoadSlicesFromDB() ([]benchmarkURLItem, error) {
	rows, err := r.DB.Query(`
		SELECT url, category, sub_category, sub_sub_category, country, media_type
		FROM benchmark_slices
		WHERE is_active = 1
		ORDER BY category, sub_category, country, media_type
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]benchmarkURLItem, 0, 4096)
	for rows.Next() {
		var it benchmarkURLItem
		var subSub sql.NullString
		if err := rows.Scan(&it.URL, &it.Category, &it.SubCategory, &subSub, &it.Country, &it.MediaType); err != nil {
			return nil, err
		}
		if subSub.Valid {
			it.SubSubCategory = subSub.String
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *Runner) benchmarkStartSyncRun(trigger string) (string, error) {
	if trigger == "" {
		trigger = "manual"
	}
	id := benchmarkNewID()
	_, err := r.DB.Exec(`
		INSERT INTO benchmark_sync_runs (id, trigger_type, status, started_at)
		VALUES (?, ?, 'running', UTC_TIMESTAMP())
	`, id, trigger)
	return id, err
}

func (r *Runner) benchmarkFinishSyncRun(id, status string, sitemapCount int, errMsg string) error {
	var msg interface{}
	if strings.TrimSpace(errMsg) != "" {
		msg = errMsg
	}
	_, err := r.DB.Exec(`
		UPDATE benchmark_sync_runs
		SET status = ?, sitemap_count = ?, error_message = ?, finished_at = UTC_TIMESTAMP()
		WHERE id = ?
	`, status, sitemapCount, msg, id)
	return err
}

func (r *Runner) benchmarkPersistSitemap(items []benchmarkURLItem, syncRunID string) error {
	if !r.benchmarkDBReady() {
		return fmt.Errorf("benchmark tables not ready")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `UPDATE benchmark_slices SET is_active = 0`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO benchmark_slices (
			url, url_hash, category, sub_category, sub_sub_category, country, media_type,
			is_active, sync_run_id, first_seen_at, last_seen_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE
			category = VALUES(category),
			sub_category = VALUES(sub_category),
			sub_sub_category = VALUES(sub_sub_category),
			country = VALUES(country),
			media_type = VALUES(media_type),
			is_active = 1,
			sync_run_id = VALUES(sync_run_id),
			last_seen_at = UTC_TIMESTAMP()
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, it := range items {
		url := canonicalBenchmarkURL(it.URL)
		var subSub interface{}
		if strings.TrimSpace(it.SubSubCategory) != "" {
			subSub = it.SubSubCategory
		}
		if _, err := stmt.ExecContext(ctx,
			url,
			benchmarkURLHash(url),
			it.Category,
			it.SubCategory,
			subSub,
			it.Country,
			it.MediaType,
			syncRunID,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *Runner) benchmarkPersistSitemapAsync(items []benchmarkURLItem, trigger string) {
	go func() {
		syncID, err := r.benchmarkStartSyncRun(trigger)
		if err != nil {
			log.Printf("benchmark: start sync run: %v", err)
			return
		}
		if err := r.benchmarkPersistSitemap(items, syncID); err != nil {
			_ = r.benchmarkFinishSyncRun(syncID, "failed", len(items), err.Error())
			log.Printf("benchmark: persist sitemap: %v", err)
			return
		}
		_ = r.benchmarkFinishSyncRun(syncID, "success", len(items), "")
		log.Printf("benchmark: sitemap persisted to MySQL (%d slices, run %s)", len(items), syncID)
	}()
}

func (r *Runner) benchmarkMemorySetSitemap(items []benchmarkURLItem, meta benchmarkSitemapMeta) {
	benchmarkSitemapData = &benchmarkSitemapCache{
		Items:     items,
		LoadedAt:  meta.LoadedAt,
		ExpiresAt: meta.ExpiresAt,
	}
}

// loadBenchmarkSitemapWithStore memory → Redis → MySQL → upstream (force clears cache)
func (r *Runner) loadBenchmarkSitemapWithStore(force bool) ([]benchmarkURLItem, benchmarkSitemapMeta, error) {
	benchmarkSitemapMu.Lock()
	defer benchmarkSitemapMu.Unlock()

	if force {
		benchmarkSitemapData = nil
		r.benchmarkRedisInvalidateSitemap()
	}

	if !force && benchmarkSitemapData != nil && time.Now().Before(benchmarkSitemapData.ExpiresAt) {
		meta := benchmarkSitemapMeta{
			LoadedAt:  benchmarkSitemapData.LoadedAt,
			ExpiresAt: benchmarkSitemapData.ExpiresAt,
			Count:     len(benchmarkSitemapData.Items),
			Source:    "memory",
		}
		return benchmarkSitemapData.Items, meta, nil
	}

	if !force {
		if items, meta, ok := r.benchmarkRedisGetSitemap(); ok {
			r.benchmarkMemorySetSitemap(items, meta)
			log.Printf("benchmark sitemap from Redis: %d urls", len(items))
			return items, meta, nil
		}
	}

	if !force && r.benchmarkDBReady() && r.benchmarkIsSitemapDBFresh() {
		items, err := r.benchmarkLoadSlicesFromDB()
		if err == nil && len(items) > 0 {
			dbMeta, _ := r.benchmarkSitemapMetaFromDB()
			dbMeta.Source = "db"
			dbMeta.Count = len(items)
			r.benchmarkMemorySetSitemap(items, dbMeta)
			r.benchmarkRedisSetSitemap(items, dbMeta)
			log.Printf("benchmark sitemap from MySQL: %d urls (expires %s)", len(items), dbMeta.ExpiresAt.Format(time.RFC3339))
			return items, dbMeta, nil
		}
		if err != nil {
			log.Printf("benchmark: load sitemap from db: %v", err)
		}
	}

	items, meta, err := r.loadBenchmarkSitemapUpstreamCoalesced(force)
	if err != nil {
		if !force {
			if staleItems, staleMeta, ok := r.benchmarkRedisGetSitemap(); ok {
				staleMeta.Source = "redis-stale"
				r.benchmarkMemorySetSitemap(staleItems, staleMeta)
				log.Printf("benchmark: upstream failed, serving stale Redis sitemap (%d)", len(staleItems))
				return staleItems, staleMeta, nil
			}
			if r.benchmarkDBReady() {
				if stale, staleErr := r.benchmarkLoadSlicesFromDB(); staleErr == nil && len(stale) > 0 {
					dbMeta, _ := r.benchmarkSitemapMetaFromDB()
					dbMeta.Source = "db-stale"
					dbMeta.Count = len(stale)
					r.benchmarkMemorySetSitemap(stale, dbMeta)
					log.Printf("benchmark: upstream failed, serving stale MySQL sitemap (%d)", len(stale))
					return stale, dbMeta, nil
				}
			}
		}
		return nil, benchmarkSitemapMeta{}, err
	}

	r.benchmarkRedisSetSitemap(items, meta)
	if r.benchmarkDBReady() {
		r.benchmarkPersistSitemapAsync(items, map[bool]string{true: "manual", false: "sitemap_only"}[force])
	}

	return items, meta, nil
}

// loadBenchmarkSitemapUpstreamCoalesced Redis lock coalesces upstream fetches across instances
func (r *Runner) loadBenchmarkSitemapUpstreamCoalesced(force bool) ([]benchmarkURLItem, benchmarkSitemapMeta, error) {
	if r.benchmarkRedisOK() {
		if !r.benchmarkRedisTryLock(benchmarkRedisSitemapLockKey, benchmarkRedisSitemapLockTTL) {
			if !force {
				if items, meta, ok := r.benchmarkRedisWaitSitemap(90 * time.Second); ok {
					meta.Source = "redis"
					r.benchmarkMemorySetSitemap(items, meta)
					return items, meta, nil
				}
			}
		} else {
			defer r.benchmarkRedisUnlock(benchmarkRedisSitemapLockKey)
			if !force {
				if items, meta, ok := r.benchmarkRedisGetSitemap(); ok {
					r.benchmarkMemorySetSitemap(items, meta)
					return items, meta, nil
				}
			}
		}
	}

	items, err := loadBenchmarkSitemapUpstream()
	if err != nil {
		return nil, benchmarkSitemapMeta{}, err
	}
	meta := benchmarkSitemapMeta{
		LoadedAt:  benchmarkSitemapData.LoadedAt,
		ExpiresAt: benchmarkSitemapData.ExpiresAt,
		Count:     len(items),
		Source:    "upstream",
	}
	// write Redis before releasing refresh_lock so waiters see data
	r.benchmarkRedisSetSitemap(items, meta)
	return items, meta, nil
}

// loadBenchmarkSitemapUpstream fetch from AppsFlyer only; update in-memory cache (legacy loadBenchmarkSitemap)
func loadBenchmarkSitemapUpstream() ([]benchmarkURLItem, error) {
	idxBody, idxStatus, err := benchmarkHTTPGet(benchmarkSitemapIndex)
	if err != nil {
		return nil, fmt.Errorf("fetch sitemap_index: %w", err)
	}
	if idxStatus != http.StatusOK {
		return nil, fmt.Errorf("fetch sitemap_index: upstream status %d", idxStatus)
	}

	var index benchmarkSitemapIndexXML
	if err := xml.Unmarshal(idxBody, &index); err != nil {
		return nil, fmt.Errorf("parse sitemap_index: %w", err)
	}

	items := make([]benchmarkURLItem, 0, 8000)
	seen := make(map[string]struct{}, 8000)

	for _, sm := range index.Sitemaps {
		if sm.Loc == "" {
			continue
		}
		body, status, err := benchmarkHTTPGet(sm.Loc)
		if err != nil || status != http.StatusOK {
			log.Printf("benchmark sitemap %s err=%v status=%d", sm.Loc, err, status)
			continue
		}
		var smXML benchmarkSitemapXML
		if err := xml.Unmarshal(body, &smXML); err != nil {
			log.Printf("benchmark sitemap %s parse err=%v", sm.Loc, err)
			continue
		}
		for _, u := range smXML.URLs {
			it := parseBenchmarkURL(u.Loc)
			if it == nil {
				continue
			}
			if _, ok := seen[it.URL]; ok {
				continue
			}
			seen[it.URL] = struct{}{}
			items = append(items, *it)
		}
	}

	now := time.Now()
	benchmarkSitemapData = &benchmarkSitemapCache{
		Items:     items,
		LoadedAt:  now,
		ExpiresAt: now.Add(benchmarkSitemapTTL),
	}
	log.Printf("benchmark sitemap loaded from upstream: %d urls, cache until %s", len(items), benchmarkSitemapData.ExpiresAt.Format(time.RFC3339))
	return items, nil
}

func (r *Runner) benchmarkGetCachedPagePropsMySQL(canonicalURL string) (map[string]interface{}, bool, error) {
	if !r.benchmarkDBReady() {
		return nil, false, nil
	}
	var raw []byte
	err := r.DB.QueryRow(`
		SELECT page_props
		FROM benchmark_slice_cache
		WHERE url = ? AND expires_at > UTC_TIMESTAMP()
	`, canonicalURL).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	var pp map[string]interface{}
	if err := json.Unmarshal(raw, &pp); err != nil {
		return nil, false, err
	}

	go func(url string) {
		_, _ = r.DB.Exec(`UPDATE benchmark_slice_cache SET hit_count = hit_count + 1 WHERE url = ?`, url)
	}(canonicalURL)
	return pp, true, nil
}

// benchmarkGetSliceFromCaches Redis → MySQL; backfill Redis on MySQL hit
func (r *Runner) benchmarkGetSliceFromCaches(canonicalURL string) (map[string]interface{}, bool, string) {
	if pp, ok := r.benchmarkRedisGetSlice(canonicalURL); ok {
		return pp, true, "redis"
	}
	pp, ok, err := r.benchmarkGetCachedPagePropsMySQL(canonicalURL)
	if err != nil {
		log.Printf("benchmark: slice mysql read: %v", err)
		return nil, false, ""
	}
	if ok {
		r.benchmarkRedisSetSlice(canonicalURL, pp)
		return pp, true, "mysql"
	}
	return nil, false, ""
}

func (r *Runner) benchmarkPutCachedPageProps(canonicalURL string, pp map[string]interface{}) error {
	if !r.benchmarkDBReady() || pp == nil {
		return nil
	}
	raw, err := json.Marshal(pp)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	expires := now.Add(benchmarkSliceCacheTTL)
	hash := benchmarkContentHash(pp)
	points := benchmarkCountDataPoints(pp)
	mask := benchmarkSectionsMask(pp)

	_, err = r.DB.Exec(`
		INSERT INTO benchmark_slice_cache (
			url, content_hash, page_props, point_count, sections_mask,
			source_fetched_at, expires_at, hit_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
		ON DUPLICATE KEY UPDATE
			content_hash = VALUES(content_hash),
			page_props = VALUES(page_props),
			point_count = VALUES(point_count),
			sections_mask = VALUES(sections_mask),
			source_fetched_at = VALUES(source_fetched_at),
			expires_at = VALUES(expires_at),
			updated_at = UTC_TIMESTAMP()
	`, canonicalURL, nullIfEmpty(hash), raw, points, nullIfEmpty(mask), now, expires)
	return err
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (r *Runner) benchmarkInvalidateSliceCaches(canonicalURL string) {
	r.benchmarkRedisInvalidateSlice(canonicalURL)
	if r.benchmarkDBReady() {
		_, _ = r.DB.Exec(`DELETE FROM benchmark_slice_cache WHERE url = ?`, canonicalURL)
	}
}

func (r *Runner) benchmarkPutSliceToCaches(canonicalURL string, pp map[string]interface{}) {
	r.benchmarkRedisSetSlice(canonicalURL, pp)
	if err := r.benchmarkPutCachedPageProps(canonicalURL, pp); err != nil {
		log.Printf("benchmark: slice mysql write: %v", err)
	}
}

func (r *Runner) fetchBenchmarkPageWithStore(force bool, targetURL string) (map[string]interface{}, bool, string, error) {
	canonical := canonicalBenchmarkURL(targetURL)
	if !force {
		if pp, ok, layer := r.benchmarkGetSliceFromCaches(canonical); ok {
			return pp, true, layer, nil
		}
	} else {
		r.benchmarkInvalidateSliceCaches(canonical)
	}

	lockKey := benchmarkRedisSliceLockKey(canonical)
	if r.benchmarkRedisOK() {
		if !r.benchmarkRedisTryLock(lockKey, benchmarkRedisSliceLockTTL) {
			deadline := time.Now().Add(benchmarkFetchTimeout + 5*time.Second)
			for time.Now().Before(deadline) {
				if pp, ok, layer := r.benchmarkGetSliceFromCaches(canonical); ok {
					return pp, true, layer, nil
				}
				time.Sleep(60 * time.Millisecond)
			}
		} else {
			defer r.benchmarkRedisUnlock(lockKey)
			if !force {
				if pp, ok, layer := r.benchmarkGetSliceFromCaches(canonical); ok {
					return pp, true, layer, nil
				}
			}
		}
	}

	pp, err := fetchBenchmarkPage(targetURL)
	if err != nil {
		return nil, false, "", err
	}
	r.benchmarkPutSliceToCaches(canonical, pp)
	return pp, false, "upstream", nil
}

func (r *Runner) benchmarkRecordExport(exportID, userID, label, filePath string, sliceCount int, manifest interface{}) error {
	if !r.benchmarkDBReady() || exportID == "" || userID == "" {
		return nil
	}
	var manifestJSON interface{}
	if manifest != nil {
		b, err := json.Marshal(manifest)
		if err != nil {
			return err
		}
		manifestJSON = string(b)
	}
	_, err := r.DB.Exec(`
		INSERT INTO benchmark_exports (export_id, created_by, label, slice_count, file_path, manifest, created_at)
		VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE
			file_path = VALUES(file_path),
			slice_count = VALUES(slice_count),
			manifest = VALUES(manifest)
	`, exportID, userID, nullIfEmpty(label), sliceCount, filePath, manifestJSON)
	return err
}

func countBenchmarkExportSlices(files []benchmarkExportFile) int {
	n := 0
	for _, f := range files {
		if strings.HasPrefix(f.Path, "slices/") && strings.HasSuffix(f.Path, "/summary.json") {
			n++
		}
	}
	return n
}

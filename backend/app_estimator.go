//go:build autopipe
// +build autopipe

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	appEstimatorDBEnv = "APP_ESTIMATOR_DB_PATH"
)

var (
	appEstimatorDBOnce sync.Once
	appEstimatorDB     *sql.DB
	appEstimatorDBErr  error
	appEstimatorIconCache sync.Map
)

func appEstimatorDBPath() string {
	return strings.TrimSpace(os.Getenv(appEstimatorDBEnv))
}

func getAppEstimatorDB() (*sql.DB, error) {
	appEstimatorDBOnce.Do(func() {
		path := appEstimatorDBPath()
		abs, err := filepath.Abs(path)
		if err != nil {
			appEstimatorDBErr = fmt.Errorf("resolve db path: %w", err)
			return
		}
		if _, err := os.Stat(abs); err != nil {
			appEstimatorDBErr = fmt.Errorf("app estimator db not found at %s: %w", abs, err)
			return
		}
		dsn := fmt.Sprintf("file:%s?mode=ro", filepath.ToSlash(abs))
		db, err := sql.Open("sqlite", dsn)
		if err != nil {
			appEstimatorDBErr = fmt.Errorf("open sqlite: %w", err)
			return
		}
		db.SetMaxOpenConns(4)
		db.SetMaxIdleConns(2)
		if err := db.Ping(); err != nil {
			_ = db.Close()
			appEstimatorDBErr = fmt.Errorf("ping sqlite: %w", err)
			return
		}
		appEstimatorDB = db
		log.Printf("app estimator sqlite ready: %s", abs)
	})
	return appEstimatorDB, appEstimatorDBErr
}

func appEstimatorWriteError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}

func appEstimatorPagination(req *http.Request) (page, pageSize, offset int) {
	page = 1
	pageSize = 50
	if p := strings.TrimSpace(req.URL.Query().Get("page")); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}
	if ps := strings.TrimSpace(req.URL.Query().Get("pageSize")); ps != "" {
		if n, err := strconv.Atoi(ps); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			pageSize = n
		}
	}
	offset = (page - 1) * pageSize
	return page, pageSize, offset
}

func appEstimatorTableCount(db *sql.DB, table string) int {
	var n int
	if err := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&n); err != nil {
		return 0
	}
	return n
}

// GET /api/app-estimator/health — no auth; for nginx / ops probes
func (r *Runner) getAppEstimatorHealthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"status":  "unavailable",
			"error":   err.Error(),
			"dbPath":  appEstimatorDBPath(),
		})
		return
	}
	var n int
	_ = db.QueryRow("SELECT COUNT(*) FROM rating_snapshots").Scan(&n)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  "ok",
		"dbPath":  appEstimatorDBPath(),
		"snapshots": n,
	})
}

// GET /api/app-estimator/overview
func (r *Runner) getAppEstimatorOverviewHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	path := appEstimatorDBPath()
	abs, _ := filepath.Abs(path)
	var dbSize int64
	if st, err := os.Stat(abs); err == nil {
		dbSize = st.Size()
	}

	counts := map[string]int{
		"apps":                   appEstimatorTableCount(db, "apps"),
		"rating_snapshots":       appEstimatorTableCount(db, "rating_snapshots"),
		"snapshot_quality_flags": appEstimatorTableCount(db, "snapshot_quality_flags"),
		"rating_velocity":        appEstimatorTableCount(db, "rating_velocity"),
		"traindate_benchmarks":   appEstimatorTableCount(db, "traindate_benchmarks"),
		"k_calibration":          appEstimatorTableCount(db, "k_calibration"),
		"download_estimates":     appEstimatorTableCount(db, "download_estimates"),
	}

	ranges := map[string]interface{}{}
	type dateRange struct {
		Min string `json:"min"`
		Max string `json:"max"`
	}
	var dr dateRange
	if err := db.QueryRow(`SELECT MIN(snapshot_date), MAX(snapshot_date) FROM rating_snapshots`).Scan(&dr.Min, &dr.Max); err == nil {
		ranges["snapshots"] = dr
	}
	if err := db.QueryRow(`SELECT MIN(as_of_date), MAX(as_of_date) FROM rating_velocity`).Scan(&dr.Min, &dr.Max); err == nil {
		ranges["velocity"] = dr
	}
	if err := db.QueryRow(`SELECT MIN(report_start), MAX(report_end) FROM traindate_benchmarks`).Scan(&dr.Min, &dr.Max); err == nil {
		ranges["benchmarks"] = dr
	}
	if err := db.QueryRow(`SELECT MIN(estimate_date), MAX(estimate_date) FROM download_estimates`).Scan(&dr.Min, &dr.Max); err == nil {
		ranges["estimates"] = dr
	}

	platforms := []string{}
	rows, err := db.Query(`SELECT DISTINCT platform FROM rating_snapshots WHERE platform != '' ORDER BY platform`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil {
				platforms = append(platforms, p)
			}
		}
	}

	countries := []string{}
	rows2, err := db.Query(`SELECT DISTINCT country FROM rating_snapshots WHERE country != '' ORDER BY country LIMIT 300`)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var c string
			if rows2.Scan(&c) == nil {
				countries = append(countries, c)
			}
		}
	}

	sourceQualities := []string{}
	rows3, err := db.Query(`SELECT DISTINCT source_quality FROM v_latest_snapshots WHERE source_quality != '' ORDER BY source_quality`)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var q string
			if rows3.Scan(&q) == nil {
				sourceQualities = append(sourceQualities, q)
			}
		}
	}

	var distinctApps int
	_ = db.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT DISTINCT platform, app_id, package, bundle
			FROM rating_snapshots
			WHERE app_id != '' OR package != ''
		)`).Scan(&distinctApps)

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":         true,
		"dbPath":          abs,
		"dbSizeBytes":     dbSize,
		"loadedAt":        time.Now().UTC().Format(time.RFC3339),
		"counts":          counts,
		"ranges":          ranges,
		"platforms":       platforms,
		"countries":       countries,
		"sourceQualities": sourceQualities,
		"distinctApps":    distinctApps,
		"pipeline":        appEstimatorGetPipelineStatus(),
	})
}

// appEstimatorMetaJoin attaches traindate app_name (data.ai display name) to snapshot/velocity rows.
const appEstimatorMetaJoin = `
LEFT JOIN (
  SELECT platform, app_id, package, bundle, MAX(app_name) AS app_name
  FROM traindate_benchmarks
  WHERE app_name IS NOT NULL AND TRIM(app_name) != ''
  GROUP BY platform, app_id, package, bundle
) app_meta ON app_meta.platform = s.platform
  AND app_meta.app_id = s.app_id
  AND app_meta.package = s.package
  AND app_meta.bundle = s.bundle`

const appEstimatorMetaJoinEst = `
LEFT JOIN (
  SELECT platform, app_id, package, bundle, MAX(app_name) AS app_name
  FROM traindate_benchmarks
  WHERE app_name IS NOT NULL AND TRIM(app_name) != ''
  GROUP BY platform, app_id, package, bundle
) app_meta ON app_meta.platform = e.platform
  AND app_meta.app_id = e.app_id
  AND app_meta.package = e.package
  AND app_meta.bundle = e.bundle`

func appEstimatorBuildWhereAliased(alias, platform, country, search string, includeAppName bool, cols ...string) (string, []interface{}) {
	var parts []string
	var args []interface{}
	colPrefix := ""
	if alias != "" {
		colPrefix = alias + "."
	}
	if platform != "" {
		parts = append(parts, colPrefix+"platform = ?")
		args = append(args, platform)
	}
	if country != "" {
		parts = append(parts, colPrefix+"country = ?")
		args = append(args, country)
	}
	if search != "" {
		like := "%" + strings.ReplaceAll(strings.ReplaceAll(search, "%", ""), "_", "") + "%"
		var ors []string
		for _, col := range cols {
			ors = append(ors, colPrefix+col+" LIKE ?")
			args = append(args, like)
		}
		if includeAppName {
			ors = append(ors, "app_meta.app_name LIKE ?")
			args = append(args, like)
		}
		if len(ors) > 0 {
			parts = append(parts, "("+strings.Join(ors, " OR ")+")")
		}
	}
	if len(parts) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(parts, " AND "), args
}

func appEstimatorStoreURL(platform, pkg, bundle, sourceURL string) string {
	if strings.TrimSpace(sourceURL) != "" {
		return strings.TrimSpace(sourceURL)
	}
	if strings.TrimSpace(pkg) != "" {
		return "https://play.google.com/store/apps/details?id=" + url.QueryEscape(strings.TrimSpace(pkg))
	}
	if strings.TrimSpace(bundle) != "" && strings.EqualFold(strings.TrimSpace(platform), "ios") {
		return "https://apps.apple.com/app/" + url.PathEscape(strings.TrimSpace(bundle))
	}
	return ""
}

func appEstimatorIconURL(storeURL string) string {
	if storeURL == "" {
		return ""
	}
	return "https://icon.horse/icon/" + url.QueryEscape(storeURL)
}

func appEstimatorLookupIconURL(mysqlDB *sql.DB, platform, pkg, bundle, appID string) string {
	if mysqlDB == nil {
		return ""
	}
	cacheKey := strings.Join([]string{platform, pkg, bundle, appID}, "|")
	if cached, ok := appEstimatorIconCache.Load(cacheKey); ok {
		return cached.(string)
	}

	candidates := make([]string, 0, 3)
	seen := map[string]struct{}{}
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		candidates = append(candidates, v)
	}
	add(pkg)
	add(bundle)
	add(appID)

	iconURL := ""
	for _, id := range candidates {
		var icon sql.NullString
		err := mysqlDB.QueryRow(`
			SELECT icon_url
			FROM apps_finder
			WHERE app_id = ? AND icon_url IS NOT NULL AND TRIM(icon_url) != ''
			LIMIT 1`, id).Scan(&icon)
		if err == nil && icon.Valid {
			iconURL = strings.TrimSpace(icon.String)
			break
		}
	}

	appEstimatorIconCache.Store(cacheKey, iconURL)
	return iconURL
}

func appEstimatorApplyDisplayMeta(item map[string]interface{}, platform, pkg, bundle, appName, sourceURL, appID string, mysqlDB *sql.DB) {
	item["appName"] = strings.TrimSpace(appName)
	storeURL := appEstimatorStoreURL(platform, pkg, bundle, sourceURL)
	item["storeUrl"] = storeURL

	iconURL := appEstimatorLookupIconURL(mysqlDB, platform, pkg, bundle, appID)
	if iconURL == "" {
		iconURL = appEstimatorIconURL(storeURL)
	}
	item["iconUrl"] = iconURL
}

// GET /api/app-estimator/snapshots
func (r *Runner) getAppEstimatorSnapshotsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	search := strings.TrimSpace(req.URL.Query().Get("search"))
	sourceQuality := strings.TrimSpace(req.URL.Query().Get("sourceQuality"))
	page, pageSize, offset := appEstimatorPagination(req)

	where, args := appEstimatorBuildWhereAliased("s", platform, country, search, true, "app_id", "package", "bundle")
	if sourceQuality != "" {
		if where == "" {
			where = " WHERE s.source_quality = ?"
		} else {
			where += " AND s.source_quality = ?"
		}
		args = append(args, sourceQuality)
	}

	var total int
	countQ := "SELECT COUNT(*) FROM v_latest_snapshots s" + appEstimatorMetaJoin + where
	if err := db.QueryRow(countQ, args...).Scan(&total); err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	q := `SELECT s.platform, s.app_id, s.package, s.bundle, s.country, s.rating_count, s.avg_rating,
	             s.snapshot_date, s.source_url, s.source_quality, s.collected_at,
	             COALESCE(app_meta.app_name, '') AS app_name
	      FROM v_latest_snapshots s` + appEstimatorMetaJoin + where + `
	      ORDER BY s.rating_count DESC
	      LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var platform, appID, pkg, bundle, country, snapDate, sourceURL, sourceQuality, collectedAt, appName sql.NullString
		var ratingCount sql.NullInt64
		var avgRating sql.NullFloat64
		if err := rows.Scan(&platform, &appID, &pkg, &bundle, &country, &ratingCount, &avgRating,
			&snapDate, &sourceURL, &sourceQuality, &collectedAt, &appName); err != nil {
			continue
		}
		item := map[string]interface{}{
			"platform":       platform.String,
			"appId":          appID.String,
			"package":        pkg.String,
			"bundle":         bundle.String,
			"country":        country.String,
			"ratingCount":    ratingCount.Int64,
			"avgRating":      avgRating.Float64,
			"snapshotDate":   snapDate.String,
			"sourceUrl":      sourceURL.String,
			"sourceQuality":  sourceQuality.String,
			"collectedAt":    collectedAt.String,
		}
		appEstimatorApplyDisplayMeta(item, platform.String, pkg.String, bundle.String, appName.String, sourceURL.String, appID.String, r.DB)
		items = append(items, item)
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"items":    items,
	})
}

// GET /api/app-estimator/snapshots/history?platform=&appId=&country=
func (r *Runner) getAppEstimatorSnapshotHistoryHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	appID := strings.TrimSpace(req.URL.Query().Get("appId"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	if platform == "" || country == "" {
		appEstimatorWriteError(w, http.StatusBadRequest, "platform and country are required")
		return
	}

	q := `SELECT snapshot_date, rating_count, avg_rating, source_quality, collected_at
	      FROM rating_snapshots
	      WHERE platform = ? AND country = ?`
	args := []interface{}{platform, country}
	if appID != "" {
		q += " AND app_id = ?"
		args = append(args, appID)
	} else if pkg := strings.TrimSpace(req.URL.Query().Get("package")); pkg != "" {
		q += " AND package = ?"
		args = append(args, pkg)
	}
	q += " ORDER BY snapshot_date ASC LIMIT 500"

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var snapDate, sourceQuality, collectedAt sql.NullString
		var ratingCount sql.NullInt64
		var avgRating sql.NullFloat64
		if err := rows.Scan(&snapDate, &ratingCount, &avgRating, &sourceQuality, &collectedAt); err != nil {
			continue
		}
		items = append(items, map[string]interface{}{
			"snapshotDate":  snapDate.String,
			"ratingCount":   ratingCount.Int64,
			"avgRating":     avgRating.Float64,
			"sourceQuality": sourceQuality.String,
			"collectedAt":   collectedAt.String,
		})
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"items":   items,
	})
}

// GET /api/app-estimator/velocity
func (r *Runner) getAppEstimatorVelocityHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	search := strings.TrimSpace(req.URL.Query().Get("search"))
	confidence := strings.TrimSpace(req.URL.Query().Get("confidence"))
	calcMethod := strings.TrimSpace(req.URL.Query().Get("calcMethod"))
	if calcMethod == "" {
		calcMethod = "adjacent"
	}
	page, pageSize, offset := appEstimatorPagination(req)

	whereParts := []string{"s.calc_method = ?"}
	args := []interface{}{calcMethod}
	if platform != "" {
		whereParts = append(whereParts, "s.platform = ?")
		args = append(args, platform)
	}
	if country != "" {
		whereParts = append(whereParts, "s.country = ?")
		args = append(args, country)
	}
	if confidence != "" {
		whereParts = append(whereParts, "s.confidence = ?")
		args = append(args, confidence)
	}
	if search != "" {
		like := "%" + strings.ReplaceAll(strings.ReplaceAll(search, "%", ""), "_", "") + "%"
		whereParts = append(whereParts, "(s.app_id LIKE ? OR s.package LIKE ? OR s.bundle LIKE ? OR app_meta.app_name LIKE ?)")
		args = append(args, like, like, like, like)
	}
	where := " WHERE " + strings.Join(whereParts, " AND ")

	var total int
	if err := db.QueryRow("SELECT COUNT(*) FROM v_latest_velocity s"+appEstimatorMetaJoin+where, args...).Scan(&total); err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	q := `SELECT s.platform, s.app_id, s.package, s.bundle, s.country, s.as_of_date, s.previous_date,
	             s.current_rating_count, s.previous_rating_count, s.delta_ratings, s.snapshot_days,
	             s.rating_velocity_daily, s.confidence, s.confidence_score, s.calc_method, s.created_at,
	             COALESCE(app_meta.app_name, '') AS app_name
	      FROM v_latest_velocity s` + appEstimatorMetaJoin + where + `
	      ORDER BY s.rating_velocity_daily DESC
	      LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var platform, appID, pkg, bundle, country, asOf, prev, confidence, calcMethodVal, createdAt, appName sql.NullString
		var curCount, prevCount, delta, snapDays sql.NullInt64
		var velocity, confScore sql.NullFloat64
		if err := rows.Scan(&platform, &appID, &pkg, &bundle, &country, &asOf, &prev,
			&curCount, &prevCount, &delta, &snapDays, &velocity, &confidence, &confScore, &calcMethodVal, &createdAt, &appName); err != nil {
			continue
		}
		item := map[string]interface{}{
			"platform":             platform.String,
			"appId":                appID.String,
			"package":              pkg.String,
			"bundle":               bundle.String,
			"country":              country.String,
			"asOfDate":             asOf.String,
			"previousDate":         prev.String,
			"currentRatingCount":   curCount.Int64,
			"previousRatingCount":  prevCount.Int64,
			"deltaRatings":         delta.Int64,
			"snapshotDays":         snapDays.Int64,
			"ratingVelocityDaily":  velocity.Float64,
			"confidence":           confidence.String,
			"confidenceScore":      confScore.Float64,
			"calcMethod":           calcMethodVal.String,
			"createdAt":            createdAt.String,
		}
		appEstimatorApplyDisplayMeta(item, platform.String, pkg.String, bundle.String, appName.String, "", appID.String, r.DB)
		items = append(items, item)
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"items":    items,
	})
}

// GET /api/app-estimator/benchmarks
func (r *Runner) getAppEstimatorBenchmarksHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	category := strings.TrimSpace(req.URL.Query().Get("category"))
	search := strings.TrimSpace(req.URL.Query().Get("search"))
	page, pageSize, offset := appEstimatorPagination(req)

	whereParts := []string{"1=1"}
	args := []interface{}{}
	if platform != "" {
		whereParts = append(whereParts, "platform = ?")
		args = append(args, platform)
	}
	if country != "" {
		whereParts = append(whereParts, "country = ?")
		args = append(args, country)
	}
	if category != "" {
		whereParts = append(whereParts, "(category_name = ? OR category = ?)")
		args = append(args, category, category)
	}
	if search != "" {
		like := "%" + strings.ReplaceAll(strings.ReplaceAll(search, "%", ""), "_", "") + "%"
		whereParts = append(whereParts, "(app_name LIKE ? OR app_id LIKE ? OR package LIKE ? OR bundle LIKE ?)")
		args = append(args, like, like, like, like)
	}
	where := " WHERE " + strings.Join(whereParts, " AND ")

	var total int
	if err := db.QueryRow("SELECT COUNT(*) FROM traindate_benchmarks"+where, args...).Scan(&total); err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	q := `SELECT country, app_id, app_name, bundle, package, platform, category, category_name,
	             downloads, report_start, report_end, source_file, imported_at
	      FROM traindate_benchmarks` + where + `
	      ORDER BY downloads DESC
	      LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var country, appID, appName, bundle, pkg, platform, category, categoryName, reportStart, reportEnd, sourceFile, importedAt sql.NullString
		var downloads sql.NullInt64
		if err := rows.Scan(&country, &appID, &appName, &bundle, &pkg, &platform, &category, &categoryName,
			&downloads, &reportStart, &reportEnd, &sourceFile, &importedAt); err != nil {
			continue
		}
		item := map[string]interface{}{
			"country":      country.String,
			"appId":        appID.String,
			"appName":      appName.String,
			"bundle":       bundle.String,
			"package":      pkg.String,
			"platform":     platform.String,
			"category":     category.String,
			"categoryName": categoryName.String,
			"downloads":    downloads.Int64,
			"reportStart":  reportStart.String,
			"reportEnd":    reportEnd.String,
			"sourceFile":   sourceFile.String,
			"importedAt":   importedAt.String,
		}
		appEstimatorApplyDisplayMeta(item, platform.String, pkg.String, bundle.String, appName.String, "", appID.String, r.DB)
		items = append(items, item)
	}

	categories := []string{}
	cRows, err := db.Query(`SELECT DISTINCT category_name FROM traindate_benchmarks WHERE category_name != '' ORDER BY category_name LIMIT 200`)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var c string
			if cRows.Scan(&c) == nil {
				categories = append(categories, c)
			}
		}
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"items":      items,
		"categories": categories,
	})
}

// GET /api/app-estimator/estimates
func (r *Runner) getAppEstimatorEstimatesHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	search := strings.TrimSpace(req.URL.Query().Get("search"))
	latestOnly := strings.TrimSpace(req.URL.Query().Get("latestOnly")) != "false"
	page, pageSize, offset := appEstimatorPagination(req)

	where, args := appEstimatorBuildWhereAliased("e", platform, country, search, true, "app_id", "package", "bundle")
	if latestOnly {
		if where == "" {
			where = " WHERE e.estimate_date = (SELECT MAX(estimate_date) FROM download_estimates)"
		} else {
			where += " AND e.estimate_date = (SELECT MAX(estimate_date) FROM download_estimates)"
		}
	}

	var total int
	if err := db.QueryRow("SELECT COUNT(*) FROM download_estimates e"+appEstimatorMetaJoinEst+where, args...).Scan(&total); err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	q := `SELECT e.estimate_date, e.platform, e.app_id, e.package, e.bundle, e.country, e.category, e.rank,
	             e.total_ratings, e.delta_ratings, e.rating_velocity_daily, e.k_base, e.maturity_beta,
	             e.regional_m, e.est_monthly_downloads, e.est_daily_downloads, e.confidence,
	             e.methodology, e.benchmark_waterline, e.model_version, e.created_at,
	             COALESCE(app_meta.app_name, '') AS app_name
	      FROM download_estimates e` + appEstimatorMetaJoinEst + where + `
	      ORDER BY e.est_monthly_downloads DESC
	      LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var estDate, platform, appID, pkg, bundle, country, category, confidence, methodology, modelVersion, createdAt, appName sql.NullString
		var rank, totalRatings, estMonthly, estDaily sql.NullInt64
		var deltaRatings, velocity, kBase, maturityBeta, regionalM, benchmarkWaterline sql.NullFloat64
		if err := rows.Scan(&estDate, &platform, &appID, &pkg, &bundle, &country, &category, &rank,
			&totalRatings, &deltaRatings, &velocity, &kBase, &maturityBeta, &regionalM,
			&estMonthly, &estDaily, &confidence, &methodology, &benchmarkWaterline, &modelVersion, &createdAt, &appName); err != nil {
			continue
		}
		item := map[string]interface{}{
			"estimateDate":         estDate.String,
			"platform":             platform.String,
			"appId":                appID.String,
			"package":              pkg.String,
			"bundle":               bundle.String,
			"country":              country.String,
			"category":             category.String,
			"rank":                 rank.Int64,
			"totalRatings":         totalRatings.Int64,
			"deltaRatings":         deltaRatings.Float64,
			"ratingVelocityDaily":  velocity.Float64,
			"kBase":                kBase.Float64,
			"maturityBeta":         maturityBeta.Float64,
			"regionalM":            regionalM.Float64,
			"estMonthlyDownloads":  estMonthly.Int64,
			"estDailyDownloads":    estDaily.Int64,
			"confidence":           confidence.String,
			"methodology":          methodology.String,
			"benchmarkWaterline":   benchmarkWaterline.Float64,
			"modelVersion":         modelVersion.String,
			"createdAt":            createdAt.String,
		}
		appEstimatorApplyDisplayMeta(item, platform.String, pkg.String, bundle.String, appName.String, "", appID.String, r.DB)
		items = append(items, item)
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"items":    items,
	})
}

// GET /api/app-estimator/calibration
func (r *Runner) getAppEstimatorCalibrationHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	db, err := getAppEstimatorDB()
	if err != nil {
		appEstimatorWriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	platform := strings.TrimSpace(req.URL.Query().Get("platform"))
	country := strings.TrimSpace(req.URL.Query().Get("country"))
	category := strings.TrimSpace(req.URL.Query().Get("category"))
	page, pageSize, offset := appEstimatorPagination(req)

	whereParts := []string{"1=1"}
	args := []interface{}{}
	if platform != "" {
		whereParts = append(whereParts, "platform = ?")
		args = append(args, platform)
	}
	if country != "" {
		whereParts = append(whereParts, "country = ?")
		args = append(args, country)
	}
	if category != "" {
		whereParts = append(whereParts, "category = ?")
		args = append(args, category)
	}
	where := " WHERE " + strings.Join(whereParts, " AND ")

	var total int
	if err := db.QueryRow("SELECT COUNT(*) FROM k_calibration"+where, args...).Scan(&total); err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	q := `SELECT platform, category, country, effective_k, sample_count, mape, p50_error, updated_at
	      FROM k_calibration` + where + `
	      ORDER BY sample_count DESC
	      LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.Query(q, args...)
	if err != nil {
		appEstimatorWriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var platform, category, country, updatedAt sql.NullString
		var sampleCount sql.NullInt64
		var effectiveK, mape, p50 sql.NullFloat64
		if err := rows.Scan(&platform, &category, &country, &effectiveK, &sampleCount, &mape, &p50, &updatedAt); err != nil {
			continue
		}
		items = append(items, map[string]interface{}{
			"platform":     platform.String,
			"category":     category.String,
			"country":      country.String,
			"effectiveK":   effectiveK.Float64,
			"sampleCount":  sampleCount.Int64,
			"mape":         mape.Float64,
			"p50Error":     p50.Float64,
			"updatedAt":    updatedAt.String,
		})
	}

	categoryWhereParts := []string{"category != ''"}
	categoryArgs := []interface{}{}
	if platform != "" {
		categoryWhereParts = append(categoryWhereParts, "platform = ?")
		categoryArgs = append(categoryArgs, platform)
	}
	if country != "" {
		categoryWhereParts = append(categoryWhereParts, "country = ?")
		categoryArgs = append(categoryArgs, country)
	}
	categoryRows, err := db.Query(
		"SELECT DISTINCT category FROM k_calibration WHERE " + strings.Join(categoryWhereParts, " AND ") + " ORDER BY category LIMIT 400",
		categoryArgs...,
	)
	categories := []string{}
	if err == nil {
		defer categoryRows.Close()
		for categoryRows.Next() {
			var c sql.NullString
			if scanErr := categoryRows.Scan(&c); scanErr == nil && strings.TrimSpace(c.String) != "" {
				categories = append(categories, c.String)
			}
		}
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
		"items":    items,
		"categories": categories,
	})
}

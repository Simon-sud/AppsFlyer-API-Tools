//go:build autopipe
// +build autopipe

package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	benchmarkRedisPrefix          = "autopipe:benchmark:"
	benchmarkRedisSitemapKey      = benchmarkRedisPrefix + "sitemap:v1"
	benchmarkRedisSitemapLockKey  = benchmarkRedisPrefix + "sitemap:refresh_lock"
	benchmarkRedisSliceKeyPrefix  = benchmarkRedisPrefix + "slice:v1:"
	benchmarkRedisSliceLockPrefix = benchmarkRedisPrefix + "slice:lock:v1:"

	benchmarkRedisOpTimeout       = 250 * time.Millisecond
	benchmarkRedisSitemapLockTTL  = 3 * time.Minute
	benchmarkRedisSliceLockTTL    = 35 * time.Second
	benchmarkRedisSitemapStaleWin = 30 * time.Minute
	benchmarkRedisSliceStaleWin   = 12 * time.Hour
)

type benchmarkRedisSitemapPayload struct {
	Items     []benchmarkURLItem `json:"items"`
	LoadedAt  int64              `json:"loadedAt"`
	ExpiresAt int64              `json:"expiresAt"`
}

type benchmarkRedisSlicePayload struct {
	PageProps   json.RawMessage `json:"pageProps"`
	ContentHash string          `json:"contentHash,omitempty"`
	CachedAt    int64           `json:"cachedAt"`
}

type benchmarkRedisBlob struct {
	Encoding string `json:"encoding"`
	Body     string `json:"body"`
}

func (r *Runner) benchmarkRedisOK() bool {
	return r != nil && r.Redis != nil
}

func benchmarkRedisCtx(timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = benchmarkRedisOpTimeout
	}
	return context.WithTimeout(context.Background(), timeout)
}

func encodeBenchmarkRedisBlob(raw []byte) benchmarkRedisBlob {
	body, enc := compressDashboardBody(string(raw))
	return benchmarkRedisBlob{Encoding: enc, Body: body}
}

func decodeBenchmarkRedisBlob(blob benchmarkRedisBlob) ([]byte, error) {
	if blob.Body == "" {
		return nil, errors.New("empty redis blob")
	}
	switch blob.Encoding {
	case "", "identity":
		return []byte(blob.Body), nil
	case "gzip+base64":
		return decodeDashboardBody(dashboardCachePayload{
			Body:         blob.Body,
			BodyEncoding: blob.Encoding,
		})
	default:
		return nil, errors.New("unknown benchmark redis encoding")
	}
}

func (r *Runner) benchmarkRedisGetJSON(key string, dest interface{}) (bool, error) {
	if !r.benchmarkRedisOK() {
		return false, nil
	}
	ctx, cancel := benchmarkRedisCtx(benchmarkRedisOpTimeout)
	defer cancel()
	cached, err := r.Redis.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return false, nil
		}
		return false, err
	}
	var blob benchmarkRedisBlob
	if err := json.Unmarshal([]byte(cached), &blob); err != nil {
		return false, err
	}
	raw, err := decodeBenchmarkRedisBlob(blob)
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (r *Runner) benchmarkRedisSetJSON(key string, value interface{}, ttl, staleWindow time.Duration) error {
	if !r.benchmarkRedisOK() {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	blob, err := json.Marshal(encodeBenchmarkRedisBlob(raw))
	if err != nil {
		return err
	}
	expire := dashboardCacheTTLWithJitter(ttl, staleWindow, key)
	ctx, cancel := benchmarkRedisCtx(benchmarkRedisOpTimeout)
	defer cancel()
	return r.Redis.Set(ctx, key, blob, expire).Err()
}

func (r *Runner) benchmarkRedisDel(keys ...string) {
	if !r.benchmarkRedisOK() || len(keys) == 0 {
		return
	}
	ctx, cancel := benchmarkRedisCtx(benchmarkRedisOpTimeout)
	defer cancel()
	_ = r.Redis.Del(ctx, keys...).Err()
}

func (r *Runner) benchmarkRedisTryLock(lockKey string, ttl time.Duration) bool {
	if !r.benchmarkRedisOK() {
		return true
	}
	ctx, cancel := benchmarkRedisCtx(benchmarkRedisOpTimeout)
	defer cancel()
	ok, err := r.Redis.SetNX(ctx, lockKey, "1", ttl).Result()
	return err == nil && ok
}

func (r *Runner) benchmarkRedisUnlock(lockKey string) {
	if !r.benchmarkRedisOK() {
		return
	}
	ctx, cancel := benchmarkRedisCtx(benchmarkRedisOpTimeout)
	defer cancel()
	_ = r.Redis.Del(ctx, lockKey).Err()
}

func (r *Runner) benchmarkRedisGetSitemap() ([]benchmarkURLItem, benchmarkSitemapMeta, bool) {
	var payload benchmarkRedisSitemapPayload
	ok, err := r.benchmarkRedisGetJSON(benchmarkRedisSitemapKey, &payload)
	if err != nil {
		log.Printf("benchmark redis sitemap get: %v", err)
		return nil, benchmarkSitemapMeta{}, false
	}
	if !ok || len(payload.Items) == 0 {
		return nil, benchmarkSitemapMeta{}, false
	}
	now := time.Now().Unix()
	if payload.ExpiresAt > 0 && now > payload.ExpiresAt {
		r.benchmarkRedisDel(benchmarkRedisSitemapKey)
		return nil, benchmarkSitemapMeta{}, false
	}
	meta := benchmarkSitemapMeta{
		LoadedAt:  time.Unix(payload.LoadedAt, 0),
		ExpiresAt: time.Unix(payload.ExpiresAt, 0),
		Count:     len(payload.Items),
		Source:    "redis",
	}
	if payload.LoadedAt == 0 {
		meta.LoadedAt = time.Now()
	}
	if payload.ExpiresAt == 0 {
		meta.ExpiresAt = meta.LoadedAt.Add(benchmarkSitemapDBTTL)
	}
	return payload.Items, meta, true
}

func (r *Runner) benchmarkRedisSetSitemap(items []benchmarkURLItem, meta benchmarkSitemapMeta) {
	if len(items) == 0 {
		return
	}
	if meta.ExpiresAt.IsZero() {
		meta.ExpiresAt = meta.LoadedAt.Add(benchmarkSitemapDBTTL)
	}
	if meta.LoadedAt.IsZero() {
		meta.LoadedAt = time.Now()
	}
	payload := benchmarkRedisSitemapPayload{
		Items:     items,
		LoadedAt:  meta.LoadedAt.Unix(),
		ExpiresAt: meta.ExpiresAt.Unix(),
	}
	ttl := time.Until(meta.ExpiresAt)
	if ttl < time.Minute {
		ttl = benchmarkSitemapDBTTL
	}
	if err := r.benchmarkRedisSetJSON(benchmarkRedisSitemapKey, payload, ttl, benchmarkRedisSitemapStaleWin); err != nil {
		log.Printf("benchmark redis sitemap set: %v", err)
	}
}

func (r *Runner) benchmarkRedisInvalidateSitemap() {
	r.benchmarkRedisDel(benchmarkRedisSitemapKey)
}

func (r *Runner) benchmarkRedisWaitSitemap(maxWait time.Duration) ([]benchmarkURLItem, benchmarkSitemapMeta, bool) {
	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		if items, meta, ok := r.benchmarkRedisGetSitemap(); ok {
			return items, meta, true
		}
		time.Sleep(80 * time.Millisecond)
	}
	return nil, benchmarkSitemapMeta{}, false
}

func benchmarkRedisSliceKey(canonicalURL string) string {
	return benchmarkRedisSliceKeyPrefix + benchmarkURLHash(canonicalURL)
}

func benchmarkRedisSliceLockKey(canonicalURL string) string {
	return benchmarkRedisSliceLockPrefix + benchmarkURLHash(canonicalURL)
}

func (r *Runner) benchmarkRedisGetSlice(canonicalURL string) (map[string]interface{}, bool) {
	var payload benchmarkRedisSlicePayload
	ok, err := r.benchmarkRedisGetJSON(benchmarkRedisSliceKey(canonicalURL), &payload)
	if err != nil {
		log.Printf("benchmark redis slice get: %v", err)
		return nil, false
	}
	if !ok || len(payload.PageProps) == 0 {
		return nil, false
	}
	var pp map[string]interface{}
	if err := json.Unmarshal(payload.PageProps, &pp); err != nil {
		return nil, false
	}
	return pp, true
}

func (r *Runner) benchmarkRedisSetSlice(canonicalURL string, pp map[string]interface{}) {
	if pp == nil {
		return
	}
	raw, err := json.Marshal(pp)
	if err != nil {
		return
	}
	payload := benchmarkRedisSlicePayload{
		PageProps:   raw,
		ContentHash: benchmarkContentHash(pp),
		CachedAt:    time.Now().Unix(),
	}
	if err := r.benchmarkRedisSetJSON(
		benchmarkRedisSliceKey(canonicalURL),
		payload,
		benchmarkSliceCacheTTL,
		benchmarkRedisSliceStaleWin,
	); err != nil {
		log.Printf("benchmark redis slice set: %v", err)
	}
}

func (r *Runner) benchmarkRedisInvalidateSlice(canonicalURL string) {
	r.benchmarkRedisDel(benchmarkRedisSliceKey(canonicalURL))
}

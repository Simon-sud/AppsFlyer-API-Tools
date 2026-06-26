//go:build autopipe
// +build autopipe

package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/xuri/excelize/v2"
)

// contextKey is custom type for context.WithValue; avoids built-in types as keys
type contextKey string

type dashboardCachePayload struct {
	StatusCode   int    `json:"status_code"`
	ContentType  string `json:"content_type"`
	Body         string `json:"body"`
	BodyEncoding string `json:"body_encoding,omitempty"` // identity or gzip+base64
	CachedAt     int64  `json:"cached_at"`
	FreshUntil   int64  `json:"fresh_until"` // Fresh-until time (SWR)
	StaleUntil   int64  `json:"stale_until"` // Stale-until time (SWR)
}

type captureResponseWriter struct {
	header     http.Header
	body       bytes.Buffer
	statusCode int
}

func newCaptureResponseWriter() *captureResponseWriter {
	return &captureResponseWriter{
		header: make(http.Header),
	}
}

func (w *captureResponseWriter) Header() http.Header {
	return w.header
}

func (w *captureResponseWriter) WriteHeader(statusCode int) {
	if w.statusCode == 0 {
		w.statusCode = statusCode
	}
}

func (w *captureResponseWriter) Write(p []byte) (int, error) {
	if w.statusCode == 0 {
		w.statusCode = http.StatusOK
	}
	return w.body.Write(p)
}

// TaskProgressBar wraps task progress; merges log output into one bar
type TaskProgressBar struct {
	taskID    string
	appID     string
	current   int
	max       int
	message   string
	startTime time.Time
	mu        sync.Mutex
}

// NewTaskProgressBar creates a new task progress bar
func NewTaskProgressBar(taskID, appID string) *TaskProgressBar {
	return &TaskProgressBar{
		taskID:    taskID,
		appID:     appID,
		current:   0,
		max:       100,
		message:   "Initializing...",
		startTime: time.Now(),
	}
}

// Update progress bar (0-100)
func (p *TaskProgressBar) Update(progress int, message string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}

	p.current = progress
	p.message = message

	// Compute elapsed time
	elapsed := time.Since(p.startTime)

	// Output unified progress bar format
	barWidth := 50
	filled := int(float64(barWidth) * float64(progress) / 100.0)
	empty := barWidth - filled

	bar := strings.Repeat("█", filled) + strings.Repeat("░", empty)

	// Unified progress bar output format
	// Safely truncate taskID (use full ID if shorter than 8)
	taskIDShort := p.taskID
	if len(taskIDShort) > 8 {
		taskIDShort = taskIDShort[:8]
	}
	log.Printf("[AutoPipe] [%s:%s] [%3d%%] %s | Elapsed: %v",
		taskIDShort,
		p.appID,
		progress,
		message,
		elapsed.Round(time.Second))

	// Log progress bar visual every 10% or at completion
	if progress%10 == 0 || progress == 100 {
		log.Printf("[AutoPipe] Progress Bar: [%s] %d%%", bar, progress)
	}
}

// Complete marks progress bar done
func (p *TaskProgressBar) Complete(message string) {
	p.Update(100, message)
	// Log final completion
	log.Printf("[AutoPipe] ✅ Task %s:%s completed successfully", p.taskID, p.appID)
}

// Simplified auth - user ID from request header

type Task struct {
	ID               string         `json:"id"`
	TaskID           string         `json:"task_id"`
	Type             string         `json:"type"`
	Status           string         `json:"status"`
	StartTime        sql.NullTime   `json:"start_time"`
	EndTime          sql.NullTime   `json:"end_time"`
	Duration         sql.NullString `json:"duration"`
	Description      string         `json:"description"`
	Priority         string         `json:"priority"`
	AccountID        string         `json:"account_id"`
	DataPointer      string         `json:"data_pointer"`
	AppType          string         `json:"app_type"`
	Progress         int            `json:"progress"`
	CreateTime       time.Time      `json:"create_time"`
	LatestUpdateTime time.Time      `json:"latest_update_time"`
	UserID           string         `json:"user_id"`
	APIToken         sql.NullString `json:"api_token"`
	TokenReqCount    int64          `json:"token_request_count"`
	TokenLastUsedAt  sql.NullTime   `json:"token_last_used_at"`
	TokenCreatedAt   sql.NullTime   `json:"token_created_at"`
}

type TaskSchedule struct {
	ID            string         `json:"id"`
	TaskID        string         `json:"task_id"`
	ScheduleType  string         `json:"schedule_type"`
	ExecutionTime sql.NullString `json:"execution_time"`
	ExecutionDate sql.NullTime   `json:"execution_date"`
	Timezone      string         `json:"timezone"`
	IsActive      bool           `json:"is_active"`
	NextExecution sql.NullTime   `json:"next_execution"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type TaskApp struct {
	ID        string          `json:"id"`
	TaskID    string          `json:"task_id"`
	AppID     string          `json:"app_id"`
	AppName   string          `json:"app_name"`
	IconURL   sql.NullString  `json:"icon_url"`
	OS        string          `json:"os"`
	Country   sql.NullString  `json:"country"`
	Category  sql.NullString  `json:"category"`
	Developer sql.NullString  `json:"developer"`
	Rating    sql.NullFloat64 `json:"rating"`
}

// TaskAppJSON app struct for JSON serialization
type TaskAppJSON struct {
	ID        string  `json:"id"`
	TaskID    string  `json:"task_id"`
	AppID     string  `json:"app_id"`
	AppName   string  `json:"app_name"`
	IconURL   string  `json:"icon_url"`
	OS        string  `json:"os"`
	Country   string  `json:"country"`
	Category  string  `json:"category"`
	Developer string  `json:"developer"`
	Rating    float64 `json:"rating"`
	Progress  int     `json:"progress"` // Per-app progress
}

// AppProgress stores live app progress
type AppProgress struct {
	TaskID   string `json:"task_id"`
	AppID    string `json:"app_id"`
	Progress int    `json:"progress"`
}

type DateRange struct {
	FromDate time.Time
	ToDate   time.Time
}

// Account config struct
type AccountConfig struct {
	ID          string
	AccountName string
	AccountType string
	APIToken    string
}

// CSV row map
type CSVRow map[string]string

type Runner struct {
	DB               *sql.DB
	Redis            *redis.Client
	JWTSecret        string // JWT secret for frontend direct requests
	lastTickUnix     atomic.Int64
	lastTaskCount    int            // Track last task count to reduce duplicate logs
	lastQueryParams  string         // Track last query params to reduce duplicate logs
	appProgressCache map[string]int // Cache per-app live progress taskID:appID -> progress
	progressMutex    sync.RWMutex   // RWMutex for progress cache
	cacheRefreshJobs sync.Map       // key => struct{} for in-process singleflight dedup
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func openDB() (*sql.DB, error) {
	host := getenv("DB_HOST", "127.0.0.1")
	user := getenv("DB_USER", "root")
	pass := getenv("DB_PASSWORD", "")
	name := getenv("DB_NAME", "appsflyer_rawdata")

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true&charset=utf8mb4&collation=utf8mb4_unicode_ci&loc=UTC", user, pass, host, name)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	return db, db.Ping()
}

// Auth middleware - JWT and X-User-ID header (Flask proxy backward compat)
func (r *Runner) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		var userID string
		var authErr error

		// Prefer X-User-ID header (Flask proxy, backward compat)
		userID = req.Header.Get("X-User-ID")
		if userID != "" {
			// Remove log output to reduce noise (enable for debug)
			// log.Printf("✓ Using user ID from X-User-ID header (Flask proxy): %s", userID)
		} else {
			// Validate JWT directly (frontend direct request, primary)
			userID, authErr = r.authenticateRequest(req)
			if authErr != nil {
				// Log auth failures only; silence success to reduce noise
				log.Printf("JWT authentication failed: %v", authErr)
				http.Error(w, `{"error":"Authentication failed"}`, http.StatusUnauthorized)
				return
			}
			// Remove success auth logs to reduce request noise
			// log.Printf("✓ Authenticated user via JWT: %s", userID)
		}

		// Store user_id in context
		ctx := context.WithValue(req.Context(), contextKey("user_id"), userID)
		next.ServeHTTP(w, req.WithContext(ctx))
	}
}

// superAdminMiddleware allows Super Admin only (must follow authMiddleware)
func (r *Runner) superAdminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		userID := getUserID(req)
		var role string
		if err := r.DB.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&role); err != nil || role != "Super Admin" {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"success":false,"error":"Super Admin required"}`, http.StatusForbidden)
			return
		}
		next(w, req)
	}
}

func copyHeaders(dst, src http.Header) {
	for key, values := range src {
		for _, v := range values {
			dst.Add(key, v)
		}
	}
}

func isNoCacheRequest(req *http.Request) bool {
	raw := strings.TrimSpace(strings.ToLower(req.URL.Query().Get("nocache")))
	if raw == "1" || raw == "true" || raw == "yes" {
		return true
	}
	forceHeader := strings.TrimSpace(strings.ToLower(req.Header.Get("X-Dashboard-Force-Refresh")))
	if forceHeader == "1" || forceHeader == "true" || forceHeader == "yes" {
		return true
	}
	autoPipeForceHeader := strings.TrimSpace(strings.ToLower(req.Header.Get("X-Autopipe-Force-Refresh")))
	return autoPipeForceHeader == "1" || autoPipeForceHeader == "true" || autoPipeForceHeader == "yes"
}

func dashboardTeamScopeKey(req *http.Request) string {
	teamID := strings.TrimSpace(req.Header.Get("X-Selected-Team-Id"))
	if teamID == "" {
		return "self"
	}
	return "team:" + teamID
}

const dashboardCacheGenerationKey = "autopipe:dashboard:data:generation"
const autopipeCacheGenerationPrefix = "autopipe:autopipe:data:generation:"

func (r *Runner) dashboardCacheGeneration() string {
	if r.Redis == nil {
		return "0"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	val, err := r.Redis.Get(ctx, dashboardCacheGenerationKey).Result()
	if err != nil || strings.TrimSpace(val) == "" {
		return "0"
	}
	return strings.TrimSpace(val)
}

func (r *Runner) bumpDashboardCacheGeneration(reason string) {
	if r.Redis == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	newVal, err := r.Redis.Incr(ctx, dashboardCacheGenerationKey).Result()
	if err != nil {
		log.Printf("[DashboardCache] bump generation failed (reason=%s): %v", reason, err)
		return
	}
	log.Printf("[DashboardCache] generation bumped to %d (reason=%s)", newVal, reason)
}

func (r *Runner) autopipeCacheGeneration(domain string) string {
	if r.Redis == nil {
		return "0"
	}
	key := autopipeCacheGenerationPrefix + domain
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	val, err := r.Redis.Get(ctx, key).Result()
	if err != nil || strings.TrimSpace(val) == "" {
		return "0"
	}
	return strings.TrimSpace(val)
}

func (r *Runner) bumpAutopipeCacheGeneration(domain, reason string) {
	if r.Redis == nil || strings.TrimSpace(domain) == "" {
		return
	}
	key := autopipeCacheGenerationPrefix + strings.TrimSpace(domain)
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	newVal, err := r.Redis.Incr(ctx, key).Result()
	if err != nil {
		log.Printf("[AutoPipeCache] bump generation failed (domain=%s reason=%s): %v", domain, reason, err)
		return
	}
	log.Printf("[AutoPipeCache] generation bumped domain=%s to %d (reason=%s)", domain, newVal, reason)
}

func (r *Runner) bumpAutopipeCacheGenerations(reason string, domains ...string) {
	seen := map[string]struct{}{}
	for _, d := range domains {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		if _, exists := seen[d]; exists {
			continue
		}
		seen[d] = struct{}{}
		r.bumpAutopipeCacheGeneration(d, reason)
	}
}

func shouldBypassAutopipeTasksCache(req *http.Request) bool {
	status := strings.TrimSpace(strings.ToLower(req.URL.Query().Get("status")))
	search := strings.TrimSpace(req.URL.Query().Get("search"))
	// tasks API used for progress polling and search; keep fresh by default.
	if status == "" || status == "all" || status == "running" {
		return true
	}
	if search != "" {
		return true
	}
	return false
}

func (r *Runner) autopipeCacheMiddleware(cacheNamespace, generationDomain string, ttl time.Duration, next http.HandlerFunc, bypassFn func(*http.Request) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet || r.Redis == nil {
			next(w, req)
			return
		}
		if bypassFn != nil && bypassFn(req) {
			w.Header().Set("X-AutoPipe-Cache", "BYPASS")
			next(w, req)
			return
		}
		if isNoCacheRequest(req) {
			w.Header().Set("X-AutoPipe-Cache", "BYPASS")
			next(w, req)
			return
		}

		userID, _ := req.Context().Value(contextKey("user_id")).(string)
		if userID == "" {
			next(w, req)
			return
		}

		canonicalQuery := canonicalDashboardQuery(req.URL.Query())
		teamScope := dashboardTeamScopeKey(req)
		generation := r.autopipeCacheGeneration(generationDomain)
		cacheKey := fmt.Sprintf("autopipe:autopipe:v1:%s:%s:%s:%s:%s?%s", cacheNamespace, userID, teamScope, generation, req.URL.Path, canonicalQuery)
		staleWindow := dashboardStaleWindow(ttl)

		if payload, ok := r.tryReadDashboardCache(cacheKey, 800*time.Millisecond); ok {
			now := time.Now().Unix()
			freshUntil := payload.FreshUntil
			if freshUntil == 0 {
				freshUntil = payload.CachedAt + int64(ttl.Seconds())
			}
			staleUntil := payload.StaleUntil
			if staleUntil == 0 {
				staleUntil = freshUntil + int64(staleWindow.Seconds())
			}
			if now <= freshUntil {
				if writeCachedPayloadResponse(w, payload, "X-AutoPipe-Cache", "HIT") {
					return
				}
			} else if now <= staleUntil {
				if writeCachedPayloadResponse(w, payload, "X-AutoPipe-Cache", "STALE") {
					go func() {
						if !r.startCacheRefreshJob(cacheKey) {
							return
						}
						defer r.finishCacheRefreshJob(cacheKey)
						if !r.tryAcquireDashboardRefreshLock(cacheKey) {
							return
						}
						defer r.releaseDashboardRefreshLock(cacheKey)

						refreshCtx := context.WithValue(context.Background(), contextKey("user_id"), userID)
						refreshReq := req.Clone(refreshCtx)
						recorder := newCaptureResponseWriter()
						next(recorder, refreshReq)

						statusCode := recorder.statusCode
						if statusCode == 0 {
							statusCode = http.StatusOK
						}
						payload := buildDashboardPayload(statusCode, recorder.header.Get("Content-Type"), recorder.body.String(), ttl, staleWindow)
						if !shouldCacheDashboardPayload(payload) {
							return
						}
						r.storeDashboardCache(cacheKey, payload, ttl, staleWindow)
					}()
					return
				}
			}
		}

		refreshLeader := r.startCacheRefreshJob(cacheKey)
		if !refreshLeader {
			if payload, ok := r.waitForDashboardCacheFill(cacheKey, 900*time.Millisecond); ok {
				if writeCachedPayloadResponse(w, payload, "X-AutoPipe-Cache", "HIT-WAIT") {
					return
				}
			}
		}

		holdRedisLock := false
		if refreshLeader {
			holdRedisLock = r.tryAcquireDashboardRefreshLock(cacheKey)
			defer func() {
				if holdRedisLock {
					r.releaseDashboardRefreshLock(cacheKey)
				}
				r.finishCacheRefreshJob(cacheKey)
			}()
		}

		recorder := newCaptureResponseWriter()
		next(recorder, req)

		copyHeaders(w.Header(), recorder.header)
		w.Header().Set("X-AutoPipe-Cache", "MISS")
		statusCode := recorder.statusCode
		if statusCode == 0 {
			statusCode = http.StatusOK
		}
		w.WriteHeader(statusCode)
		_, _ = w.Write(recorder.body.Bytes())

		if statusCode != http.StatusOK {
			return
		}
		payload := buildDashboardPayload(statusCode, recorder.header.Get("Content-Type"), recorder.body.String(), ttl, staleWindow)
		if !shouldCacheDashboardPayload(payload) {
			return
		}
		if refreshLeader && holdRedisLock {
			r.storeDashboardCache(cacheKey, payload, ttl, staleWindow)
		}
	}
}

func dashboardStaleWindow(ttl time.Duration) time.Duration {
	stale := ttl * 2
	if stale < 30*time.Second {
		stale = 30 * time.Second
	}
	return stale
}

func dashboardCacheTTLWithJitter(baseTTL, staleWindow time.Duration, key string) time.Duration {
	total := baseTTL + staleWindow
	if baseTTL <= 0 {
		return total
	}
	jitterSpan := time.Duration(float64(baseTTL) * 0.2)
	if jitterSpan <= 0 {
		return total
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	rangeSize := int64(jitterSpan)*2 + 1
	offset := time.Duration(int64(h.Sum32())%rangeSize) - jitterSpan
	ttl := total + offset
	minTTL := baseTTL + staleWindow/2
	if ttl < minTTL {
		return minTTL
	}
	return ttl
}

func compressDashboardBody(raw string) (body string, encoding string) {
	if len(raw) < 2*1024 {
		return raw, "identity"
	}
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write([]byte(raw)); err != nil {
		_ = zw.Close()
		return raw, "identity"
	}
	if err := zw.Close(); err != nil {
		return raw, "identity"
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), "gzip+base64"
}

func decodeDashboardBody(payload dashboardCachePayload) ([]byte, error) {
	switch strings.ToLower(strings.TrimSpace(payload.BodyEncoding)) {
	case "", "identity":
		return []byte(payload.Body), nil
	case "gzip+base64":
		raw, err := base64.StdEncoding.DecodeString(payload.Body)
		if err != nil {
			return nil, err
		}
		zr, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		defer zr.Close()
		return io.ReadAll(zr)
	default:
		return nil, fmt.Errorf("unsupported dashboard cache body encoding: %s", payload.BodyEncoding)
	}
}

func (r *Runner) startCacheRefreshJob(cacheKey string) bool {
	_, exists := r.cacheRefreshJobs.LoadOrStore(cacheKey, struct{}{})
	return !exists
}

func (r *Runner) finishCacheRefreshJob(cacheKey string) {
	r.cacheRefreshJobs.Delete(cacheKey)
}

func (r *Runner) tryAcquireDashboardRefreshLock(cacheKey string) bool {
	if r.Redis == nil {
		return true
	}
	lockKey := cacheKey + ":refresh_lock"
	ok, err := r.Redis.SetNX(context.Background(), lockKey, "1", 12*time.Second).Result()
	return err == nil && ok
}

func (r *Runner) releaseDashboardRefreshLock(cacheKey string) {
	if r.Redis == nil {
		return
	}
	lockKey := cacheKey + ":refresh_lock"
	_ = r.Redis.Del(context.Background(), lockKey).Err()
}

func (r *Runner) tryReadDashboardCache(cacheKey string, timeout time.Duration) (dashboardCachePayload, bool) {
	if r.Redis == nil {
		return dashboardCachePayload{}, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cached, err := r.Redis.Get(ctx, cacheKey).Result()
	if err != nil || cached == "" {
		return dashboardCachePayload{}, false
	}
	var payload dashboardCachePayload
	if jsonErr := json.Unmarshal([]byte(cached), &payload); jsonErr != nil {
		return dashboardCachePayload{}, false
	}
	return payload, true
}

func (r *Runner) waitForDashboardCacheFill(cacheKey string, maxWait time.Duration) (dashboardCachePayload, bool) {
	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		if payload, ok := r.tryReadDashboardCache(cacheKey, 120*time.Millisecond); ok {
			return payload, true
		}
		time.Sleep(80 * time.Millisecond)
	}
	return dashboardCachePayload{}, false
}

func buildDashboardPayload(statusCode int, contentType, body string, freshTTL, staleWindow time.Duration) dashboardCachePayload {
	if contentType == "" {
		contentType = "application/json"
	}
	encodedBody, bodyEncoding := compressDashboardBody(body)
	now := time.Now()
	return dashboardCachePayload{
		StatusCode:   statusCode,
		ContentType:  contentType,
		Body:         encodedBody,
		BodyEncoding: bodyEncoding,
		CachedAt:     now.Unix(),
		FreshUntil:   now.Add(freshTTL).Unix(),
		StaleUntil:   now.Add(freshTTL + staleWindow).Unix(),
	}
}

func (r *Runner) storeDashboardCache(cacheKey string, payload dashboardCachePayload, ttl, staleWindow time.Duration) {
	serialized, err := json.Marshal(payload)
	if err != nil {
		return
	}
	expire := dashboardCacheTTLWithJitter(ttl, staleWindow, cacheKey)
	_ = r.Redis.Set(context.Background(), cacheKey, serialized, expire).Err()
}

func writeCachedPayloadResponse(w http.ResponseWriter, payload dashboardCachePayload, headerName, cacheState string) bool {
	bodyBytes, err := decodeDashboardBody(payload)
	if err != nil {
		return false
	}
	if payload.ContentType != "" {
		w.Header().Set("Content-Type", payload.ContentType)
	}
	if strings.TrimSpace(headerName) != "" {
		w.Header().Set(headerName, cacheState)
	}
	statusCode := payload.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	w.WriteHeader(statusCode)
	_, _ = w.Write(bodyBytes)
	return true
}

func canonicalDashboardQuery(raw url.Values) string {
	q := url.Values{}
	for key, values := range raw {
		if strings.EqualFold(key, "nocache") {
			continue
		}
		cloned := append([]string(nil), values...)
		sort.Strings(cloned)
		for _, v := range cloned {
			q.Add(key, v)
		}
	}
	return q.Encode()
}

func shouldCacheDashboardPayload(payload dashboardCachePayload) bool {
	bodyBytes, err := decodeDashboardBody(payload)
	if err != nil {
		return false
	}
	body := strings.TrimSpace(string(bodyBytes))
	if payload.StatusCode != http.StatusOK || body == "" {
		return false
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
		return false
	}

	if successVal, exists := parsed["success"]; exists {
		if ok, cast := successVal.(bool); cast && !ok {
			return false
		}
	}

	dataVal, hasData := parsed["data"]
	if !hasData || dataVal == nil {
		return false
	}
	switch data := dataVal.(type) {
	case []interface{}:
		return len(data) > 0
	case map[string]interface{}:
		return len(data) > 0
	}
	return true
}

func (r *Runner) dashboardCacheMiddleware(cacheNamespace string, ttl time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet || r.Redis == nil {
			next(w, req)
			return
		}

		if isNoCacheRequest(req) {
			w.Header().Set("X-Dashboard-Cache", "BYPASS")
			next(w, req)
			return
		}

		userID, _ := req.Context().Value(contextKey("user_id")).(string)
		if userID == "" {
			next(w, req)
			return
		}

		canonicalQuery := canonicalDashboardQuery(req.URL.Query())
		teamScope := dashboardTeamScopeKey(req)
		generation := r.dashboardCacheGeneration()
		cacheKey := fmt.Sprintf("autopipe:dashboard:v4:%s:%s:%s:%s:%s?%s", cacheNamespace, userID, teamScope, generation, req.URL.Path, canonicalQuery)
		staleWindow := dashboardStaleWindow(ttl)

		if payload, ok := r.tryReadDashboardCache(cacheKey, 800*time.Millisecond); ok {
			now := time.Now().Unix()
			freshUntil := payload.FreshUntil
			if freshUntil == 0 {
				freshUntil = payload.CachedAt + int64(ttl.Seconds())
			}
			staleUntil := payload.StaleUntil
			if staleUntil == 0 {
				staleUntil = freshUntil + int64(staleWindow.Seconds())
			}
			if now <= freshUntil {
				if writeCachedPayloadResponse(w, payload, "X-Dashboard-Cache", "HIT") {
					return
				}
			} else if now <= staleUntil {
				// SWR: return stale data first, refresh async in background
				if writeCachedPayloadResponse(w, payload, "X-Dashboard-Cache", "STALE") {
					go func() {
						if !r.startCacheRefreshJob(cacheKey) {
							return
						}
						defer r.finishCacheRefreshJob(cacheKey)
						if !r.tryAcquireDashboardRefreshLock(cacheKey) {
							return
						}
						defer r.releaseDashboardRefreshLock(cacheKey)

						refreshCtx := context.WithValue(context.Background(), contextKey("user_id"), userID)
						refreshReq := req.Clone(refreshCtx)
						recorder := newCaptureResponseWriter()
						next(recorder, refreshReq)

						statusCode := recorder.statusCode
						if statusCode == 0 {
							statusCode = http.StatusOK
						}
						payload := buildDashboardPayload(statusCode, recorder.header.Get("Content-Type"), recorder.body.String(), ttl, staleWindow)
						if !shouldCacheDashboardPayload(payload) {
							return
						}
						r.storeDashboardCache(cacheKey, payload, ttl, staleWindow)
					}()
					return
				}
			}
		}

		// In-process singleflight: concurrent same-key requests wait for first fill to reduce DB load
		refreshLeader := r.startCacheRefreshJob(cacheKey)
		if !refreshLeader {
			if payload, ok := r.waitForDashboardCacheFill(cacheKey, 900*time.Millisecond); ok {
				if writeCachedPayloadResponse(w, payload, "X-Dashboard-Cache", "HIT-WAIT") {
					return
				}
			}
		}

		holdRedisLock := false
		if refreshLeader {
			holdRedisLock = r.tryAcquireDashboardRefreshLock(cacheKey)
			defer func() {
				if holdRedisLock {
					r.releaseDashboardRefreshLock(cacheKey)
				}
				r.finishCacheRefreshJob(cacheKey)
			}()
		}

		recorder := newCaptureResponseWriter()
		next(recorder, req)

		copyHeaders(w.Header(), recorder.header)
		w.Header().Set("X-Dashboard-Cache", "MISS")
		statusCode := recorder.statusCode
		if statusCode == 0 {
			statusCode = http.StatusOK
		}
		w.WriteHeader(statusCode)
		_, _ = w.Write(recorder.body.Bytes())

		if statusCode != http.StatusOK {
			return
		}

		payload := buildDashboardPayload(statusCode, recorder.header.Get("Content-Type"), recorder.body.String(), ttl, staleWindow)
		if !shouldCacheDashboardPayload(payload) {
			return
		}
		if refreshLeader && holdRedisLock {
			r.storeDashboardCache(cacheKey, payload, ttl, staleWindow)
		}
	}
}

// authenticateRequest validates JWT and returns user ID
func (r *Runner) authenticateRequest(req *http.Request) (string, error) {
	authHeader := req.Header.Get("Authorization")
	if authHeader == "" {
		return "", errors.New("authorization header missing")
	}
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return "", errors.New("invalid authorization header format")
	}
	tokenString := strings.TrimSpace(authHeader[len("Bearer "):])

	if r.JWTSecret == "" {
		return "", errors.New("JWT secret not configured")
	}

	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		// Verify signing algorithm
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(r.JWTSecret), nil
	})

	if err != nil {
		log.Printf("JWT parse error: %v", err)
		return "", fmt.Errorf("failed to parse JWT: %w", err)
	}

	if !token.Valid {
		return "", errors.New("JWT token is not valid")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid JWT claims")
	}

	idValue, ok := claims["id"]
	if !ok {
		return "", errors.New("JWT missing user id")
	}

	userID, ok := idValue.(string)
	if !ok || userID == "" {
		return "", errors.New("invalid user id claim")
	}

	return userID, nil
}

// Helper: get user_id from context
func getUserID(req *http.Request) string {
	// Prefer X-User-ID header (Python proxy)
	if userID := req.Header.Get("X-User-ID"); userID != "" {
		return userID
	}
	// Fallback: read from context
	if userID, ok := req.Context().Value(contextKey("user_id")).(string); ok {
		return userID
	}
	return "default-user"
}

// getEffectiveUserIDs returns user IDs for data scoping (matches Python _effective_user_ids_for_data_scope)
// Super Admin with X-Selected-Team-Id: return team member IDs; otherwise current user only
func (r *Runner) getEffectiveUserIDs(req *http.Request) ([]string, error) {
	userID := getUserID(req)
	var role string
	err := r.DB.QueryRow("SELECT role FROM users WHERE id = ?", userID).Scan(&role)
	if err != nil {
		return []string{userID}, nil
	}
	if role != "Super Admin" {
		return []string{userID}, nil
	}
	teamID := strings.TrimSpace(req.Header.Get("X-Selected-Team-Id"))
	if teamID == "" {
		return []string{userID}, nil
	}
	rows, err := r.DB.Query("SELECT user_id FROM user_teams WHERE team_id = ?", teamID)
	if err != nil {
		return []string{userID}, nil
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	if len(ids) == 0 {
		return []string{userID}, nil
	}
	return ids, nil
}

// inClausePlaceholder builds placeholders and args for user_id IN, e.g. "?,?,?" with []interface{}{id1, id2, id3}
func inClausePlaceholder(userIDs []string) (placeholder string, args []interface{}) {
	if len(userIDs) == 0 {
		return "", nil
	}
	parts := make([]string, len(userIDs))
	for i := range userIDs {
		parts[i] = "?"
		args = append(args, userIDs[i])
	}
	return strings.Join(parts, ","), args
}

// dashboardScopedTaskIDs returns task_id list for Dashboard queries:
// - accountNames set: tasks for those account_name in account_configs where user_id is in userIDs;
// - accountNames empty: all tasks for userIDs (Team isolation when no account selected; avoids SuperAdmin full scan).
// If account specified but no match/tasks, return empty slice (with dashboardTaskFilterSQL AND 1=0).
func (r *Runner) dashboardScopedTaskIDs(userIDs []string, accountNames []string) []string {
	if len(userIDs) == 0 {
		return nil
	}
	inPlace, inArgs := inClausePlaceholder(userIDs)
	if inPlace == "" {
		inPlace, inArgs = "?", []interface{}{userIDs[0]}
	}

	if len(accountNames) == 0 {
		rows, err := r.DB.Query("SELECT id FROM tasks WHERE user_id IN ("+inPlace+")", inArgs...)
		if err != nil {
			log.Printf("dashboardScopedTaskIDs (all team tasks) error: %v", err)
			return nil
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		return ids
	}

	placeholders := make([]string, len(accountNames))
	acqArgs := make([]interface{}, len(accountNames))
	for i, name := range accountNames {
		placeholders[i] = "?"
		acqArgs[i] = name
	}
	acQuery := fmt.Sprintf(`SELECT id FROM account_configs WHERE account_name IN (%s)`, strings.Join(placeholders, ","))
	rows, err := r.DB.Query(acQuery, acqArgs...)
	if err != nil {
		log.Printf("dashboardScopedTaskIDs account_configs error: %v", err)
		return nil
	}
	var accountIDs []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			accountIDs = append(accountIDs, id)
		}
	}
	rows.Close()

	if len(accountIDs) == 0 {
		return nil
	}

	acPlaceholders := make([]string, len(accountIDs))
	tArgs := make([]interface{}, len(accountIDs))
	for i, id := range accountIDs {
		acPlaceholders[i] = "?"
		tArgs[i] = id
	}
	q := fmt.Sprintf(`
		SELECT DISTINCT id FROM tasks 
		WHERE account_id IN (%s) AND user_id IN (%s)
	`, strings.Join(acPlaceholders, ","), inPlace)
	tArgs = append(tArgs, inArgs...)
	rows2, err := r.DB.Query(q, tArgs...)
	if err != nil {
		log.Printf("dashboardScopedTaskIDs tasks by account error: %v", err)
		return nil
	}
	defer rows2.Close()
	var taskIDs []string
	for rows2.Next() {
		var id string
		if rows2.Scan(&id) == nil {
			taskIDs = append(taskIDs, id)
		}
	}
	return taskIDs
}

// dashboardTaskFilterSQL converts task IDs to SQL; returns AND 1=0 when empty to prevent full-table leaks without task filter.
func dashboardTaskFilterSQL(taskIDs []string) (filter string, args []interface{}) {
	if len(taskIDs) > 0 {
		ph := make([]string, len(taskIDs))
		args = make([]interface{}, 0, len(taskIDs))
		for i, id := range taskIDs {
			ph[i] = "?"
			args = append(args, id)
		}
		return " AND task_id IN (" + strings.Join(ph, ",") + ")", args
	}
	return " AND 1=0", nil
}

// API: GET /api/autopipe/tasks - task list (filtered by getEffectiveUserIDs on Team switch)
func (r *Runner) getTasksHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, err := r.getEffectiveUserIDs(req)
	if err != nil || len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	page := 1
	pageSize := 20
	status := req.URL.Query().Get("status")
	accountID := req.URL.Query().Get("accountId")
	taskType := req.URL.Query().Get("type")
	search := strings.TrimSpace(req.URL.Query().Get("search"))

	if p := req.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if ps := req.URL.Query().Get("pageSize"); ps != "" {
		fmt.Sscanf(ps, "%d", &pageSize)
	}

	// Build query param fingerprint for dedup
	queryParams := fmt.Sprintf("%s|%s|%s|%s|%d", status, accountID, taskType, search, page)

	offset := (page - 1) * pageSize

	inPlace, inArgs := inClausePlaceholder(userIDs)
	if inPlace == "" {
		inPlace, inArgs = "?", []interface{}{getUserID(req)}
	}

	// Build query - JOIN account_configs for account info, task_schedules for execution date/time
	var query string
	query = `SELECT t.id, t.task_id, t.type, t.status, t.start_time, t.end_time, t.duration, t.description, t.priority, 
			  t.account_id, t.data_pointer, t.app_type, t.progress, t.create_time, t.latest_update_time, t.user_id,
			  t.api_token, t.token_request_count, t.token_last_used_at, t.token_created_at,
			  ac.account_name, ac.account_type, ac.custom_icon,
			  ts.execution_date, ts.execution_time
			  FROM tasks t
			  LEFT JOIN account_configs ac ON t.account_id = ac.id
			  LEFT JOIN task_schedules ts ON t.id = ts.task_id
			  WHERE t.user_id IN (` + inPlace + `)`
	args := append([]interface{}{}, inArgs...)

	if status != "" && status != "all" {
		query += " AND t.status = ?"
		args = append(args, status)
	}
	if accountID != "" {
		query += " AND t.account_id = ?"
		args = append(args, accountID)
	}
	if taskType != "" {
		query += " AND t.type = ?"
		args = append(args, taskType)
	}
	if search != "" {
		// Fix: search matches task_apps(app_id/app_name) and tasks.task_id for frontend task_id polling
		searchEscaped := strings.ReplaceAll(search, "%", "\\%")
		searchEscaped = strings.ReplaceAll(searchEscaped, "_", "\\_")
		searchPattern := "%" + searchEscaped + "%"

		query += " AND (t.id IN (SELECT ta.task_id FROM task_apps ta WHERE ta.app_id LIKE ? OR ta.app_name LIKE ?) OR t.task_id LIKE ?)"
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	query += " ORDER BY t.latest_update_time DESC LIMIT ? OFFSET ?"
	args = append(args, pageSize, offset)

	rows, err := r.DB.Query(query, args...)
	if err != nil {
		log.Printf("Query tasks error: %v", err)
		log.Printf("Failed query: %s", query)
		log.Printf("Query args: %v", args)
		http.Error(w, `{"error":"查询任务失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasksData []map[string]interface{}
	for rows.Next() {
		var t Task
		var accountName, accountType sql.NullString
		var customIcon sql.NullString
		var executionDate sql.NullTime
		var executionTime sql.NullString
		var tokenReqCount sql.NullInt64
		var tokenLastUsedAt sql.NullTime
		var tokenCreatedAt sql.NullTime
		err := rows.Scan(&t.ID, &t.TaskID, &t.Type, &t.Status, &t.StartTime, &t.EndTime, &t.Duration,
			&t.Description, &t.Priority, &t.AccountID, &t.DataPointer, &t.AppType, &t.Progress,
			&t.CreateTime, &t.LatestUpdateTime, &t.UserID,
			&t.APIToken, &tokenReqCount, &tokenLastUsedAt, &tokenCreatedAt,
			&accountName, &accountType, &customIcon, &executionDate, &executionTime)
		if err != nil {
			log.Printf("Scan task error: %v", err)
			continue
		}

		// Query linked apps
		apps, _ := r.loadTaskApps(context.Background(), t.ID)

		// Format time fields as strings to avoid TZ conversion
		var startTimeStr interface{} = nil
		if t.StartTime.Valid {
			startTimeStr = t.StartTime.Time.Format("2006-01-02 15:04:05")
		}

		var endTimeStr interface{} = nil
		if t.EndTime.Valid {
			endTimeStr = t.EndTime.Time.Format("2006-01-02 15:04:05")
		}

		// Build response data
		taskData := map[string]interface{}{
			"id":                 t.ID,
			"task_id":            t.TaskID,
			"type":               t.Type,
			"status":             t.Status,
			"start_time":         startTimeStr,
			"end_time":           endTimeStr,
			"duration":           t.Duration,
			"description":        t.Description,
			"priority":           t.Priority,
			"account_id":         t.AccountID,
			"data_pointer":       t.DataPointer,
			"app_type":           t.AppType,
			"progress":           t.Progress,
			"create_time":        t.CreateTime.Format("2006-01-02 15:04:05"),
			"latest_update_time": t.LatestUpdateTime.Format("2006-01-02 15:04:05"),
			"user_id":            t.UserID,
			"account_name":       accountName.String,
			"account_type":       accountType.String,
			"custom_icon":        customIcon.String,
			"apps":               apps,
		}
		if t.APIToken.Valid {
			taskData["api_token"] = t.APIToken.String
		} else {
			taskData["api_token"] = nil
		}
		if tokenReqCount.Valid {
			taskData["token_request_count"] = tokenReqCount.Int64
		} else {
			taskData["token_request_count"] = int64(0)
		}
		if tokenLastUsedAt.Valid {
			taskData["token_last_used_at"] = tokenLastUsedAt.Time.Format("2006-01-02 15:04:05")
		} else {
			taskData["token_last_used_at"] = nil
		}
		if tokenCreatedAt.Valid {
			taskData["token_created_at"] = tokenCreatedAt.Time.Format("2006-01-02 15:04:05")
		} else {
			taskData["token_created_at"] = nil
		}

		// Add execution_date (Single mode start date)
		if executionDate.Valid {
			taskData["execution_date"] = executionDate.Time.Format("2006-01-02")
		} else {
			taskData["execution_date"] = nil
		}

		// Add execution_time (Daily mode execution time)
		if executionTime.Valid {
			taskData["execution_time"] = executionTime.String
		} else {
			taskData["execution_time"] = nil
		}

		tasksData = append(tasksData, taskData)
	}

	// Get total count (same filter as main query via effectiveUserIDs)
	countQuery := "SELECT COUNT(*) FROM tasks t WHERE t.user_id IN (" + inPlace + ")"
	countArgs := append([]interface{}{}, inArgs...)

	if status != "" && status != "all" {
		countQuery += " AND t.status = ?"
		countArgs = append(countArgs, status)
	}
	if accountID != "" {
		countQuery += " AND t.account_id = ?"
		countArgs = append(countArgs, accountID)
	}
	if taskType != "" {
		countQuery += " AND t.type = ?"
		countArgs = append(countArgs, taskType)
	}
	if search != "" {
		// Match main query: task_apps and tasks.task_id
		searchEscaped := strings.ReplaceAll(search, "%", "\\%")
		searchEscaped = strings.ReplaceAll(searchEscaped, "_", "\\_")
		searchPattern := "%" + searchEscaped + "%"

		countQuery += " AND (t.id IN (SELECT ta.task_id FROM task_apps ta WHERE ta.app_id LIKE ? OR ta.app_name LIKE ?) OR t.task_id LIKE ?)"
		countArgs = append(countArgs, searchPattern, searchPattern, searchPattern)
	}

	var total int
	r.DB.QueryRow(countQuery, countArgs...).Scan(&total)

	// Log only when query params or task count change; reduce noise
	if queryParams != r.lastQueryParams || len(tasksData) != r.lastTaskCount {
		log.Printf("[API] GET /api/autopipe/tasks - users: %d, found %d tasks, total: %d, params: status=%s, account=%s, type=%s, page=%d",
			len(userIDs), len(tasksData), total, status, accountID, taskType, page)
		r.lastQueryParams = queryParams
		r.lastTaskCount = len(tasksData)
	}

	resp := map[string]interface{}{
		"success": true,
		"data":    tasksData,
		"pagination": map[string]interface{}{
			"page":       page,
			"pageSize":   pageSize,
			"total":      total,
			"totalPages": (total + pageSize - 1) / pageSize,
		},
	}
	json.NewEncoder(w).Encode(resp)
}

// API: POST /api/autopipe/tasks - create task
func (r *Runner) createTaskHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)
	log.Printf("[API] POST /api/autopipe/tasks - user_id: %s", userID)

	var body struct {
		TaskID        string `json:"task_id"`
		Type          string `json:"type"`
		Description   string `json:"description"`
		Priority      string `json:"priority"`
		AccountID     string `json:"account_id"`
		DataPointer   string `json:"data_pointer"`
		AppType       string `json:"app_type"`
		Status        string `json:"status"`
		ExecutionTime string `json:"execution_time"` // New: execution time (Daily mode)
		ExecutionDate string `json:"execution_date"` // New: execution date (Single mode)
		Timezone      string `json:"timezone"`       // New: timezone
		Apps          []struct {
			AppID     string      `json:"app_id"`
			AppName   string      `json:"app_name"`
			IconURL   string      `json:"icon_url"`
			OS        string      `json:"os"`
			Country   string      `json:"country"`
			Category  string      `json:"category"`
			Developer string      `json:"developer"`
			Rating    interface{} `json:"rating"` // Supports string or number
		} `json:"apps"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		log.Printf("JSON decode error: %v", err)
		http.Error(w, `{"error":"无效的请求数据"}`, http.StatusBadRequest)
		return
	}

	log.Printf("[API] POST /api/autopipe/tasks - received data: type=%s, account_id=%s, apps_count=%d",
		body.Type, body.AccountID, len(body.Apps))

	// Use client task_id or generate one
	taskID := body.TaskID
	if taskID == "" {
		taskID = generateTaskID()
	}
	id := generateSimpleUUID()

	// Determine task status
	status := body.Status
	if status == "" {
		status = "paused"
	}

	// Get account config name
	var accountName string
	err := r.DB.QueryRow(`
		SELECT account_name FROM account_configs WHERE id = ?
	`, body.AccountID).Scan(&accountName)
	if err != nil {
		log.Printf("Get account name error: %v", err)
		http.Error(w, `{"error":"获取账户配置失败"}`, http.StatusInternalServerError)
		return
	}

	// Insert task
	_, err = r.DB.Exec(`
		INSERT INTO tasks (id, task_id, type, status, description, priority, account_id, account, data_pointer, app_type, user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, taskID, body.Type, status, body.Description, body.Priority, body.AccountID, accountName, body.DataPointer, body.AppType, userID)

	if err != nil {
		log.Printf("Create task error: %v", err)
		http.Error(w, `{"error":"创建任务失败"}`, http.StatusInternalServerError)
		return
	}

	// Insert linked apps
	for _, app := range body.Apps {
		appID := generateSimpleUUID()
		_, err := r.DB.Exec(`
			INSERT INTO task_apps (id, task_id, app_id, app_name, icon_url, os, country, category, developer, rating)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, appID, id, app.AppID, app.AppName, nullString(app.IconURL), app.OS,
			nullString(app.Country), nullString(app.Category), nullString(app.Developer), interfaceToNullFloat64(app.Rating))

		if err != nil {
			log.Printf("Insert task_app error: %v", err)
		}
	}

	// Create schedule config
	scheduleID := generateSimpleUUID()
	scheduleType := "single" // Default Single Execution
	if body.DataPointer == "Daily Execution" {
		scheduleType = "daily"
	}

	// Timezone: Daily execution_time interpreted in Beijing time; DB defaults to Asia/Shanghai
	timezone := body.Timezone
	if timezone == "" {
		timezone = "Asia/Shanghai"
	}

	// Set execution time and date
	var executionTime, executionDate sql.NullString
	var nextExecution sql.NullTime

	if scheduleType == "daily" {
		// Daily: use execution time
		if body.ExecutionTime != "" {
			executionTime = sql.NullString{String: body.ExecutionTime, Valid: true}
		} else {
			executionTime = sql.NullString{String: "00:00:00", Valid: true} // Default midnight run
		}

		// Smart nextExecution setup:
		// 1. If past today's execution time, run now (set nextExecution to now)
		// 2. Else set to today's execution time
		if body.ExecutionTime != "" {
			// Parse time string (HH:MM:SS or HH:MM)
			timeStr := body.ExecutionTime
			if len(timeStr) >= 5 {
				parts := strings.Split(timeStr, ":")
				var h, m, s int
				fmt.Sscanf(parts[0], "%d", &h)
				if len(parts) > 1 {
					fmt.Sscanf(parts[1], "%d", &m)
				}
				if len(parts) > 2 {
					fmt.Sscanf(parts[2], "%d", &s)
				}

				// Create execution time in local TZ (CST)
				cst, _ := time.LoadLocation("Asia/Shanghai")
				now := time.Now().In(cst)
				todayExec := time.Date(now.Year(), now.Month(), now.Day(), h, m, s, 0, cst)

				// If past today's execution time, run immediately
				if now.After(todayExec) || now.Equal(todayExec) {
					// Today slot: run immediately for yesterday's data
					nextExecution = sql.NullTime{Time: now.UTC(), Valid: true}
				} else {
					// Before today's execution time; set today (stored as UTC)
					nextExecution = sql.NullTime{Time: todayExec.UTC(), Valid: true}
				}
			} else {
				// On bad time format, use now (immediate run)
				nextExecution = sql.NullTime{Time: time.Now().UTC(), Valid: true}
			}
		} else {
			// Default midnight run
			cst, _ := time.LoadLocation("Asia/Shanghai")
			now := time.Now().In(cst)
			todayExec := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, cst)
			if now.After(todayExec) || now.Equal(todayExec) {
				nextExecution = sql.NullTime{Time: now.UTC(), Valid: true}
			} else {
				nextExecution = sql.NullTime{Time: todayExec.UTC(), Valid: true}
			}
		}
	} else {
		// Single: use execution date
		if body.ExecutionDate != "" {
			executionDate = sql.NullString{String: body.ExecutionDate, Valid: true}
		} else {
			// Default start from today
			executionDate = sql.NullString{String: time.Now().Format("2006-01-02"), Valid: true}
		}
		// Set immediate execution (now)
		nextExecution = sql.NullTime{Time: time.Now(), Valid: true}
	}

	_, err = r.DB.Exec(`
		INSERT INTO task_schedules (id, task_id, schedule_type, execution_time, execution_date, timezone, is_active, next_execution)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, scheduleID, id, scheduleType, executionTime, executionDate, timezone, true, nextExecution)

	if err != nil {
		log.Printf("Insert task_schedule error: %v", err)
		// No error; task created but schedule config failed
	} else {
		log.Printf("[API] Created schedule: type=%s, execution_time=%v, execution_date=%v",
			scheduleType, executionTime, executionDate)
	}

	r.bumpAutopipeCacheGenerations("task_created", "tasks", "apps")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "任务创建成功",
		"task_id": id,
	})
}

// API: PUT /api/autopipe/tasks/<task_id> - update task
func (r *Runner) updateTaskHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)
	taskID := strings.TrimPrefix(req.URL.Path, "/api/autopipe/tasks/")

	var body struct {
		// Base fields
		Description string `json:"description"`
		Priority    string `json:"priority"`

		// Task config fields
		AppType      string `json:"app_type"`      // ios, android, both
		Type         string `json:"type"`          // install_pb, event_pb, install_rtpb, event_rtpb
		AccountID    string `json:"account_id"`    // Account ID
		ScheduleType string `json:"schedule_type"` // single, daily

		// Time config
		StartDate   string `json:"start_date"`   // Single mode start date
		ExecuteTime string `json:"execute_time"` // Daily execution time (HH:MM)

		// App config
		Apps []struct {
			AppID     string `json:"app_id"`
			AppName   string `json:"app_name"`
			IconURL   string `json:"icon_url"`
			OS        string `json:"os"`
			Country   string `json:"country"`
			Category  string `json:"category"`
			Developer string `json:"developer"`
			Rating    string `json:"rating"`
		} `json:"apps"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		log.Printf("[API] PUT /api/autopipe/tasks/%s - decode error: %v", taskID, err)
		http.Error(w, `{"error":"无效的请求数据"}`, http.StatusBadRequest)
		return
	}

	log.Printf("[API] PUT /api/autopipe/tasks/%s - user_id: %s, updating task config", taskID, userID)
	log.Printf("[API] Request body: %+v", body)

	// Begin transaction
	tx, err := r.DB.Begin()
	if err != nil {
		log.Printf("[API] Begin transaction error: %v", err)
		http.Error(w, `{"error":"数据库事务失败"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Update task base fields
	log.Printf("[API] Updating tasks table: app_type=%s, type=%s, account_id=%s", body.AppType, body.Type, body.AccountID)

	// If account_id changes, fetch new account_name
	var accountName string
	if body.AccountID != "" {
		err = tx.QueryRow(`
			SELECT account_name FROM account_configs WHERE id = ?
		`, body.AccountID).Scan(&accountName)
		if err != nil {
			log.Printf("[API] Get account name error: %v", err)
			http.Error(w, `{"error":"获取账户配置失败"}`, http.StatusInternalServerError)
			return
		}
	}

	result, err := tx.Exec(`
		UPDATE tasks SET 
			description = ?, 
			priority = ?, 
			app_type = ?, 
			type = ?, 
			account_id = ?,
			account = ?,
			latest_update_time = CURRENT_TIMESTAMP
		WHERE id = ? AND user_id = ?
	`, body.Description, body.Priority, body.AppType, body.Type, body.AccountID, accountName, taskID, userID)

	if err != nil {
		log.Printf("[API] Update tasks error: %v", err)
		http.Error(w, `{"error":"更新任务失败"}`, http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	log.Printf("[API] Tasks table updated: %d rows affected", rowsAffected)

	// Update schedule config
	if body.ScheduleType != "" {
		log.Printf("[API] Updating task_schedules: schedule_type=%s, start_date=%s, execute_time=%s", body.ScheduleType, body.StartDate, body.ExecuteTime)

		if body.ScheduleType == "single" && body.StartDate != "" {
			// Single: update execution_date and reactivate schedule (re-run after reconfigure)
			log.Printf("[API] Updating single schedule with execution_date=%s", body.StartDate)
			_, err = tx.Exec(`
				UPDATE task_schedules SET 
					schedule_type = ?,
					execution_date = ?,
					is_active = TRUE,
					next_execution = NULL,
					updated_at = CURRENT_TIMESTAMP
				WHERE task_id = ?
			`, body.ScheduleType, body.StartDate, taskID)
		} else if body.ScheduleType == "daily" && body.ExecuteTime != "" {
			// Daily: update execution_time and reactivate schedule
			log.Printf("[API] Updating daily schedule with execution_time=%s", body.ExecuteTime)
			_, err = tx.Exec(`
				UPDATE task_schedules SET 
					schedule_type = ?,
					execution_time = ?,
					is_active = TRUE,
					updated_at = CURRENT_TIMESTAMP
				WHERE task_id = ?
			`, body.ScheduleType, body.ExecuteTime, taskID)
		} else {
			// Update schedule_type only and reactivate schedule
			log.Printf("[API] Updating schedule_type only: %s", body.ScheduleType)
			_, err = tx.Exec(`
				UPDATE task_schedules SET 
					schedule_type = ?,
					is_active = TRUE,
					next_execution = NULL,
					updated_at = CURRENT_TIMESTAMP
				WHERE task_id = ?
			`, body.ScheduleType, taskID)
		}

		if err != nil {
			log.Printf("[API] Update task_schedules error: %v", err)
			http.Error(w, `{"error":"更新调度配置失败"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("[API] Task schedules updated successfully")
	}

	// Update app config
	if len(body.Apps) > 0 {
		// Delete existing app config
		_, err = tx.Exec(`DELETE FROM task_apps WHERE task_id = ?`, taskID)
		if err != nil {
			log.Printf("[API] Delete task_apps error: %v", err)
			http.Error(w, `{"error":"删除现有App配置失败"}`, http.StatusInternalServerError)
			return
		}

		// Insert new app config
		for _, app := range body.Apps {
			_, err = tx.Exec(`
				INSERT INTO task_apps (id, task_id, app_id, app_name, icon_url, os, country, category, developer, rating, created_at)
				VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			`, taskID, app.AppID, app.AppName, app.IconURL, app.OS, app.Country, app.Category, app.Developer, app.Rating)
			if err != nil {
				log.Printf("[API] Insert task_apps error: %v", err)
				http.Error(w, `{"error":"插入App配置失败"}`, http.StatusInternalServerError)
				return
			}
		}
	}

	// Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("[API] Commit transaction error: %v", err)
		http.Error(w, `{"error":"提交事务失败"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[API] Task updated successfully: %s", taskID)
	r.bumpAutopipeCacheGenerations("task_updated", "tasks", "apps")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "任务配置更新成功",
	})
}

// API: DELETE /api/autopipe/tasks/<task_id> - delete task (cascade all related data)
func (r *Runner) deleteTaskHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)
	taskID := strings.TrimPrefix(req.URL.Path, "/api/autopipe/tasks/")

	log.Printf("[API] DELETE /api/autopipe/tasks/%s - user_id: %s", taskID, userID)

	// 1. Verify task ownership
	var taskExists bool
	err := r.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ? AND user_id = ?)", taskID, userID).Scan(&taskExists)
	if err != nil {
		log.Printf("[API] Check task ownership error: %v", err)
		http.Error(w, `{"error":"查询任务失败"}`, http.StatusInternalServerError)
		return
	}
	if !taskExists {
		http.Error(w, `{"error":"任务不存在或无权限"}`, http.StatusNotFound)
		return
	}

	// 2. Begin transaction for cascade delete
	tx, err := r.DB.Begin()
	if err != nil {
		log.Printf("[API] Begin transaction error: %v", err)
		http.Error(w, `{"error":"开启事务失败"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 3. Delete actual data in tables (by task_id)
	dataTables := []string{
		"Dashboard_Install_Postbacks",
		"Dashboard_In_App_Event_Postbacks",
		"Dashboard_Retargeting_Install_Postbacks",
		"Dashboard_Retargeting_In_App_Event_Postbacks",
	}

	var totalDataDeleted int64
	for _, table := range dataTables {
		result, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE task_id = ?", table), taskID)
		if err != nil {
			log.Printf("[API] Delete data from %s error: %v", table, err)
			// Continue without aborting flow
		} else {
			rows, _ := result.RowsAffected()
			totalDataDeleted += rows
			if rows > 0 {
				log.Printf("[API] Deleted %d rows from %s", rows, table)
			}
		}
	}

	// 4. Delete task execution logs
	result, err := tx.Exec("DELETE FROM task_execution_logs WHERE task_id = ?", taskID)
	if err != nil {
		log.Printf("[API] Delete execution logs error: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		if rows > 0 {
			log.Printf("[API] Deleted %d execution logs", rows)
		}
	}

	// 5. Delete task schedule config
	result, err = tx.Exec("DELETE FROM task_schedules WHERE task_id = ?", taskID)
	if err != nil {
		log.Printf("[API] Delete schedules error: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		if rows > 0 {
			log.Printf("[API] Deleted %d schedules", rows)
		}
	}

	// 6. Delete task-linked apps
	result, err = tx.Exec("DELETE FROM task_apps WHERE task_id = ?", taskID)
	if err != nil {
		log.Printf("[API] Delete task apps error: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		if rows > 0 {
			log.Printf("[API] Deleted %d task apps", rows)
		}
	}

	// 7. Delete task itself
	_, err = tx.Exec("DELETE FROM tasks WHERE id = ? AND user_id = ?", taskID, userID)
	if err != nil {
		log.Printf("[API] Delete task error: %v", err)
		http.Error(w, `{"error":"删除任务失败"}`, http.StatusInternalServerError)
		return
	}

	// 8. Commit transaction
	if err = tx.Commit(); err != nil {
		log.Printf("[API] Commit transaction error: %v", err)
		http.Error(w, `{"error":"提交删除失败"}`, http.StatusInternalServerError)
		return
	}

	// Dashboard data changed; bump cache generation to force refresh
	r.bumpDashboardCacheGeneration("task_deleted")
	r.bumpAutopipeCacheGenerations("task_deleted", "tasks", "apps", "logs")

	log.Printf("[API] Task %s deleted successfully, data_rows_deleted=%d", taskID, totalDataDeleted)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"message":      "任务及相关数据删除成功",
		"data_deleted": totalDataDeleted,
	})
}

// API: PATCH /api/autopipe/tasks/<task_id>/status - update task status
func (r *Runner) updateTaskStatusHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)
	parts := strings.Split(req.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, `{"error":"无效的路径"}`, http.StatusBadRequest)
		return
	}
	taskID := parts[4]

	var body struct {
		Status string `json:"status"`
	}

	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		log.Printf("[API] PATCH /api/autopipe/tasks/%s/status - decode error: %v", taskID, err)
		http.Error(w, `{"error":"无效的请求数据"}`, http.StatusBadRequest)
		return
	}

	log.Printf("[API] PATCH /api/autopipe/tasks/%s/status - user_id: %s, new_status: %s", taskID, userID, body.Status)

	// If status becomes running, reset progress and clear cache
	if body.Status == "running" {
		// Reset task progress to 0
		result, err := r.DB.Exec(`
			UPDATE tasks SET status = ?, progress = 0, latest_update_time = CURRENT_TIMESTAMP
			WHERE id = ? AND user_id = ?
		`, body.Status, taskID, userID)

		if err != nil {
			log.Printf("[API] Update status error: %v", err)
			http.Error(w, `{"error":"更新任务状态失败"}`, http.StatusInternalServerError)
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			log.Printf("[API] Update status failed: no rows affected (task not found or no permission)")
			http.Error(w, `{"error":"任务不存在或无权限"}`, http.StatusNotFound)
			return
		}

		// Clear all app progress cache for task
		r.clearTaskAppProgressCache(taskID)

		// Fix: when status becomes running, update next_execution_time to avoid duplicate tick runs
		// Load schedule config
		sched, err := r.loadSchedule(req.Context(), taskID)
		if err == nil && sched != nil && sched.ID != "" {
			// Load task info for data_pointer
			var dataPointer string
			err = r.DB.QueryRowContext(req.Context(), `SELECT data_pointer FROM tasks WHERE id = ?`, taskID).Scan(&dataPointer)
			if err == nil {
				if dataPointer == "Daily Execution" && sched.ScheduleType == "daily" && sched.ExecutionTime.Valid {
					// Daily: compute tomorrow execution time (Beijing time)
					loc, _ := time.LoadLocation("Asia/Shanghai")
					now := time.Now().In(loc)
					h, m, sec, err := parseHHMMSS(sched.ExecutionTime.String)
					if err == nil {
						todayExec := time.Date(now.Year(), now.Month(), now.Day(), h, m, sec, 0, loc)
						nextExec := todayExec.Add(24 * time.Hour) // Same time tomorrow
						if err := r.updateNextExecution(req.Context(), sched.ID, nextExec); err != nil {
							log.Printf("[API] Failed to update next_execution_time when activating task: %v", err)
						} else {
							log.Printf("[API] Updated next_execution_time to %v when activating task %s", nextExec, taskID)
						}
					}
				}
			}
		}

		log.Printf("[API] Task status updated to running, progress reset to 0, cache cleared: %s", taskID)
	} else {
		// Other status updates; don't reset progress
		result, err := r.DB.Exec(`
			UPDATE tasks SET status = ?, latest_update_time = CURRENT_TIMESTAMP
			WHERE id = ? AND user_id = ?
		`, body.Status, taskID, userID)

		if err != nil {
			log.Printf("[API] Update status error: %v", err)
			http.Error(w, `{"error":"更新任务状态失败"}`, http.StatusInternalServerError)
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			log.Printf("[API] Update status failed: no rows affected (task not found or no permission)")
			http.Error(w, `{"error":"任务不存在或无权限"}`, http.StatusNotFound)
			return
		}

		log.Printf("[API] Task status updated successfully: %s -> %s", taskID, body.Status)
	}

	r.bumpAutopipeCacheGenerations("task_status_updated", "tasks")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "任务状态更新成功",
	})
}

// API: GET /api/autopipe/progress - batch task progress (lightweight, for live updates)
func (r *Runner) getProgressHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)

	// Query param taskIds (optional; default all running task progress)
	taskIds := req.URL.Query()["taskId"]

	ctx := req.Context()

	// Build query conditions
	var query string
	var args []interface{}

	if len(taskIds) > 0 {
		// Query progress for specified tasks
		placeholders := make([]string, len(taskIds))
		for i, taskId := range taskIds {
			placeholders[i] = "?"
			args = append(args, taskId)
		}
		query = fmt.Sprintf(`
			SELECT id, task_id, status, progress, latest_update_time
			FROM tasks 
			WHERE id IN (%s) AND user_id = ?
		`, strings.Join(placeholders, ","))
		args = append(args, userID)
	} else {
		// Query progress for all running tasks
		query = `
			SELECT id, task_id, status, progress, latest_update_time
			FROM tasks 
			WHERE status = 'running' AND user_id = ?
		`
		args = []interface{}{userID}
	}

	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		log.Printf("[API] GET /api/autopipe/progress - query error: %v", err)
		http.Error(w, `{"success":false,"error":"查询进度失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type TaskProgress struct {
		ID               string    `json:"id"`
		TaskID           string    `json:"task_id"`
		Status           string    `json:"status"`
		Progress         int       `json:"progress"`
		LatestUpdateTime time.Time `json:"latest_update_time"`
		Apps             []struct {
			AppID    string `json:"app_id"`
			Progress int    `json:"progress"`
		} `json:"apps"`
	}

	var tasksProgress []TaskProgress

	for rows.Next() {
		var tp TaskProgress
		var latestUpdateTime time.Time
		err := rows.Scan(&tp.ID, &tp.TaskID, &tp.Status, &tp.Progress, &latestUpdateTime)
		if err != nil {
			log.Printf("[API] GET /api/autopipe/progress - scan error: %v", err)
			continue
		}
		tp.LatestUpdateTime = latestUpdateTime

		// Get progress for all apps in task
		appRows, err := r.DB.QueryContext(ctx, `
			SELECT app_id
			FROM task_apps 
			WHERE task_id = ?
		`, tp.ID)

		if err == nil {
			defer appRows.Close()
			for appRows.Next() {
				var appID string
				if err := appRows.Scan(&appID); err == nil {
					// Use calculateAppProgress for accurate progress
					appProgress := r.calculateAppProgress(ctx, tp.ID, appID)
					tp.Apps = append(tp.Apps, struct {
						AppID    string `json:"app_id"`
						Progress int    `json:"progress"`
					}{
						AppID:    appID,
						Progress: appProgress,
					})
				}
			}
		}

		tasksProgress = append(tasksProgress, tp)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    tasksProgress,
	})
}

// API: GET /api/autopipe/progress/stream - long-poll for live progress updates
// Return immediately on progress change; else wait up to 5s
func (r *Runner) getProgressStreamHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)

	// Query param taskIds (required)
	taskIds := req.URL.Query()["taskId"]
	if len(taskIds) == 0 {
		http.Error(w, `{"success":false,"error":"taskId参数必需"}`, http.StatusBadRequest)
		return
	}

	ctx := req.Context()

	// Get last progress state (change detection)
	lastProgress := make(map[string]map[string]int) // taskID -> appID -> progress
	if lastProgressStr := req.URL.Query().Get("lastProgress"); lastProgressStr != "" {
		// Parse last progress (format: taskId:appId:progress,taskId:appId:progress)
		parts := strings.Split(lastProgressStr, ",")
		for _, part := range parts {
			items := strings.Split(part, ":")
			if len(items) == 3 {
				taskID := items[0]
				appID := items[1]
				progress, _ := strconv.Atoi(items[2])
				if lastProgress[taskID] == nil {
					lastProgress[taskID] = make(map[string]int)
				}
				lastProgress[taskID][appID] = progress
			}
		}
	}

	// Long-poll progress; wait up to 5s
	checkInterval := 100 * time.Millisecond // Check every 100ms
	maxWaitTime := 5 * time.Second          // Wait up to 5s max
	startTime := time.Now()

	for {
		// Check timeout
		if time.Since(startTime) >= maxWaitTime {
			break
		}

		// Check for progress changes
		hasChange := false
		var currentProgress map[string]map[string]int = make(map[string]map[string]int)

		// Query current progress
		placeholders := make([]string, len(taskIds))
		args := make([]interface{}, len(taskIds))
		for i, taskId := range taskIds {
			placeholders[i] = "?"
			args[i] = taskId
		}
		query := fmt.Sprintf(`
			SELECT id, task_id, status, progress, latest_update_time
			FROM tasks 
			WHERE id IN (%s) AND user_id = ?
		`, strings.Join(placeholders, ","))
		args = append(args, userID)

		rows, err := r.DB.QueryContext(ctx, query, args...)
		if err == nil {
		rowLoop:
			for rows.Next() {
				var taskID, taskTaskID, status string
				var progress int
				var latestUpdateTime time.Time
				if err := rows.Scan(&taskID, &taskTaskID, &status, &progress, &latestUpdateTime); err == nil {
					// Get progress for all apps in task
					appRows, err := r.DB.QueryContext(ctx, `
						SELECT app_id
						FROM task_apps 
						WHERE task_id = ?
					`, taskID)

					if err == nil {
						currentProgress[taskID] = make(map[string]int)
						for appRows.Next() {
							var appID string
							if err := appRows.Scan(&appID); err == nil {
								appProgress := r.calculateAppProgress(ctx, taskID, appID)
								currentProgress[taskID][appID] = appProgress

								// Check for app-level progress changes
								lastAppProgress := 0
								if lastProgress[taskID] != nil {
									lastAppProgress = lastProgress[taskID][appID]
								}
								// Mark changed on any app progress change (even small)
								if appProgress != lastAppProgress {
									hasChange = true
									appRows.Close()
									// On change detected, break all loops and return
									break rowLoop
								}
							}
						}
						appRows.Close()
					}
				}
			}
			rows.Close()
		}

		// Return immediately on change
		if hasChange {
			type TaskProgress struct {
				ID               string    `json:"id"`
				TaskID           string    `json:"task_id"`
				Status           string    `json:"status"`
				Progress         int       `json:"progress"`
				LatestUpdateTime time.Time `json:"latest_update_time"`
				Apps             []struct {
					AppID    string `json:"app_id"`
					Progress int    `json:"progress"`
				} `json:"apps"`
			}

			var tasksProgress []TaskProgress
			for _, taskID := range taskIds {
				var taskTaskID, status string
				var progress int
				var latestUpdateTime time.Time
				err := r.DB.QueryRowContext(ctx, `
					SELECT task_id, status, progress, latest_update_time
					FROM tasks 
					WHERE id = ? AND user_id = ?
				`, taskID, userID).Scan(&taskTaskID, &status, &progress, &latestUpdateTime)

				if err == nil {
					tp := TaskProgress{
						ID:               taskID,
						TaskID:           taskTaskID,
						Status:           status,
						Progress:         progress,
						LatestUpdateTime: latestUpdateTime,
					}

					// Get app progress
					appRows, err := r.DB.QueryContext(ctx, `
						SELECT app_id
						FROM task_apps 
						WHERE task_id = ?
					`, taskID)

					if err == nil {
						for appRows.Next() {
							var appID string
							if err := appRows.Scan(&appID); err == nil {
								appProgress := r.calculateAppProgress(ctx, taskID, appID)
								tp.Apps = append(tp.Apps, struct {
									AppID    string `json:"app_id"`
									Progress int    `json:"progress"`
								}{
									AppID:    appID,
									Progress: appProgress,
								})
							}
						}
						appRows.Close()
					}

					tasksProgress = append(tasksProgress, tp)
				}
			}

			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"data":    tasksProgress,
				"changed": true,
			})
			return
		}

		// Wait then check again
		time.Sleep(checkInterval)
	}

	// On timeout return current state (even unchanged)
	type TaskProgress struct {
		ID               string    `json:"id"`
		TaskID           string    `json:"task_id"`
		Status           string    `json:"status"`
		Progress         int       `json:"progress"`
		LatestUpdateTime time.Time `json:"latest_update_time"`
		Apps             []struct {
			AppID    string `json:"app_id"`
			Progress int    `json:"progress"`
		} `json:"apps"`
	}

	var tasksProgress []TaskProgress
	for _, taskID := range taskIds {
		var taskTaskID, status string
		var progress int
		var latestUpdateTime time.Time
		err := r.DB.QueryRowContext(ctx, `
			SELECT task_id, status, progress, latest_update_time
			FROM tasks 
			WHERE id = ? AND user_id = ?
		`, taskID, userID).Scan(&taskTaskID, &status, &progress, &latestUpdateTime)

		if err == nil {
			tp := TaskProgress{
				ID:               taskID,
				TaskID:           taskTaskID,
				Status:           status,
				Progress:         progress,
				LatestUpdateTime: latestUpdateTime,
			}

			// Get app progress
			appRows, err := r.DB.QueryContext(ctx, `
				SELECT app_id
				FROM task_apps 
				WHERE task_id = ?
			`, taskID)

			if err == nil {
				for appRows.Next() {
					var appID string
					if err := appRows.Scan(&appID); err == nil {
						appProgress := r.calculateAppProgress(ctx, taskID, appID)
						tp.Apps = append(tp.Apps, struct {
							AppID    string `json:"app_id"`
							Progress int    `json:"progress"`
						}{
							AppID:    appID,
							Progress: appProgress,
						})
					}
				}
				appRows.Close()
			}

			tasksProgress = append(tasksProgress, tp)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    tasksProgress,
		"changed": false,
	})
}

// API: GET /api/autopipe/tasks/<task_id>/logs - task logs (visibility checked via effectiveUserIDs per Team)
func (r *Runner) getTaskLogsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}
	parts := strings.Split(req.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, `{"error":"无效的路径"}`, http.StatusBadRequest)
		return
	}
	taskID := parts[4]

	inPlace, inArgs := inClausePlaceholder(userIDs)
	if inPlace == "" {
		inPlace, inArgs = "?", []interface{}{getUserID(req)}
	}
	// Verify task visible in request scope (current user or Team member)
	var count int
	r.DB.QueryRow("SELECT COUNT(*) FROM tasks WHERE id = ? AND user_id IN ("+inPlace+")", append([]interface{}{taskID}, inArgs...)...).Scan(&count)
	if count == 0 {
		http.Error(w, `{"error":"任务不存在或无权限"}`, http.StatusNotFound)
		return
	}

	page := 1
	pageSize := 20
	if p := req.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if ps := req.URL.Query().Get("pageSize"); ps != "" {
		fmt.Sscanf(ps, "%d", &pageSize)
	}

	offset := (page - 1) * pageSize

	rows, err := r.DB.Query(`
		SELECT id, task_id, app_id, execution_time, status, error_message, execution_duration, data_processed, data_fetched, data_deduplicated
		FROM task_execution_logs WHERE task_id = ?
		ORDER BY execution_time DESC LIMIT ? OFFSET ?
	`, taskID, pageSize, offset)

	if err != nil {
		http.Error(w, `{"error":"查询日志失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var id, tid, appID, status string
		var errorMsg sql.NullString
		var execTime time.Time
		var duration, processed, fetched, deduplicated int64
		rows.Scan(&id, &tid, &appID, &execTime, &status, &errorMsg, &duration, &processed, &fetched, &deduplicated)
		logs = append(logs, map[string]interface{}{
			"id":                 id,
			"task_id":            tid,
			"app_id":             appID,
			"execution_time":     execTime.Format("2006-01-02 15:04:05"),
			"status":             status,
			"error_message":      errorMsg.String,
			"execution_duration": duration,
			"data_processed":     processed,
			"data_fetched":       fetched,
			"data_deduplicated":  deduplicated,
		})
	}

	var total int
	r.DB.QueryRow("SELECT COUNT(*) FROM task_execution_logs WHERE task_id = ?", taskID).Scan(&total)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    logs,
		"pagination": map[string]interface{}{
			"page":       page,
			"pageSize":   pageSize,
			"total":      total,
			"totalPages": (total + pageSize - 1) / pageSize,
		},
	})
}

// API: GET /api/autopipe/tasks/<task_id>/download - download task data as XLSX
func (r *Runner) downloadTaskDataHandler(w http.ResponseWriter, req *http.Request) {
	userID := getUserID(req)
	parts := strings.Split(req.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, `{"error":"无效的路径"}`, http.StatusBadRequest)
		return
	}
	taskID := parts[4]

	log.Printf("[API] GET /api/autopipe/tasks/%s/download - user_id: %s", taskID, userID)

	// Verify task ownership and load task info
	var t Task
	err := r.DB.QueryRow(`
		SELECT id, task_id, type, status, account_id
		FROM tasks WHERE id = ? AND user_id = ?
	`, taskID, userID).Scan(&t.ID, &t.TaskID, &t.Type, &t.Status, &t.AccountID)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, `{"error":"任务不存在或无权限"}`, http.StatusNotFound)
		} else {
			log.Printf("[API] Query task error: %v", err)
			http.Error(w, `{"error":"查询任务失败"}`, http.StatusInternalServerError)
		}
		return
	}

	// Get table name
	tableName, err := tableForType(t.Type)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	// Query all data
	query := fmt.Sprintf("SELECT * FROM %s WHERE task_id = ?", tableName)
	rows, err := r.DB.Query(query, t.ID)
	if err != nil {
		log.Printf("[API] Query data error: %v", err)
		http.Error(w, `{"error":"查询数据失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		log.Printf("[API] Get columns error: %v", err)
		http.Error(w, `{"error":"获取列信息失败"}`, http.StatusInternalServerError)
		return
	}

	// Create Excel file
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("[API] Close excel file error: %v", err)
		}
	}()

	sheetName := "Sheet1"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		log.Printf("[API] New sheet error: %v", err)
		http.Error(w, `{"error":"创建Excel工作表失败"}`, http.StatusInternalServerError)
		return
	}
	f.SetActiveSheet(index)

	// Helper: column index to Excel name (A, B, ..., Z, AA, AB, ...)
	getExcelColumnName := func(colIndex int) string {
		result := ""
		for colIndex >= 0 {
			result = string(rune('A'+(colIndex%26))) + result
			colIndex = colIndex/26 - 1
		}
		return result
	}

	// Write header row
	for i, col := range columns {
		cell := fmt.Sprintf("%s1", getExcelColumnName(i))
		f.SetCellValue(sheetName, cell, col)
	}

	// Read data and write Excel
	rowNum := 2
	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	for rows.Next() {
		if err := rows.Scan(valuePtrs...); err != nil {
			log.Printf("[API] Scan row error: %v", err)
			continue
		}

		for i, val := range values {
			cell := fmt.Sprintf("%s%d", getExcelColumnName(i), rowNum)
			if val != nil {
				f.SetCellValue(sheetName, cell, val)
			}
		}
		rowNum++
	}

	if err = rows.Err(); err != nil {
		log.Printf("[API] Rows error: %v", err)
		http.Error(w, `{"error":"读取数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=task_%s_%s_%s.xlsx", t.TaskID, t.Type, time.Now().Format("20060102")))

	// Write response
	if err := f.Write(w); err != nil {
		log.Printf("[API] Write excel to response error: %v", err)
		http.Error(w, `{"error":"写入Excel文件失败"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[API] Successfully exported %d rows to Excel for task %s", rowNum-2, t.TaskID)
}

// API: POST /api/autopipe/tasks/<task_id>/execute - manually execute task
func (r *Runner) manualExecuteHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)
	parts := strings.Split(req.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, `{"error":"无效的路径"}`, http.StatusBadRequest)
		return
	}
	taskID := parts[4]

	log.Printf("[API] POST /api/autopipe/tasks/%s/execute - user_id: %s", taskID, userID)

	// Verify task ownership and load task info
	var t Task
	err := r.DB.QueryRow(`
		SELECT id, task_id, type, status, start_time, end_time, data_pointer, create_time, latest_update_time, user_id, account_id
		FROM tasks WHERE id = ? AND user_id = ?
	`, taskID, userID).Scan(&t.ID, &t.TaskID, &t.Type, &t.Status, &t.StartTime, &t.EndTime,
		&t.DataPointer, &t.CreateTime, &t.LatestUpdateTime, &t.UserID, &t.AccountID)

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"success":false,"error":"任务不存在或无权限"}`))
		} else {
			log.Printf("[API] Query task error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"success":false,"error":"查询任务失败"}`))
		}
		return
	}

	// Get linked apps
	apps, err := r.loadTaskApps(context.Background(), t.ID)
	if err != nil || len(apps) == 0 {
		log.Printf("[API] Load apps error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"error":"获取应用信息失败"}`))
		return
	}

	// Set task status to running
	// Reset progress to 0 only when not already running; avoid double-run reset
	var currentStatus string
	var currentProgress int
	err = r.DB.QueryRow(`SELECT status, progress FROM tasks WHERE id = ?`, t.ID).Scan(&currentStatus, &currentProgress)
	if err != nil {
		log.Printf("[API] Query current task status error: %v", err)
	}

	if currentStatus == "running" && currentProgress > 0 {
		// Already running with progress; don't reset
		log.Printf("[API] Task %s is already running with progress %d%%, skipping reset", t.TaskID, currentProgress)
	} else {
		// Not running or progress 0; reset progress
		_, err = r.DB.ExecContext(context.Background(), `
		UPDATE tasks 
		SET status = 'running',
		    progress = 0,
		    start_time = NOW(),
		    latest_update_time = NOW()
		WHERE id = ?
	`, t.ID)
		if err != nil {
			log.Printf("[API] Update task status to running error: %v", err)
		} else {
			log.Printf("[API] Task %s status updated to running, progress reset to 0", t.TaskID)
		}
	}

	// Execute task
	start := time.Now()
	var total int64
	var firstErr error

	// Load schedule for correct date range
	sched, err := r.loadSchedule(context.Background(), t.ID)
	if err != nil {
		log.Printf("[API] Load schedule error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"error":"获取调度配置失败"}`))
		return
	}

	// Use computeDueAndRange for date range (forceExecute=true allows re-run)
	// Note: even with forceExecute=true, fetch next time to update next_execution_time after completion
	_, drPtr, next, err := r.computeDueAndRange(time.Now(), t, sched, true)
	if err != nil {
		log.Printf("[API] Compute date range error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(fmt.Sprintf(`{"success":false,"error":"计算日期范围失败: %s"}`, err.Error())))
		return
	}
	if drPtr == nil {
		log.Printf("[API] Date range is nil for task %s", t.TaskID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"success":false,"error":"无法确定日期范围"}`))
		return
	}

	dr := *drPtr

	log.Printf("[API] Manual execution: task=%s, date_range=%s to %s, apps=%d",
		t.TaskID, dr.FromDate.Format("2006-01-02"), dr.ToDate.Format("2006-01-02"), len(apps))

	// Process apps concurrently with per-app logs
	var totalFetched, totalDeduplicated, totalProcessed int64
	var appResults []map[string]interface{}
	var mu sync.Mutex // Protect concurrent access to shared vars

	log.Printf("[API] Starting concurrent execution for %d apps: %v", len(apps), func() []string {
		var appIDs []string
		for _, app := range apps {
			appIDs = append(appIDs, app.AppID)
		}
		return appIDs
	}())

	// Use WaitGroup to wait for all goroutines
	var wg sync.WaitGroup
	wg.Add(len(apps))

	// Start one goroutine per app
	for i, app := range apps {
		go func(index int, app TaskAppJSON) {
			defer wg.Done()

			log.Printf("[API] Processing app %d/%d: %s (%s)", index+1, len(apps), app.AppID, app.AppName)
			appStart := time.Now()
			result, err := r.fetchAndInsert(context.Background(), t, app, dr)
			appDuration := time.Since(appStart).Seconds()

			// Use mutex for shared variable access
			mu.Lock()
			if err != nil {
				log.Printf("[API] Fetch error for app %s: %v", app.AppID, err)
				if firstErr == nil {
					firstErr = err
				}
				// Log failed app run
				msg := err.Error()
				r.addExecutionLog(context.Background(), t.ID, app.AppID, "failed", int64(appDuration), 0, 0, 0, &msg)
			} else {
				log.Printf("[API] App %s completed: fetched=%d, deduplicated=%d, processed=%d",
					app.AppID, result.Fetched, result.Deduplicated, result.Processed)
				totalFetched += result.Fetched
				totalDeduplicated += result.Deduplicated
				totalProcessed += result.Processed

				// Log successful app run
				r.addExecutionLog(context.Background(), t.ID, app.AppID, "success", int64(appDuration), result.Processed, result.Fetched, result.Deduplicated, nil)

				appResults = append(appResults, map[string]interface{}{
					"app_id":       app.AppID,
					"app_name":     app.AppName,
					"fetched":      result.Fetched,
					"deduplicated": result.Deduplicated,
					"processed":    result.Processed,
					"duration":     appDuration,
				})
			}
			mu.Unlock()
		}(i, app)
	}

	// Wait for all goroutines
	wg.Wait()
	log.Printf("[API] All apps completed concurrently")

	duration := time.Since(start).Seconds()

	// Log execution
	w.Header().Set("Content-Type", "application/json")

	if firstErr != nil {
		msg := firstErr.Error()
		// No aggregate failure log; each app logged separately

		// On failure set paused and reset progress to 0
		_, err = r.DB.ExecContext(context.Background(), `
		UPDATE tasks 
		SET status = 'paused',
		    progress = 0,
		    latest_update_time = NOW()
		WHERE id = ?
	`, t.ID)
		if err != nil {
			log.Printf("[API] Update task status to paused error: %v", err)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   msg,
		})
	} else {
		// No aggregate success log; each app logged separately
		log.Printf("[API] Manual execution completed: fetched=%d deduplicated=%d final=%d rows, duration=%.2fs", totalFetched, totalDeduplicated, totalProcessed, duration)

		// If Single Execution mode, mark completed
		if t.DataPointer == "Single Execution" {
			err = r.completeTask(context.Background(), t.ID, int64(duration))
			if err != nil {
				log.Printf("[API] Complete task error: %v", err)
			} else {
				log.Printf("[API] Task %s marked as completed (Single Execution)", t.TaskID)
			}
			// Single: clear app progress cache after completion to stop 100% polling
			r.clearTaskAppProgressCache(t.ID)
		} else {
			// Daily Execution mode keeps running status
			// Daily: keep 100% after run until next run resets to 0%
			// Fix: clear app progress cache to stop 100% polling
			// At 100% with no cache, calculateAppProgress returns 100% from DB state
			r.clearTaskAppProgressCache(t.ID)

			// Fix: after manual run, update next_execution_time to avoid duplicate tick runs
			// If next time valid from computeDueAndRange, update; else compute tomorrow's run time
			if sched != nil && sched.ID != "" {
				if !next.IsZero() {
					// Use next time from computeDueAndRange
					if err := r.updateNextExecution(context.Background(), sched.ID, next); err != nil {
						log.Printf("[API] Failed to update next_execution_time: %v", err)
					} else {
						log.Printf("[API] Updated next_execution_time to %v for task %s", next, t.TaskID)
					}
				} else if sched.ScheduleType == "daily" && sched.ExecutionTime.Valid {
					// If next time zero, compute tomorrow (always Beijing time)
					loc, _ := time.LoadLocation("Asia/Shanghai")
					now := time.Now().In(loc)
					h, m, sec, err := parseHHMMSS(sched.ExecutionTime.String)
					if err == nil {
						todayExec := time.Date(now.Year(), now.Month(), now.Day(), h, m, sec, 0, loc)
						nextExec := todayExec.Add(24 * time.Hour) // Same time tomorrow
						if err := r.updateNextExecution(context.Background(), sched.ID, nextExec); err != nil {
							log.Printf("[API] Failed to update next_execution_time: %v", err)
						} else {
							log.Printf("[API] Updated next_execution_time to %v (tomorrow) for task %s", nextExec, t.TaskID)
						}
					}
				}
			}

			log.Printf("[API] Task %s remains running (Daily Execution), progress kept at 100%% until next execution, cache cleared", t.TaskID)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":   true,
			"message":   "任务执行成功",
			"processed": total,
			"duration":  duration,
		})
	}
	r.bumpAutopipeCacheGenerations("task_manual_execute", "tasks", "logs")
}

// Background task scheduling helpers
func (r *Runner) loadRunningTasks(ctx context.Context) ([]Task, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, task_id, type, status, start_time, end_time, data_pointer, account_id, progress, create_time, latest_update_time, user_id
		FROM tasks WHERE status = 'running'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.TaskID, &t.Type, &t.Status, &t.StartTime, &t.EndTime,
			&t.DataPointer, &t.AccountID, &t.Progress, &t.CreateTime, &t.LatestUpdateTime, &t.UserID); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (r *Runner) loadSchedule(ctx context.Context, taskID string) (*TaskSchedule, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, task_id, schedule_type, execution_time, execution_date, timezone, is_active, next_execution, updated_at
		FROM task_schedules WHERE task_id = ? AND is_active = TRUE LIMIT 1
	`, taskID)

	var s TaskSchedule
	if err := row.Scan(&s.ID, &s.TaskID, &s.ScheduleType, &s.ExecutionTime, &s.ExecutionDate,
		&s.Timezone, &s.IsActive, &s.NextExecution, &s.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

func (r *Runner) loadTaskApps(ctx context.Context, taskID string) ([]TaskAppJSON, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, task_id, app_id, app_name, icon_url, os, country, category, developer, rating
		FROM task_apps WHERE task_id = ?
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []TaskAppJSON
	for rows.Next() {
		var a TaskApp
		if err := rows.Scan(&a.ID, &a.TaskID, &a.AppID, &a.AppName, &a.IconURL, &a.OS,
			&a.Country, &a.Category, &a.Developer, &a.Rating); err != nil {
			return nil, err
		}

		// Compute per-app progress
		appProgress := r.calculateAppProgress(ctx, taskID, a.AppID)

		// Convert to JSON struct
		appJSON := TaskAppJSON{
			ID:        a.ID,
			TaskID:    a.TaskID,
			AppID:     a.AppID,
			AppName:   a.AppName,
			IconURL:   a.IconURL.String,
			OS:        a.OS,
			Country:   a.Country.String,
			Category:  a.Category.String,
			Developer: a.Developer.String,
			Rating:    a.Rating.Float64,
			Progress:  appProgress,
		}
		apps = append(apps, appJSON)
	}
	return apps, rows.Err()
}

// API: GET /api/autopipe/apps - unique Apps from task_apps (dedupe by app_id)
func (r *Runner) getAllAppsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := getUserID(req)

	// Query unique apps, dedupe by app_id
	// GROUP BY app_id; one row per app_id (MAX created_at)
	query := `
		SELECT ta.app_id, 
		       MAX(ta.app_name) as app_name,
		       MAX(ta.icon_url) as icon_url,
		       MAX(ta.os) as os
		FROM task_apps ta
		INNER JOIN tasks t ON ta.task_id = t.id
		WHERE t.user_id = ?
		GROUP BY ta.app_id
		ORDER BY MAX(ta.app_name) ASC
	`

	rows, err := r.DB.Query(query, userID)
	if err != nil {
		log.Printf("Query apps error: %v", err)
		http.Error(w, `{"success":false,"error":"查询App列表失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var apps []map[string]interface{}
	for rows.Next() {
		var appID, appName, os string
		var iconURL sql.NullString

		err := rows.Scan(&appID, &appName, &iconURL, &os)
		if err != nil {
			log.Printf("Scan app error: %v", err)
			continue
		}

		app := map[string]interface{}{
			"app_id":   appID,
			"app_name": appName,
			"icon_url": iconURL.String,
			"os":       os,
		}
		apps = append(apps, app)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"success":false,"error":"读取App数据失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"data":    apps,
	}

	json.NewEncoder(w).Encode(response)
}

// API: GET /api/dashboard/apps - unique Apps from Dashboard tables (direct DB query, not AutoPipe tasks)
// Date range filter: fromDate and toDate query params (YYYY-MM-DD)
// Account and Campaign filters: accountNames and campaignIds query params
func (r *Runner) getDashboardAppsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	campaignIds := req.URL.Query()["campaignIds"]   // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD

	// Validate date format if dates provided
	if fromDate != "" || toDate != "" {
		if fromDate == "" || toDate == "" {
			http.Error(w, `{"success":false,"error":"fromDate和toDate必须同时提供"}`, http.StatusBadRequest)
			return
		}
		_, err := time.Parse("2006-01-02", fromDate)
		if err != nil {
			http.Error(w, `{"success":false,"error":"无效的fromDate格式，应为YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
		_, err = time.Parse("2006-01-02", toDate)
		if err != nil {
			http.Error(w, `{"success":false,"error":"无效的toDate格式，应为YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
	}

	// Without accounts, limit to current Team tasks; missing task filter scans all Apps (SuperAdmin sees all after Team switch)
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter (Install: install_time, Event: event_time)
	installDateFilter := ""
	eventDateFilter := ""
	installDateArgs := []interface{}{}
	eventDateArgs := []interface{}{}
	if fromDate != "" && toDate != "" {
		installDateFilter = " AND install_time IS NOT NULL AND DATE(install_time) >= ? AND DATE(install_time) <= ?"
		eventDateFilter = " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
		installDateArgs = []interface{}{fromDate, toDate}
		eventDateArgs = []interface{}{fromDate, toDate}
	}

	// Step 1: unique app_id from all Dashboard tables (dedupe by app_id)
	// Merged query: Dashboard_Install_Postbacks, Dashboard_In_App_Event_Postbacks,
	// Dashboard_Retargeting_Install_Postbacks, Dashboard_Retargeting_In_App_Event_Postbacks
	// Note: each SELECT in UNION has independent params; pass per table
	var query string
	var args []interface{}

	// Base WHERE always includes task scope
	installWhere := "WHERE app_id IS NOT NULL AND app_id != ''" + taskFilter
	if campaignFilter != "" {
		installWhere += campaignFilter
	}
	if installDateFilter != "" {
		installWhere += installDateFilter
	}
	eventWhere := "WHERE app_id IS NOT NULL AND app_id != ''" + taskFilter
	if campaignFilter != "" {
		eventWhere += campaignFilter
	}
	if eventDateFilter != "" {
		eventWhere += eventDateFilter
	}

	query = fmt.Sprintf(`
		SELECT DISTINCT app_id
		FROM (
			SELECT DISTINCT app_id 
			FROM Dashboard_Install_Postbacks 
			%s
			UNION
			SELECT DISTINCT app_id 
			FROM Dashboard_In_App_Event_Postbacks 
			%s
			UNION
			SELECT DISTINCT app_id 
			FROM Dashboard_Retargeting_Install_Postbacks 
			%s
			UNION
			SELECT DISTINCT app_id 
			FROM Dashboard_Retargeting_In_App_Event_Postbacks 
			%s
		) AS all_app_ids
		ORDER BY app_id ASC
	`, installWhere, eventWhere, installWhere, eventWhere)

	// Param order must match each UNION branch:
	// Install -> Event -> RT Install -> RT Event
	args = append(args, taskArgs...)
	args = append(args, campaignArgs...)
	args = append(args, installDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, campaignArgs...)
	args = append(args, eventDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, campaignArgs...)
	args = append(args, installDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, campaignArgs...)
	args = append(args, eventDateArgs...)

	var rows *sql.Rows
	var err error
	if len(args) > 0 {
		rows, err = r.DB.Query(query, args...)
	} else {
		rows, err = r.DB.Query(query)
	}
	if err != nil {
		log.Printf("Query dashboard apps error: %v", err)
		http.Error(w, `{"success":false,"error":"查询App列表失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var appIDs []string
	for rows.Next() {
		var appID sql.NullString
		err := rows.Scan(&appID)
		if err != nil {
			log.Printf("Scan app_id error: %v", err)
			continue
		}
		if appID.Valid && appID.String != "" {
			appIDs = append(appIDs, appID.String)
		}
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"success":false,"error":"读取App数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Step 2: app_name and icon_url per app_id
	// Prefer apps_finder; fallback to latest app_name from Dashboard tables
	var apps []map[string]interface{}
	for _, appID := range appIDs {
		var appName sql.NullString
		var iconURL sql.NullString

		// Try apps_finder first for app_name and icon_url (most accurate)
		err := r.DB.QueryRow(`
			SELECT app_name, icon_url 
			FROM apps_finder 
			WHERE app_id = ? 
			LIMIT 1
		`, appID).Scan(&appName, &iconURL)

		// If not in apps_finder, latest app_name from Dashboard tables
		if err != nil || !appName.Valid || appName.String == "" {
			// Latest app_name from Dashboard tables (ORDER BY created_at DESC, first non-empty)
			// Query each table separately, pick latest
			var foundName sql.NullString

			// Try latest app_name from each table
			tables := []string{
				"Dashboard_Install_Postbacks",
				"Dashboard_In_App_Event_Postbacks",
				"Dashboard_Retargeting_Install_Postbacks",
				"Dashboard_Retargeting_In_App_Event_Postbacks",
			}

			for _, table := range tables {
				fallbackQuery := fmt.Sprintf(`
					SELECT app_name 
					FROM %s 
					WHERE app_id = ? AND app_name IS NOT NULL AND app_name != ''
					ORDER BY created_at DESC
					LIMIT 1
				`, table)

				var tempName sql.NullString
				err2 := r.DB.QueryRow(fallbackQuery, appID).Scan(&tempName)
				if err2 == nil && tempName.Valid && tempName.String != "" {
					foundName = tempName
					break // Use first match
				}
			}

			if foundName.Valid && foundName.String != "" {
				appName = foundName
			} else {
				// If still missing, use app_id as app_name
				appName = sql.NullString{String: appID, Valid: true}
			}
		}

		app := map[string]interface{}{
			"app_id":   appID,
			"app_name": appName.String,
			"icon_url": nil,
		}

		// Use icon_url from apps_finder if available
		if iconURL.Valid && iconURL.String != "" {
			app["icon_url"] = iconURL.String
		}

		apps = append(apps, app)
	}

	// Sort by app_name
	sort.Slice(apps, func(i, j int) bool {
		nameI := apps[i]["app_name"].(string)
		nameJ := apps[j]["app_name"].(string)
		return nameI < nameJ
	})

	response := map[string]interface{}{
		"success": true,
		"data":    apps,
	}

	json.NewEncoder(w).Encode(response)
}

// API: GET /api/dashboard/accounts - unique Accounts from Dashboard tables (filtered via effectiveUserIDs per Team)
// Date range filter: fromDate and toDate query params (YYYY-MM-DD)
// App and Campaign filters: appIds and campaignIds query params
func (r *Runner) getDashboardAccountsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	appIds := req.URL.Query()["appIds"]           // App ID list
	campaignIds := req.URL.Query()["campaignIds"] // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")   // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")       // End date YYYY-MM-DD

	// Validate date format if dates provided
	if fromDate != "" || toDate != "" {
		if fromDate == "" || toDate == "" {
			http.Error(w, `{"success":false,"error":"fromDate和toDate必须同时提供"}`, http.StatusBadRequest)
			return
		}
		_, err := time.Parse("2006-01-02", fromDate)
		if err != nil {
			http.Error(w, `{"success":false,"error":"无效的fromDate格式，应为YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
		_, err = time.Parse("2006-01-02", toDate)
		if err != nil {
			http.Error(w, `{"success":false,"error":"无效的toDate格式，应为YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
	}

	// Limit visible task_id by effectiveUserIDs; return accounts for that Team only
	var taskIDs []string
	inPlace, inArgs := inClausePlaceholder(userIDs)
	if inPlace != "" {
		rows, err := r.DB.Query("SELECT id FROM tasks WHERE user_id IN ("+inPlace+")", inArgs...)
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					taskIDs = append(taskIDs, id)
				}
			}
			rows.Close()
		}
	}

	var taskFilter string
	var taskArgs []interface{}
	if len(taskIDs) > 0 {
		taskPlaceholders := make([]string, len(taskIDs))
		for i, taskID := range taskIDs {
			taskPlaceholders[i] = "?"
			taskArgs = append(taskArgs, taskID)
		}
		taskFilter = fmt.Sprintf(" AND task_id IN (%s)", strings.Join(taskPlaceholders, ","))
	} else if len(userIDs) > 0 {
		// No tasks for Team; return no accounts
		taskFilter = " AND 1=0"
	}

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter (Install: install_time, Event: event_time)
	installDateFilter := ""
	eventDateFilter := ""
	installDateArgs := []interface{}{}
	eventDateArgs := []interface{}{}
	if fromDate != "" && toDate != "" {
		installDateFilter = " AND install_time IS NOT NULL AND DATE(install_time) >= ? AND DATE(install_time) <= ?"
		eventDateFilter = " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
		installDateArgs = []interface{}{fromDate, toDate}
		eventDateArgs = []interface{}{fromDate, toDate}
	}

	// Unique account values from Dashboard tables (dedupe by account, scoped to effectiveUserIDs tasks)
	// Note: each SELECT in UNION has independent params; pass per table
	var query string
	var args []interface{}

	// Base WHERE with task scope for Team filtering
	installWhere := "WHERE account IS NOT NULL AND account != ''"
	if taskFilter != "" {
		installWhere += taskFilter
	}
	if appFilter != "" {
		installWhere += appFilter
	}
	if campaignFilter != "" {
		installWhere += campaignFilter
	}
	if installDateFilter != "" {
		installWhere += installDateFilter
	}
	eventWhere := "WHERE account IS NOT NULL AND account != ''"
	if taskFilter != "" {
		eventWhere += taskFilter
	}
	if appFilter != "" {
		eventWhere += appFilter
	}
	if campaignFilter != "" {
		eventWhere += campaignFilter
	}
	if eventDateFilter != "" {
		eventWhere += eventDateFilter
	}

	query = fmt.Sprintf(`
		SELECT DISTINCT account
		FROM (
			SELECT DISTINCT account 
			FROM Dashboard_Install_Postbacks 
			%s
			UNION
			SELECT DISTINCT account 
			FROM Dashboard_In_App_Event_Postbacks 
			%s
			UNION
			SELECT DISTINCT account 
			FROM Dashboard_Retargeting_Install_Postbacks 
			%s
			UNION
			SELECT DISTINCT account 
			FROM Dashboard_Retargeting_In_App_Event_Postbacks 
			%s
		) AS all_accounts
		ORDER BY account ASC
	`, installWhere, eventWhere, installWhere, eventWhere)

	// Param order must match each UNION branch:
	// Install -> Event -> RT Install -> RT Event
	args = append(args, taskArgs...)
	args = append(args, appArgs...)
	args = append(args, campaignArgs...)
	args = append(args, installDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, appArgs...)
	args = append(args, campaignArgs...)
	args = append(args, eventDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, appArgs...)
	args = append(args, campaignArgs...)
	args = append(args, installDateArgs...)
	args = append(args, taskArgs...)
	args = append(args, appArgs...)
	args = append(args, campaignArgs...)
	args = append(args, eventDateArgs...)

	var rows *sql.Rows
	var err error
	if len(args) > 0 {
		rows, err = r.DB.Query(query, args...)
	} else {
		rows, err = r.DB.Query(query)
	}
	if err != nil {
		log.Printf("Query dashboard accounts error: %v", err)
		http.Error(w, `{"success":false,"error":"查询Account列表失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var accounts []string
	accountSeen := make(map[string]struct{})
	for rows.Next() {
		var account sql.NullString
		err := rows.Scan(&account)
		if err != nil {
			log.Printf("Scan account error: %v", err)
			continue
		}
		if account.Valid && account.String != "" {
			normalized := strings.TrimSpace(account.String)
			if normalized == "" {
				continue
			}
			key := strings.ToLower(normalized)
			if _, exists := accountSeen[key]; exists {
				continue
			}
			accountSeen[key] = struct{}{}
			accounts = append(accounts, normalized)
		}
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"success":false,"error":"读取Account数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Fetch account_type and custom_icon per account from account_configs
	var accountList []map[string]interface{}
	for _, accountName := range accounts {
		var accountType sql.NullString
		var customIcon sql.NullString

		// Resolve account config only in visible task scope; avoid cross-account name collision
		var err error
		if len(taskIDs) > 0 {
			taskPlaceholders := make([]string, len(taskIDs))
			scopedArgs := make([]interface{}, 0, 1+len(taskIDs))
			scopedArgs = append(scopedArgs, accountName)
			for i, taskID := range taskIDs {
				taskPlaceholders[i] = "?"
				scopedArgs = append(scopedArgs, taskID)
			}
			q := fmt.Sprintf(`
				SELECT ac.account_type, ac.custom_icon
				FROM account_configs ac
				INNER JOIN tasks t ON t.account_id = ac.id
				WHERE LOWER(TRIM(ac.account_name)) = LOWER(TRIM(?))
				  AND t.id IN (%s)
				ORDER BY t.updated_at DESC
				LIMIT 1
			`, strings.Join(taskPlaceholders, ","))
			err = r.DB.QueryRow(q, scopedArgs...).Scan(&accountType, &customIcon)
		} else {
			err = sql.ErrNoRows
		}

		accountData := map[string]interface{}{
			"account_name": accountName,
			"account_type": "",
			"icon":         nil,
		}

		// If account config found, use its type and icon
		if err == nil {
			if accountType.Valid && accountType.String != "" {
				accountData["account_type"] = accountType.String
			}
			if customIcon.Valid && customIcon.String != "" {
				accountData["icon"] = customIcon.String
			}
		}

		accountList = append(accountList, accountData)
	}

	response := map[string]interface{}{
		"success": true,
		"data":    accountList,
	}

	json.NewEncoder(w).Encode(response)
}

// DashboardStatistics statistics result
type DashboardStatistics struct {
	Installs         int64 `json:"installs"`
	Events           int64 `json:"events"`
	RetargetInstalls int64 `json:"retarget_installs"`
	RetargetEvents   int64 `json:"retarget_events"`
}

// API: GET /api/dashboard/statistics - Dashboard statistics (filtered via effectiveUserIDs per Team)
func (r *Runner) getDashboardStatisticsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	appIds := req.URL.Query()["appIds"]             // App ID list
	campaignIds := req.URL.Query()["campaignIds"]   // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Without accounts, limit Team tasks; else stat cards scan full DB
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter - day precision (DATE() compares date part)
	// Note: DATE() compares day part even when field has hour/minute/second
	// All tables use event_time for date filtering
	// - In Install table, event_time is install time
	// - In Event table, event_time is event time
	// Single field binds date picker for all cases
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"

	dateArgs := []interface{}{fromDate, toDate}

	statistics := DashboardStatistics{}

	// ============================================
	// Query 1: Installations card
	// Table: Dashboard_Install_Postbacks
	// Time field: event_time (install time in Install table; day-level via DATE())
	// ============================================
	var installs int64
	var queryInstalls string
	var argsInstalls []interface{}
	if taskFilter != "" {
		queryInstalls = fmt.Sprintf(`
			SELECT COUNT(*) 
			FROM Dashboard_Install_Postbacks 
			WHERE 1=1 %s %s %s %s
		`, taskFilter, appFilter, campaignFilter, dateFilter)
		argsInstalls = append(argsInstalls, taskArgs...)
		argsInstalls = append(argsInstalls, appArgs...)
		if len(campaignArgs) > 0 {
			argsInstalls = append(argsInstalls, campaignArgs...)
		}
	} else {
		// Without task filter, use app and date filters only
		if appFilter != "" {
			queryInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Install_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dateFilter)
			argsInstalls = append(argsInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsInstalls = append(argsInstalls, campaignArgs...)
			}
		} else {
			queryInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Install_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dateFilter)
			if len(campaignArgs) > 0 {
				argsInstalls = append(argsInstalls, campaignArgs...)
			}
		}
	}
	argsInstalls = append(argsInstalls, dateArgs...)

	err := r.DB.QueryRow(queryInstalls, argsInstalls...).Scan(&installs)
	if err != nil {
		log.Printf("Query installs error: %v", err)
		installs = 0
	}
	statistics.Installs = installs

	// ============================================
	// Query 2: Events card
	// Table: Dashboard_In_App_Event_Postbacks
	// Time field: event_time (event time; day-level via DATE())
	// ============================================
	var events int64
	var queryEvents string
	var argsEvents []interface{}
	if taskFilter != "" {
		queryEvents = fmt.Sprintf(`
			SELECT COUNT(*) 
			FROM Dashboard_In_App_Event_Postbacks 
			WHERE 1=1 %s %s %s %s
		`, taskFilter, appFilter, campaignFilter, dateFilter)
		argsEvents = append(argsEvents, taskArgs...)
		argsEvents = append(argsEvents, appArgs...)
		if len(campaignArgs) > 0 {
			argsEvents = append(argsEvents, campaignArgs...)
		}
	} else {
		if appFilter != "" {
			queryEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dateFilter)
			argsEvents = append(argsEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsEvents = append(argsEvents, campaignArgs...)
			}
		} else {
			queryEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dateFilter)
			if len(campaignArgs) > 0 {
				argsEvents = append(argsEvents, campaignArgs...)
			}
		}
	}
	argsEvents = append(argsEvents, dateArgs...)

	err = r.DB.QueryRow(queryEvents, argsEvents...).Scan(&events)
	if err != nil {
		log.Printf("Query events error: %v", err)
		events = 0
	}
	statistics.Events = events

	// ============================================
	// Query 3: Retarget Installations card
	// Table: Dashboard_Retargeting_Install_Postbacks
	// Time field: event_time (install time in Retarget Install table; day-level via DATE())
	// ============================================
	var retargetInstalls int64
	var queryRetargetInstalls string
	var argsRetargetInstalls []interface{}
	if taskFilter != "" {
		queryRetargetInstalls = fmt.Sprintf(`
			SELECT COUNT(*) 
			FROM Dashboard_Retargeting_Install_Postbacks 
			WHERE 1=1 %s %s %s %s
		`, taskFilter, appFilter, campaignFilter, dateFilter)
		argsRetargetInstalls = append(argsRetargetInstalls, taskArgs...)
		argsRetargetInstalls = append(argsRetargetInstalls, appArgs...)
		if len(campaignArgs) > 0 {
			argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
		}
	} else {
		if appFilter != "" {
			queryRetargetInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dateFilter)
			argsRetargetInstalls = append(argsRetargetInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
			}
		} else {
			queryRetargetInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dateFilter)
			if len(campaignArgs) > 0 {
				argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
			}
		}
	}
	argsRetargetInstalls = append(argsRetargetInstalls, dateArgs...)

	err = r.DB.QueryRow(queryRetargetInstalls, argsRetargetInstalls...).Scan(&retargetInstalls)
	if err != nil {
		log.Printf("Query retarget installs error: %v", err)
		retargetInstalls = 0
	}
	statistics.RetargetInstalls = retargetInstalls

	// ============================================
	// Query 4: Retarget Events card
	// Table: Dashboard_Retargeting_In_App_Event_Postbacks
	// Time field: event_time (event time; day-level via DATE())
	// ============================================
	var retargetEvents int64
	var queryRetargetEvents string
	var argsRetargetEvents []interface{}
	if taskFilter != "" {
		queryRetargetEvents = fmt.Sprintf(`
			SELECT COUNT(*) 
			FROM Dashboard_Retargeting_In_App_Event_Postbacks 
			WHERE 1=1 %s %s %s %s
		`, taskFilter, appFilter, campaignFilter, dateFilter)
		argsRetargetEvents = append(argsRetargetEvents, taskArgs...)
		argsRetargetEvents = append(argsRetargetEvents, appArgs...)
		if len(campaignArgs) > 0 {
			argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
		}
	} else {
		if appFilter != "" {
			queryRetargetEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dateFilter)
			argsRetargetEvents = append(argsRetargetEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
			}
		} else {
			queryRetargetEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dateFilter)
			if len(campaignArgs) > 0 {
				argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
			}
		}
	}
	argsRetargetEvents = append(argsRetargetEvents, dateArgs...)

	err = r.DB.QueryRow(queryRetargetEvents, argsRetargetEvents...).Scan(&retargetEvents)
	if err != nil {
		log.Printf("Query retarget events error: %v", err)
		retargetEvents = 0
	}
	statistics.RetargetEvents = retargetEvents

	response := map[string]interface{}{
		"success": true,
		"data":    statistics,
	}

	json.NewEncoder(w).Encode(response)
}

// API: GET /api/dashboard/campaign-ids - Campaign ID list (filtered via effectiveUserIDs per Team)
func (r *Runner) getDashboardCampaignIdsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	appIds := req.URL.Query()["appIds"]             // App ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Without accounts, still scope to Team tasks; app+date only would scan all Campaigns (SuperAdmin sees all after Team switch)
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
	dateArgs := []interface{}{fromDate, toDate}

	// Unique campaign_id from all four tables (always with taskFilter; AND 1=0 yields empty)
	var campaignIDQuery string
	var campaignIDQueryArgs []interface{}
	campaignIDQuery = fmt.Sprintf(`
			SELECT DISTINCT campaign_id
			FROM (
				SELECT DISTINCT campaign_id 
				FROM Dashboard_Install_Postbacks 
				WHERE campaign_id IS NOT NULL AND campaign_id != '' %s %s %s
				UNION
				SELECT DISTINCT campaign_id 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE campaign_id IS NOT NULL AND campaign_id != '' %s %s %s
				UNION
				SELECT DISTINCT campaign_id 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE campaign_id IS NOT NULL AND campaign_id != '' %s %s %s
				UNION
				SELECT DISTINCT campaign_id 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE campaign_id IS NOT NULL AND campaign_id != '' %s %s %s
			) AS all_campaign_ids
			ORDER BY campaign_id ASC
		`, taskFilter, appFilter, dateFilter, taskFilter, appFilter, dateFilter, taskFilter, appFilter, dateFilter, taskFilter, appFilter, dateFilter)
	campaignIDQueryArgs = append(campaignIDQueryArgs, taskArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, appArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, dateArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, taskArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, appArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, dateArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, taskArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, appArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, dateArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, taskArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, appArgs...)
	campaignIDQueryArgs = append(campaignIDQueryArgs, dateArgs...)

	// Run query for unique campaign_id list
	campaignIDRows, err := r.DB.Query(campaignIDQuery, campaignIDQueryArgs...)
	if err != nil {
		log.Printf("Query campaign_ids error: %v", err)
		http.Error(w, `{"success":false,"error":"查询Campaign列表失败"}`, http.StatusInternalServerError)
		return
	}
	defer campaignIDRows.Close()

	// Dedupe by normalized ID; handles case and whitespace differences
	normalizeID := func(id string) string {
		return strings.TrimSpace(strings.ToLower(id))
	}

	var campaignIDs []string
	seenNormalizedIDs := make(map[string]string) // map[normalized_id]original_id for dedupe
	for campaignIDRows.Next() {
		var campaignID sql.NullString
		if err := campaignIDRows.Scan(&campaignID); err == nil {
			if campaignID.Valid && campaignID.String != "" {
				originalID := strings.TrimSpace(campaignID.String)
				normalizedID := normalizeID(originalID)
				if normalizedID != "" {
					// If normalized ID new, add it (keep first original ID format)
					if _, exists := seenNormalizedIDs[normalizedID]; !exists {
						campaignIDs = append(campaignIDs, originalID)
						seenNormalizedIDs[normalizedID] = originalID
					}
				}
			}
		}
	}

	if err = campaignIDRows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"success":false,"error":"读取Campaign数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Dedupe by campaign_id directly; no campaign field query
	// campaignIDs deduped in step 1; convert to response format
	var campaignList []map[string]string
	for _, id := range campaignIDs {
		// Use campaign_id as display name (optional DB lookup; does not affect dedupe)
		campaignList = append(campaignList, map[string]string{
			"id":   id,
			"name": id, // Use campaign_id itself as display name
		})
	}

	// Sort by name
	sort.Slice(campaignList, func(i, j int) bool {
		return campaignList[i]["name"] < campaignList[j]["name"]
	})

	response := map[string]interface{}{
		"success": true,
		"data":    campaignList,
	}

	json.NewEncoder(w).Encode(response)
}

// DashboardDailyStatistics daily-split statistics
type DashboardDailyStatistics struct {
	Date             string `json:"date"`
	Installs         int64  `json:"installs"`
	Events           int64  `json:"events"`
	RetargetInstalls int64  `json:"retarget_installs"`
	RetargetEvents   int64  `json:"retarget_events"`
}

// API: GET /api/dashboard/statistics/daily - daily Dashboard statistics (filtered via effectiveUserIDs per Team)
func (r *Runner) getDashboardDailyStatisticsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	appIds := req.URL.Query()["appIds"]             // App ID list
	campaignIds := req.URL.Query()["campaignIds"]   // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Same as getDashboardStatisticsHandler: scope to Team tasks even without account
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Generate date range
	fromTime, err := time.Parse("2006-01-02", fromDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的fromDate格式"}`, http.StatusBadRequest)
		return
	}
	toTime, err := time.Parse("2006-01-02", toDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的toDate格式"}`, http.StatusBadRequest)
		return
	}

	// Generate all dates
	var dailyStats []DashboardDailyStatistics
	currentDate := fromTime
	for !currentDate.After(toTime) {
		dateStr := currentDate.Format("2006-01-02")
		dailyStat := DashboardDailyStatistics{
			Date: dateStr,
		}

		// Query stats for date
		dayFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ?"
		dayArgs := []interface{}{dateStr}

		// 1. Installations
		var queryInstalls string
		var argsInstalls []interface{}
		if taskFilter != "" {
			queryInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Install_Postbacks 
				WHERE 1=1 %s %s %s %s
			`, taskFilter, appFilter, campaignFilter, dayFilter)
			argsInstalls = append(argsInstalls, taskArgs...)
			argsInstalls = append(argsInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsInstalls = append(argsInstalls, campaignArgs...)
			}
		} else if appFilter != "" {
			queryInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Install_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dayFilter)
			argsInstalls = append(argsInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsInstalls = append(argsInstalls, campaignArgs...)
			}
		} else {
			queryInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Install_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dayFilter)
			if len(campaignArgs) > 0 {
				argsInstalls = append(argsInstalls, campaignArgs...)
			}
		}
		argsInstalls = append(argsInstalls, dayArgs...)
		r.DB.QueryRow(queryInstalls, argsInstalls...).Scan(&dailyStat.Installs)

		// 2. Events
		var queryEvents string
		var argsEvents []interface{}
		if taskFilter != "" {
			queryEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s %s
			`, taskFilter, appFilter, campaignFilter, dayFilter)
			argsEvents = append(argsEvents, taskArgs...)
			argsEvents = append(argsEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsEvents = append(argsEvents, campaignArgs...)
			}
		} else if appFilter != "" {
			queryEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dayFilter)
			argsEvents = append(argsEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsEvents = append(argsEvents, campaignArgs...)
			}
		} else {
			queryEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_In_App_Event_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dayFilter)
			if len(campaignArgs) > 0 {
				argsEvents = append(argsEvents, campaignArgs...)
			}
		}
		argsEvents = append(argsEvents, dayArgs...)
		r.DB.QueryRow(queryEvents, argsEvents...).Scan(&dailyStat.Events)

		// 3. Retarget Installations
		var queryRetargetInstalls string
		var argsRetargetInstalls []interface{}
		if taskFilter != "" {
			queryRetargetInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE 1=1 %s %s %s %s
			`, taskFilter, appFilter, campaignFilter, dayFilter)
			argsRetargetInstalls = append(argsRetargetInstalls, taskArgs...)
			argsRetargetInstalls = append(argsRetargetInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
			}
		} else if appFilter != "" {
			queryRetargetInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dayFilter)
			argsRetargetInstalls = append(argsRetargetInstalls, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
			}
		} else {
			queryRetargetInstalls = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_Install_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dayFilter)
			if len(campaignArgs) > 0 {
				argsRetargetInstalls = append(argsRetargetInstalls, campaignArgs...)
			}
		}
		argsRetargetInstalls = append(argsRetargetInstalls, dayArgs...)
		r.DB.QueryRow(queryRetargetInstalls, argsRetargetInstalls...).Scan(&dailyStat.RetargetInstalls)

		// 4. Retarget Events
		var queryRetargetEvents string
		var argsRetargetEvents []interface{}
		if taskFilter != "" {
			queryRetargetEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s %s
			`, taskFilter, appFilter, campaignFilter, dayFilter)
			argsRetargetEvents = append(argsRetargetEvents, taskArgs...)
			argsRetargetEvents = append(argsRetargetEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
			}
		} else if appFilter != "" {
			queryRetargetEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE 1=1 %s %s %s
			`, appFilter, campaignFilter, dayFilter)
			argsRetargetEvents = append(argsRetargetEvents, appArgs...)
			if len(campaignArgs) > 0 {
				argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
			}
		} else {
			queryRetargetEvents = fmt.Sprintf(`
				SELECT COUNT(*) 
				FROM Dashboard_Retargeting_In_App_Event_Postbacks 
				WHERE 1=1 %s %s
			`, campaignFilter, dayFilter)
			if len(campaignArgs) > 0 {
				argsRetargetEvents = append(argsRetargetEvents, campaignArgs...)
			}
		}
		argsRetargetEvents = append(argsRetargetEvents, dayArgs...)
		r.DB.QueryRow(queryRetargetEvents, argsRetargetEvents...).Scan(&dailyStat.RetargetEvents)

		dailyStats = append(dailyStats, dailyStat)
		currentDate = currentDate.AddDate(0, 0, 1)
	}

	response := map[string]interface{}{
		"success": true,
		"data":    dailyStats,
	}

	json.NewEncoder(w).Encode(response)
}

// InstallConversionData Install Conversion chart data
type InstallConversionData struct {
	Date     string `json:"date"`
	Installs int64  `json:"installs"`
}

// InstallConversionGroupedData grouped Install Conversion chart data
type InstallConversionGroupedData struct {
	GroupId   string                  `json:"groupId"`   // Account name or app ID
	GroupName string                  `json:"groupName"` // Account name or app name
	Icon      string                  `json:"icon"`      // Icon URL or base64
	Platform  string                  `json:"platform"`  // Platform: iOS or Android (APP grouping only)
	Data      []InstallConversionData `json:"data"`      // Data series for group
}

// API: GET /api/dashboard/install-conversion - Install Conversion chart data (filtered via effectiveUserIDs per Team)
func (r *Runner) getInstallConversionHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	appIds := req.URL.Query()["appIds"]             // App ID list
	campaignIds := req.URL.Query()["campaignIds"]   // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD
	groupBy := req.URL.Query().Get("groupBy")       // Grouping: ACC or APP
	dataType := req.URL.Query().Get("dataType")     // Data type: UA or RT

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Validate groupBy param
	if groupBy != "ACC" && groupBy != "APP" {
		groupBy = "ACC" // Default ACC
	}

	// Validate dataType and resolve table name
	var tableName string
	if dataType == "RT" {
		tableName = "Dashboard_Retargeting_Install_Postbacks"
	} else {
		tableName = "Dashboard_Install_Postbacks" // Default UA
	}
	// APP grouping still uses taskIDs filter
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Generate date range
	fromTime, err := time.Parse("2006-01-02", fromDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的fromDate格式"}`, http.StatusBadRequest)
		return
	}
	toTime, err := time.Parse("2006-01-02", toDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的toDate格式"}`, http.StatusBadRequest)
		return
	}

	// Check single-day query
	isSingleDay := fromDate == toDate

	// Grouping by groupBy param
	var groupedData []InstallConversionGroupedData

	if groupBy == "ACC" {
		// Group by account
		// Get all accounts and icons
		var accountsToQuery []string
		if len(accountNames) > 0 {
			accountsToQuery = accountNames
		} else {
			// If no accounts specified, load accounts with data via task_id linked to effectiveUserIDs
			var dateFilter string
			var dateArgs []interface{}
			if isSingleDay {
				dateFilter = " AND DATE(event_time) = ?"
				dateArgs = []interface{}{fromDate}
			} else {
				dateFilter = " AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
				dateArgs = []interface{}{fromDate, toDate}
			}

			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			var userTaskIDs []string
			rows, err := r.DB.Query("SELECT DISTINCT id FROM tasks WHERE user_id IN ("+inPlace+")", inArgs...)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var taskID string
					if err := rows.Scan(&taskID); err == nil {
						userTaskIDs = append(userTaskIDs, taskID)
					}
				}
			}

			if len(userTaskIDs) > 0 {
				// Accounts with data from tables (via task_id)
				taskPlaceholders := make([]string, len(userTaskIDs))
				taskArgs := make([]interface{}, len(userTaskIDs))
				for i, taskID := range userTaskIDs {
					taskPlaceholders[i] = "?"
					taskArgs[i] = taskID
				}

				query := fmt.Sprintf(`
					SELECT DISTINCT t.account_id, ac.account_name
					FROM %s d
					INNER JOIN tasks t ON d.task_id = t.id
					INNER JOIN account_configs ac ON t.account_id = ac.id
					WHERE d.task_id IN (%s) %s
				`, tableName, strings.Join(taskPlaceholders, ","), dateFilter)
				queryArgs := append(taskArgs, dateArgs...)

				rows, err := r.DB.Query(query, queryArgs...)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var accountID, name string
						if err := rows.Scan(&accountID, &name); err == nil {
							accountsToQuery = append(accountsToQuery, name)
						}
					}
				}
			}
		}

		for _, accountName := range accountsToQuery {
			// Get account_id for account (must be in effectiveUserIDs scope)
			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			accQuery := fmt.Sprintf(`
				SELECT ac.id 
				FROM account_configs ac
				INNER JOIN tasks t ON ac.id = t.account_id
				WHERE ac.account_name = ? AND t.user_id IN (%s)
				LIMIT 1
			`, inPlace)
			var accountID string
			err := r.DB.QueryRow(accQuery, append([]interface{}{accountName}, inArgs...)...).Scan(&accountID)

			// Skip if account missing or no permission
			if err != nil || accountID == "" {
				continue
			}

			// Get account icon
			var accountIcon sql.NullString
			r.DB.QueryRow("SELECT custom_icon FROM account_configs WHERE id = ?", accountID).Scan(&accountIcon)
			iconStr := ""
			if accountIcon.Valid {
				iconStr = accountIcon.String
			}

			// Get task_ids for account (scoped to effectiveUserIDs)
			var accountTaskIDs []string
			if accountID != "" {
				rows, err := r.DB.Query("SELECT DISTINCT id FROM tasks WHERE account_id = ? AND user_id IN ("+inPlace+")", append([]interface{}{accountID}, inArgs...)...)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var taskID string
						if err := rows.Scan(&taskID); err == nil {
							accountTaskIDs = append(accountTaskIDs, taskID)
						}
					}
				}
			}

			// Build filter for account
			var accountTaskFilter string
			var accountTaskArgs []interface{}
			if len(accountTaskIDs) > 0 {
				taskPlaceholders := make([]string, len(accountTaskIDs))
				for i, taskID := range accountTaskIDs {
					taskPlaceholders[i] = "?"
					accountTaskArgs = append(accountTaskArgs, taskID)
				}
				accountTaskFilter = fmt.Sprintf(" AND task_id IN (%s)", strings.Join(taskPlaceholders, ","))
			}

			var accountAppFilter string
			var accountAppArgs []interface{}
			if len(appIds) > 0 {
				placeholders := make([]string, len(appIds))
				for i, appId := range appIds {
					placeholders[i] = "?"
					accountAppArgs = append(accountAppArgs, appId)
				}
				accountAppFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
			}

			// Build data series for account
			var accountData []InstallConversionData

			if isSingleDay {
				// Single day: one aggregate then hourly zero-fill; avoids 24 COUNT queries
				dateStr := fromDate
				hourCounts := make(map[int]int64, 24)
				var aggregateQuery string
				var aggregateArgs []interface{}
				timeFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ?"
				if accountTaskFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT HOUR(event_time) AS hour_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s %s
						GROUP BY HOUR(event_time)
					`, tableName, accountTaskFilter, accountAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, accountTaskArgs...)
					aggregateArgs = append(aggregateArgs, accountAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else if accountAppFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT HOUR(event_time) AS hour_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s
						GROUP BY HOUR(event_time)
					`, tableName, accountAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, accountAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else {
					aggregateQuery = fmt.Sprintf(`
						SELECT HOUR(event_time) AS hour_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s
						GROUP BY HOUR(event_time)
					`, tableName, campaignFilter, timeFilter)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				}
				aggregateArgs = append(aggregateArgs, dateStr)

				rows, err := r.DB.Query(aggregateQuery, aggregateArgs...)
				if err == nil {
					for rows.Next() {
						var hourKey int
						var installs int64
						if scanErr := rows.Scan(&hourKey, &installs); scanErr == nil {
							hourCounts[hourKey] = installs
						}
					}
					rows.Close()
				}

				for hour := 0; hour < 24; hour++ {
					accountData = append(accountData, InstallConversionData{
						Date:     fmt.Sprintf("%s %02d:00", dateStr, hour),
						Installs: hourCounts[hour],
					})
				}
			} else {
				// Multi-day: one aggregate then daily zero-fill; avoids per-day COUNT
				dayCounts := make(map[string]int64)
				var aggregateQuery string
				var aggregateArgs []interface{}
				timeFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
				if accountTaskFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT DATE(event_time) AS day_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s %s
						GROUP BY DATE(event_time)
					`, tableName, accountTaskFilter, accountAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, accountTaskArgs...)
					aggregateArgs = append(aggregateArgs, accountAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else if accountAppFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT DATE(event_time) AS day_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s
						GROUP BY DATE(event_time)
					`, tableName, accountAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, accountAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else {
					aggregateQuery = fmt.Sprintf(`
						SELECT DATE(event_time) AS day_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s
						GROUP BY DATE(event_time)
					`, tableName, campaignFilter, timeFilter)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				}
				aggregateArgs = append(aggregateArgs, fromDate, toDate)

				rows, err := r.DB.Query(aggregateQuery, aggregateArgs...)
				if err == nil {
					for rows.Next() {
						var dayKey string
						var installs int64
						if scanErr := rows.Scan(&dayKey, &installs); scanErr == nil {
							dayCounts[dayKey] = installs
						}
					}
					rows.Close()
				}

				currentDate := fromTime
				for !currentDate.After(toTime) {
					dateStr := currentDate.Format("2006-01-02")
					accountData = append(accountData, InstallConversionData{
						Date:     dateStr,
						Installs: dayCounts[dateStr],
					})
					currentDate = currentDate.AddDate(0, 0, 1)
				}
			}

			// Add only when data non-empty
			hasData := false
			for _, d := range accountData {
				if d.Installs > 0 {
					hasData = true
					break
				}
			}
			if hasData {
				groupedData = append(groupedData, InstallConversionGroupedData{
					GroupId:   accountName,
					GroupName: accountName,
					Icon:      iconStr,
					Data:      accountData,
				})
			}
		}
	} else if groupBy == "APP" {
		// Group by app
		// Build task ID filter (APP mode)
		var taskFilter string
		var taskArgs []interface{}
		if len(taskIDs) > 0 {
			taskPlaceholders := make([]string, len(taskIDs))
			for i, taskID := range taskIDs {
				taskPlaceholders[i] = "?"
				taskArgs = append(taskArgs, taskID)
			}
			taskFilter = fmt.Sprintf(" AND task_id IN (%s)", strings.Join(taskPlaceholders, ","))
		}

		var appsToQuery []string
		if len(appIds) > 0 {
			appsToQuery = appIds
		} else {
			// If no apps specified, all apps from Dashboard table
			query := fmt.Sprintf(`
				SELECT DISTINCT app_id
				FROM %s 
				WHERE app_id IS NOT NULL AND app_id != ''
			`, tableName)
			rows, err := r.DB.Query(query)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var appID string
					if err := rows.Scan(&appID); err == nil {
						appsToQuery = append(appsToQuery, appID)
					}
				}
			}
		}

		for _, appId := range appsToQuery {
			// Get app name, icon, and platform
			var appName, appIcon sql.NullString
			// Prefer apps_finder
			r.DB.QueryRow("SELECT app_name, icon_url FROM apps_finder WHERE app_id = ? LIMIT 1", appId).Scan(&appName, &appIcon)
			appNameStr := ""
			appIconStr := ""
			if appName.Valid {
				appNameStr = appName.String
			}
			if appIcon.Valid {
				appIconStr = appIcon.String
			}
			// If not in apps_finder, latest app_name from Dashboard table
			if appNameStr == "" {
				var dashboardAppName sql.NullString
				r.DB.QueryRow(fmt.Sprintf(`
					SELECT app_name 
					FROM %s 
					WHERE app_id = ? AND app_name IS NOT NULL AND app_name != ''
					ORDER BY created_at DESC 
					LIMIT 1
				`, tableName), appId).Scan(&dashboardAppName)
				if dashboardAppName.Valid {
					appNameStr = dashboardAppName.String
				}
			}
			if appIconStr == "" {
				var dashboardAppIcon sql.NullString
				r.DB.QueryRow(fmt.Sprintf(`
					SELECT icon_url 
					FROM %s 
					WHERE app_id = ? AND icon_url IS NOT NULL AND icon_url != ''
					ORDER BY created_at DESC 
					LIMIT 1
				`, tableName), appId).Scan(&dashboardAppIcon)
				if dashboardAppIcon.Valid {
					appIconStr = dashboardAppIcon.String
				}
			}
			// Get platform (latest from Dashboard table)
			var platform sql.NullString
			r.DB.QueryRow(fmt.Sprintf(`
				SELECT platform 
				FROM %s 
				WHERE app_id = ? AND platform IS NOT NULL AND platform != ''
				ORDER BY created_at DESC 
				LIMIT 1
			`, tableName), appId).Scan(&platform)
			platformStr := ""
			if platform.Valid {
				platformStr = platform.String
				// Normalize platform: ios -> IOS, android -> Android
				switch platformStr {
				case "ios", "iOS":
					platformStr = "IOS"
				case "android":
					platformStr = "Android"
				}
			}

			// Build filter for app
			var appAppFilter string
			var appAppArgs []interface{}
			appPlaceholders := []string{"?"}
			appAppArgs = append(appAppArgs, appId)
			appAppFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(appPlaceholders, ","))

			// Build data series for app
			var appData []InstallConversionData

			if isSingleDay {
				// Single day: one aggregate then hourly zero-fill; avoids 24 COUNT queries
				dateStr := fromDate
				hourCounts := make(map[int]int64, 24)
				var aggregateQuery string
				var aggregateArgs []interface{}
				timeFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ?"
				if taskFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT HOUR(event_time) AS hour_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s %s
						GROUP BY HOUR(event_time)
					`, tableName, taskFilter, appAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, taskArgs...)
					aggregateArgs = append(aggregateArgs, appAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else {
					aggregateQuery = fmt.Sprintf(`
						SELECT HOUR(event_time) AS hour_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s
						GROUP BY HOUR(event_time)
					`, tableName, appAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, appAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				}
				aggregateArgs = append(aggregateArgs, dateStr)

				rows, err := r.DB.Query(aggregateQuery, aggregateArgs...)
				if err == nil {
					for rows.Next() {
						var hourKey int
						var installs int64
						if scanErr := rows.Scan(&hourKey, &installs); scanErr == nil {
							hourCounts[hourKey] = installs
						}
					}
					rows.Close()
				}

				for hour := 0; hour < 24; hour++ {
					appData = append(appData, InstallConversionData{
						Date:     fmt.Sprintf("%s %02d:00", dateStr, hour),
						Installs: hourCounts[hour],
					})
				}
			} else {
				// Multi-day: one aggregate then daily zero-fill; avoids per-day COUNT
				dayCounts := make(map[string]int64)
				var aggregateQuery string
				var aggregateArgs []interface{}
				timeFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
				if taskFilter != "" {
					aggregateQuery = fmt.Sprintf(`
						SELECT DATE(event_time) AS day_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s %s
						GROUP BY DATE(event_time)
					`, tableName, taskFilter, appAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, taskArgs...)
					aggregateArgs = append(aggregateArgs, appAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				} else {
					aggregateQuery = fmt.Sprintf(`
						SELECT DATE(event_time) AS day_key, COUNT(*) AS installs
						FROM %s
						WHERE 1=1 %s %s %s
						GROUP BY DATE(event_time)
					`, tableName, appAppFilter, campaignFilter, timeFilter)
					aggregateArgs = append(aggregateArgs, appAppArgs...)
					if len(campaignArgs) > 0 {
						aggregateArgs = append(aggregateArgs, campaignArgs...)
					}
				}
				aggregateArgs = append(aggregateArgs, fromDate, toDate)

				rows, err := r.DB.Query(aggregateQuery, aggregateArgs...)
				if err == nil {
					for rows.Next() {
						var dayKey string
						var installs int64
						if scanErr := rows.Scan(&dayKey, &installs); scanErr == nil {
							dayCounts[dayKey] = installs
						}
					}
					rows.Close()
				}

				currentDate := fromTime
				for !currentDate.After(toTime) {
					dateStr := currentDate.Format("2006-01-02")
					appData = append(appData, InstallConversionData{
						Date:     dateStr,
						Installs: dayCounts[dateStr],
					})
					currentDate = currentDate.AddDate(0, 0, 1)
				}
			}

			// Add only when data non-empty
			hasData := false
			for _, d := range appData {
				if d.Installs > 0 {
					hasData = true
					break
				}
			}
			if hasData {
				groupedData = append(groupedData, InstallConversionGroupedData{
					GroupId:   appId,
					GroupName: appNameStr,
					Icon:      appIconStr,
					Platform:  platformStr,
					Data:      appData,
				})
			}
		}
	}

	// Return empty array if no grouped data
	if len(groupedData) == 0 {
		response := map[string]interface{}{
			"success": true,
			"data":    []InstallConversionGroupedData{},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"data":    groupedData,
	}

	json.NewEncoder(w).Encode(response)
}

// EventConversionData Event Conversion chart data
type EventConversionData struct {
	Date   string `json:"date"`
	Events int64  `json:"events"`
}

// EventConversionGroupedData grouped Event Conversion chart data
type EventConversionGroupedData struct {
	GroupId   string                `json:"groupId"`   // Account name or app ID
	GroupName string                `json:"groupName"` // Account name or app name
	Icon      string                `json:"icon"`      // Icon URL or base64
	Platform  string                `json:"platform"`  // Platform: iOS or Android (APP grouping only)
	Data      []EventConversionData `json:"data"`      // Data series for group
}

// API: GET /api/dashboard/event-conversion - Event Conversion chart data (filtered via effectiveUserIDs per Team)
func (r *Runner) getEventConversionHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	accountNames := req.URL.Query()["accountNames"] // Account name list
	appIds := req.URL.Query()["appIds"]             // App ID list
	campaignIds := req.URL.Query()["campaignIds"]   // Campaign ID list
	fromDate := req.URL.Query().Get("fromDate")     // Start date YYYY-MM-DD
	toDate := req.URL.Query().Get("toDate")         // End date YYYY-MM-DD
	groupBy := req.URL.Query().Get("groupBy")       // Grouping: ACC or APP
	dataType := req.URL.Query().Get("dataType")     // Data type: UA or RT

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Validate groupBy param
	if groupBy != "ACC" && groupBy != "APP" {
		groupBy = "ACC" // Default ACC
	}

	// Validate dataType and resolve table name
	var tableName string
	if dataType == "RT" {
		tableName = "Dashboard_Retargeting_In_App_Event_Postbacks"
	} else {
		tableName = "Dashboard_In_App_Event_Postbacks" // Default UA
	}
	// APP grouping still uses taskIDs filter
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Generate date range
	fromTime, err := time.Parse("2006-01-02", fromDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的fromDate格式"}`, http.StatusBadRequest)
		return
	}
	toTime, err := time.Parse("2006-01-02", toDate)
	if err != nil {
		http.Error(w, `{"success":false,"error":"无效的toDate格式"}`, http.StatusBadRequest)
		return
	}

	// Check single-day query
	isSingleDay := fromDate == toDate

	// Grouping by groupBy param
	var groupedData []EventConversionGroupedData

	if groupBy == "ACC" {
		// Group by account
		// Get all accounts and icons
		var accountsToQuery []string
		if len(accountNames) > 0 {
			accountsToQuery = accountNames
		} else {
			// If no accounts specified, load accounts with data via task_id linked to effectiveUserIDs
			var dateFilter string
			var dateArgs []interface{}
			if isSingleDay {
				dateFilter = " AND DATE(event_time) = ?"
				dateArgs = []interface{}{fromDate}
			} else {
				dateFilter = " AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
				dateArgs = []interface{}{fromDate, toDate}
			}

			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			var userTaskIDs []string
			rows, err := r.DB.Query("SELECT DISTINCT id FROM tasks WHERE user_id IN ("+inPlace+")", inArgs...)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var taskID string
					if err := rows.Scan(&taskID); err == nil {
						userTaskIDs = append(userTaskIDs, taskID)
					}
				}
			}

			if len(userTaskIDs) > 0 {
				// Accounts with data from tables (via task_id)
				taskPlaceholders := make([]string, len(userTaskIDs))
				taskArgs := make([]interface{}, len(userTaskIDs))
				for i, taskID := range userTaskIDs {
					taskPlaceholders[i] = "?"
					taskArgs[i] = taskID
				}

				query := fmt.Sprintf(`
					SELECT DISTINCT t.account_id, ac.account_name
					FROM %s d
					INNER JOIN tasks t ON d.task_id = t.id
					INNER JOIN account_configs ac ON t.account_id = ac.id
					WHERE d.task_id IN (%s) %s
				`, tableName, strings.Join(taskPlaceholders, ","), dateFilter)
				queryArgs := append(taskArgs, dateArgs...)

				rows, err := r.DB.Query(query, queryArgs...)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var accountID, name string
						if err := rows.Scan(&accountID, &name); err == nil {
							accountsToQuery = append(accountsToQuery, name)
						}
					}
				}
			}
		}

		for _, accountName := range accountsToQuery {
			// Get account_id for account (must be in effectiveUserIDs scope)
			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			accQuery := fmt.Sprintf(`
				SELECT ac.id 
				FROM account_configs ac
				INNER JOIN tasks t ON ac.id = t.account_id
				WHERE ac.account_name = ? AND t.user_id IN (%s)
				LIMIT 1
			`, inPlace)
			var accountID string
			err := r.DB.QueryRow(accQuery, append([]interface{}{accountName}, inArgs...)...).Scan(&accountID)

			// Skip if account missing or no permission
			if err != nil || accountID == "" {
				continue
			}

			// Get account icon
			var accountIcon sql.NullString
			r.DB.QueryRow("SELECT custom_icon FROM account_configs WHERE id = ?", accountID).Scan(&accountIcon)
			iconStr := ""
			if accountIcon.Valid {
				iconStr = accountIcon.String
			}

			// Get task_ids for account (scoped to effectiveUserIDs)
			var accountTaskIDs []string
			if accountID != "" {
				rows, err := r.DB.Query("SELECT DISTINCT id FROM tasks WHERE account_id = ? AND user_id IN ("+inPlace+")", append([]interface{}{accountID}, inArgs...)...)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var taskID string
						if err := rows.Scan(&taskID); err == nil {
							accountTaskIDs = append(accountTaskIDs, taskID)
						}
					}
				}
			}

			// Build filter for account
			var accountTaskFilter string
			var accountTaskArgs []interface{}
			if len(accountTaskIDs) > 0 {
				taskPlaceholders := make([]string, len(accountTaskIDs))
				for i, taskID := range accountTaskIDs {
					taskPlaceholders[i] = "?"
					accountTaskArgs = append(accountTaskArgs, taskID)
				}
				accountTaskFilter = fmt.Sprintf(" AND task_id IN (%s)", strings.Join(taskPlaceholders, ","))
			}

			var accountAppFilter string
			var accountAppArgs []interface{}
			if len(appIds) > 0 {
				placeholders := make([]string, len(appIds))
				for i, appId := range appIds {
					placeholders[i] = "?"
					accountAppArgs = append(accountAppArgs, appId)
				}
				accountAppFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
			}

			// Build data series for account
			var accountData []EventConversionData

			if isSingleDay {
				// Single day: group by hour
				dateStr := fromDate
				for hour := 0; hour < 24; hour++ {
					dataPoint := EventConversionData{
						Date: fmt.Sprintf("%s %02d:00", dateStr, hour),
					}

					hourFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ? AND HOUR(event_time) = ?"
					hourArgs := []interface{}{dateStr, hour}

					var queryEvents string
					var argsEvents []interface{}
					if accountTaskFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s %s
						`, tableName, accountTaskFilter, accountAppFilter, campaignFilter, hourFilter)
						argsEvents = append(argsEvents, accountTaskArgs...)
						argsEvents = append(argsEvents, accountAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					} else if accountAppFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s
						`, tableName, accountAppFilter, campaignFilter, hourFilter)
						argsEvents = append(argsEvents, accountAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					} else {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s
						`, tableName, campaignFilter, hourFilter)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					}
					argsEvents = append(argsEvents, hourArgs...)
					r.DB.QueryRow(queryEvents, argsEvents...).Scan(&dataPoint.Events)

					accountData = append(accountData, dataPoint)
				}
			} else {
				// Multi-day: group by date
				currentDate := fromTime
				for !currentDate.After(toTime) {
					dateStr := currentDate.Format("2006-01-02")
					dataPoint := EventConversionData{
						Date: dateStr,
					}

					dayFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ?"
					dayArgs := []interface{}{dateStr}

					var queryEvents string
					var argsEvents []interface{}
					if accountTaskFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s
						`, tableName, accountTaskFilter, accountAppFilter, dayFilter)
						argsEvents = append(argsEvents, accountTaskArgs...)
						argsEvents = append(argsEvents, accountAppArgs...)
					} else if accountAppFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s
						`, tableName, accountAppFilter, dayFilter)
						argsEvents = append(argsEvents, accountAppArgs...)
					} else {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s
						`, tableName, dayFilter)
					}
					argsEvents = append(argsEvents, dayArgs...)
					r.DB.QueryRow(queryEvents, argsEvents...).Scan(&dataPoint.Events)

					accountData = append(accountData, dataPoint)
					currentDate = currentDate.AddDate(0, 0, 1)
				}
			}

			// Add only when data non-empty
			hasData := false
			for _, d := range accountData {
				if d.Events > 0 {
					hasData = true
					break
				}
			}
			if hasData {
				groupedData = append(groupedData, EventConversionGroupedData{
					GroupId:   accountName,
					GroupName: accountName,
					Icon:      iconStr,
					Data:      accountData,
				})
			}
		}
	} else if groupBy == "APP" {
		// Group by app
		// Build task ID filter (APP mode)
		var taskFilter string
		var taskArgs []interface{}
		if len(taskIDs) > 0 {
			taskPlaceholders := make([]string, len(taskIDs))
			for i, taskID := range taskIDs {
				taskPlaceholders[i] = "?"
				taskArgs = append(taskArgs, taskID)
			}
			taskFilter = fmt.Sprintf(" AND task_id IN (%s)", strings.Join(taskPlaceholders, ","))
		}

		var appsToQuery []string
		if len(appIds) > 0 {
			appsToQuery = appIds
		} else {
			// If no apps specified, all apps from Dashboard table
			query := fmt.Sprintf(`
				SELECT DISTINCT app_id
				FROM %s 
				WHERE app_id IS NOT NULL AND app_id != ''
			`, tableName)
			rows, err := r.DB.Query(query)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var appID string
					if err := rows.Scan(&appID); err == nil {
						appsToQuery = append(appsToQuery, appID)
					}
				}
			}
		}

		for _, appId := range appsToQuery {
			// Get app name, icon, and platform
			var appName, appIcon sql.NullString
			// Prefer apps_finder
			r.DB.QueryRow("SELECT app_name, icon_url FROM apps_finder WHERE app_id = ? LIMIT 1", appId).Scan(&appName, &appIcon)
			appNameStr := ""
			appIconStr := ""
			if appName.Valid {
				appNameStr = appName.String
			}
			if appIcon.Valid {
				appIconStr = appIcon.String
			}
			// If not in apps_finder, latest app_name from Dashboard table
			if appNameStr == "" {
				var dashboardAppName sql.NullString
				r.DB.QueryRow(fmt.Sprintf(`
					SELECT app_name 
					FROM %s 
					WHERE app_id = ? AND app_name IS NOT NULL AND app_name != ''
					ORDER BY created_at DESC 
					LIMIT 1
				`, tableName), appId).Scan(&dashboardAppName)
				if dashboardAppName.Valid {
					appNameStr = dashboardAppName.String
				}
			}
			if appIconStr == "" {
				var dashboardAppIcon sql.NullString
				r.DB.QueryRow(fmt.Sprintf(`
					SELECT icon_url 
					FROM %s 
					WHERE app_id = ? AND icon_url IS NOT NULL AND icon_url != ''
					ORDER BY created_at DESC 
					LIMIT 1
				`, tableName), appId).Scan(&dashboardAppIcon)
				if dashboardAppIcon.Valid {
					appIconStr = dashboardAppIcon.String
				}
			}
			// Get platform (latest from Dashboard table)
			var platform sql.NullString
			r.DB.QueryRow(fmt.Sprintf(`
				SELECT platform 
				FROM %s 
				WHERE app_id = ? AND platform IS NOT NULL AND platform != ''
				ORDER BY created_at DESC 
				LIMIT 1
			`, tableName), appId).Scan(&platform)
			platformStr := ""
			if platform.Valid {
				platformStr = platform.String
				// Normalize platform: ios -> IOS, android -> Android
				switch platformStr {
				case "ios", "iOS":
					platformStr = "IOS"
				case "android":
					platformStr = "Android"
				}
			}

			// Build filter for app
			var appAppFilter string
			var appAppArgs []interface{}
			appPlaceholders := []string{"?"}
			appAppArgs = append(appAppArgs, appId)
			appAppFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(appPlaceholders, ","))

			// Build data series for app
			var appData []EventConversionData

			if isSingleDay {
				// Single day: group by hour
				dateStr := fromDate
				for hour := 0; hour < 24; hour++ {
					dataPoint := EventConversionData{
						Date: fmt.Sprintf("%s %02d:00", dateStr, hour),
					}

					hourFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ? AND HOUR(event_time) = ?"
					hourArgs := []interface{}{dateStr, hour}

					var queryEvents string
					var argsEvents []interface{}
					if taskFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s %s
						`, tableName, taskFilter, appAppFilter, campaignFilter, hourFilter)
						argsEvents = append(argsEvents, taskArgs...)
						argsEvents = append(argsEvents, appAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					} else {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s
						`, tableName, appAppFilter, campaignFilter, hourFilter)
						argsEvents = append(argsEvents, appAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					}
					argsEvents = append(argsEvents, hourArgs...)
					r.DB.QueryRow(queryEvents, argsEvents...).Scan(&dataPoint.Events)

					appData = append(appData, dataPoint)
				}
			} else {
				// Multi-day: group by date
				currentDate := fromTime
				for !currentDate.After(toTime) {
					dateStr := currentDate.Format("2006-01-02")
					dataPoint := EventConversionData{
						Date: dateStr,
					}

					dayFilter := " AND event_time IS NOT NULL AND DATE(event_time) = ?"
					dayArgs := []interface{}{dateStr}

					var queryEvents string
					var argsEvents []interface{}
					if taskFilter != "" {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s %s
						`, tableName, taskFilter, appAppFilter, campaignFilter, dayFilter)
						argsEvents = append(argsEvents, taskArgs...)
						argsEvents = append(argsEvents, appAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					} else {
						queryEvents = fmt.Sprintf(`
							SELECT COUNT(*) 
							FROM %s 
							WHERE 1=1 %s %s %s
						`, tableName, appAppFilter, campaignFilter, dayFilter)
						argsEvents = append(argsEvents, appAppArgs...)
						if len(campaignArgs) > 0 {
							argsEvents = append(argsEvents, campaignArgs...)
						}
					}
					argsEvents = append(argsEvents, dayArgs...)
					r.DB.QueryRow(queryEvents, argsEvents...).Scan(&dataPoint.Events)

					appData = append(appData, dataPoint)
					currentDate = currentDate.AddDate(0, 0, 1)
				}
			}

			// Add only when data non-empty
			hasData := false
			for _, d := range appData {
				if d.Events > 0 {
					hasData = true
					break
				}
			}
			if hasData {
				groupedData = append(groupedData, EventConversionGroupedData{
					GroupId:   appId,
					GroupName: appNameStr,
					Icon:      appIconStr,
					Platform:  platformStr,
					Data:      appData,
				})
			}
		}
	}

	// Return empty array if no grouped data
	if len(groupedData) == 0 {
		response := map[string]interface{}{
			"success": true,
			"data":    []EventConversionGroupedData{},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"data":    groupedData,
	}

	json.NewEncoder(w).Encode(response)
}

// DistributionProportionData pie chart item
type DistributionProportionData struct {
	Name     string `json:"name"`
	Value    int64  `json:"value"`
	Color    string `json:"color,omitempty"`
	Icon     string `json:"icon,omitempty"`     // Account or app icon
	Platform string `json:"platform,omitempty"` // Platform: iOS or Android (APP mode only)
}

// API: GET /api/dashboard/distribution-proportion - Distribution Proportion chart data (filtered via effectiveUserIDs per Team)
func (r *Runner) getDistributionProportionHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	mode := req.URL.Query().Get("mode")   // ACC or APP
	badge := req.URL.Query().Get("badge") // UA or RT
	fromDate := req.URL.Query().Get("fromDate")
	toDate := req.URL.Query().Get("toDate")
	accountNames := req.URL.Query()["accountNames"]
	appIds := req.URL.Query()["appIds"]
	campaignIds := req.URL.Query()["campaignIds"] // Campaign ID list

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Validate mode param
	if mode != "ACC" && mode != "APP" {
		mode = "ACC" // Default ACC
	}

	// Validate badge and resolve table name
	var installTable, eventTable string
	if badge == "RT" {
		installTable = "Dashboard_Retargeting_Install_Postbacks"
		eventTable = "Dashboard_Retargeting_In_App_Event_Postbacks"
	} else {
		// Default UA
		installTable = "Dashboard_Install_Postbacks"
		eventTable = "Dashboard_In_App_Event_Postbacks"
	}

	// Without accounts, still scope Team tasks; else funnel charts scan full DB
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
	dateArgs := []interface{}{fromDate, toDate}

	// Determine groupby field from mode
	var groupByField string
	var groupByPlatform bool
	if mode == "APP" {
		// APP mode: group by app_id and platform
		groupByField = "app_id, platform"
		groupByPlatform = true
	} else {
		groupByField = "account"
		groupByPlatform = false
	}

	// Build query: merge install/event tables, groupby fields, count rows
	// Use WHERE 1=1 base consistent with other queries
	var query string
	var args []interface{}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build WHERE (base WHERE 1=1)
	var whereClause string
	if taskFilter != "" {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s %s %s", taskFilter, appFilter, campaignFilter, dateFilter)
		args = append(args, taskArgs...)
		args = append(args, appArgs...)
		if len(campaignArgs) > 0 {
			args = append(args, campaignArgs...)
		}
	} else if appFilter != "" {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s %s", appFilter, campaignFilter, dateFilter)
		args = append(args, appArgs...)
		if len(campaignArgs) > 0 {
			args = append(args, campaignArgs...)
		}
	} else {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s", campaignFilter, dateFilter)
		if len(campaignArgs) > 0 {
			args = append(args, campaignArgs...)
		}
	}
	args = append(args, dateArgs...)

	// UNION ALL: merge two tables (groupby fields only), then group and aggregate outer query
	// Note: params repeated for each of two tables
	if groupByPlatform {
		// APP mode: group by app_id and platform
		query = fmt.Sprintf(`
			SELECT app_key, platform_key, COUNT(*) AS count
			FROM (
				SELECT app_id AS app_key, platform AS platform_key
				FROM %s
				%s AND platform IS NOT NULL AND platform != ''
				UNION ALL
				SELECT app_id AS app_key, platform AS platform_key
				FROM %s
				%s AND platform IS NOT NULL AND platform != ''
			) AS combined_data
			WHERE app_key IS NOT NULL AND app_key != ''
			GROUP BY app_key, platform_key
			ORDER BY count DESC
		`, installTable, whereClause, eventTable, whereClause)
	} else {
		// ACC mode: group by account
		query = fmt.Sprintf(`
			SELECT group_key, COUNT(*) AS count
			FROM (
				SELECT %s AS group_key
				FROM %s
				%s
				UNION ALL
				SELECT %s AS group_key
				FROM %s
				%s
			) AS combined_data
			WHERE group_key IS NOT NULL AND group_key != ''
			GROUP BY group_key
			ORDER BY count DESC
		`, groupByField, installTable, whereClause,
			groupByField, eventTable, whereClause)
	}

	// Params repeated twice (once per install and event table)
	args = append(args, args...)

	// Run query
	rows, err := r.DB.Query(query, args...)
	if err != nil {
		log.Printf("Query distribution proportion error: %v", err)
		http.Error(w, `{"success":false,"error":"查询分布比例数据失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Define color palette
	colors := []string{
		"#1e3a8a", // blue-800
		"#7c3aed", // violet-600
		"#6b21a8", // purple-700
		"#be185d", // pink-700
		"#b91c1c", // red-700
		"#c2410c", // orange-700
		"#166534", // green-700
		"#0e7490", // cyan-700
		"#1e40af", // blue-700
		"#581c87", // purple-800
	}

	var result []DistributionProportionData
	index := 0
	for rows.Next() {
		var count int64
		var name string
		var icon string
		var platform string

		if groupByPlatform {
			// APP mode: scan app_key and platform_key
			var appKey sql.NullString
			var platformKey sql.NullString
			if err := rows.Scan(&appKey, &platformKey, &count); err != nil {
				log.Printf("Scan distribution proportion error: %v", err)
				continue
			}

			if !appKey.Valid || appKey.String == "" || !platformKey.Valid || platformKey.String == "" || count <= 0 {
				continue
			}

			groupKey := appKey.String
			platform = platformKey.String
			// Normalize platform: ios -> IOS, android -> Android
			switch platform {
			case "ios", "iOS":
				platform = "IOS"
			case "android":
				platform = "Android"
			}

			// APP mode: app_name and icon (scoped to effectiveUserIDs)
			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			var appName sql.NullString
			var appIcon sql.NullString
			q := fmt.Sprintf(`
				SELECT DISTINCT ta.app_name, ta.icon_url
				FROM task_apps ta
				INNER JOIN tasks t ON ta.task_id = t.id
				WHERE ta.app_id = ? AND t.user_id IN (%s)
				LIMIT 1
			`, inPlace)
			err := r.DB.QueryRow(q, append([]interface{}{groupKey}, inArgs...)...).Scan(&appName, &appIcon)

			if err == nil && appName.Valid && appName.String != "" {
				name = appName.String
				if appIcon.Valid {
					icon = appIcon.String
				}
			} else {
				// If not in task_apps, try apps_finder (icon_url field)
				var appName2 sql.NullString
				var appIcon2 sql.NullString
				err2 := r.DB.QueryRow(`
					SELECT app_name, icon_url FROM apps_finder 
					WHERE app_id = ? 
					LIMIT 1
				`, groupKey).Scan(&appName2, &appIcon2)
				if err2 == nil && appName2.Valid && appName2.String != "" {
					name = appName2.String
					if appIcon2.Valid {
						icon = appIcon2.String
					}
				} else {
					// If none found, use app_id
					name = groupKey
				}
			}
		} else {
			// ACC mode: group by account
			var groupKey sql.NullString
			if err := rows.Scan(&groupKey, &count); err != nil {
				log.Printf("Scan distribution proportion error: %v", err)
				continue
			}

			if !groupKey.Valid || groupKey.String == "" || count <= 0 {
				continue
			}

			// ACC mode: account name and icon from account_configs (scoped to effectiveUserIDs)
			inPlace, inArgs := inClausePlaceholder(userIDs)
			if inPlace == "" {
				inPlace, inArgs = "?", []interface{}{getUserID(req)}
			}
			var accountName sql.NullString
			var accountIcon sql.NullString
			q := fmt.Sprintf(`
				SELECT DISTINCT ac.account_name, ac.custom_icon
				FROM account_configs ac
				INNER JOIN tasks t ON ac.id = t.account_id
				WHERE ac.account_name = ? AND t.user_id IN (%s)
				LIMIT 1
			`, inPlace)
			err := r.DB.QueryRow(q, append([]interface{}{groupKey.String}, inArgs...)...).Scan(&accountName, &accountIcon)

			if err == nil && accountName.Valid && accountName.String != "" {
				// Found account config; use account_name
				name = accountName.String
				if accountIcon.Valid {
					icon = accountIcon.String
				}
			} else {
				// Skip account if not found or no permission
				continue
			}
		}

		result = append(result, DistributionProportionData{
			Name:     name,
			Value:    count,
			Color:    colors[index%len(colors)],
			Icon:     icon,
			Platform: platform,
		})
		index++
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		http.Error(w, `{"success":false,"error":"读取分布比例数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Return empty array if no data
	if len(result) == 0 {
		response := map[string]interface{}{
			"success": true,
			"data":    []DistributionProportionData{},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"data":    result,
	}

	json.NewEncoder(w).Encode(response)
}

// EventNameGroupDetail breakdown under event name (ACC by account, APP by app_id)
type EventNameGroupDetail struct {
	GroupName          string `json:"groupName"`          // Account name or app name
	Install            int64  `json:"install"`            // Install count
	Event              int64  `json:"event"`              // Event count
	RetargetingInstall int64  `json:"retargetingInstall"` // Retargeting Install count
	RetargetingEvent   int64  `json:"retargetingEvent"`   // Retargeting Event count
}

// EventNameStatisticsData event name statistics item
type EventNameStatisticsData struct {
	EventName          string                 `json:"eventName"`          // Event name
	Install            int64                  `json:"install"`            // Install count (UA)
	Event              int64                  `json:"event"`              // Event count (UA)
	RetargetingInstall int64                  `json:"retargetingInstall"` // Retargeting Install count (RT)
	RetargetingEvent   int64                  `json:"retargetingEvent"`   // Retargeting Event count (RT)
	GroupDetails       []EventNameGroupDetail `json:"groupDetails"`       // Group details (ACC by account, APP by app_id)
}

// API: GET /api/dashboard/event-name-statistics - statistics grouped by event name
// Params:
//   - mode: ACC or APP (grouping for data filter)
//   - fromDate: start date YYYY-MM-DD
//   - toDate: end date YYYY-MM-DD
//   - accountNames: account name list (optional)
//   - appIds: app ID list (optional)
func (r *Runner) getEventNameStatisticsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	const maxEventNamesForFunnel = 8
	const maxGroupDetailsPerEvent = 30
	includeDetailsRaw := strings.TrimSpace(strings.ToLower(req.URL.Query().Get("includeDetails")))
	includeGroupDetails := includeDetailsRaw == "1" || includeDetailsRaw == "true" || includeDetailsRaw == "yes"
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	mode := req.URL.Query().Get("mode")   // ACC or APP (filter only, not grouping)
	badge := req.URL.Query().Get("badge") // UA or RT
	fromDate := req.URL.Query().Get("fromDate")
	toDate := req.URL.Query().Get("toDate")
	accountNames := req.URL.Query()["accountNames"]
	appIds := req.URL.Query()["appIds"]
	campaignIds := req.URL.Query()["campaignIds"] // Campaign ID list

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Validate mode param
	if mode != "ACC" && mode != "APP" {
		mode = "ACC" // Default ACC
	}

	// Validate badge and resolve table name
	var installTable, eventTable string
	if badge == "RT" {
		installTable = "Dashboard_Retargeting_Install_Postbacks"
		eventTable = "Dashboard_Retargeting_In_App_Event_Postbacks"
	} else {
		// Default UA
		installTable = "Dashboard_Install_Postbacks"
		eventTable = "Dashboard_In_App_Event_Postbacks"
	}

	// Align with Distribution Proportion: always filter by Team task scope regardless of account selection,
	// Avoid full-table data when accountNames empty.
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
	dateArgs := []interface{}{fromDate, toDate}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build WHERE clause
	var whereClause string
	var allArgs []interface{}
	if taskFilter != "" {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s %s %s", taskFilter, appFilter, campaignFilter, dateFilter)
		allArgs = append(allArgs, taskArgs...)
		allArgs = append(allArgs, appArgs...)
		if len(campaignArgs) > 0 {
			allArgs = append(allArgs, campaignArgs...)
		}
	} else if appFilter != "" {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s %s", appFilter, campaignFilter, dateFilter)
		allArgs = append(allArgs, appArgs...)
		if len(campaignArgs) > 0 {
			allArgs = append(allArgs, campaignArgs...)
		}
	} else {
		whereClause = fmt.Sprintf("WHERE 1=1 %s %s", campaignFilter, dateFilter)
		if len(campaignArgs) > 0 {
			allArgs = append(allArgs, campaignArgs...)
		}
	}
	allArgs = append(allArgs, dateArgs...)

	// Query table by badge param (UA or RT)
	// UA mode: query only Dashboard_Install_Postbacks and Dashboard_In_App_Event_Postbacks
	// RT mode: query only Dashboard_Retargeting_Install_Postbacks and Dashboard_Retargeting_In_App_Event_Postbacks

	query := fmt.Sprintf(`
		SELECT 
			COALESCE(event_name, 'UNKNOWN') AS event_name,
			COALESCE(SUM(install_count), 0) AS install,
			COALESCE(SUM(event_count), 0) AS event,
			0 AS retargeting_install,
			0 AS retargeting_event
		FROM (
			SELECT 
				COALESCE(event_name, 'Install') AS event_name,
				COUNT(*) AS install_count,
				0 AS event_count
			FROM %s
			%s
			GROUP BY COALESCE(event_name, 'Install')
			
			UNION ALL
			
			SELECT 
				COALESCE(event_name, 'Event') AS event_name,
				0 AS install_count,
				COUNT(*) AS event_count
			FROM %s
			%s AND event_name IS NOT NULL AND event_name != ''
			GROUP BY event_name
		) AS combined_data
		WHERE event_name IS NOT NULL AND event_name != ''
		GROUP BY event_name
		ORDER BY (install + event) DESC
		LIMIT %d
	`, installTable, whereClause, eventTable, whereClause, maxEventNamesForFunnel)

	// Repeat params twice (one per table)
	allArgs = append(allArgs, allArgs...)

	// Run query
	rows, err := r.DB.Query(query, allArgs...)
	if err != nil {
		log.Printf("Query event name statistics error: %v", err)
		http.Error(w, `{"success":false,"error":"查询Event Name统计数据失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var result []EventNameStatisticsData
	for rows.Next() {
		var eventName sql.NullString
		var install, event, retargetingInstall, retargetingEvent int64

		if err := rows.Scan(&eventName, &install, &event, &retargetingInstall, &retargetingEvent); err != nil {
			log.Printf("Scan event name statistics error: %v", err)
			continue
		}

		if !eventName.Valid || eventName.String == "" {
			continue
		}

		var groupDetails []EventNameGroupDetail
		eventNameStr := eventName.String
		if includeGroupDetails {
			// Keep original allArgs for groupDetails query
			originalArgs := make([]interface{}, len(allArgs)/2)
			copy(originalArgs, allArgs[:len(allArgs)/2])

			// Query group details per event_name (by account or app_id)
			// Query four tables: Install, Event, Retargeting Install, Retargeting Event
			var retargetingInstallTable, retargetingEventTable string
			retargetingInstallTable = "Dashboard_Retargeting_Install_Postbacks"
			retargetingEventTable = "Dashboard_Retargeting_In_App_Event_Postbacks"

			var installTableCondition string
			var installTableArgs []interface{}
			eventNameLower := strings.ToLower(strings.TrimSpace(eventNameStr))
			if eventNameLower == "install" {
				installTableCondition = "AND LOWER(event_name) = 'install'"
				installTableArgs = originalArgs
			} else {
				installTableCondition = "AND LOWER(event_name) = LOWER(?)"
				installTableArgs = append(originalArgs, eventNameStr)
			}

			var eventTableCondition string
			var eventTableArgs []interface{}
			if eventNameLower == "install" {
				eventTableCondition = "AND 1=0"
				eventTableArgs = originalArgs
			} else {
				eventTableCondition = "AND LOWER(event_name) = LOWER(?) AND event_name IS NOT NULL AND event_name != ''"
				eventTableArgs = append(originalArgs, eventNameStr)
			}

			var retargetingInstallTableCondition string
			var retargetingInstallTableArgs []interface{}
			if eventNameLower == "retargeting install" {
				retargetingInstallTableCondition = "AND LOWER(event_name) = 'retargeting install'"
				retargetingInstallTableArgs = originalArgs
			} else {
				retargetingInstallTableCondition = "AND LOWER(event_name) = LOWER(?)"
				retargetingInstallTableArgs = append(originalArgs, eventNameStr)
			}

			var retargetingEventTableCondition string
			var retargetingEventTableArgs []interface{}
			if eventNameLower == "retargeting install" {
				retargetingEventTableCondition = "AND 1=0"
				retargetingEventTableArgs = originalArgs
			} else {
				retargetingEventTableCondition = "AND LOWER(event_name) = LOWER(?) AND event_name IS NOT NULL AND event_name != ''"
				retargetingEventTableArgs = append(originalArgs, eventNameStr)
			}

			if mode == "ACC" {
				groupArgs := make([]interface{}, 0)
				groupArgs = append(groupArgs, installTableArgs...)
				groupArgs = append(groupArgs, eventTableArgs...)
				groupArgs = append(groupArgs, retargetingInstallTableArgs...)
				groupArgs = append(groupArgs, retargetingEventTableArgs...)

				groupQuery := fmt.Sprintf(`
				SELECT 
					account AS group_name,
					COALESCE(SUM(install_count), 0) AS install,
					COALESCE(SUM(event_count), 0) AS event,
					COALESCE(SUM(retargeting_install_count), 0) AS retargeting_install,
					COALESCE(SUM(retargeting_event_count), 0) AS retargeting_event
				FROM (
					-- Install表
					SELECT 
						account,
						COUNT(*) AS install_count,
						0 AS event_count,
						0 AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY account
					
					UNION ALL
					
					-- Event表
					SELECT 
						account,
						0 AS install_count,
						COUNT(*) AS event_count,
						0 AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY account
					
					UNION ALL
					
					-- Retargeting Install表
					SELECT 
						account,
						0 AS install_count,
						0 AS event_count,
						COUNT(*) AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY account
					
					UNION ALL
					
					-- Retargeting Event表
					SELECT 
						account,
						0 AS install_count,
						0 AS event_count,
						0 AS retargeting_install_count,
						COUNT(*) AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY account
				) AS combined_data
				WHERE account IS NOT NULL AND account != ''
				GROUP BY account
				ORDER BY (install + event + retargeting_install + retargeting_event) DESC
				LIMIT %d
			`, installTable, whereClause, installTableCondition, eventTable, whereClause, eventTableCondition, retargetingInstallTable, whereClause, retargetingInstallTableCondition, retargetingEventTable, whereClause, retargetingEventTableCondition, maxGroupDetailsPerEvent)

				groupRows, err := r.DB.Query(groupQuery, groupArgs...)
				if err != nil {
					log.Printf("Query groupDetails error for eventName %s (ACC mode): %v", eventNameStr, err)
				} else {
					defer groupRows.Close()
					for groupRows.Next() {
						var groupName sql.NullString
						var groupInstall, groupEvent, groupRetargetingInstall, groupRetargetingEvent int64
						if err := groupRows.Scan(&groupName, &groupInstall, &groupEvent, &groupRetargetingInstall, &groupRetargetingEvent); err == nil && groupName.Valid && groupName.String != "" {
							groupDetails = append(groupDetails, EventNameGroupDetail{
								GroupName:          groupName.String,
								Install:            groupInstall,
								Event:              groupEvent,
								RetargetingInstall: groupRetargetingInstall,
								RetargetingEvent:   groupRetargetingEvent,
							})
						}
					}
				}
			} else {
				groupArgs := make([]interface{}, 0)
				groupArgs = append(groupArgs, installTableArgs...)
				groupArgs = append(groupArgs, eventTableArgs...)
				groupArgs = append(groupArgs, retargetingInstallTableArgs...)
				groupArgs = append(groupArgs, retargetingEventTableArgs...)

				groupQuery := fmt.Sprintf(`
				SELECT 
					app_id AS group_name,
					COALESCE(SUM(install_count), 0) AS install,
					COALESCE(SUM(event_count), 0) AS event,
					COALESCE(SUM(retargeting_install_count), 0) AS retargeting_install,
					COALESCE(SUM(retargeting_event_count), 0) AS retargeting_event
				FROM (
					-- Install表
					SELECT 
						app_id,
						COUNT(*) AS install_count,
						0 AS event_count,
						0 AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY app_id
					
					UNION ALL
					
					-- Event表
					SELECT 
						app_id,
						0 AS install_count,
						COUNT(*) AS event_count,
						0 AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY app_id
					
					UNION ALL
					
					-- Retargeting Install表
					SELECT 
						app_id,
						0 AS install_count,
						0 AS event_count,
						COUNT(*) AS retargeting_install_count,
						0 AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY app_id
					
					UNION ALL
					
					-- Retargeting Event表
					SELECT 
						app_id,
						0 AS install_count,
						0 AS event_count,
						0 AS retargeting_install_count,
						COUNT(*) AS retargeting_event_count
					FROM %s
					%s %s
					GROUP BY app_id
				) AS combined_data
				WHERE app_id IS NOT NULL AND app_id != ''
				GROUP BY app_id
				ORDER BY (install + event + retargeting_install + retargeting_event) DESC
				LIMIT %d
			`, installTable, whereClause, installTableCondition, eventTable, whereClause, eventTableCondition, retargetingInstallTable, whereClause, retargetingInstallTableCondition, retargetingEventTable, whereClause, retargetingEventTableCondition, maxGroupDetailsPerEvent)

				groupRows, err := r.DB.Query(groupQuery, groupArgs...)
				if err != nil {
					log.Printf("Query groupDetails error for eventName %s (APP mode): %v", eventNameStr, err)
				} else {
					defer groupRows.Close()
					for groupRows.Next() {
						var groupName sql.NullString
						var groupInstall, groupEvent, groupRetargetingInstall, groupRetargetingEvent int64
						if err := groupRows.Scan(&groupName, &groupInstall, &groupEvent, &groupRetargetingInstall, &groupRetargetingEvent); err == nil && groupName.Valid && groupName.String != "" {
							inPlace, inArgs := inClausePlaceholder(userIDs)
							if inPlace == "" {
								inPlace, inArgs = "?", []interface{}{getUserID(req)}
							}
							var appName sql.NullString
							q := fmt.Sprintf(`
							SELECT DISTINCT ta.app_name
							FROM task_apps ta
							INNER JOIN tasks t ON ta.task_id = t.id
							WHERE ta.app_id = ? AND t.user_id IN (%s)
							LIMIT 1
						`, inPlace)
							r.DB.QueryRow(q, append([]interface{}{groupName.String}, inArgs...)...).Scan(&appName)

							displayName := groupName.String
							if appName.Valid && appName.String != "" {
								displayName = appName.String
							}

							groupDetails = append(groupDetails, EventNameGroupDetail{
								GroupName:          displayName,
								Install:            groupInstall,
								Event:              groupEvent,
								RetargetingInstall: groupRetargetingInstall,
								RetargetingEvent:   groupRetargetingEvent,
							})
						}
					}
				}
			}
		}

		result = append(result, EventNameStatisticsData{
			EventName:          eventName.String,
			Install:            install,
			Event:              event,
			RetargetingInstall: 0, // Count data type by badge param only
			RetargetingEvent:   0, // Count data type by badge param only
			GroupDetails:       groupDetails,
		})
	}

	response := map[string]interface{}{
		"success": true,
		"data":    result,
	}

	json.NewEncoder(w).Encode(response)
}

// RegionalStatisticsData regional statistics
type RegionalStatisticsData struct {
	Country   string           `json:"country"`             // Country code
	Count     int64            `json:"count"`               // Count (Install or Event mode total)
	EventData map[string]int64 `json:"eventData,omitempty"` // Event mode: count per event name
}

// AffiliateChannelData Affiliate Channel bubble chart item
type AffiliateChannelData struct {
	Name      string           `json:"name"`                // Bubble display name
	Channel   string           `json:"channel"`             // channel field
	GroupName string           `json:"groupName"`           // ALL empty; ACC is account; APP is app_id
	Count     int64            `json:"count"`               // Count (bubble size)
	EventData map[string]int64 `json:"eventData,omitempty"` // Event mode: count per event_name
}

// API: GET /api/dashboard/regional-statistics - regional stats by country
// Params:
//   - groupBy: ACC or APP (grouping)
//   - dataType: UA or RT (data type)
//   - fromDate: start date YYYY-MM-DD
//   - toDate: end date YYYY-MM-DD
//   - accountNames: account name list (optional)
//   - appIds: app ID list (optional)
func (r *Runner) getRegionalStatisticsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	// Get query params
	groupBy := req.URL.Query().Get("groupBy")               // ALL, ACC, or APP
	statisticsType := req.URL.Query().Get("statisticsType") // Install or Event
	dataType := req.URL.Query().Get("dataType")             // UA or RT
	fromDate := req.URL.Query().Get("fromDate")
	toDate := req.URL.Query().Get("toDate")
	accountNames := req.URL.Query()["accountNames"]
	appIds := req.URL.Query()["appIds"]
	campaignIds := req.URL.Query()["campaignIds"] // Campaign ID list

	// Validate date params
	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}

	// Validate groupBy param
	if groupBy != "ALL" && groupBy != "ACC" && groupBy != "APP" {
		groupBy = "ALL" // Default ALL
	}

	// Validate statisticsType; default Event (backward compat)
	if statisticsType != "Install" && statisticsType != "Event" {
		// If no statisticsType, infer from groupBy (backward compat)
		if groupBy == "APP" {
			statisticsType = "Event"
		} else {
			statisticsType = "Install"
		}
	}

	// Debug log: record params before tableName resolved
	log.Printf("Regional statistics request - groupBy: %s, statisticsType: %s, dataType: %s",
		groupBy, statisticsType, dataType)

	// Validate dataType and resolve table name
	var tableName string
	if dataType == "RT" {
		// RT mode: select table by statisticsType
		if statisticsType == "Event" {
			tableName = "Dashboard_Retargeting_In_App_Event_Postbacks"
		} else {
			tableName = "Dashboard_Retargeting_Install_Postbacks"
		}
	} else {
		// UA mode: select table by statisticsType
		if statisticsType == "Event" {
			tableName = "Dashboard_In_App_Event_Postbacks"
		} else {
			tableName = "Dashboard_Install_Postbacks" // Default UA
		}
	}

	// Debug log: resolved table name
	log.Printf("Regional statistics - determined tableName: %s", tableName)

	// Match other Dashboard charts: always scope tasks first to avoid full-table queries.
	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	// Build app ID filter
	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		placeholders := make([]string, len(appIds))
		for i, appId := range appIds {
			placeholders[i] = "?"
			appArgs = append(appArgs, appId)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Build Campaign ID filter
	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		placeholders := make([]string, len(campaignIds))
		for i, campaignId := range campaignIds {
			placeholders[i] = "?"
			campaignArgs = append(campaignArgs, campaignId)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(placeholders, ","))
	}

	// Date filter: all tables use event_time (matches Dashboard Installations / Events cards exactly)
	// Notes:
	// - Dashboard_Install_Postbacks has both install_time (AppsFlyer-reported install time) and event_time (postback ingest time),
	//   TZ/latency may put them on different days; install_time here vs event_time on Installations card,
	//   totals and country breakdown diverge (e.g. card US=132 vs chart US=98 plus 2 DE).
	// - Regional chart must use the same time field as cards. event_time = install time in Install table, event time in Event table.
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"
	dateArgs := []interface{}{fromDate, toDate}

	// Grouping by groupBy param
	if groupBy == "ACC" {
		// ACC mode: group by account; each account returns country stats
		// First get all accounts with data
		var accountsQuery string
		var accountsArgs []interface{}

		if taskFilter != "" {
			accountsQuery = fmt.Sprintf(`
				SELECT DISTINCT d.account
				FROM %s d
				WHERE 1=1 %s %s %s %s AND d.account IS NOT NULL AND d.account != ''
			`, tableName, taskFilter, appFilter, campaignFilter, dateFilter)
			accountsArgs = append(accountsArgs, taskArgs...)
			accountsArgs = append(accountsArgs, appArgs...)
			if len(campaignArgs) > 0 {
				accountsArgs = append(accountsArgs, campaignArgs...)
			}
		} else {
			if appFilter != "" {
				accountsQuery = fmt.Sprintf(`
					SELECT DISTINCT d.account
					FROM %s d
					WHERE 1=1 %s %s %s AND d.account IS NOT NULL AND d.account != ''
				`, tableName, appFilter, campaignFilter, dateFilter)
				accountsArgs = append(accountsArgs, appArgs...)
				if len(campaignArgs) > 0 {
					accountsArgs = append(accountsArgs, campaignArgs...)
				}
			} else {
				accountsQuery = fmt.Sprintf(`
					SELECT DISTINCT d.account
					FROM %s d
					WHERE 1=1 %s %s AND d.account IS NOT NULL AND d.account != ''
				`, tableName, campaignFilter, dateFilter)
				if len(campaignArgs) > 0 {
					accountsArgs = append(accountsArgs, campaignArgs...)
				}
			}
		}
		accountsArgs = append(accountsArgs, dateArgs...)

		accountsRows, err := r.DB.Query(accountsQuery, accountsArgs...)
		if err != nil {
			log.Printf("Query accounts error: %v", err)
			http.Error(w, `{"success":false,"error":"查询账户列表失败"}`, http.StatusInternalServerError)
			return
		}
		defer accountsRows.Close()

		var accounts []string
		for accountsRows.Next() {
			var account string
			if err := accountsRows.Scan(&account); err == nil {
				accounts = append(accounts, account)
			}
		}

		// Query country stats per account
		type AccountRegionalData struct {
			Account string                   `json:"account"`
			Icon    string                   `json:"icon,omitempty"`
			Data    []RegionalStatisticsData `json:"data"`
		}

		var groupedResult []AccountRegionalData
		for _, account := range accounts {
			// Get account icon
			var accountIcon sql.NullString
			var accountID string
			if len(taskIDs) > 0 {
				taskPlaceholders := make([]string, len(taskIDs))
				scopedArgs := make([]interface{}, 0, 1+len(taskIDs))
				scopedArgs = append(scopedArgs, account)
				for i, taskID := range taskIDs {
					taskPlaceholders[i] = "?"
					scopedArgs = append(scopedArgs, taskID)
				}
				q := fmt.Sprintf(`
					SELECT ac.id, ac.custom_icon 
					FROM account_configs ac
					INNER JOIN tasks t ON t.account_id = ac.id
					WHERE LOWER(TRIM(ac.account_name)) = LOWER(TRIM(?))
					  AND t.id IN (%s)
					ORDER BY t.updated_at DESC
					LIMIT 1
				`, strings.Join(taskPlaceholders, ","))
				_ = r.DB.QueryRow(q, scopedArgs...).Scan(&accountID, &accountIcon)
			}

			iconStr := ""
			if accountIcon.Valid {
				iconStr = accountIcon.String
			}

			// Query country stats for account
			var countryData []RegionalStatisticsData

			if statisticsType == "Event" {
				// Event mode: group by country and event_name
				var countryQuery string
				var countryArgs []interface{}

				// Fix: no longer filter event_name IS NOT NULL AND event_name != '' to match Dashboard Events card totals.
				accountFilter := " AND d.account = ?"
				if taskFilter != "" {
					countryQuery = fmt.Sprintf(`
						SELECT 
							COALESCE(d.country_code, 'Unknown') AS country,
							COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
							COUNT(*) AS count
						FROM %s d
						WHERE 1=1 %s %s %s %s %s
						GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
						ORDER BY d.country_code, count DESC
					`, tableName, taskFilter, appFilter, campaignFilter, dateFilter, accountFilter)
					countryArgs = append(countryArgs, taskArgs...)
					countryArgs = append(countryArgs, appArgs...)
					if len(campaignArgs) > 0 {
						countryArgs = append(countryArgs, campaignArgs...)
					}
				} else {
					if appFilter != "" {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s %s
							GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
							ORDER BY d.country_code, count DESC
						`, tableName, appFilter, campaignFilter, dateFilter, accountFilter)
						countryArgs = append(countryArgs, appArgs...)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					} else {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s
							GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
							ORDER BY d.country_code, count DESC
						`, tableName, campaignFilter, dateFilter, accountFilter)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					}
				}
				countryArgs = append(countryArgs, dateArgs...)
				countryArgs = append(countryArgs, account)

				countryRows, err := r.DB.Query(countryQuery, countryArgs...)
				if err != nil {
					log.Printf("Query country data for account %s error: %v", account, err)
					continue
				}

				// Aggregate event name data by country
				countryMap := make(map[string]*RegionalStatisticsData)
				for countryRows.Next() {
					var country string
					var eventName string
					var count int64
					if err := countryRows.Scan(&country, &eventName, &count); err == nil {
						if countryDataItem, exists := countryMap[country]; exists {
							countryDataItem.Count += count
							countryDataItem.EventData[eventName] = count
						} else {
							countryMap[country] = &RegionalStatisticsData{
								Country:   country,
								Count:     count,
								EventData: map[string]int64{eventName: count},
							}
						}
					}
				}
				countryRows.Close()

				// Convert to array
				for _, data := range countryMap {
					countryData = append(countryData, *data)
				}

				// Sort by total count
				sort.Slice(countryData, func(i, j int) bool {
					return countryData[i].Count > countryData[j].Count
				})
			} else {
				// Install mode: group by country (original logic)
				var countryQuery string
				var countryArgs []interface{}

				accountFilter := " AND d.account = ?"
				if taskFilter != "" {
					countryQuery = fmt.Sprintf(`
						SELECT 
							COALESCE(d.country_code, 'Unknown') AS country,
							COUNT(*) AS count
						FROM %s d
						WHERE 1=1 %s %s %s %s %s
						GROUP BY d.country_code
						ORDER BY count DESC
					`, tableName, taskFilter, appFilter, campaignFilter, dateFilter, accountFilter)
					countryArgs = append(countryArgs, taskArgs...)
					countryArgs = append(countryArgs, appArgs...)
					if len(campaignArgs) > 0 {
						countryArgs = append(countryArgs, campaignArgs...)
					}
				} else {
					if appFilter != "" {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s %s
							GROUP BY d.country_code
							ORDER BY count DESC
						`, tableName, appFilter, campaignFilter, dateFilter, accountFilter)
						countryArgs = append(countryArgs, appArgs...)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					} else {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s
							GROUP BY d.country_code
							ORDER BY count DESC
						`, tableName, campaignFilter, dateFilter, accountFilter)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					}
				}
				countryArgs = append(countryArgs, dateArgs...)
				countryArgs = append(countryArgs, account)

				countryRows, err := r.DB.Query(countryQuery, countryArgs...)
				if err != nil {
					log.Printf("Query country data for account %s error: %v", account, err)
					continue
				}

				for countryRows.Next() {
					var country string
					var count int64
					if err := countryRows.Scan(&country, &count); err == nil {
						countryData = append(countryData, RegionalStatisticsData{
							Country: country,
							Count:   count,
						})
					}
				}
				countryRows.Close()
			}

			if len(countryData) > 0 {
				groupedResult = append(groupedResult, AccountRegionalData{
					Account: account,
					Icon:    iconStr,
					Data:    countryData,
				})
			}
		}

		response := map[string]interface{}{
			"success": true,
			"data":    groupedResult,
		}
		json.NewEncoder(w).Encode(response)
		return
	} else if groupBy == "APP" {
		// APP mode: group by app_id and platform; each app+platform returns country stats
		// First get all app_id and platform combos with data
		var appsQuery string
		var appsArgs []interface{}

		if taskFilter != "" {
			appsQuery = fmt.Sprintf(`
				SELECT DISTINCT d.app_id, d.platform
				FROM %s d
				WHERE 1=1 %s %s %s %s AND d.app_id IS NOT NULL AND d.app_id != '' AND d.platform IS NOT NULL AND d.platform != ''
			`, tableName, taskFilter, appFilter, campaignFilter, dateFilter)
			appsArgs = append(appsArgs, taskArgs...)
			appsArgs = append(appsArgs, appArgs...)
			if len(campaignArgs) > 0 {
				appsArgs = append(appsArgs, campaignArgs...)
			}
		} else {
			if appFilter != "" {
				appsQuery = fmt.Sprintf(`
					SELECT DISTINCT d.app_id, d.platform
					FROM %s d
					WHERE 1=1 %s %s %s AND d.app_id IS NOT NULL AND d.app_id != '' AND d.platform IS NOT NULL AND d.platform != ''
				`, tableName, appFilter, campaignFilter, dateFilter)
				appsArgs = append(appsArgs, appArgs...)
				if len(campaignArgs) > 0 {
					appsArgs = append(appsArgs, campaignArgs...)
				}
			} else {
				appsQuery = fmt.Sprintf(`
					SELECT DISTINCT d.app_id, d.platform
					FROM %s d
					WHERE 1=1 %s %s AND d.app_id IS NOT NULL AND d.app_id != '' AND d.platform IS NOT NULL AND d.platform != ''
				`, tableName, campaignFilter, dateFilter)
				if len(campaignArgs) > 0 {
					appsArgs = append(appsArgs, campaignArgs...)
				}
			}
		}
		appsArgs = append(appsArgs, dateArgs...)

		appsRows, err := r.DB.Query(appsQuery, appsArgs...)
		if err != nil {
			log.Printf("Query apps error: %v", err)
			http.Error(w, `{"success":false,"error":"查询应用列表失败"}`, http.StatusInternalServerError)
			return
		}
		defer appsRows.Close()

		type AppPlatform struct {
			AppId    string
			Platform string
		}
		var appPlatforms []AppPlatform
		for appsRows.Next() {
			var appId string
			var platform string
			if err := appsRows.Scan(&appId, &platform); err == nil {
				appPlatforms = append(appPlatforms, AppPlatform{
					AppId:    appId,
					Platform: platform,
				})
			}
		}

		// Query country stats per app+platform combo
		type AppRegionalData struct {
			AppId    string                   `json:"appId"`
			AppName  string                   `json:"appName,omitempty"`
			Platform string                   `json:"platform,omitempty"`
			Icon     string                   `json:"icon,omitempty"`
			Data     []RegionalStatisticsData `json:"data"`
		}

		var groupedResult []AppRegionalData
		for _, appPlatform := range appPlatforms {
			appId := appPlatform.AppId
			platform := appPlatform.Platform

			// Get app name and icon from apps_finder
			var appName sql.NullString
			var appIcon sql.NullString
			r.DB.QueryRow(`
				SELECT app_name, icon_url 
				FROM apps_finder 
				WHERE app_id = ?
				LIMIT 1
			`, appId).Scan(&appName, &appIcon)

			nameStr := appId
			if appName.Valid {
				nameStr = appName.String
			}

			iconStr := ""
			if appIcon.Valid {
				iconStr = appIcon.String
			}

			// Query country stats for app+platform
			var countryData []RegionalStatisticsData

			if statisticsType == "Event" {
				// Event mode: group by country and event_name
				var countryQuery string
				var countryArgs []interface{}

				// Fix: drop non-empty event_name filter (align with Events card); use COALESCE(NULLIF(...), 'Unknown') consistently.
				appIdFilter := " AND d.app_id = ? AND d.platform = ?"
				if taskFilter != "" {
					countryQuery = fmt.Sprintf(`
						SELECT 
							COALESCE(d.country_code, 'Unknown') AS country,
							COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
							COUNT(*) AS count
						FROM %s d
						WHERE 1=1 %s %s %s %s %s
						GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
						ORDER BY d.country_code, count DESC
					`, tableName, taskFilter, appFilter, campaignFilter, dateFilter, appIdFilter)
					countryArgs = append(countryArgs, taskArgs...)
					countryArgs = append(countryArgs, appArgs...)
					if len(campaignArgs) > 0 {
						countryArgs = append(countryArgs, campaignArgs...)
					}
				} else {
					if appFilter != "" {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s %s
							GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
							ORDER BY d.country_code, count DESC
						`, tableName, appFilter, campaignFilter, dateFilter, appIdFilter)
						countryArgs = append(countryArgs, appArgs...)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					} else {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COALESCE(NULLIF(d.event_name, ''), 'Unknown') AS event_name,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s
							GROUP BY d.country_code, COALESCE(NULLIF(d.event_name, ''), 'Unknown')
							ORDER BY d.country_code, count DESC
						`, tableName, campaignFilter, dateFilter, appIdFilter)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					}
				}
				countryArgs = append(countryArgs, dateArgs...)
				countryArgs = append(countryArgs, appId)
				countryArgs = append(countryArgs, platform)

				countryRows, err := r.DB.Query(countryQuery, countryArgs...)
				if err != nil {
					log.Printf("Query country data for app %s platform %s error: %v", appId, platform, err)
					continue
				}

				// Aggregate event name data by country
				countryMap := make(map[string]*RegionalStatisticsData)
				for countryRows.Next() {
					var country string
					var eventName string
					var count int64
					if err := countryRows.Scan(&country, &eventName, &count); err == nil {
						if countryDataItem, exists := countryMap[country]; exists {
							countryDataItem.Count += count
							countryDataItem.EventData[eventName] = count
						} else {
							countryMap[country] = &RegionalStatisticsData{
								Country:   country,
								Count:     count,
								EventData: map[string]int64{eventName: count},
							}
						}
					}
				}
				countryRows.Close()

				// Convert to array
				for _, data := range countryMap {
					countryData = append(countryData, *data)
				}

				// Sort by total count
				sort.Slice(countryData, func(i, j int) bool {
					return countryData[i].Count > countryData[j].Count
				})
			} else {
				// Install mode: group by country (original logic)
				var countryQuery string
				var countryArgs []interface{}

				appIdFilter := " AND d.app_id = ? AND d.platform = ?"
				if taskFilter != "" {
					countryQuery = fmt.Sprintf(`
						SELECT 
							COALESCE(d.country_code, 'Unknown') AS country,
							COUNT(*) AS count
						FROM %s d
						WHERE 1=1 %s %s %s %s %s
						GROUP BY d.country_code
						ORDER BY count DESC
					`, tableName, taskFilter, appFilter, campaignFilter, dateFilter, appIdFilter)
					countryArgs = append(countryArgs, taskArgs...)
					countryArgs = append(countryArgs, appArgs...)
					if len(campaignArgs) > 0 {
						countryArgs = append(countryArgs, campaignArgs...)
					}
				} else {
					if appFilter != "" {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s %s
							GROUP BY d.country_code
							ORDER BY count DESC
						`, tableName, appFilter, campaignFilter, dateFilter, appIdFilter)
						countryArgs = append(countryArgs, appArgs...)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					} else {
						countryQuery = fmt.Sprintf(`
							SELECT 
								COALESCE(d.country_code, 'Unknown') AS country,
								COUNT(*) AS count
							FROM %s d
							WHERE 1=1 %s %s %s
							GROUP BY d.country_code
							ORDER BY count DESC
						`, tableName, campaignFilter, dateFilter, appIdFilter)
						if len(campaignArgs) > 0 {
							countryArgs = append(countryArgs, campaignArgs...)
						}
					}
				}
				countryArgs = append(countryArgs, dateArgs...)
				countryArgs = append(countryArgs, appId)
				countryArgs = append(countryArgs, platform)

				countryRows, err := r.DB.Query(countryQuery, countryArgs...)
				if err != nil {
					log.Printf("Query country data for app %s platform %s error: %v", appId, platform, err)
					continue
				}

				for countryRows.Next() {
					var country string
					var count int64
					if err := countryRows.Scan(&country, &count); err == nil {
						countryData = append(countryData, RegionalStatisticsData{
							Country: country,
							Count:   count,
						})
					}
				}
				countryRows.Close()
			}

			if len(countryData) > 0 {
				groupedResult = append(groupedResult, AppRegionalData{
					AppId:    appId,
					AppName:  nameStr,
					Platform: platform,
					Icon:     iconStr,
					Data:     countryData,
				})
			}
		}

		response := map[string]interface{}{
			"success": true,
			"data":    groupedResult,
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// ALL mode: group and count by country_code
	// Event mode: group by country and event_name, then aggregate
	var result []RegionalStatisticsData

	if statisticsType == "Event" {
		// Event mode: group by country and event_name
		log.Printf("Regional statistics - Entering Event mode for table: %s", tableName)
		var query string
		var args []interface{}

		// Fix: no longer filter event_name IS NOT NULL AND event_name != '' to match Dashboard Events card totals;
		// Use COALESCE(NULLIF(event_name,''),'Unknown') to bucket NULL/empty into Unknown.
		if taskFilter != "" {
			query = fmt.Sprintf(`
				SELECT 
					COALESCE(country_code, 'Unknown') AS country,
					COALESCE(NULLIF(event_name, ''), 'Unknown') AS event_name,
					COUNT(*) AS count
				FROM %s
				WHERE 1=1 %s %s %s %s
				GROUP BY country_code, COALESCE(NULLIF(event_name, ''), 'Unknown')
				ORDER BY country_code, count DESC
			`, tableName, taskFilter, appFilter, campaignFilter, dateFilter)
			args = append(args, taskArgs...)
			args = append(args, appArgs...)
			if len(campaignArgs) > 0 {
				args = append(args, campaignArgs...)
			}
		} else {
			if appFilter != "" {
				query = fmt.Sprintf(`
					SELECT 
						COALESCE(country_code, 'Unknown') AS country,
						COALESCE(NULLIF(event_name, ''), 'Unknown') AS event_name,
						COUNT(*) AS count
					FROM %s
					WHERE 1=1 %s %s %s
					GROUP BY country_code, COALESCE(NULLIF(event_name, ''), 'Unknown')
					ORDER BY country_code, count DESC
				`, tableName, appFilter, campaignFilter, dateFilter)
				args = append(args, appArgs...)
				if len(campaignArgs) > 0 {
					args = append(args, campaignArgs...)
				}
			} else {
				query = fmt.Sprintf(`
					SELECT 
						COALESCE(country_code, 'Unknown') AS country,
						COALESCE(NULLIF(event_name, ''), 'Unknown') AS event_name,
						COUNT(*) AS count
					FROM %s
					WHERE 1=1 %s %s
					GROUP BY country_code, COALESCE(NULLIF(event_name, ''), 'Unknown')
					ORDER BY country_code, count DESC
				`, tableName, campaignFilter, dateFilter)
				if len(campaignArgs) > 0 {
					args = append(args, campaignArgs...)
				}
			}
		}
		args = append(args, dateArgs...)

		// Run query
		log.Printf("Regional statistics Event mode - Executing query: %s", query)
		log.Printf("Regional statistics Event mode - Query args: %v", args)
		rows, err := r.DB.Query(query, args...)
		if err != nil {
			log.Printf("Query regional statistics error: %v", err)
			http.Error(w, `{"success":false,"error":"查询区域统计数据失败"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		// Aggregate event name data by country
		countryMap := make(map[string]*RegionalStatisticsData)
		rowCount := 0
		for rows.Next() {
			rowCount++
			var country string
			var eventName string
			var count int64
			if err := rows.Scan(&country, &eventName, &count); err != nil {
				log.Printf("Scan regional statistics error: %v", err)
				continue
			}

			// Ensure eventName non-empty: SQL uses COALESCE(NULLIF(event_name,''),'Unknown');
			// Client-side guard: driver may map NULL to empty string in edge cases.
			if eventName == "" {
				eventName = "Unknown"
			}

			log.Printf("Processing row: country=%s, eventName=%s, count=%d", country, eventName, count)

			if countryData, exists := countryMap[country]; exists {
				countryData.Count += count
				if countryData.EventData == nil {
					countryData.EventData = make(map[string]int64)
				}
				countryData.EventData[eventName] = count
				log.Printf("Updated country %s: total count=%d, eventData=%v", country, countryData.Count, countryData.EventData)
			} else {
				countryMap[country] = &RegionalStatisticsData{
					Country:   country,
					Count:     count,
					EventData: map[string]int64{eventName: count},
				}
				log.Printf("Created new country %s: count=%d, eventData=%v", country, count, countryMap[country].EventData)
			}
		}

		// Debug log: query results
		if rowCount == 0 {
			log.Printf("Warning: Event mode query returned 0 rows for table %s", tableName)
		} else {
			log.Printf("Event mode query returned %d rows, countryMap size: %d", rowCount, len(countryMap))
			// Log eventData in countryMap
			for country, data := range countryMap {
				log.Printf("Country: %s, Count: %d, EventData: %v", country, data.Count, data.EventData)
			}
		}

		// Convert to array
		for _, data := range countryMap {
			result = append(result, *data)
		}

		// Sort by total count
		sort.Slice(result, func(i, j int) bool {
			return result[i].Count > result[j].Count
		})

		// Debug log: final results
		log.Printf("Event mode - Final result count: %d", len(result))
		for i, item := range result {
			if i < 3 { // Log first 3 only
				log.Printf("Result[%d]: Country=%s, Count=%d, EventData=%v, EventData size=%d", i, item.Country, item.Count, item.EventData, len(item.EventData))
			}
		}

		// Ensure all results have EventData (init even if empty)
		for i := range result {
			if result[i].EventData == nil {
				result[i].EventData = make(map[string]int64)
				log.Printf("Warning: Result[%d] EventData was nil, initialized empty map", i)
			}
		}
	} else {
		log.Printf("Regional statistics - Entering Install mode for table: %s", tableName)
		// Install mode: group by country (original logic)
		var query string
		var args []interface{}

		if taskFilter != "" {
			query = fmt.Sprintf(`
				SELECT 
					COALESCE(country_code, 'Unknown') AS country,
					COUNT(*) AS count
				FROM %s
				WHERE 1=1 %s %s %s %s
				GROUP BY country_code
				ORDER BY count DESC
			`, tableName, taskFilter, appFilter, campaignFilter, dateFilter)
			args = append(args, taskArgs...)
			args = append(args, appArgs...)
			if len(campaignArgs) > 0 {
				args = append(args, campaignArgs...)
			}
		} else {
			if appFilter != "" {
				query = fmt.Sprintf(`
					SELECT 
						COALESCE(country_code, 'Unknown') AS country,
						COUNT(*) AS count
					FROM %s
					WHERE 1=1 %s %s %s
					GROUP BY country_code
					ORDER BY count DESC
				`, tableName, appFilter, campaignFilter, dateFilter)
				args = append(args, appArgs...)
				if len(campaignArgs) > 0 {
					args = append(args, campaignArgs...)
				}
			} else {
				query = fmt.Sprintf(`
					SELECT 
						COALESCE(country_code, 'Unknown') AS country,
						COUNT(*) AS count
					FROM %s
					WHERE 1=1 %s %s
					GROUP BY country_code
					ORDER BY count DESC
				`, tableName, campaignFilter, dateFilter)
				if len(campaignArgs) > 0 {
					args = append(args, campaignArgs...)
				}
			}
		}
		args = append(args, dateArgs...)

		// Run query
		rows, err := r.DB.Query(query, args...)
		if err != nil {
			log.Printf("Query regional statistics error: %v", err)
			http.Error(w, `{"success":false,"error":"查询区域统计数据失败"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var country string
			var count int64
			if err := rows.Scan(&country, &count); err != nil {
				log.Printf("Scan regional statistics error: %v", err)
				continue
			}
			result = append(result, RegionalStatisticsData{
				Country: country,
				Count:   count,
			})
		}
	}

	// Debug log: final response data
	log.Printf("Final response - result count: %d, statisticsType: %s", len(result), statisticsType)
	if len(result) > 0 {
		eventDataSize := 0
		if result[0].EventData != nil {
			eventDataSize = len(result[0].EventData)
		}
		log.Printf("First result item: Country=%s, Count=%d, EventData=%v, EventData size=%d",
			result[0].Country, result[0].Count, result[0].EventData, eventDataSize)
	}

	response := map[string]interface{}{
		"success": true,
		"data":    result,
	}

	json.NewEncoder(w).Encode(response)
}

// API: GET /api/dashboard/affiliate-channels - Affiliate Channel chart data
// Params:
//   - groupBy: ALL | ACC | APP (grouping)
//   - statisticsType: Install | Event (stat type)
//   - dataType: UA | RT (data type)
//   - accountNames/appIds/campaignIds/fromDate/toDate (filters)
func (r *Runner) getAffiliateChannelHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, _ := r.getEffectiveUserIDs(req)
	if len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	accountNames := req.URL.Query()["accountNames"]
	appIds := req.URL.Query()["appIds"]
	campaignIds := req.URL.Query()["campaignIds"]
	fromDate := req.URL.Query().Get("fromDate")
	toDate := req.URL.Query().Get("toDate")
	groupBy := req.URL.Query().Get("groupBy")
	statisticsType := req.URL.Query().Get("statisticsType")
	dataType := req.URL.Query().Get("dataType")

	if fromDate == "" || toDate == "" {
		http.Error(w, `{"success":false,"error":"日期参数不能为空"}`, http.StatusBadRequest)
		return
	}
	if groupBy != "ALL" && groupBy != "ACC" && groupBy != "APP" {
		groupBy = "ALL"
	}
	if statisticsType != "Install" && statisticsType != "Event" {
		statisticsType = "Event"
	}

	// Table selection (aligned with Regional Statistics)
	var tableName string
	if dataType == "RT" {
		if statisticsType == "Event" {
			tableName = "Dashboard_Retargeting_In_App_Event_Postbacks"
		} else {
			tableName = "Dashboard_Retargeting_Install_Postbacks"
		}
	} else {
		if statisticsType == "Event" {
			tableName = "Dashboard_In_App_Event_Postbacks"
		} else {
			tableName = "Dashboard_Install_Postbacks"
		}
	}

	taskIDs := r.dashboardScopedTaskIDs(userIDs, accountNames)
	taskFilter, taskArgs := dashboardTaskFilterSQL(taskIDs)

	var appFilter string
	var appArgs []interface{}
	if len(appIds) > 0 {
		ph := make([]string, len(appIds))
		for i, appID := range appIds {
			ph[i] = "?"
			appArgs = append(appArgs, appID)
		}
		appFilter = fmt.Sprintf(" AND app_id IN (%s)", strings.Join(ph, ","))
	}

	var campaignFilter string
	var campaignArgs []interface{}
	if len(campaignIds) > 0 {
		ph := make([]string, len(campaignIds))
		for i, cid := range campaignIds {
			ph[i] = "?"
			campaignArgs = append(campaignArgs, cid)
		}
		campaignFilter = fmt.Sprintf(" AND campaign_id IN (%s)", strings.Join(ph, ","))
	}

	// Date filter: matches Dashboard Installations/Events cards; uses event_time consistently.
	// event_time is install time in Install table; install_time would mismatch card date attribution,
	// channel totals mismatch cards (see comments above getRegionalStatisticsHandler).
	dateFilter := " AND event_time IS NOT NULL AND DATE(event_time) >= ? AND DATE(event_time) <= ?"

	whereClause := fmt.Sprintf("WHERE 1=1 %s %s %s %s", taskFilter, appFilter, campaignFilter, dateFilter)
	args := make([]interface{}, 0, len(taskArgs)+len(appArgs)+len(campaignArgs)+2)
	args = append(args, taskArgs...)
	args = append(args, appArgs...)
	args = append(args, campaignArgs...)
	args = append(args, fromDate, toDate)

	channelExpr := "COALESCE(NULLIF(TRIM(channel), ''), 'Unknown')"
	groupExpr := "''"
	groupByClause := "channel_name"
	var query string
	switch groupBy {
	case "ACC":
		groupExpr = "COALESCE(NULLIF(TRIM(account), ''), 'Unknown')"
		groupByClause = "group_name, channel_name"
		query = fmt.Sprintf(`
			SELECT
				%s AS group_name,
				%s AS channel_name,
				COUNT(*) AS cnt
			FROM %s
			%s
			GROUP BY %s
			ORDER BY cnt DESC
			LIMIT 80
		`, groupExpr, channelExpr, tableName, whereClause, groupByClause)
	case "APP":
		groupExpr = "COALESCE(NULLIF(TRIM(app_id), ''), 'Unknown')"
		groupByClause = "group_name, channel_name"
		query = fmt.Sprintf(`
			SELECT
				%s AS group_name,
				%s AS channel_name,
				COUNT(*) AS cnt
			FROM %s
			%s
			GROUP BY %s
			ORDER BY cnt DESC
			LIMIT 80
		`, groupExpr, channelExpr, tableName, whereClause, groupByClause)
	default:
		query = fmt.Sprintf(`
			SELECT
				%s AS group_name,
				%s AS channel_name,
				COUNT(*) AS cnt
			FROM %s
			%s
			GROUP BY %s
			ORDER BY cnt DESC
			LIMIT 80
		`, groupExpr, channelExpr, tableName, whereClause, groupByClause)
	}

	rows, err := r.DB.Query(query, args...)
	if err != nil {
		log.Printf("Query affiliate channels error: %v", err)
		http.Error(w, `{"success":false,"error":"查询Affiliate Channel数据失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]AffiliateChannelData, 0, 64)
	indexByKey := make(map[string]int, 64)
	for rows.Next() {
		var groupName sql.NullString
		var channelName sql.NullString
		var cnt int64
		if err := rows.Scan(&groupName, &channelName, &cnt); err != nil {
			continue
		}
		if cnt <= 0 {
			continue
		}
		channel := "Unknown"
		if channelName.Valid && strings.TrimSpace(channelName.String) != "" {
			channel = strings.TrimSpace(channelName.String)
		}
		group := ""
		if groupName.Valid {
			group = strings.TrimSpace(groupName.String)
		}
		name := channel
		if groupBy == "ACC" || groupBy == "APP" {
			if group == "" {
				group = "Unknown"
			}
			name = fmt.Sprintf("%s | %s", group, channel)
		}
		result = append(result, AffiliateChannelData{
			Name:      name,
			Channel:   channel,
			GroupName: group,
			Count:     cnt,
		})
		key := fmt.Sprintf("%s||%s", group, channel)
		indexByKey[key] = len(result) - 1
	}

	if err := rows.Err(); err != nil {
		http.Error(w, `{"success":false,"error":"读取Affiliate Channel数据失败"}`, http.StatusInternalServerError)
		return
	}

	// Event mode: per-channel event_name breakdown for tooltips
	if statisticsType == "Event" && len(result) > 0 {
		eventQuery := fmt.Sprintf(`
			SELECT
				%s AS group_name,
				%s AS channel_name,
				COALESCE(NULLIF(TRIM(event_name), ''), 'Unknown') AS event_name,
				COUNT(*) AS cnt
			FROM %s
			%s
			GROUP BY %s, event_name
		`, groupExpr, channelExpr, tableName, whereClause, groupByClause)

		eventRows, err := r.DB.Query(eventQuery, args...)
		if err == nil {
			defer eventRows.Close()
			for eventRows.Next() {
				var groupName sql.NullString
				var channelName sql.NullString
				var eventName sql.NullString
				var cnt int64
				if scanErr := eventRows.Scan(&groupName, &channelName, &eventName, &cnt); scanErr != nil {
					continue
				}
				group := ""
				if groupName.Valid {
					group = strings.TrimSpace(groupName.String)
				}
				channel := "Unknown"
				if channelName.Valid && strings.TrimSpace(channelName.String) != "" {
					channel = strings.TrimSpace(channelName.String)
				}
				evt := "Unknown"
				if eventName.Valid && strings.TrimSpace(eventName.String) != "" {
					evt = strings.TrimSpace(eventName.String)
				}
				key := fmt.Sprintf("%s||%s", group, channel)
				if idx, ok := indexByKey[key]; ok {
					if result[idx].EventData == nil {
						result[idx].EventData = make(map[string]int64)
					}
					result[idx].EventData[evt] += cnt
				}
			}
		} else {
			log.Printf("Query affiliate channel event detail error: %v", err)
		}
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

// calculateAppProgress computes progress for a specific app
// Fix: prefer in-memory cache for live progress updates to frontend
// Fix: after completion (100%, not running), skip cache to avoid duplicate updates
func (r *Runner) calculateAppProgress(ctx context.Context, taskID, appID string) int {
	// Prefer in-memory cache for live progress (most accurate)
	// Check task state first; if completed (not running, 100%), skip cache
	r.progressMutex.RLock()
	cacheKey := taskID + ":" + appID
	cachedProgress, hasCache := r.appProgressCache[cacheKey]
	r.progressMutex.RUnlock()

	// If cache exists, check task state to avoid returning stale 100%
	if hasCache {
		var taskStatus string
		var taskProgress int
		err := r.DB.QueryRowContext(ctx, `
			SELECT status, progress FROM tasks WHERE id = ?
		`, taskID).Scan(&taskStatus, &taskProgress)

		// If completed (not running) at 100%, skip cache; use DB state downstream
		// Avoid returning cached 100% after completion and duplicate frontend updates
		if err == nil && taskStatus != "running" && taskProgress >= 100 {
			// Task completed; skip cache for downstream logic
		} else {
			// Task running or incomplete; return cached live progress
			return cachedProgress
		}
	}

	// If not cached, query task status and progress from DB (fallback)
	var taskStatus string
	var taskProgress int
	var dataPointer string
	err := r.DB.QueryRowContext(ctx, `
		SELECT status, progress, data_pointer FROM tasks WHERE id = ?
	`, taskID).Scan(&taskStatus, &taskProgress, &dataPointer)

	if err != nil {
		log.Printf("[calculateAppProgress] Error querying task status: %v", err)
		return 0
	}

	// If not running, check for successful execution logs
	if taskStatus != "running" {
		var successCount int
		r.DB.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM task_execution_logs 
			WHERE task_id = ? AND app_id = ? AND status = 'success'
		`, taskID, appID).Scan(&successCount)

		if successCount > 0 {
			// Single: return 100% when completed
			// Daily should not reach here (Daily tasks stay running)
			return 100
		}
		return 0
	}

	// Task running; check app execution state
	var status string
	var executionTime sql.NullTime
	err = r.DB.QueryRowContext(ctx, `
		SELECT status, execution_time 
		FROM task_execution_logs 
		WHERE task_id = ? AND app_id = ? 
		ORDER BY execution_time DESC 
		LIMIT 1
	`, taskID, appID).Scan(&status, &executionTime)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// No execution logs but task running
			// Daily with progress 0: waiting next run; return 100% (last run complete)
			// Progress > 0: running; estimate from task progress
			if dataPointer == "Daily Execution" && taskProgress == 0 {
				// Daily + no logs + progress 0 = last run done, waiting next run; return 100%
				return 100
			}
			// Task started (progress > 0); estimate app progress from task progress
			// Task progress is app average; each app progress should be near task progress
			// Use task progress as reference for smooth display
			if taskProgress == 0 {
				// Task not started; return 0
				return 0
			}
			// Task running; use task progress as app progress reference
			// As average, per-app may differ slightly but should align overall
			return taskProgress
		}
		log.Printf("[calculateAppProgress] Error querying app progress: %v", err)
		return 0
	}

	// Compute app progress from run state and task progress
	switch status {
	case "success":
		// Execution log shows success
		// Daily progress 0: last run done, waiting next; return 100%
		// Progress > 0: new cycle running; estimate from task progress
		if dataPointer == "Daily Execution" {
			if taskProgress == 0 {
				// Daily + progress 0 = last run done, waiting next; return 100%
				// 100% means successful completion until next run resets to 0%
				return 100
			}
			// Daily + progress > 0 = new cycle running; use task progress as reference
			// Task progress is average; each app should be close
			return taskProgress
		}
		// Single: return 100% when completed
		return 100
	case "failed":
		return 0
	case "running":
		// If running, estimate from task progress and app runtime
		// Task progress is average; each app should be near task progress
		if executionTime.Valid {
			duration := time.Since(executionTime.Time).Seconds()
			// Fine-tune from task progress and runtime
			// Short run: progress may be slightly below task progress
			// Long run: progress may match or slightly exceed task progress
			if duration < 5 {
				// Just started; progress slightly below task
				return max(0, taskProgress-10)
			} else if duration < 10 {
				// Running; progress near task progress
				return taskProgress
			} else {
				// Long run: progress may slightly exceed task progress
				return min(100, taskProgress+5)
			}
		}
		// No runtime info; use task progress directly
		return taskProgress
	default:
		return 0
	}
}

// max returns the larger of two ints
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// updateAppProgress updates progress cache for an app
func (r *Runner) updateAppProgress(taskID, appID string, progress int) {
	r.progressMutex.Lock()
	defer r.progressMutex.Unlock()

	key := taskID + ":" + appID
	r.appProgressCache[key] = progress
}

// updateTaskProgressFromApps averages app progress and updates task progress
// Resolves progress overwrite during concurrent execution
func (r *Runner) updateTaskProgressFromApps(ctx context.Context, taskID string) error {
	r.progressMutex.RLock()
	defer r.progressMutex.RUnlock()

	// Get all app progress for task
	var totalProgress int
	var appCount int
	prefix := taskID + ":"
	for key, progress := range r.appProgressCache {
		if strings.HasPrefix(key, prefix) {
			totalProgress += progress
			appCount++
		}
	}

	// Skip task progress update if no app progress
	if appCount == 0 {
		return nil
	}

	// Compute average progress
	avgProgress := totalProgress / appCount
	if avgProgress > 100 {
		avgProgress = 100
	}
	if avgProgress < 0 {
		avgProgress = 0
	}

	// Update overall task progress
	return r.updateProgress(ctx, taskID, avgProgress)
}

// clearTaskAppProgressCache clears all app progress cache for a task
func (r *Runner) clearTaskAppProgressCache(taskID string) {
	r.progressMutex.Lock()
	defer r.progressMutex.Unlock()

	// Delete all cache entries starting with taskID:
	for key := range r.appProgressCache {
		if strings.HasPrefix(key, taskID+":") {
			delete(r.appProgressCache, key)
		}
	}
}

func (r *Runner) computeDueAndRange(now time.Time, t Task, s *TaskSchedule, forceExecute bool) (bool, *DateRange, time.Time, error) {
	// Daily/Single scheduling and "yesterday" cutoff use Beijing time; not server TZ or task_schedules.timezone
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.Local
	}
	now = now.In(loc)

	// Single with forceExecute=true runs even if schedule missing or inactive
	// Allows re-run of completed tasks without config-change gate
	if (s == nil || !s.IsActive) && forceExecute && t.DataPointer == "Single Execution" {
		// Single manual run: execution_date through yesterday (if schedule has execution_date)
		// If no schedule, use task create time as start date
		var execDate time.Time
		if s != nil && s.ExecutionDate.Valid {
			execDate = s.ExecutionDate.Time
		} else {
			// If no execution_date, use task create time
			execDate = t.CreateTime
		}
		yesterday := now.AddDate(0, 0, -1)
		from := time.Date(execDate.Year(), execDate.Month(), execDate.Day(), 0, 0, 0, 0, loc)
		to := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 23, 59, 59, 0, loc)

		// If from > to, invalid range; use task create time through yesterday
		if from.After(to) {
			from = time.Date(t.CreateTime.Year(), t.CreateTime.Month(), t.CreateTime.Day(), 0, 0, 0, 0, loc)
		}

		log.Printf("[AutoPipe] Single task manual execution (forceExecute=true): allowing execution without schedule check, date_range=%s to %s",
			from.Format("2006-01-02"), to.Format("2006-01-02"))
		return true, &DateRange{FromDate: from, ToDate: to}, now, nil
	}

	if s == nil || !s.IsActive {
		return false, nil, time.Time{}, nil
	}

	switch s.ScheduleType {
	case "daily":
		if !s.ExecutionTime.Valid {
			return false, nil, time.Time{}, fmt.Errorf("daily schedule missing execution_time")
		}
		h, m, sec, err := parseHHMMSS(s.ExecutionTime.String)
		if err != nil {
			return false, nil, time.Time{}, err
		}
		todayExec := time.Date(now.Year(), now.Month(), now.Day(), h, m, sec, 0, loc)

		// Daily execution logic:
		// 1. Check if nextExecution blocks run
		if !forceExecute && s.NextExecution.Valid {
			// next_execution stored UTC; compare in Beijing time
			nextExec := s.NextExecution.Time.In(loc)
			log.Printf("[AutoPipe] Daily task time check (Asia/Shanghai): now=%v, nextExec=%v, todayExec=%v", now, nextExec, todayExec)

			if now.Before(nextExec) {
				log.Printf("[AutoPipe] Task not due yet: now < nextExec")
				return false, nil, nextExec, nil
			}
			log.Printf("[AutoPipe] Task should execute: now >= nextExec")
		}

		// 2. If before today's execution time and not immediate, skip run
		// Note: check nextExecution is immediate (now or earlier)
		if now.Before(todayExec) {
			// If next_execution due (Beijing time), treat as immediate run
			nextForCompare := s.NextExecution.Time.In(loc)
			if s.NextExecution.Valid && (now.After(nextForCompare) || now.Equal(nextForCompare)) {
				log.Printf("[AutoPipe] Task should execute immediately: now >= nextExec")
			} else {
				log.Printf("[AutoPipe] Task not due yet: now < todayExec and not immediate execution")
				return false, nil, todayExec, nil
			}
		}

		// 3. Execute task: fetch yesterday's data range (daily yesterday)
		yesterday := now.AddDate(0, 0, -1)
		from := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, loc)
		to := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 23, 59, 59, 0, loc)

		// 4. Set next execution to same time tomorrow
		next := todayExec.Add(24 * time.Hour)
		return true, &DateRange{FromDate: from, ToDate: to}, next, nil

	case "single":
		// Single: execution_date through yesterday
		if !s.ExecutionDate.Valid {
			return false, nil, time.Time{}, fmt.Errorf("single schedule missing execution_date")
		}
		// Parse execution_date
		execDate := s.ExecutionDate.Time
		yesterday := now.AddDate(0, 0, -1)
		from := time.Date(execDate.Year(), execDate.Month(), execDate.Day(), 0, 0, 0, 0, loc)
		to := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 23, 59, 59, 0, loc)

		// If from > to, date range invalid
		if from.After(to) {
			return false, nil, time.Time{}, fmt.Errorf("invalid date range: from %s > to %s", from.Format("2006-01-02"), to.Format("2006-01-02"))
		}

		// Manual run (forceExecute=true) ignores next_execution and allows re-run
		if !forceExecute && s.NextExecution.Valid {
			return false, nil, s.NextExecution.Time.In(loc), nil
		}
		return true, &DateRange{FromDate: from, ToDate: to}, now, nil
	}
	return false, nil, time.Time{}, fmt.Errorf("unknown schedule type: %s", s.ScheduleType)
}

func parseHHMMSS(s string) (int, int, int, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 3 {
		return 0, 0, 0, fmt.Errorf("bad time: %s", s)
	}
	var h, m, sec int
	fmt.Sscanf(parts[0], "%d", &h)
	fmt.Sscanf(parts[1], "%d", &m)
	fmt.Sscanf(parts[2], "%d", &sec)
	return h, m, sec, nil
}

func tableForType(taskType string) (string, error) {
	switch taskType {
	case "install_pb":
		return "Dashboard_Install_Postbacks", nil
	case "event_pb":
		return "Dashboard_In_App_Event_Postbacks", nil
	case "install_rtpb":
		return "Dashboard_Retargeting_Install_Postbacks", nil
	case "event_rtpb":
		return "Dashboard_Retargeting_In_App_Event_Postbacks", nil
	}
	return "", fmt.Errorf("unknown task type: %s", taskType)
}

type ExecutionResult struct {
	Processed    int64 // Final row count (after dedupe)
	Fetched      int64 // Raw row count from API
	Deduplicated int64 // Rows removed by dedupe
}

func (r *Runner) fetchAndInsert(ctx context.Context, t Task, app TaskAppJSON, dr DateRange) (*ExecutionResult, error) {
	// Create progress bar merging all log output
	progressBar := NewTaskProgressBar(t.TaskID, app.AppID)

	// === Phase 0: cleanup - delete historical data for task across all tables ===
	// Prevent stale data across tables when task type changes (e.g. event_pb to install_pb)
	// Note: cleanup only on first run or config change; don't overwrite results
	dataTables := []string{
		"Dashboard_Install_Postbacks",
		"Dashboard_In_App_Event_Postbacks",
		"Dashboard_Retargeting_In_App_Event_Postbacks",
		"Dashboard_Retargeting_Install_Postbacks",
	}

	// Check if task already has data in tables (decide cleanup)
	var shouldClean bool
	for _, table := range dataTables {
		var count int
		query := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE task_id = ?", table)
		if err := r.DB.QueryRowContext(ctx, query, t.ID).Scan(&count); err == nil && count > 0 {
			// Data exists; decide cleanup by date range
			// Daily tasks use new dates each run; no cleanup needed
			// Cleanup for Single tasks or first run
			shouldClean = (t.DataPointer != "Daily Execution")
			if shouldClean {
				break
			}
		}
	}

	var totalDeleted int64
	if shouldClean {
		for _, table := range dataTables {
			// Delete all data for task_id in this table
			result, err := r.DB.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s WHERE task_id = ?", table), t.ID)
			if err != nil {
				log.Printf("[AutoPipe] Warning: Failed to delete from %s: %v", table, err)
			} else {
				deletedRows, _ := result.RowsAffected()
				totalDeleted += deletedRows
				if deletedRows > 0 {
					log.Printf("[AutoPipe] Cleaned %d records from %s for task %s", deletedRows, table, t.TaskID)
				}
			}
		}

		if totalDeleted > 0 {
			log.Printf("[AutoPipe] ✓ Cleaned %d total historical records across all tables for task %s", totalDeleted, t.TaskID)
		}
	}

	// === Phase 1: prep - Daily each run starts at 0% ===
	progressBar.Update(0, fmt.Sprintf("Task started: %s", t.TaskID))
	// Daily: each run starts at 0% so frontend shows per-run progress
	// Single: keep original logic
	// Fix: each app updates own progress, then average
	r.updateAppProgress(t.ID, app.AppID, 0)
	if t.DataPointer == "Daily Execution" {
		// Daily: reset task progress to 0
		r.updateProgress(ctx, t.ID, 0)
	} else {
		// Single: average progress across all apps
		r.updateTaskProgressFromApps(ctx, t.ID)
	}

	// 1. Get database table name
	tbl, err := tableForType(t.Type)
	if err != nil {
		return nil, err
	}
	progressBar.Update(3, fmt.Sprintf("Database table determined: %s", tbl))
	// Fix: update app progress only, then average
	r.updateAppProgress(t.ID, app.AppID, 3)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// 2. Get account config
	account, err := r.loadAccountConfig(ctx, t.AccountID)
	if err != nil {
		return nil, fmt.Errorf("load account: %w", err)
	}
	progressBar.Update(6, fmt.Sprintf("Account config loaded: %s", account.AccountName))
	// Fix: update app progress only, then average
	r.updateAppProgress(t.ID, app.AppID, 6)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// 3. Build API URL and params
	apiURL, err := getAPIEndpoint(t.Type, account.AccountType, app.AppID)
	if err != nil {
		return nil, err
	}

	params := map[string]string{
		"from":  dr.FromDate.Format("2006-01-02"),
		"to":    dr.ToDate.Format("2006-01-02"),
		"limit": "200000",
	}

	if account.AccountType == "PID" {
		params["media_source"] = "standard"
		params["category"] = "standard"
		params["install_type"] = "organic"
		params["revenue"] = "true"
	}

	progressBar.Update(10, fmt.Sprintf("API endpoint ready: %s", apiURL))
	// Fix: update app progress only, then average
	r.updateAppProgress(t.ID, app.AppID, 10)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// === Phase 2: API call 10-20% ===
	progressBar.Update(10, "Calling API...")
	csvReader, body, err := r.fetchCSVFromAPI(ctx, apiURL, account.APIToken, params)
	if err != nil {
		return nil, fmt.Errorf("fetch CSV: %w", err)
	}
	progressBar.Update(20, "API call successful, data received")
	// Fix: update app progress only, then average
	r.updateAppProgress(t.ID, app.AppID, 20)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// === Phase 3: data receive 20-30% ===
	progressBar.Update(25, "Parsing CSV headers...")
	r.updateAppProgress(t.ID, app.AppID, 25)
	r.updateTaskProgressFromApps(ctx, t.ID)

	progressBar.Update(30, "Starting data insertion...")
	r.updateAppProgress(t.ID, app.AppID, 30)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// === Phase 4: data write 30-80% ===
	// Fix: concurrent runs update per-app progress, then average to update task progress
	// Check if Daily task
	isDailyTask := (t.DataPointer == "Daily Execution")
	processed, err := r.insertCSVData(ctx, tbl, t.ID, app.AppID, account.AccountName, csvReader, body, func(progress int) {
		// Update per-app progress only (cache)
		r.updateAppProgress(t.ID, app.AppID, progress)
		// Average app progress and update task progress
		if err := r.updateTaskProgressFromApps(ctx, t.ID); err != nil {
			log.Printf("[AutoPipe] Failed to update task progress from apps: %v", err)
		}
		// Update progress bar display
		if progress%10 == 0 || progress >= 80 { // Update progress bar every 10% or near completion
			progressBar.Update(progress, fmt.Sprintf("Inserting data... %d%%", progress))
		}
	}, isDailyTask, &dr)
	if err != nil {
		return nil, fmt.Errorf("insert data: %w", err)
	}

	// === Phase 5: dedupe check 80-88% ===
	progressBar.Update(80, "Data insertion completed, starting deduplication...")
	// Fix: update app progress only, then average
	r.updateAppProgress(t.ID, app.AppID, 80)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// Run overall dedupe check
	dedupCount, err := r.performFinalDeduplication(ctx, tbl, t.ID, app.AppID)
	if err != nil {
		log.Printf("[AutoPipe] Warning: Final deduplication failed: %v", err)
		dedupCount = 0 // Set 0 on error
		progressBar.Update(85, "Deduplication check: Error occurred")
	} else if dedupCount > 0 {
		progressBar.Update(85, fmt.Sprintf("Final deduplication: Removed %d duplicate records", dedupCount))
	} else {
		progressBar.Update(85, "Deduplication check: No duplicates found")
	}
	r.updateAppProgress(t.ID, app.AppID, 85)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// === Phase 6: completion verify 85-90% ===
	progressBar.Update(88, "Data verification...")
	r.updateAppProgress(t.ID, app.AppID, 88)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// === Phase 7: task complete 90-100% ===
	progressBar.Update(92, "Finalizing task...")
	r.updateAppProgress(t.ID, app.AppID, 92)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// Compute final row count (after dedupe)
	finalProcessed := processed - dedupCount
	progressBar.Complete(fmt.Sprintf("Task completed successfully | Fetched: %d, Deduplicated: %d, Final: %d rows",
		processed, dedupCount, finalProcessed))
	r.updateAppProgress(t.ID, app.AppID, 100)
	r.updateTaskProgressFromApps(ctx, t.ID)

	// After DB write, bump Dashboard cache generation for fresh reads
	r.bumpDashboardCacheGeneration("autopipe_fetch_insert")

	return &ExecutionResult{
		Processed:    finalProcessed,
		Fetched:      processed,
		Deduplicated: dedupCount,
	}, nil
}

func (r *Runner) performFinalDeduplication(ctx context.Context, tableName, taskID, _ string) (int64, error) {
	// Final dedupe pass within task_id only (avoid cross-account deletes for same app_id)
	// Strategy: time field by table type
	// - Install/Event both use event_time (install time in Install table)
	// Keep latest row per (appsflyer_id/advertising_id + app_id + time field) within task

	if taskID == "" {
		return 0, nil
	}

	// Resolve time field by table type
	var timeField string
	switch tableName {
	case "Dashboard_Install_Postbacks", "Dashboard_Retargeting_Install_Postbacks":
		timeField = "event_time"
	case "Dashboard_In_App_Event_Postbacks", "Dashboard_Retargeting_In_App_Event_Postbacks":
		timeField = "event_time"
	default:
		return 0, fmt.Errorf("unknown table type: %s", tableName)
	}

	var totalDeleted int64

	// Strategy 1: dedupe within task by appsflyer_id + app_id + time field
	deleteSQL1 := fmt.Sprintf(`
		DELETE t1 FROM %s t1
		INNER JOIN %s t2 
		WHERE 
			t1.task_id = ?
			AND t2.task_id = ?
			AND t1.appsflyer_id = t2.appsflyer_id 
			AND t1.app_id = t2.app_id
			AND t1.%s = t2.%s
			AND t1.id < t2.id
			AND t1.appsflyer_id IS NOT NULL
			AND t1.%s IS NOT NULL
	`, tableName, tableName, timeField, timeField, timeField)

	result1, err := r.DB.ExecContext(ctx, deleteSQL1, taskID, taskID)
	if err != nil {
		return 0, fmt.Errorf("dedup by appsflyer_id: %w", err)
	}
	count1, _ := result1.RowsAffected()
	totalDeleted += count1

	if count1 > 0 {
		log.Printf("[AutoPipe] Dedup: Removed %d duplicates by appsflyer_id + %s (task %s)", count1, timeField, taskID)
	}

	// Strategy 2: dedupe within task by advertising_id + app_id + time field (for NULL appsflyer_id rows)
	deleteSQL2 := fmt.Sprintf(`
		DELETE t1 FROM %s t1
		INNER JOIN %s t2 
		WHERE 
			t1.task_id = ?
			AND t2.task_id = ?
			AND t1.appsflyer_id IS NULL
			AND t2.appsflyer_id IS NULL
			AND t1.advertising_id = t2.advertising_id 
			AND t1.app_id = t2.app_id
			AND t1.%s = t2.%s
			AND t1.id < t2.id
			AND t1.advertising_id IS NOT NULL
			AND t1.%s IS NOT NULL
	`, tableName, tableName, timeField, timeField, timeField)

	result2, err := r.DB.ExecContext(ctx, deleteSQL2, taskID, taskID)
	if err != nil {
		return totalDeleted, fmt.Errorf("dedup by advertising_id: %w", err)
	}
	count2, _ := result2.RowsAffected()
	totalDeleted += count2

	if count2 > 0 {
		log.Printf("[AutoPipe] Dedup: Removed %d duplicates by advertising_id + %s (task %s)", count2, timeField, taskID)
	}

	// === Strategy 3: dedupe by business field combo (iOS privacy-enhanced rows) ===
	// For rows without appsflyer_id or advertising_id, dedupe by timestamp+adset_id and business fields
	var deleteSQL3 string
	if tableName == "Dashboard_Install_Postbacks" || tableName == "Dashboard_Retargeting_Install_Postbacks" {
		// Install Postbacks: dedupe by app_id + business time + attributed_touch_time + campaign + adset_id + country_code
		// Business time prefers install_time; fallback to event_time
		deleteSQL3 = fmt.Sprintf(`
			DELETE t1 FROM %s t1
			INNER JOIN %s t2 
			WHERE 
				t1.appsflyer_id IS NULL
				AND t2.appsflyer_id IS NULL
				AND t1.advertising_id IS NULL
				AND t2.advertising_id IS NULL
				AND t1.app_id = t2.app_id
				AND COALESCE(t1.install_time, t1.event_time, '1970-01-01') = COALESCE(t2.install_time, t2.event_time, '1970-01-01')
				AND COALESCE(t1.attributed_touch_time, '1970-01-01') = COALESCE(t2.attributed_touch_time, '1970-01-01')
				AND COALESCE(t1.campaign, '') = COALESCE(t2.campaign, '')
				AND COALESCE(t1.adset_id, '') = COALESCE(t2.adset_id, '')
				AND COALESCE(t1.country_code, '') = COALESCE(t2.country_code, '')
				AND t1.id < t2.id
				AND t1.task_id = ?
				AND t2.task_id = ?
		`, tableName, tableName)
	} else {
		// Event Postbacks: dedupe by app_id + event_name + event_time + attributed_touch_time + install_time + campaign + adset_id + country_code
		deleteSQL3 = fmt.Sprintf(`
			DELETE t1 FROM %s t1
			INNER JOIN %s t2 
			WHERE 
				t1.appsflyer_id IS NULL
				AND t2.appsflyer_id IS NULL
				AND t1.advertising_id IS NULL
				AND t2.advertising_id IS NULL
				AND t1.app_id = t2.app_id
				AND COALESCE(t1.event_name, '') = COALESCE(t2.event_name, '')
				AND COALESCE(t1.event_time, '1970-01-01') = COALESCE(t2.event_time, '1970-01-01')
				AND COALESCE(t1.attributed_touch_time, '1970-01-01') = COALESCE(t2.attributed_touch_time, '1970-01-01')
				AND COALESCE(t1.install_time, '1970-01-01') = COALESCE(t2.install_time, '1970-01-01')
				AND COALESCE(t1.campaign, '') = COALESCE(t2.campaign, '')
				AND COALESCE(t1.adset_id, '') = COALESCE(t2.adset_id, '')
				AND COALESCE(t1.country_code, '') = COALESCE(t2.country_code, '')
				AND t1.id < t2.id
				AND t1.task_id = ?
				AND t2.task_id = ?
		`, tableName, tableName)
	}

	result3, err := r.DB.ExecContext(ctx, deleteSQL3, taskID, taskID)
	if err != nil {
		return totalDeleted, fmt.Errorf("dedup by business fields: %w", err)
	}
	count3, _ := result3.RowsAffected()
	totalDeleted += count3

	if count3 > 0 {
		log.Printf("[AutoPipe] Dedup: Removed %d duplicates by business fields (iOS enhanced data)", count3)
	}

	return totalDeleted, nil
}

func (r *Runner) updateNextExecution(ctx context.Context, scheduleID string, next time.Time) error {
	_, err := r.DB.ExecContext(ctx,
		`UPDATE task_schedules SET next_execution = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		next.UTC(), scheduleID)
	return err
}

func (r *Runner) addExecutionLog(ctx context.Context, taskID string, appID string, status string, durationSec int64, processed int64, fetched int64, deduplicated int64, errMsg *string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO task_execution_logs (id, task_id, app_id, execution_time, status, error_message, execution_duration, data_processed, data_fetched, data_deduplicated)
		VALUES (UUID(), ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
	`, taskID, appID, status, errMsg, durationSec, processed, fetched, deduplicated)
	if err == nil {
		r.bumpAutopipeCacheGenerations("task_execution_log_added", "logs")
	}
	return err
}

// updateProgress updates task progress (0-100)
func (r *Runner) updateProgress(ctx context.Context, taskID string, progress int) error {
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}

	result, err := r.DB.ExecContext(ctx, `
		UPDATE tasks 
		SET progress = ?,
		    latest_update_time = NOW()
		WHERE id = ?
	`, progress, taskID)

	if err != nil {
		log.Printf("[AutoPipe] ❌ Failed to update progress to %d%%: %v", progress, err)
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	log.Printf("[AutoPipe] ✅ Progress updated: %d%% (rows affected: %d)", progress, rowsAffected)

	return nil
}

// completeTask marks task completed (Single Execution mode)
func (r *Runner) completeTask(ctx context.Context, taskID string, durationSec int64) error {
	// Compute duration string
	duration := formatDuration(durationSec)

	// Set task completed with end_time, duration, and progress=100
	_, err := r.DB.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'completed',
		    progress = 100,
		    end_time = NOW(),
		    duration = ?,
		    latest_update_time = NOW()
		WHERE id = ?
	`, duration, taskID)

	if err != nil {
		log.Printf("[AutoPipe] Failed to complete task: %v", err)
		return err
	}

	// Single Execution: disable schedule to prevent auto re-run
	// Set is_active=false so task won't auto-run even if status set back to running
	_, err = r.DB.ExecContext(ctx, `
		UPDATE task_schedules 
		SET is_active = FALSE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE task_id = ?
	`, taskID)

	if err != nil {
		log.Printf("[AutoPipe] Failed to disable schedule for completed task: %v", err)
		// No error; task already marked completed (primary operation)
	} else {
		log.Printf("[AutoPipe] Task schedule disabled to prevent re-execution (Single Execution)")
	}

	log.Printf("[AutoPipe] Task marked as completed with progress=100%%")
	r.bumpAutopipeCacheGenerations("task_completed", "tasks")
	return nil
}

// formatDuration formats seconds as readable string (e.g. "2h 30m")
func formatDuration(seconds int64) string {
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}

	hours := seconds / 3600
	minutes := (seconds % 3600) / 60

	if hours > 0 {
		if minutes > 0 {
			return fmt.Sprintf("%dh %dm", hours, minutes)
		}
		return fmt.Sprintf("%dh", hours)
	}

	return fmt.Sprintf("%dm", minutes)
}

// recoverStaleDailyTasks on startup only recovers Daily tasks stuck mid-execution after crash.
// Failed tasks do not auto-retry; user must Active manually to avoid restart loops and UI flicker.
func (r *Runner) recoverStaleDailyTasks(ctx context.Context) error {
	nowUTC := time.Now().UTC()

	rows, err := r.DB.QueryContext(ctx, `
		SELECT t.id, t.task_id, ts.id, t.progress, t.latest_update_time
		FROM tasks t
		INNER JOIN task_schedules ts ON ts.task_id = t.id AND ts.is_active = TRUE AND ts.schedule_type = 'daily'
		WHERE t.status = 'running' AND t.data_pointer = 'Daily Execution'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, taskID, schedID string
		var progress int
		var latestUpd sql.NullTime
		if err := rows.Scan(&id, &taskID, &schedID, &progress, &latestUpd); err != nil {
			log.Printf("[AutoPipe] recoverStaleDailyTasks scan err: %v", err)
			continue
		}

		apps, err := r.loadTaskApps(ctx, id)
		if err != nil || len(apps) == 0 {
			continue
		}

		staleMidRun := false
		if latestUpd.Valid && progress > 0 && progress < 100 {
			if time.Since(latestUpd.Time) > 15*time.Minute {
				staleMidRun = true
			}
		}

		if !staleMidRun {
			continue
		}

		r.clearTaskAppProgressCache(id)
		if _, err := r.DB.ExecContext(ctx, `
			UPDATE tasks SET progress = 0, latest_update_time = NOW() WHERE id = ?
		`, id); err != nil {
			log.Printf("[AutoPipe] recoverStaleDailyTasks reset progress %s: %v", taskID, err)
		}
		if err := r.updateNextExecution(ctx, schedID, nowUTC); err != nil {
			log.Printf("[AutoPipe] recoverStaleDailyTasks updateNextExecution %s: %v", taskID, err)
			continue
		}
		log.Printf("[AutoPipe] recoverStaleDailyTasks: queued retry for %s (staleMidRun=true)", taskID)
	}
	return rows.Err()
}

func (r *Runner) loop(ctx context.Context) {
	if err := r.recoverStaleDailyTasks(ctx); err != nil {
		log.Printf("[AutoPipe] recoverStaleDailyTasks error: %v", err)
	}
	// Run tick once at startup so new tasks don't wait
	if err := r.tick(ctx, time.Now()); err != nil {
		log.Printf("initial tick error: %v", err)
	}

	// 60s interval to reduce tick frequency
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			r.lastTickUnix.Store(now.Unix())
			if err := r.tick(ctx, now); err != nil {
				log.Printf("tick error: %v", err)
			}
		}
	}
}

func (r *Runner) tick(ctx context.Context, now time.Time) error {
	tasks, err := r.loadRunningTasks(ctx)
	if err != nil {
		return err
	}

	// Log only when tasks exist; reduce console noise
	if len(tasks) > 0 {
		log.Printf("[AutoPipe] Tick check: found %d running tasks", len(tasks))
	}

	for _, t := range tasks {
		sched, err := r.loadSchedule(ctx, t.ID)
		if err != nil {
			log.Printf("[AutoPipe] loadSchedule err for task %s: %v", t.ID, err)
			continue
		}
		if sched == nil {
			log.Printf("[AutoPipe] No schedule found for task %s - skipping", t.TaskID)
			continue
		}

		// Detailed check logs only when tasks exist
		log.Printf("[AutoPipe] Checking task: %s (type=%s, schedule=%s)", t.TaskID, t.Type, sched.ScheduleType)

		shouldRun, dr, next, err := r.computeDueAndRange(now, t, sched, false)
		if err != nil {
			log.Printf("[AutoPipe] computeDue err for task %s: %v", t.ID, err)
			continue
		}
		if !shouldRun || dr == nil {
			log.Printf("[AutoPipe] Task %s not due yet (shouldRun=%v, dr=%v)", t.TaskID, shouldRun, dr != nil)
			continue
		}

		log.Printf("[AutoPipe] Task %s is due! Starting execution...", t.TaskID)

		apps, err := r.loadTaskApps(ctx, t.ID)
		if err != nil {
			log.Printf("loadTaskApps err for task %s: %v", t.ID, err)
			continue
		}

		start := time.Now()
		var totalFetched, totalDeduplicated, totalProcessed int64
		var firstErr error

		// Process apps concurrently with per-app logs
		var mu sync.Mutex // Protect concurrent access to shared vars
		var wg sync.WaitGroup
		wg.Add(len(apps))

		for _, app := range apps {
			go func(app TaskAppJSON) {
				defer wg.Done()

				appStart := time.Now()
				result, err := r.fetchAndInsert(ctx, t, app, *dr)
				appDuration := time.Since(appStart).Seconds()

				// Use mutex for shared variable access
				mu.Lock()
				if err != nil && firstErr == nil {
					firstErr = err
					// Log failed app run
					msg := err.Error()
					_ = r.addExecutionLog(ctx, t.ID, app.AppID, "failed", int64(appDuration), 0, 0, 0, &msg)
				} else if result != nil {
					totalFetched += result.Fetched
					totalDeduplicated += result.Deduplicated
					totalProcessed += result.Processed

					// Log successful app run
					_ = r.addExecutionLog(ctx, t.ID, app.AppID, "success", int64(appDuration), result.Processed, result.Fetched, result.Deduplicated, nil)
				}
				mu.Unlock()
			}(app)
		}

		// Wait for all goroutines
		wg.Wait()
		dur := time.Since(start).Seconds()

		// Daily: any app failure schedules next run; no short retry; user must Active to rerun
		nextSchedule := next
		if sched.ScheduleType == "daily" && firstErr != nil {
			log.Printf("[AutoPipe] Daily task %s had errors, next_execution set to %v (no auto-retry until manual Active or next schedule)",
				t.TaskID, nextSchedule)
		}
		// No aggregate execution log; each app logged separately
		if sched.ID != "" {
			_ = r.updateNextExecution(ctx, sched.ID, nextSchedule)
		}

		// Single Execution: mark completed after success
		if sched.ScheduleType == "single" {
			err := r.completeTask(ctx, t.ID, int64(dur))
			if err != nil {
				log.Printf("[AutoPipe] Error marking task as completed: %v", err)
			} else {
				log.Printf("[AutoPipe] Task %s marked as completed (Single Execution)", t.TaskID)
			}
			// Single: clear app progress cache after completion to stop 100% polling
			r.clearTaskAppProgressCache(t.ID)
		} else {
			// Daily Execution: keep 100% until next run starts (then reset to 0%)
			// 100% means successful completion
			// Fix: clear app progress cache to stop 100% polling
			// At 100% with no cache, calculateAppProgress returns 100% from DB state
			r.clearTaskAppProgressCache(t.ID)
			log.Printf("[AutoPipe] Daily task %s execution completed, progress kept at 100%% until next execution starts, cache cleared", t.TaskID)
		}
	}
	return nil
}

// HTTP Handlers
func (r *Runner) healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"lastTickUnix": r.lastTickUnix.Load(),
	})
}

func (r *Runner) statusHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var cnt int
	_ = r.DB.QueryRow("SELECT COUNT(*) FROM tasks WHERE status='running'").Scan(&cnt)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"runningTasks": cnt,
	})
}

// Helper functions
func generateSimpleUUID() string {
	// Simplified UUID generation
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), os.Getpid())
}

func generateTaskID() string {
	// Generate 12-char random task ID
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 12)
	for i := range b {
		b[i] = charset[time.Now().UnixNano()%int64(len(charset))]
	}
	return string(b)
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}

// Helper: convert interface{} to sql.NullFloat64
func interfaceToNullFloat64(val interface{}) sql.NullFloat64 {
	if val == nil {
		return sql.NullFloat64{Valid: false}
	}

	switch v := val.(type) {
	case float64:
		return sql.NullFloat64{Float64: v, Valid: true}
	case float32:
		return sql.NullFloat64{Float64: float64(v), Valid: true}
	case int:
		return sql.NullFloat64{Float64: float64(v), Valid: true}
	case int64:
		return sql.NullFloat64{Float64: float64(v), Valid: true}
	case string:
		if v == "" {
			return sql.NullFloat64{Valid: false}
		}
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return sql.NullFloat64{Float64: f, Valid: true}
		}
		return sql.NullFloat64{Valid: false}
	default:
		return sql.NullFloat64{Valid: false}
	}
}

// Ensure tasks table has dispatch token fields and unique index (idempotent)
func ensureDispatchTokenSchema(db *sql.DB) error {
	type colDef struct {
		Name string
		DDL  string
	}
	cols := []colDef{
		{Name: "api_token", DDL: "ALTER TABLE tasks ADD COLUMN api_token VARCHAR(128) NULL"},
		{Name: "token_request_count", DDL: "ALTER TABLE tasks ADD COLUMN token_request_count BIGINT NOT NULL DEFAULT 0"},
		{Name: "token_last_used_at", DDL: "ALTER TABLE tasks ADD COLUMN token_last_used_at DATETIME NULL"},
		{Name: "token_created_at", DDL: "ALTER TABLE tasks ADD COLUMN token_created_at DATETIME NULL"},
		{Name: "ios_appid", DDL: "ALTER TABLE tasks ADD COLUMN ios_appid VARCHAR(255) NULL"},
		{Name: "android_appid", DDL: "ALTER TABLE tasks ADD COLUMN android_appid VARCHAR(255) NULL"},
		{Name: "event_type", DDL: "ALTER TABLE tasks ADD COLUMN event_type VARCHAR(255) NULL"},
	}
	for _, c := range cols {
		var count int
		if err := db.QueryRow(
			`SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = ?`,
			c.Name,
		).Scan(&count); err != nil {
			return fmt.Errorf("check column %s: %w", c.Name, err)
		}
		if count == 0 {
			if _, err := db.Exec(c.DDL); err != nil {
				return fmt.Errorf("add column %s: %w", c.Name, err)
			}
			log.Printf("[Schema] Added tasks.%s", c.Name)
		}
	}

	var idxCount int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'uniq_tasks_api_token'`,
	).Scan(&idxCount); err != nil {
		return fmt.Errorf("check uniq_tasks_api_token index: %w", err)
	}
	if idxCount == 0 {
		if _, err := db.Exec(`CREATE UNIQUE INDEX uniq_tasks_api_token ON tasks(api_token)`); err != nil {
			return fmt.Errorf("create uniq_tasks_api_token: %w", err)
		}
		log.Printf("[Schema] Added unique index uniq_tasks_api_token")
	}
	return nil
}

func generateSecureToken() (string, error) {
	// 32 bytes => 43 chars (URL-safe, no padding); meets common token security requirements
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (r *Runner) taskVisibleByIDs(taskID string, userIDs []string) (bool, error) {
	inPlace, inArgs := inClausePlaceholder(userIDs)
	if inPlace == "" {
		return false, nil
	}
	query := "SELECT COUNT(*) FROM tasks WHERE id = ? AND user_id IN (" + inPlace + ")"
	args := append([]interface{}{taskID}, inArgs...)
	var cnt int
	if err := r.DB.QueryRow(query, args...).Scan(&cnt); err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// API: POST /api/autopipe/tasks/<task_id>/token - generate or refresh task API token (JWT required)
func (r *Runner) generateTaskTokenHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, err := r.getEffectiveUserIDs(req)
	if err != nil || len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	taskID := strings.TrimPrefix(req.URL.Path, "/api/autopipe/tasks/")
	taskID = strings.TrimSuffix(taskID, "/token")
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		http.Error(w, `{"success":false,"error":"invalid task_id"}`, http.StatusBadRequest)
		return
	}

	visible, err := r.taskVisibleByIDs(taskID, userIDs)
	if err != nil {
		http.Error(w, `{"success":false,"error":"query task failed"}`, http.StatusInternalServerError)
		return
	}
	if !visible {
		http.Error(w, `{"success":false,"error":"task not found"}`, http.StatusNotFound)
		return
	}

	var token string
	for i := 0; i < 8; i++ {
		candidate, err := generateSecureToken()
		if err != nil {
			http.Error(w, `{"success":false,"error":"generate token failed"}`, http.StatusInternalServerError)
			return
		}
		var dup int
		if err := r.DB.QueryRow("SELECT COUNT(*) FROM tasks WHERE api_token = ?", candidate).Scan(&dup); err != nil {
			http.Error(w, `{"success":false,"error":"validate token failed"}`, http.StatusInternalServerError)
			return
		}
		if dup == 0 {
			token = candidate
			break
		}
	}
	if token == "" {
		http.Error(w, `{"success":false,"error":"unable to generate unique token"}`, http.StatusInternalServerError)
		return
	}

	if _, err := r.DB.Exec(
		`UPDATE tasks
		 SET api_token = ?, token_request_count = 0, token_last_used_at = NULL, token_created_at = CURRENT_TIMESTAMP, latest_update_time = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		token, taskID,
	); err != nil {
		http.Error(w, `{"success":false,"error":"save token failed"}`, http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"task_id":              taskID,
			"api_token":            token,
			"token_request_count":  0,
			"token_last_used_at":   nil,
			"token_created_at":     time.Now().Format("2006-01-02 15:04:05"),
			"external_track_route": "/api/autopipe/token/track",
		},
	})
}

// API: GET /api/autopipe/tasks/<task_id>/token/stats - token stats (JWT required)
func (r *Runner) getTaskTokenStatsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userIDs, err := r.getEffectiveUserIDs(req)
	if err != nil || len(userIDs) == 0 {
		userIDs = []string{getUserID(req)}
	}

	taskID := strings.TrimPrefix(req.URL.Path, "/api/autopipe/tasks/")
	taskID = strings.TrimSuffix(taskID, "/token/stats")
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		http.Error(w, `{"success":false,"error":"invalid task_id"}`, http.StatusBadRequest)
		return
	}

	visible, err := r.taskVisibleByIDs(taskID, userIDs)
	if err != nil {
		http.Error(w, `{"success":false,"error":"query task failed"}`, http.StatusInternalServerError)
		return
	}
	if !visible {
		http.Error(w, `{"success":false,"error":"task not found"}`, http.StatusNotFound)
		return
	}

	var token sql.NullString
	var reqCount sql.NullInt64
	var lastUsed sql.NullTime
	var created sql.NullTime
	err = r.DB.QueryRow(
		`SELECT api_token, token_request_count, token_last_used_at, token_created_at FROM tasks WHERE id = ?`,
		taskID,
	).Scan(&token, &reqCount, &lastUsed, &created)
	if err != nil {
		http.Error(w, `{"success":false,"error":"load token stats failed"}`, http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"task_id":             taskID,
		"api_token":           nil,
		"has_token":           token.Valid && token.String != "",
		"token_request_count": int64(0),
		"token_last_used_at":  nil,
		"token_created_at":    nil,
	}
	if token.Valid {
		resp["api_token"] = token.String
	}
	if reqCount.Valid {
		resp["token_request_count"] = reqCount.Int64
	}
	if lastUsed.Valid {
		resp["token_last_used_at"] = lastUsed.Time.Format("2006-01-02 15:04:05")
	}
	if created.Valid {
		resp["token_created_at"] = created.Time.Format("2006-01-02 15:04:05")
	}

	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "data": resp})
}

// incrementTokenRequestStats increments request count and updates last_used after token validation (shared by token APIs)
func (r *Runner) incrementTokenRequestStats(taskID string) error {
	if strings.TrimSpace(taskID) == "" {
		return errors.New("empty task id")
	}
	_, err := r.DB.Exec(
		`UPDATE tasks
		 SET token_request_count = token_request_count + 1, token_last_used_at = CURRENT_TIMESTAMP, latest_update_time = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		taskID,
	)
	return err
}

// API: POST /api/autopipe/token/track - external call stats without JWT (token only)
func (r *Runner) trackTokenRequestHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if req.Method != "POST" && req.Method != "GET" {
		http.Error(w, `{"success":false,"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	token := ""
	if req.Method == "GET" {
		token = strings.TrimSpace(req.URL.Query().Get("token"))
	} else {
		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			http.Error(w, `{"success":false,"error":"invalid json body"}`, http.StatusBadRequest)
			return
		}
		token = strings.TrimSpace(body.Token)
	}
	if token == "" {
		http.Error(w, `{"success":false,"error":"token is required"}`, http.StatusBadRequest)
		return
	}

	var taskID string
	var count int64
	var iosAppID sql.NullString
	var androidAppID sql.NullString
	var taskType sql.NullString
	var taskStatus sql.NullString
	err := r.DB.QueryRow(
		`SELECT id, token_request_count, ios_appid, android_appid, type, status FROM tasks WHERE api_token = ?`,
		token,
	).Scan(&taskID, &count, &iosAppID, &androidAppID, &taskType, &taskStatus)
	if err == sql.ErrNoRows {
		http.Error(w, `{"success":false,"error":"invalid token"}`, http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, `{"success":false,"error":"query token failed"}`, http.StatusInternalServerError)
		return
	}

	if err := r.incrementTokenRequestStats(taskID); err != nil {
		http.Error(w, `{"success":false,"error":"update token stats failed"}`, http.StatusInternalServerError)
		return
	}

	type trackTokenData struct {
		TaskID            string `json:"task_id"`
		Status            string `json:"status"`
		IOSAppID          string `json:"ios_appid"`
		AndroidAppID      string `json:"android_appid"`
		EventType         string `json:"event_type"`
		TokenRequestCount int64  `json:"token_request_count"`
		TokenLastUsedAt   string `json:"token_last_used_at"`
	}
	type trackTokenResponse struct {
		Success bool           `json:"success"`
		Data    trackTokenData `json:"data"`
	}

	resp := trackTokenResponse{
		Success: true,
		Data: trackTokenData{
			TaskID:            taskID,
			Status:            strings.TrimSpace(taskStatus.String),
			IOSAppID:          strings.TrimSpace(iosAppID.String),
			AndroidAppID:      strings.TrimSpace(androidAppID.String),
			EventType:         formatTrackEventType(taskType.String),
			TokenRequestCount: count + 1,
			TokenLastUsedAt:   time.Now().Format("2006-01-02 15:04:05"),
		},
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(resp)
}

func formatTrackEventType(taskType string) string {
	switch strings.TrimSpace(strings.ToLower(taskType)) {
	case "install_pb":
		return "Install-PB"
	case "event_pb":
		return "Event-PB"
	case "install_rtpb":
		return "Install-RTPB"
	case "event_rtpb":
		return "Event-RTPB"
	default:
		return ""
	}
}

// e.g. install_pb -> Install_Pb; capitalize each underscore segment
func titleCaseUnderscore(s string) string {
	parts := strings.Split(s, "_")
	for i := range parts {
		p := strings.TrimSpace(parts[i])
		if p == "" {
			continue
		}
		p = strings.ToLower(p)
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, "_")
}

// API: GET /api/autopipe/token/logs - task logs via token (no JWT; prefer dedicated header)
// Prefer X-Autopipe-Token header, fallback to query token
func (r *Runner) getTaskLogsByTokenHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if req.Method != "GET" {
		http.Error(w, `{"success":false,"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	token := strings.TrimSpace(req.Header.Get("X-Autopipe-Token"))
	if token == "" {
		token = strings.TrimSpace(req.URL.Query().Get("token"))
	}
	if token == "" {
		http.Error(w, `{"success":false,"error":"token is required"}`, http.StatusBadRequest)
		return
	}

	maxGroup := 50
	if mg := strings.TrimSpace(req.URL.Query().Get("maxgroup")); mg != "" {
		fmt.Sscanf(mg, "%d", &maxGroup)
	}
	if maxGroup < 20 {
		maxGroup = 20
	}
	if maxGroup > 200 {
		maxGroup = 200
	}

	var taskID string
	var taskType sql.NullString
	err := r.DB.QueryRow(`SELECT id, type FROM tasks WHERE api_token = ?`, token).Scan(&taskID, &taskType)
	if err == sql.ErrNoRows {
		http.Error(w, `{"success":false,"error":"invalid token"}`, http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, `{"success":false,"error":"query token failed"}`, http.StatusInternalServerError)
		return
	}

	if err := r.incrementTokenRequestStats(taskID); err != nil {
		http.Error(w, `{"success":false,"error":"update token stats failed"}`, http.StatusInternalServerError)
		return
	}

	rows, err := r.DB.Query(`
		SELECT id, task_id, app_id, execution_time, status, error_message, execution_duration, data_processed, data_fetched, data_deduplicated
		FROM task_execution_logs WHERE task_id = ?
		ORDER BY execution_time DESC LIMIT ? OFFSET ?
	`, taskID, maxGroup, 0)
	if err != nil {
		http.Error(w, `{"success":false,"error":"query logs failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type logItem struct {
		ID                string `json:"id"`
		AppID             string `json:"app_id"`
		ExecutionTime     string `json:"execution_time"`
		Status            string `json:"status"`
		ErrorMessage      string `json:"error_message"`
		ExecutionDuration int64  `json:"execution_duration"`
		DataProcessed     int64  `json:"data_processed"`
		DataFetched       int64  `json:"data_fetched"`
		DataDeduplicated  int64  `json:"data_deduplicated"`
	}
	logs := make([]logItem, 0)
	for rows.Next() {
		var id, tid, appID, status string
		var errorMsg sql.NullString
		var execTime time.Time
		var duration, processed, fetched, deduplicated int64
		if err := rows.Scan(&id, &tid, &appID, &execTime, &status, &errorMsg, &duration, &processed, &fetched, &deduplicated); err != nil {
			continue
		}
		logs = append(logs, logItem{
			ID:                id,
			AppID:             appID,
			ExecutionTime:     execTime.Format("2006-01-02 15:04:05"),
			Status:            status,
			ErrorMessage:      errorMsg.String,
			ExecutionDuration: duration,
			DataProcessed:     processed,
			DataFetched:       fetched,
			DataDeduplicated:  deduplicated,
		})
	}

	var total int
	if err := r.DB.QueryRow("SELECT COUNT(*) FROM task_execution_logs WHERE task_id = ?", taskID).Scan(&total); err != nil {
		http.Error(w, `{"success":false,"error":"count logs failed"}`, http.StatusInternalServerError)
		return
	}

	type tokenLogsResponse struct {
		Success   bool      `json:"success"`
		TaskID    string    `json:"task_id"`
		MaxGroup  int       `json:"maxgroup"`
		EventType string    `json:"event_type"`
		Records   int       `json:"records"`
		Data      []logItem `json:"data"`
	}
	resp := tokenLogsResponse{
		Success:   true,
		TaskID:    taskID,
		MaxGroup:  maxGroup,
		EventType: formatTrackEventType(taskType.String),
		Records:   total,
		Data:      logs,
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(resp)
}

// API: GET /api/autopipe/token/report - export task data as CSV via token (Track Pipe Report)
// Prefer X-Autopipe-Token header, fallback to query token
func (r *Runner) getTaskReportByTokenHandler(w http.ResponseWriter, req *http.Request) {
	if req.Method != "GET" {
		http.Error(w, `{"success":false,"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	token := strings.TrimSpace(req.Header.Get("X-Autopipe-Token"))
	if token == "" {
		token = strings.TrimSpace(req.URL.Query().Get("token"))
	}
	if token == "" {
		http.Error(w, `{"success":false,"error":"token is required"}`, http.StatusBadRequest)
		return
	}

	var taskInternalID string
	var taskPublicID string
	var taskType sql.NullString
	err := r.DB.QueryRow(
		`SELECT id, task_id, type FROM tasks WHERE api_token = ? LIMIT 1`,
		token,
	).Scan(&taskInternalID, &taskPublicID, &taskType)

	if err == sql.ErrNoRows {
		http.Error(w, `{"success":false,"error":"invalid token"}`, http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, `{"success":false,"error":"query token failed"}`, http.StatusInternalServerError)
		return
	}

	if err := r.incrementTokenRequestStats(taskInternalID); err != nil {
		http.Error(w, `{"success":false,"error":"update token stats failed"}`, http.StatusInternalServerError)
		return
	}

	tableName, err := tableForType(taskType.String)
	if err != nil {
		http.Error(w, `{"success":false,"error":"unknown task type"}`, http.StatusBadRequest)
		return
	}

	rows, err := r.DB.Query(fmt.Sprintf("SELECT * FROM %s WHERE task_id = ?", tableName), taskInternalID)
	if err != nil {
		http.Error(w, `{"success":false,"error":"query report failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		http.Error(w, `{"success":false,"error":"get columns failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set(
		"Content-Disposition",
		fmt.Sprintf("attachment; filename=Task_%s_%s_%s.csv", taskPublicID, titleCaseUnderscore(taskType.String), time.Now().Format("20060102")),
	)

	// Fixed columns to drop (not in CSV output)
	removedCols := map[string]struct{}{
		"original_url": {},
		"postback_url": {},
		"batch_id":     {},
	}

	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	// Read full table into memory first:
	// 1) Drop specified columns
	// 2) Drop all-empty columns (every row empty for that column)
	records := make([][]string, 0)
	nonEmptyCols := make([]bool, len(columns))
	for rows.Next() {
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		row := make([]string, len(columns))
		for i, v := range values {
			switch vv := v.(type) {
			case nil:
				row[i] = ""
			case []byte:
				row[i] = string(vv)
			default:
				row[i] = fmt.Sprint(vv)
			}

			if strings.TrimSpace(row[i]) != "" {
				nonEmptyCols[i] = true
			}
		}

		records = append(records, row)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, `{"success":false,"error":"read rows failed"}`, http.StatusInternalServerError)
		return
	}

	keptIdx := make([]int, 0, len(columns))
	header := make([]string, 0, len(columns))
	for i, col := range columns {
		lc := strings.ToLower(col)
		if _, drop := removedCols[lc]; drop {
			continue
		}
		if !nonEmptyCols[i] {
			continue
		}
		keptIdx = append(keptIdx, i)
		header = append(header, col)
	}

	writer := csv.NewWriter(w)
	if err := writer.Write(header); err != nil {
		log.Printf("[API] CSV write header error: %v", err)
		return
	}

	for _, rec := range records {
		outRow := make([]string, len(keptIdx))
		for j, idx := range keptIdx {
			outRow[j] = rec[idx]
		}
		if err := writer.Write(outRow); err != nil {
			break
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		log.Printf("[API] CSV flush error: %v", err)
	}
}

// CORS middleware
func autopipeCORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Selected-Team-Id, X-Dashboard-Force-Refresh, X-Autopipe-Force-Refresh")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	// Load .env file (consistent with Flask backend)
	if err := godotenv.Overload(); err != nil {
		log.Printf("Note: .env file not found or error loading: %v (falling back to existing environment variables)", err)
	} else {
		log.Printf(".env file loaded and overrides existing environment variables (ensuring consistency with Flask)")
	}

	db, err := openDB()
	if err != nil {
		log.Fatalf("openDB: %v", err)
	}
	defer db.Close()
	if err := ensureDispatchTokenSchema(db); err != nil {
		log.Fatalf("ensureDispatchTokenSchema: %v", err)
	}

	// Read JWT_SECRET_KEY from env (consistent with Flask)
	jwtSecret := os.Getenv("JWT_SECRET_KEY")
	if jwtSecret == "" {
		log.Printf("Warning: JWT_SECRET_KEY not set, JWT authentication will be disabled")
	}

	var redisClient *redis.Client
	redisAddr := strings.TrimSpace(getenv("REDIS_ADDR", ""))
	if redisAddr != "" {
		redisDB, _ := strconv.Atoi(getenv("REDIS_DB", "0"))
		redisClient = redis.NewClient(&redis.Options{
			Addr:         redisAddr,
			Password:     getenv("REDIS_PASSWORD", ""),
			DB:           redisDB,
			PoolSize:     64,
			MinIdleConns: 8,
		})
		pingCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := redisClient.Ping(pingCtx).Err(); err != nil {
			log.Printf("Redis disabled: ping failed: %v", err)
			_ = redisClient.Close()
			redisClient = nil
		} else {
			log.Printf("Redis cache enabled at %s (db=%d)", redisAddr, redisDB)
		}
		cancel()
	} else {
		log.Printf("Redis cache disabled: REDIS_ADDR is empty")
	}

	r := &Runner{
		DB:               db,
		Redis:            redisClient,
		JWTSecret:        jwtSecret,
		appProgressCache: make(map[string]int),
	}
	ctx := context.Background()
	log.Println("AutoPipe Go service started. Polling every 60s...")
	go r.loop(ctx)
	go r.appEstimatorPipelineLoop(ctx)
	log.Println("App Estimator pipeline scheduler started")

	// Route setup
	http.HandleFunc("/health", autopipeCORSMiddleware(r.healthHandler))
	http.HandleFunc("/status", autopipeCORSMiddleware(r.statusHandler))

	// AutoPipe API endpoints (auth required)
	http.HandleFunc("/api/autopipe/tasks", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		switch req.Method {
		case "GET":
			r.authMiddleware(r.autopipeCacheMiddleware("tasks", "tasks", 15*time.Second, r.getTasksHandler, shouldBypassAutopipeTasksCache))(w, req)
		case "POST":
			r.authMiddleware(r.createTaskHandler)(w, req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Get all unique App list
	http.HandleFunc("/api/autopipe/apps", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.autopipeCacheMiddleware("apps", "apps", 300*time.Second, r.getAllAppsHandler, nil))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard statistics API
	http.HandleFunc("/api/dashboard/statistics", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("statistics", 120*time.Second, r.getDashboardStatisticsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard daily-split statistics API
	http.HandleFunc("/api/dashboard/statistics/daily", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("statistics_daily", 120*time.Second, r.getDashboardDailyStatisticsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Campaign IDs API
	http.HandleFunc("/api/dashboard/campaign-ids", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("campaign_ids", 300*time.Second, r.getDashboardCampaignIdsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Install Conversion Chart API
	http.HandleFunc("/api/dashboard/install-conversion", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("install_conversion", 120*time.Second, r.getInstallConversionHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Event Conversion Chart API
	http.HandleFunc("/api/dashboard/event-conversion", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("event_conversion", 120*time.Second, r.getEventConversionHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Distribution Proportion Chart API
	http.HandleFunc("/api/dashboard/distribution-proportion", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("distribution_proportion", 120*time.Second, r.getDistributionProportionHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard App list API (direct DB query)
	http.HandleFunc("/api/dashboard/apps", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("apps", 300*time.Second, r.getDashboardAppsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Account list API (direct DB query)
	http.HandleFunc("/api/dashboard/accounts", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("accounts", 300*time.Second, r.getDashboardAccountsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Regional Statistics API (by country)
	http.HandleFunc("/api/dashboard/regional-statistics", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("regional_statistics", 120*time.Second, r.getRegionalStatisticsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Event Name Statistics API (grouped by event name)
	http.HandleFunc("/api/dashboard/event-name-statistics", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("event_name_statistics", 120*time.Second, r.getEventNameStatisticsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Dashboard Affiliate Channel API (aggregated by channel)
	http.HandleFunc("/api/dashboard/affiliate-channels", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("affiliate_channels", 120*time.Second, r.getAffiliateChannelHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Lightweight progress query (live updates)
	http.HandleFunc("/api/autopipe/progress", autopipeCORSMiddleware(
		r.authMiddleware(r.getProgressHandler),
	))
	// External token call stats API (no JWT)
	http.HandleFunc("/api/autopipe/token/track", autopipeCORSMiddleware(
		r.trackTokenRequestHandler,
	))
	// External token logs API (no JWT)
	http.HandleFunc("/api/autopipe/token/logs", autopipeCORSMiddleware(
		r.getTaskLogsByTokenHandler,
	))
	// External token report download API (no JWT)
	http.HandleFunc("/api/autopipe/token/report", autopipeCORSMiddleware(
		r.getTaskReportByTokenHandler,
	))
	// Long-poll progress stream (live sync)
	http.HandleFunc("/api/autopipe/progress/stream", autopipeCORSMiddleware(
		r.authMiddleware(r.getProgressStreamHandler),
	))

	http.HandleFunc("/api/autopipe/tasks/", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasSuffix(req.URL.Path, "/token/stats") {
			if req.Method == "GET" {
				r.authMiddleware(r.getTaskTokenStatsHandler)(w, req)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		} else if strings.HasSuffix(req.URL.Path, "/token") {
			if req.Method == "POST" {
				r.authMiddleware(r.generateTaskTokenHandler)(w, req)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		} else if strings.HasSuffix(req.URL.Path, "/status") {
			r.authMiddleware(r.updateTaskStatusHandler)(w, req)
		} else if strings.HasSuffix(req.URL.Path, "/logs") {
			r.authMiddleware(r.autopipeCacheMiddleware("task_logs", "logs", 15*time.Second, r.getTaskLogsHandler, nil))(w, req)
		} else if strings.HasSuffix(req.URL.Path, "/execute") {
			r.authMiddleware(r.manualExecuteHandler)(w, req)
		} else if strings.HasSuffix(req.URL.Path, "/download") {
			r.authMiddleware(r.downloadTaskDataHandler)(w, req)
		} else {
			switch req.Method {
			case "PUT":
				r.authMiddleware(r.updateTaskHandler)(w, req)
			case "DELETE":
				r.authMiddleware(r.deleteTaskHandler)(w, req)
			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		}
	}))

	// Benchmark public data API (memory → Redis → MySQL → upstream; see benchmark_store.go / benchmark_redis.go)
	// - /sitemap: slice index (12h); /fetch: pageProps (7d); requires REDIS_ADDR + benchmark_* tables
	//
	// Note: URL under /api/dashboard/ reuses existing nginx
	// "location /api/dashboard/ { proxy_pass 127.0.0.1:5001 }" proxy rule.
	// New prefix (e.g. /api/benchmark/) falls through nginx to Flask:5000,
	// then wrapped by Flask global errorhandler as {"status_code":405, "error_type":"MethodNotAllowed"},
	// Mislead frontend into thinking endpoint does not exist.
	http.HandleFunc("/api/dashboard/benchmark/sitemap", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.authMiddleware(r.getBenchmarkSitemapHandler)(w, req)
	}))
	http.HandleFunc("/api/dashboard/benchmark/fetch", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.authMiddleware(r.getBenchmarkFetchHandler)(w, req)
	}))
	http.HandleFunc("/api/dashboard/benchmark/export", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		switch req.Method {
		case http.MethodPost:
			r.authMiddleware(r.superAdminMiddleware(r.postBenchmarkExportHandler))(w, req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/dashboard/benchmark/export-from-urls", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		switch req.Method {
		case http.MethodPost:
			r.authMiddleware(r.superAdminMiddleware(r.postBenchmarkExportFromURLsHandler))(w, req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/dashboard/benchmark/export/latest", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.authMiddleware(r.superAdminMiddleware(r.getBenchmarkExportLatestHandler))(w, req)
	}))

	// App Download Estimator (OpenClaw SQLite read-only)
	http.HandleFunc("/api/app-estimator/health", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.getAppEstimatorHealthHandler(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/overview", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_overview", 60*time.Second, r.getAppEstimatorOverviewHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/snapshots/history", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_snap_hist", 60*time.Second, r.getAppEstimatorSnapshotHistoryHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/snapshots", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_snapshots", 60*time.Second, r.getAppEstimatorSnapshotsHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/velocity", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_velocity", 60*time.Second, r.getAppEstimatorVelocityHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/benchmarks", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_benchmarks", 120*time.Second, r.getAppEstimatorBenchmarksHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/estimates", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_estimates", 60*time.Second, r.getAppEstimatorEstimatesHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/calibration", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.dashboardCacheMiddleware("app_estimator_calibration", 120*time.Second, r.getAppEstimatorCalibrationHandler))(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/app-estimator/pipeline", autopipeCORSMiddleware(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "GET" {
			r.authMiddleware(r.getAppEstimatorPipelineHandler)(w, req)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// AI Relay API endpoints (OpenAI-compatible)
	aiProxy := NewOpenAIProxy()
	http.HandleFunc("/api/ai/v1/models", autopipeCORSMiddleware(aiProxy.ModelsHandler))
	http.HandleFunc("/api/ai/v1/chat/completions", autopipeCORSMiddleware(aiProxy.ChatCompletionsHandler))
	http.HandleFunc("/api/ai/v1/completions", autopipeCORSMiddleware(aiProxy.CompletionsHandler))
	http.HandleFunc("/api/ai/v1/embeddings", autopipeCORSMiddleware(aiProxy.EmbeddingsHandler))

	port := getenv("AUTOPIPE_PORT", ":5001")
	log.Printf("HTTP listening on %s", port)
	log.Printf("AI Relay API available at /api/ai/v1/*")
	log.Fatal(http.ListenAndServe(port, nil))
}

//go:build autopipe
// +build autopipe

package main

import (
	"compress/gzip"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Thin proxy for AppsFlyer public Benchmarks:
// - cache chain: memory → Redis → MySQL → upstream (needs benchmark_* tables + REDIS_ADDR)
// - sitemap/slice write-through Redis + MySQL; Redis lock prevents thundering herd

const (
	benchmarkBaseURL      = "https://www.appsflyer.com"
	benchmarkSitemapIndex = benchmarkBaseURL + "/benchmarks/sitemap_index.xml"
	benchmarkUserAgent    = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	benchmarkSitemapTTL   = 12 * time.Hour
	benchmarkFetchTimeout = 30 * time.Second
)

var (
	benchmarkNextDataRe  = regexp.MustCompile(`<script id="__NEXT_DATA__" type="application/json">(.+?)</script>`)
	benchmarkSitemapMu   sync.Mutex
	benchmarkSitemapData *benchmarkSitemapCache
)

type benchmarkSitemapCache struct {
	Items     []benchmarkURLItem
	LoadedAt  time.Time
	ExpiresAt time.Time
}

// benchmarkURLItem structured metadata for one benchmark slice page
type benchmarkURLItem struct {
	URL            string `json:"url"`
	Category       string `json:"category"`
	SubCategory    string `json:"subCategory"`
	SubSubCategory string `json:"subSubCategory"`
	Country        string `json:"country"`
	MediaType      string `json:"mediaType"`
}

type benchmarkSitemapIndexXML struct {
	XMLName  xml.Name `xml:"sitemapindex"`
	Sitemaps []struct {
		Loc string `xml:"loc"`
	} `xml:"sitemap"`
}

type benchmarkSitemapXML struct {
	XMLName xml.Name `xml:"urlset"`
	URLs    []struct {
		Loc string `xml:"loc"`
	} `xml:"url"`
}

// benchmarkHTTPGet fetch URL (desktop UA, redirects, gzip decode).
func benchmarkHTTPGet(target string) ([]byte, int, error) {
	client := &http.Client{Timeout: benchmarkFetchTimeout}
	req, err := http.NewRequest("GET", target, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", benchmarkUserAgent)
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	var reader io.Reader = resp.Body
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		gz, gzErr := gzip.NewReader(resp.Body)
		if gzErr != nil {
			return nil, resp.StatusCode, gzErr
		}
		defer gz.Close()
		reader = gz
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

// parseBenchmarkURL parse full URL into slice metadata; nil if not a leaf page.
// URL patterns:
//   https://www.appsflyer.com/benchmarks/{category}/{subCategory}/{country}/{mediaType}
//   https://www.appsflyer.com/benchmarks/{category}/{subCategory}/{subSubCategory}/{country}/{mediaType}
func parseBenchmarkURL(rawURL string) *benchmarkURLItem {
	prefix := benchmarkBaseURL + "/benchmarks/"
	if !strings.HasPrefix(rawURL, prefix) {
		return nil
	}
	path := strings.TrimPrefix(rawURL, prefix)
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		return nil
	}
	parts := strings.Split(path, "/")

	// skip non-slice pages: app-groups, faq, metric-definitions, etc.
	if len(parts) < 4 {
		return nil
	}

	canonical := rawURL
	if !strings.HasSuffix(canonical, "/") {
		canonical += "/"
	}
	item := &benchmarkURLItem{URL: canonical, Category: parts[0]}
	switch len(parts) {
	case 4:
		item.SubCategory = parts[1]
		item.Country = parts[2]
		item.MediaType = parts[3]
	case 5:
		item.SubCategory = parts[1]
		item.SubSubCategory = parts[2]
		item.Country = parts[3]
		item.MediaType = parts[4]
	default:
		return nil
	}
	return item
}

// fetchBenchmarkPage fetch slice page and extract pageProps (drop messages i18n blob).
func fetchBenchmarkPage(targetURL string) (map[string]interface{}, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("invalid url")
	}
	if u.Host != "www.appsflyer.com" || !strings.HasPrefix(u.Path, "/benchmarks/") {
		return nil, fmt.Errorf("url must be on www.appsflyer.com/benchmarks/")
	}
	if !strings.HasSuffix(targetURL, "/") {
		targetURL += "/"
	}

	body, status, err := benchmarkHTTPGet(targetURL)
	if err != nil {
		return nil, fmt.Errorf("fetch failed: %w", err)
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("upstream status %d", status)
	}

	m := benchmarkNextDataRe.FindSubmatch(body)
	if m == nil {
		return nil, fmt.Errorf("__NEXT_DATA__ not found in page")
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(m[1], &raw); err != nil {
		return nil, fmt.Errorf("parse __NEXT_DATA__: %w", err)
	}
	props, _ := raw["props"].(map[string]interface{})
	if props == nil {
		return nil, fmt.Errorf("no props in __NEXT_DATA__")
	}
	pp, _ := props["pageProps"].(map[string]interface{})
	if pp == nil {
		return nil, fmt.Errorf("no pageProps")
	}
	delete(pp, "messages") // drop large i18n messages blob to shrink payload
	return pp, nil
}

// ---- HTTP Handlers ----

// getBenchmarkSitemapHandler GET /api/dashboard/benchmark/sitemap
// return slice URL list: memory → MySQL → upstream; force=1 bypasses cache.
func (r *Runner) getBenchmarkSitemapHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	force := req.URL.Query().Get("force") == "1"
	items, meta, err := r.loadBenchmarkSitemapWithStore(force)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadGateway)
		return
	}
	resp := map[string]interface{}{
		"success": true,
		"total":   len(items),
		"items":   items,
		"source":  meta.Source,
	}
	if !meta.LoadedAt.IsZero() {
		resp["loadedAt"] = meta.LoadedAt.Format(time.RFC3339)
	}
	if !meta.ExpiresAt.IsZero() {
		resp["expiresAt"] = meta.ExpiresAt.Format(time.RFC3339)
	}
	json.NewEncoder(w).Encode(resp)
}

// getBenchmarkFetchHandler GET /api/dashboard/benchmark/fetch?url=...
// pageProps: Redis → MySQL → upstream; force=1 clears cache and refetches.
func (r *Runner) getBenchmarkFetchHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	target := req.URL.Query().Get("url")
	if target == "" {
		http.Error(w, `{"success":false,"error":"url parameter is required"}`, http.StatusBadRequest)
		return
	}
	force := req.URL.Query().Get("force") == "1"
	pp, cached, cacheLayer, err := r.fetchBenchmarkPageWithStore(force, target)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadGateway)
		return
	}
	resp := map[string]interface{}{
		"success":   true,
		"url":       canonicalBenchmarkURL(target),
		"pageProps": pp,
		"cached":    cached,
	}
	if cacheLayer != "" {
		resp["cacheLayer"] = cacheLayer
		w.Header().Set("X-Benchmark-Cache", cacheLayer)
	}
	json.NewEncoder(w).Encode(resp)
}

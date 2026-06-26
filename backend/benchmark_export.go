//go:build autopipe
// +build autopipe

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// OpenClaw export root (overridable via env)
// layout:
//   {BENCHMARK_OPENCLAW_ROOT}/
//     README.md
//     latest.json
//     exports/{exportId}/
//       README.md
//       manifest.json
//       index.json
//       data/benchmark_long.csv
//       slices/{slice_id}/...

const benchmarkOpenClawRootEnv = "BENCHMARK_OPENCLAW_ROOT"

// default server path /tmp/Benckmark/ (override with BENCHMARK_OPENCLAW_ROOT)
const benchmarkOpenClawDefaultRoot = "/tmp/Benckmark"

type benchmarkExportFile struct {
	Path    string          `json:"path"`
	Kind    string          `json:"kind"` // "text" | "json"
	Content json.RawMessage `json:"content"`
}

type benchmarkExportRequest struct {
	ExportID string                `json:"exportId"`
	Label    string                `json:"label,omitempty"`
	Files    []benchmarkExportFile `json:"files"`
}

func benchmarkOpenClawRoot() string {
	if v := strings.TrimSpace(os.Getenv(benchmarkOpenClawRootEnv)); v != "" {
		return v
	}
	return benchmarkOpenClawDefaultRoot
}

func sanitizeExportRelativePath(p string) (string, error) {
	p = strings.TrimSpace(p)
	p = strings.ReplaceAll(p, "\\", "/")
	if p == "" || strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return "", fmt.Errorf("invalid export path: %q", p)
	}
	clean := filepath.Clean(p)
	if clean == "." || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("invalid export path: %q", p)
	}
	return filepath.ToSlash(clean), nil
}

func writeBenchmarkExportPack(req benchmarkExportRequest) (exportDir string, rel string, err error) {
	if req.ExportID == "" {
		return "", "", fmt.Errorf("exportId is required")
	}
	if len(req.Files) == 0 {
		return "", "", fmt.Errorf("files is required")
	}

	root := benchmarkOpenClawRoot()
	rel = filepath.Join("exports", req.ExportID)
	exportDir = filepath.Join(root, rel)

	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return "", "", fmt.Errorf("mkdir export: %w", err)
	}

	for _, f := range req.Files {
		relPath, err := sanitizeExportRelativePath(f.Path)
		if err != nil {
			return "", "", err
		}
		absPath := filepath.Join(exportDir, relPath)
		if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
			return "", "", fmt.Errorf("mkdir %s: %w", relPath, err)
		}

		var data []byte
		switch f.Kind {
		case "text":
			var s string
			if err := json.Unmarshal(f.Content, &s); err != nil {
				return "", "", fmt.Errorf("decode text %s: %w", relPath, err)
			}
			data = []byte(s)
		case "json":
			var obj interface{}
			if err := json.Unmarshal(f.Content, &obj); err != nil {
				return "", "", fmt.Errorf("decode json %s: %w", relPath, err)
			}
			data, err = json.MarshalIndent(obj, "", "  ")
			if err != nil {
				return "", "", fmt.Errorf("marshal json %s: %w", relPath, err)
			}
		default:
			return "", "", fmt.Errorf("unknown file kind %q for %s", f.Kind, relPath)
		}

		if err := os.WriteFile(absPath, data, 0o644); err != nil {
			return "", "", fmt.Errorf("write %s: %w", relPath, err)
		}
	}

	latest := map[string]interface{}{
		"exportId":  req.ExportID,
		"label":     req.Label,
		"path":      filepath.ToSlash(rel),
		"root":      root,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	latestBytes, _ := json.MarshalIndent(latest, "", "  ")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", "", err
	}
	if err := os.WriteFile(filepath.Join(root, "latest.json"), latestBytes, 0o644); err != nil {
		return "", "", fmt.Errorf("write latest.json: %w", err)
	}

	return exportDir, filepath.ToSlash(rel), nil
}

// postBenchmarkExportHandler POST /api/dashboard/benchmark/export
// Body: OpenClaw export pack (manifest + flat files). Writes under BENCHMARK_OPENCLAW_ROOT.
func (r *Runner) postBenchmarkExportHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var body benchmarkExportRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	exportDir, rel, err := writeBenchmarkExportPack(body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	log.Printf("benchmark openclaw export written: %s (%d files)", exportDir, len(body.Files))

	sliceCount := countBenchmarkExportSlices(body.Files)
	if err := r.benchmarkRecordExport(body.ExportID, getUserID(req), body.Label, exportDir, sliceCount, map[string]interface{}{
		"exportId":     body.ExportID,
		"relativePath": rel,
		"fileCount":    len(body.Files),
		"sliceCount":   sliceCount,
	}); err != nil {
		log.Printf("benchmark: record export row: %v", err)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"exportId":     body.ExportID,
		"rootPath":     benchmarkOpenClawRoot(),
		"exportPath":   exportDir,
		"relativePath": rel,
		"fileCount":    len(body.Files),
		"latestFile":   filepath.Join(benchmarkOpenClawRoot(), "latest.json"),
	})
}

type benchmarkExportFromURLsRequest struct {
	Label   string            `json:"label"`
	Filters map[string]string `json:"filters,omitempty"`
	URLs    []string          `json:"urls"`
}

// postBenchmarkExportFromURLsHandler POST /api/dashboard/benchmark/export-from-urls
// Body is URL list only; server fetches pageProps from Redis/MySQL/upstream and builds pack (avoids Nginx 413).
func (r *Runner) postBenchmarkExportFromURLsHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var body benchmarkExportFromURLsRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	seen := make(map[string]struct{})
	var work []string
	for _, u := range body.URLs {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		c := canonicalBenchmarkURL(u)
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		work = append(work, c)
	}
	if len(work) == 0 {
		http.Error(w, `{"success":false,"error":"urls is required"}`, http.StatusBadRequest)
		return
	}
	if len(work) > 2500 {
		http.Error(w, `{"success":false,"error":"too many urls (max 2500)"}`, http.StatusBadRequest)
		return
	}

	var mu sync.Mutex
	var normalized []*benchNormalizedSlice
	var failures []map[string]string

	const workers = 12
	jobs := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for u := range jobs {
				pp, _, _, err := r.fetchBenchmarkPageWithStore(false, u)
				if err != nil {
					mu.Lock()
					failures = append(failures, map[string]string{"url": u, "error": err.Error()})
					mu.Unlock()
					continue
				}
				slice := benchmarkNormalizePageProps(u, pp)
				if slice == nil {
					mu.Lock()
					failures = append(failures, map[string]string{"url": u, "error": "no published metrics"})
					mu.Unlock()
					continue
				}
				mu.Lock()
				normalized = append(normalized, slice)
				mu.Unlock()
			}
		}()
	}
	for _, u := range work {
		jobs <- u
	}
	close(jobs)
	wg.Wait()

	if len(normalized) == 0 {
		http.Error(w, `{"success":false,"error":"no slice data could be loaded"}`, http.StatusBadRequest)
		return
	}

	label := strings.TrimSpace(body.Label)
	if label == "" {
		label = "benchmark_export"
	}
	filters := body.Filters
	if filters == nil {
		filters = map[string]string{}
	}

	exportID, files, err := buildOpenClawExportPackFromSlices(label, filters, normalized, failures)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	pack := benchmarkExportRequest{ExportID: exportID, Label: label, Files: files}
	exportDir, rel, err := writeBenchmarkExportPack(pack)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	log.Printf("benchmark openclaw export-from-urls written: %s (%d ok, %d fail, %d files)", exportDir, len(normalized), len(failures), len(files))

	sliceCount := len(normalized)
	if err := r.benchmarkRecordExport(exportID, getUserID(req), label, exportDir, sliceCount, map[string]interface{}{
		"exportId":     exportID,
		"relativePath": rel,
		"fileCount":    len(files),
		"sliceCount":   sliceCount,
		"mode":         "from_urls",
	}); err != nil {
		log.Printf("benchmark: record export row: %v", err)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"exportId":     exportID,
		"rootPath":     benchmarkOpenClawRoot(),
		"exportPath":   exportDir,
		"relativePath": rel,
		"fileCount":    len(files),
		"latestFile":   filepath.Join(benchmarkOpenClawRoot(), "latest.json"),
		"slicesOk":     sliceCount,
		"slicesFailed": len(failures),
	})
}

// getBenchmarkExportLatestHandler GET /api/dashboard/benchmark/export/latest
func (r *Runner) getBenchmarkExportLatestHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	latestPath := filepath.Join(benchmarkOpenClawRoot(), "latest.json")
	data, err := os.ReadFile(latestPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, `{"success":false,"error":"no export yet"}`, http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	var latest map[string]interface{}
	if err := json.Unmarshal(data, &latest); err != nil {
		http.Error(w, fmt.Sprintf(`{"success":false,"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"latest":  latest,
	})
}

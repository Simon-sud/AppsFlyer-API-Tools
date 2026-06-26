//go:build autopipe
// +build autopipe

package main

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const benchmarkOpenClawPackVersion = "1.0"

var benchmarkNonSlugChars = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

type benchSectionMeta struct {
	Key   string
	ID    string
	Label string
}

// order matches frontend SECTION_META
var benchExportSectionOrder = []benchSectionMeta{
	{"section2Data", "performance", "Performance"},
	{"section1Data", "trends", "Trends"},
	{"section3Data", "top_countries", "Top Countries"},
	{"section4Data", "change", "Change"},
	{"section5Data", "extra", "Extra"},
}

func benchmarkOpenClawExportID() string {
	t := time.Now().UTC()
	raw := strings.ReplaceAll(strings.ReplaceAll(t.Format("2006-01-02T15:04:05"), "-", ""), ":", "")
	if len(raw) > 15 {
		raw = raw[:15]
	}
	return raw + "Z"
}

func benchmarkSlugifySliceFolder(url string) string {
	path := strings.TrimPrefix(strings.ToLower(url), "https://www.appsflyer.com/benchmarks/")
	path = strings.TrimPrefix(path, "http://www.appsflyer.com/benchmarks/")
	path = strings.TrimSuffix(path, "/")
	path = strings.ReplaceAll(path, "/", "__")
	path = benchmarkNonSlugChars.ReplaceAllString(path, "_")
	if path == "" {
		return "slice"
	}
	return path
}

func benchmarkParseDescriptorFromURL(url string, slug []interface{}) (category, subCategory, subSub, country, mediaType string) {
	var parts []string
	if len(slug) > 0 {
		for _, s := range slug {
			if str, ok := s.(string); ok {
				parts = append(parts, str)
			}
		}
	} else {
		path := strings.TrimSuffix(url, "/")
		path = regexp.MustCompile(`(?i)^https://www\.appsflyer\.com/benchmarks/`).ReplaceAllString(path, "")
		for _, p := range strings.Split(path, "/") {
			if p != "" {
				parts = append(parts, p)
			}
		}
	}
	if len(parts) == 4 {
		return parts[0], parts[1], "", parts[2], parts[3]
	}
	if len(parts) >= 5 {
		return parts[0], parts[1], parts[2], parts[3], parts[4]
	}
	return "", "", "", "", ""
}

func benchmarkComputeStats(values []float64) (n int, min, median, avg, max float64) {
	if len(values) == 0 {
		return 0, 0, 0, 0, 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	n = len(sorted)
	min = sorted[0]
	max = sorted[n-1]
	mid := n / 2
	if n%2 == 0 {
		median = (sorted[mid-1] + sorted[mid]) / 2
	} else {
		median = sorted[mid]
	}
	sum := 0.0
	for _, v := range sorted {
		sum += v
	}
	avg = sum / float64(n)
	return n, min, median, avg, max
}

type benchMetricCube struct {
	Section      string
	SectionLabel string
	Metric       string
	Rows         []map[string]interface{}
	StatsN       int
	StatsMin     float64
	StatsMedian  float64
	StatsAvg     float64
	StatsMax     float64
}

type benchNormalizedSlice struct {
	ID                  string
	URL                 string
	Category            string
	SubCategory         string
	SubSubCategory      string
	Country             string
	MediaType           string
	SectionsAvailable   []string
	Cubes               []benchMetricCube
	PointCount          int
	Folder              string
	MetricSummariesJSON []map[string]interface{}
}

func benchmarkNormalizePageProps(url string, pageProps map[string]interface{}) *benchNormalizedSlice {
	if pageProps == nil {
		return nil
	}
	var slug []interface{}
	if raw, ok := pageProps["slug"].([]interface{}); ok {
		slug = raw
	}
	cat, sub, subSub, ctry, mt := benchmarkParseDescriptorFromURL(url, slug)
	idPath := strings.TrimSuffix(url, "/")
	idPath = regexp.MustCompile(`(?i)^https://www\.appsflyer\.com/benchmarks/`).ReplaceAllString(idPath, "")
	id := idPath

	var cubes []benchMetricCube
	var sectionsAvail []string

	for _, meta := range benchExportSectionOrder {
		secRaw, ok := pageProps[meta.Key].(map[string]interface{})
		if !ok || len(secRaw) == 0 {
			continue
		}
		sectionsAvail = append(sectionsAvail, meta.ID)

		for metricName, metricVal := range secRaw {
			metric, ok := metricVal.(map[string]interface{})
			if !ok {
				continue
			}
			dataArr, ok := metric["data"].([]interface{})
			if !ok || len(dataArr) == 0 {
				continue
			}
			var rows []map[string]interface{}
			var values []float64
			for _, row := range dataArr {
				rowMap, ok := row.(map[string]interface{})
				if !ok {
					continue
				}
				rows = append(rows, rowMap)
				if dv, ok := rowMap["dataValue"].(float64); ok && !math.IsNaN(dv) {
					values = append(values, dv)
				} else if dv, ok := rowMap["dataValue"].(json.Number); ok {
					f, _ := dv.Float64()
					if !math.IsNaN(f) {
						values = append(values, f)
					}
				}
			}
			if len(rows) == 0 {
				continue
			}
			n, mn, med, av, mx := benchmarkComputeStats(values)
			cubes = append(cubes, benchMetricCube{
				Section:      meta.ID,
				SectionLabel: meta.Label,
				Metric:       metricName,
				Rows:         rows,
				StatsN:       n,
				StatsMin:     mn,
				StatsMedian:  med,
				StatsAvg:     av,
				StatsMax:     mx,
			})
		}
	}

	if len(cubes) == 0 {
		return nil
	}

	pointCount := 0
	for _, c := range cubes {
		pointCount += len(c.Rows)
	}

	folder := benchmarkSlugifySliceFolder(url)
	var summaries []map[string]interface{}
	for _, c := range cubes {
		summaries = append(summaries, map[string]interface{}{
			"section": c.Section,
			"metric":  c.Metric,
			"rows":    len(c.Rows),
			"stats": map[string]interface{}{
				"n":      c.StatsN,
				"min":    c.StatsMin,
				"median": c.StatsMedian,
				"avg":    c.StatsAvg,
				"max":    c.StatsMax,
			},
		})
	}

	return &benchNormalizedSlice{
		ID:                  id,
		URL:                 url,
		Category:            cat,
		SubCategory:         sub,
		SubSubCategory:      subSub,
		Country:             ctry,
		MediaType:           mt,
		SectionsAvailable:   sectionsAvail,
		Cubes:               cubes,
		PointCount:          pointCount,
		Folder:              folder,
		MetricSummariesJSON: summaries,
	}
}

func benchmarkCSVEscape(v interface{}) string {
	s := ""
	switch t := v.(type) {
	case string:
		s = t
	case float64:
		s = strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		s = strconv.Itoa(t)
	case nil:
		s = ""
	default:
		s = fmt.Sprint(t)
	}
	if strings.ContainsAny(s, ",\"\n\r") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

const benchmarkLongCSVHeader = "slice_id,slice_url,category,sub_category,sub_sub_category,slice_country,slice_media_type,section,metric,quarter,platform,app_size,row_country,row_media_type,value"

func benchmarkBuildLongCSVLine(slice *benchNormalizedSlice, cube benchMetricCube, row map[string]interface{}) string {
	base := []string{
		slice.ID,
		slice.URL,
		slice.Category,
		slice.SubCategory,
		slice.SubSubCategory,
		slice.Country,
		slice.MediaType,
		cube.Section,
		cube.Metric,
		fmt.Sprint(row["date"]),
		fmt.Sprint(row["platform"]),
		fmt.Sprint(row["appSize"]),
		fmt.Sprint(row["countryName"]),
		fmt.Sprint(row["mediaType"]),
	}
	val := ""
	if dv, ok := row["dataValue"].(float64); ok {
		val = strconv.FormatFloat(dv, 'f', -1, 64)
	} else {
		val = fmt.Sprint(row["dataValue"])
	}
	base = append(base, val)
	parts := make([]string, len(base))
	for i, b := range base {
		parts[i] = benchmarkCSVEscape(b)
	}
	return strings.Join(parts, ",")
}

const benchmarkExportReadme = `# AppsFlyer Benchmark Export (OpenClaw)

This folder is an **AI-ready export pack** from Benchmark Explorer.
Source: AppsFlyer Public Benchmarks (industry aggregates, not client actuals).

## Read order

1. manifest.json — export metadata, schema, slice list
2. index.json — quick lookup table
3. data/benchmark_long.csv — **primary analysis file** (all slices, long format)
4. slices/<slice_id>/summary.json — per-slice metric medians (compact)
5. slices/<slice_id>/cubes/<section>__<metric>.json — metric-level stats + row count
`

func benchmarkSafeMetricFileName(metric string) string {
	s := benchmarkNonSlugChars.ReplaceAllString(metric, "_")
	if len(s) > 80 {
		s = s[:80]
	}
	if s == "" {
		return "metric"
	}
	return s
}

// buildOpenClawExportPackFromSlices matches frontend buildOpenClawExportPack output
func buildOpenClawExportPackFromSlices(label string, filters map[string]string, slices []*benchNormalizedSlice, failures []map[string]string) (exportID string, files []benchmarkExportFile, err error) {
	exportID = benchmarkOpenClawExportID()
	if label == "" {
		label = "benchmark_export"
	}

	files = append(files, benchmarkExportFile{Path: "README.md", Kind: "text", Content: mustJSONRaw(benchmarkExportReadme)})

	longLines := []string{benchmarkLongCSVHeader}
	var indexEntries []map[string]interface{}

	for _, slice := range slices {
		for _, cube := range slice.Cubes {
			for _, row := range cube.Rows {
				longLines = append(longLines, benchmarkBuildLongCSVLine(slice, cube, row))
			}
		}

		idxMetrics := make([]map[string]interface{}, 0, len(slice.MetricSummariesJSON))
		for _, m := range slice.MetricSummariesJSON {
			stats, _ := m["stats"].(map[string]interface{})
			med := 0.0
			if stats != nil {
				if x, ok := stats["median"].(float64); ok {
					med = x
				}
			}
			idxMetrics = append(idxMetrics, map[string]interface{}{
				"section": m["section"],
				"metric":  m["metric"],
				"median":  med,
			})
		}

		indexEntries = append(indexEntries, map[string]interface{}{
			"slice_id":    slice.ID,
			"folder":      "slices/" + slice.Folder,
			"url":         slice.URL,
			"descriptor":  map[string]string{"category": slice.Category, "subCategory": slice.SubCategory, "subSubCategory": slice.SubSubCategory, "country": slice.Country, "mediaType": slice.MediaType},
			"sections":    slice.SectionsAvailable,
			"point_count": slice.PointCount,
			"metrics":     idxMetrics,
		})

		descriptor := map[string]interface{}{
			"category": slice.Category, "subCategory": slice.SubCategory, "country": slice.Country, "mediaType": slice.MediaType,
		}
		if slice.SubSubCategory != "" {
			descriptor["subSubCategory"] = slice.SubSubCategory
		}
		files = append(files, benchmarkExportFile{Path: "slices/" + slice.Folder + "/descriptor.json", Kind: "json", Content: mustJSONRaw(descriptor)})

		files = append(files, benchmarkExportFile{
			Path: "slices/" + slice.Folder + "/summary.json",
			Kind: "json",
			Content: mustJSONRaw(map[string]interface{}{
				"slice_id":             slice.ID,
				"url":                  slice.URL,
				"sections_available":   slice.SectionsAvailable,
				"point_count":          slice.PointCount,
				"metrics":              slice.MetricSummariesJSON,
			}),
		})

		for _, cube := range slice.Cubes {
			safeM := benchmarkSafeMetricFileName(cube.Metric)
			files = append(files, benchmarkExportFile{
				Path: fmt.Sprintf("slices/%s/cubes/%s__%s.json", slice.Folder, cube.Section, safeM),
				Kind: "json",
				Content: mustJSONRaw(map[string]interface{}{
					"section":       cube.Section,
					"section_label": cube.SectionLabel,
					"metric":        cube.Metric,
					"stats": map[string]interface{}{
						"n": cube.StatsN, "min": cube.StatsMin, "median": cube.StatsMedian, "avg": cube.StatsAvg, "max": cube.StatsMax,
					},
					"row_count": len(cube.Rows),
				}),
			})
		}
	}

	files = append(files, benchmarkExportFile{Path: "data/benchmark_long.csv", Kind: "text", Content: mustJSONRaw(strings.Join(longLines, "\n"))})

	totalPoints := 0
	for _, s := range slices {
		totalPoints += s.PointCount
	}

	sectionSchema := make([]map[string]string, 0, len(benchExportSectionOrder))
	for _, m := range benchExportSectionOrder {
		sectionSchema = append(sectionSchema, map[string]string{"id": m.ID, "label": m.Label, "key": m.Key})
	}

	manifest := map[string]interface{}{
		"pack_version": benchmarkOpenClawPackVersion,
		"export_id":    exportID,
		"created_at":   time.Now().UTC().Format(time.RFC3339),
		"label":        label,
		"source": map[string]string{
			"provider": "appsflyer", "product": "public_benchmarks", "url": "https://www.appsflyer.com/benchmarks/",
		},
		"schema": map[string]interface{}{
			"long_csv": "data/benchmark_long.csv", "slice_root": "slices/", "sections": sectionSchema,
		},
		"filters": filters,
		"stats": map[string]interface{}{
			"slices_ok": len(slices), "slices_failed": len(failures),
			"total_rows": len(longLines) - 1, "total_points": totalPoints,
		},
		"slices":   indexEntries,
		"failures": failures,
	}

	files = append(files, benchmarkExportFile{Path: "manifest.json", Kind: "json", Content: mustJSONRaw(manifest)})
	files = append(files, benchmarkExportFile{
		Path: "index.json", Kind: "json",
		Content: mustJSONRaw(map[string]interface{}{"export_id": exportID, "slices": indexEntries, "failures": failures}),
	})

	return exportID, files, nil
}

func mustJSONRaw(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`""`)
	}
	return json.RawMessage(b)
}

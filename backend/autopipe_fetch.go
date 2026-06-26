//go:build autopipe
// +build autopipe

package main

import (
	"context"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// decodeAPIToken decode API token (may be Base64-encoded JWT)
func decodeAPIToken(encodedToken string) string {
	// return empty token as-is
	if encodedToken == "" {
		return encodedToken
	}

	// return as-is if token already starts with eyJ (JWT)
	if strings.HasPrefix(encodedToken, "eyJ") {
		return encodedToken
	}

	// try Base64 decode
	decoded, err := base64.StdEncoding.DecodeString(encodedToken)
	if err != nil {
		// on decode failure, return original token
		log.Printf("[AutoPipe] Base64 decode failed, using original token: %v", err)
		return encodedToken
	}

	return string(decoded)
}

// loadAccountConfig load account config from database
func (r *Runner) loadAccountConfig(ctx context.Context, accountID string) (*AccountConfig, error) {
	// create context with timeout
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	query := `
		SELECT id, account_name, account_type, api_token
		FROM account_configs
		WHERE id = ?
	`

	log.Printf("[AutoPipe] Loading account config for accountID: %s", accountID)
	var ac AccountConfig
	err := r.DB.QueryRowContext(queryCtx, query, accountID).Scan(
		&ac.ID, &ac.AccountName, &ac.AccountType, &ac.APIToken,
	)

	if err != nil {
		log.Printf("[AutoPipe] Error loading account config for %s: %v", accountID, err)
		return nil, fmt.Errorf("load account config: %w", err)
	}

	log.Printf("[AutoPipe] Account config loaded successfully: %s", ac.AccountName)
	return &ac, nil
}

// getAPIEndpoint build API URL from task and account type
func getAPIEndpoint(taskType, accountType, appID string) (string, error) {
	// prefix numeric app_id with id
	formattedAppID := appID
	if _, err := strconv.Atoi(appID); err == nil {
		formattedAppID = "id" + appID
	}

	baseURL := "https://hq1.appsflyer.com/api/raw-data/export/app/" + formattedAppID

	// API endpoint map
	endpoints := map[string]map[string]string{
		"PID": {
			"install_pb":   "/postbacks/v5",
			"event_pb":     "/in-app-events-postbacks/v5",
			"install_rtpb": "/retarget_install_postbacks/v5",
			"event_rtpb":   "/retarget_in_app_events_postbacks/v5",
		},
		"PRT": {
			"install_pb":   "/installs_report/v5",
			"event_pb":     "/in_app_events_report/v5",
			"install_rtpb": "/installs-retarget/v5",
			"event_rtpb":   "/in-app-events-retarget/v5",
		},
	}

	endpoint, ok := endpoints[accountType][taskType]
	if !ok {
		return "", fmt.Errorf("unsupported combination: type=%s account=%s", taskType, accountType)
	}

	return baseURL + endpoint, nil
}

// fetchCSVFromAPI fetch CSV from AppsFlyer API (with retries)
func (r *Runner) fetchCSVFromAPI(ctx context.Context, apiURL, token string, params map[string]string) (*csv.Reader, io.ReadCloser, error) {
	// decode token (may be Base64-encoded)
	decodedToken := decodeAPIToken(token)
	log.Printf("[AutoPipe] Token decoded, length: %d", len(decodedToken))

	// build request URL
	u, err := url.Parse(apiURL)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid URL: %w", err)
	}

	// add query parameters
	q := u.Query()
	for key, value := range params {
		q.Set(key, value)
	}
	u.RawQuery = q.Encode()

	// retry settings
	maxRetries := 3
	retryDelay := 2 * time.Second
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("[AutoPipe] Retry attempt %d/%d after error: %v", attempt, maxRetries-1, lastErr)
			// exponential backoff: 2s first retry, 4s second
			waitTime := retryDelay * time.Duration(1<<uint(attempt-1))
			select {
			case <-ctx.Done():
				return nil, nil, fmt.Errorf("context cancelled: %w", ctx.Err())
			case <-time.After(waitTime):
			}
		}

		// create HTTP request
		req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
		if err != nil {
			lastErr = fmt.Errorf("create request: %w", err)
			continue
		}

		// set headers (aligned with Home page)
		req.Header.Set("accept", "application/json") // use lowercase accept and application/json
		req.Header.Set("Authorization", "Bearer "+decodedToken)

		// send request (follow redirects)
		// 10-minute timeout for large files
		client := &http.Client{
			Timeout: 10 * time.Minute, // 10-minute timeout for large files
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				// allow up to 10 redirects
				if len(via) >= 10 {
					return fmt.Errorf("stopped after 10 redirects")
				}
				// continue following redirects
				return nil
			},
		}

		if attempt == 0 {
			log.Printf("[AutoPipe] Sending request to: %s", u.String())
			tokenPreview := decodedToken
			if len(tokenPreview) > 20 {
				tokenPreview = tokenPreview[:20]
			}
			log.Printf("[AutoPipe] Request headers: Accept=%s, Authorization=Bearer %s...", req.Header.Get("accept"), tokenPreview)
		}

		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("API request failed: %w", err)
			// check for unexpected EOF or other retryable errors
			errStr := err.Error()
			if strings.Contains(errStr, "unexpected EOF") || 
			   strings.Contains(errStr, "connection reset") ||
			   strings.Contains(errStr, "broken pipe") ||
			   strings.Contains(errStr, "timeout") {
				log.Printf("[AutoPipe] Retryable error detected: %v", err)
				continue // retry
			}
			// retry other errors (network issues are often transient)
			log.Printf("[AutoPipe] Request error (will retry): %v", err)
			continue
		}

		log.Printf("[AutoPipe] Final Response status: %d", resp.StatusCode)
		log.Printf("[AutoPipe] Final Response URL: %s", resp.Request.URL.String())
		log.Printf("[AutoPipe] Response Content-Type: %s", resp.Header.Get("Content-Type"))
		log.Printf("[AutoPipe] Response Content-Length: %s", resp.Header.Get("Content-Length"))

		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("[AutoPipe] Error response body: %s", string(bodyBytes))
			lastErr = fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(bodyBytes))
			// do not retry HTTP errors except 5xx
			if resp.StatusCode >= 500 && resp.StatusCode < 600 {
				log.Printf("[AutoPipe] Server error %d, will retry", resp.StatusCode)
				continue
			}
			return nil, nil, lastErr
		}

		log.Printf("[AutoPipe] Success! Reading CSV data...")

		// create CSV reader
		csvReader := csv.NewReader(resp.Body)
		csvReader.LazyQuotes = true
		csvReader.TrimLeadingSpace = true

		return csvReader, resp.Body, nil
	}

	// all retries exhausted
	return nil, nil, fmt.Errorf("fetch CSV failed after %d attempts: %w", maxRetries, lastErr)
}

// min returns the minimum of two integers
// parsePostbackURL parse postback_url for missing field values
// mainly fills iOS privacy-related gaps
func parsePostbackURL(postbackURL string) map[string]string {
	result := make(map[string]string)

	if postbackURL == "" {
		return result
	}

	// parse URL
	parsedURL, err := url.Parse(postbackURL)
	if err != nil {
		return result
	}

	// read query parameters
	queryParams := parsedURL.Query()

	// postback_url param casing varies by channel/version
	// case-insensitive match to avoid missing CLICK_TIMESTAMP / INSTALL_TIMESTAMP
	getQueryParam := func(keys ...string) string {
		for _, targetKey := range keys {
			// prefer exact key match
			if v := queryParams.Get(targetKey); v != "" {
				return v
			}
			// then case-insensitive match
			for actualKey, values := range queryParams {
				if strings.EqualFold(actualKey, targetKey) && len(values) > 0 && values[0] != "" {
					return values[0]
				}
			}
		}
		return ""
	}

	// extract timestamp fields
	// aliases: click_timestamp / click_time / attributed_touch_time
	if clickTime := getQueryParam(
		"click_timestamp", "CLICK_TIMESTAMP",
		"click_time", "CLICK_TIME",
		"attributed_touch_time", "ATTRIBUTED_TOUCH_TIME",
	); clickTime != "" {
		// URL-decode
		decoded, _ := url.QueryUnescape(clickTime)
		result["attributed_touch_time"] = formatTimestamp(decoded)
	}

	// aliases: install_timestamp / install_time
	if installTime := getQueryParam(
		"install_timestamp", "INSTALL_TIMESTAMP",
		"install_time", "INSTALL_TIME",
	); installTime != "" {
		decoded, _ := url.QueryUnescape(installTime)
		result["install_time"] = formatTimestamp(decoded)
	}

	if downloadTime := getQueryParam("download_timestamp", "DOWNLOAD_TIMESTAMP"); downloadTime != "" {
		decoded, _ := url.QueryUnescape(downloadTime)
		// download_timestamp fallback for install_time
		if result["install_time"] == "" {
			result["install_time"] = formatTimestamp(decoded)
		}
	}

	if eventTime := getQueryParam("timestamp", "TIMESTAMP"); eventTime != "" {
		decoded, _ := url.QueryUnescape(eventTime)
		result["event_time"] = formatTimestamp(decoded)
	}

	// extract ID fields
	if afID := getQueryParam("appsflyer_id", "APPSFLYER_ID"); afID != "" {
		result["appsflyer_id"] = afID
	}

	if gaid := getQueryParam("gaid", "GAID"); gaid != "" {
		result["advertising_id"] = gaid
	}

	if idfa := getQueryParam("idfa", "IDFA"); idfa != "" {
		result["idfa"] = idfa
		// IDFA fallback for advertising_id
		if result["advertising_id"] == "" {
			result["advertising_id"] = idfa
		}
	}

	if idfv := getQueryParam("idfv", "IDFV"); idfv != "" {
		result["idfv"] = idfv
	}

	// extract other useful fields
	if userID := getQueryParam("user_id", "USER_ID"); userID != "" {
		result["customer_user_id"] = userID
	}

	if ip := getQueryParam("ip", "IP"); ip != "" {
		result["ip"] = ip
	}

	if lang := getQueryParam("lang", "LANG", "language", "LANGUAGE"); lang != "" {
		result["language"] = lang
	}

	if appVersion := getQueryParam("app_version", "APP_VERSION"); appVersion != "" {
		result["app_version"] = appVersion
	}

	if osVersion := getQueryParam("os_version", "OS_VERSION"); osVersion != "" {
		result["os_version"] = osVersion
	}

	return result
}

// formatTimestamp format timestamp as 2025-10-23 22:00:00
func formatTimestamp(timestamp string) string {
	if timestamp == "" {
		return ""
	}

	// target format: 2006-01-02 15:04:05
	const targetFormat = "2006-01-02 15:04:05"

	// return as-is if already target format
	if len(timestamp) == 19 && timestamp[4] == '-' && timestamp[7] == '-' && timestamp[10] == ' ' && timestamp[13] == ':' && timestamp[16] == ':' {
		return timestamp
	}

	// parse and convert to target format
	inputFormats := []string{
		"2006-01-02 15:04:05.000",  // with milliseconds
		"2006-01-02T15:04:05",      // ISO format
		"2006-01-02T15:04:05.000",  // ISO formatwith milliseconds
		"2006-01-02T15:04:05Z",     // ISO with Z
		"2006-01-02T15:04:05.000Z", // ISO with milliseconds and Z
	}

	for _, format := range inputFormats {
		t, err := time.Parse(format, timestamp)
		if err == nil {
			return t.Format(targetFormat)
		}
	}

	// return empty string if unparseable
	return ""
}

// enhanceRowWithPostbackURL enrich row from postback_url
// fill empty fields on iOS only
// tableName: table name; Install tables need special install_time handling
// returns enriched row and whether enrichment occurred
func enhanceRowWithPostbackURL(row CSVRow, tableName string) (CSVRow, bool) {
	// check iOS platform
	platform, hasPlatform := row["platform"]
	if !hasPlatform || strings.ToLower(platform) != "ios" {
		return row, false // skip non-iOS rows
	}

	// read postback_url
	postbackURL, hasPostbackURL := row["postback_url"]
	if !hasPostbackURL || postbackURL == "" {
		return row, false // no postback_url; cannot enrich
	}

	// parse postback_url
	extractedData := parsePostbackURL(postbackURL)

	if len(extractedData) == 0 {
		return row, false // no data extracted
	}

	// detect Install-type tables
	isInstallTable := tableName == "Dashboard_Install_Postbacks" || tableName == "Dashboard_Retargeting_Install_Postbacks"

	// Install tables: fill missing only; no overwrite or clear
	enhanced := false
	if isInstallTable {
		// fill install_time from attributed_touch_time when install_time missing
		// keep existing attributed_touch_time; do not clear
		if attributedTouchTime, hasAttributedTouchTime := extractedData["attributed_touch_time"]; hasAttributedTouchTime && attributedTouchTime != "" {
			if existingInstall, exists := row["install_time"]; !exists || strings.TrimSpace(existingInstall) == "" {
				row["install_time"] = attributedTouchTime
				enhanced = true
			}
		}
	}

	// fill empty fields only
	for key, value := range extractedData {
		if value != "" {
			// use parsed value when field empty
			if existingValue, exists := row[key]; !exists || existingValue == "" {
				row[key] = value
				enhanced = true
			}
		}
	}

	return row, enhanced
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// parseCSVRow parse CSV row into map
func parseCSVRow(headers []string, row []string) CSVRow {
	result := make(CSVRow)
	for i, header := range headers {
		if i < len(row) {
			// normalize field names: lowercase, spaces to underscores
			fieldName := strings.ToLower(strings.ReplaceAll(header, " ", "_"))
			result[fieldName] = strings.TrimSpace(row[i])
		}
	}
	return result
}

// insertCSVData batch insert CSV into database
// ProgressCallback progress callback (current percent)
type ProgressCallback func(progress int)

func (r *Runner) insertCSVData(ctx context.Context, tableName, taskID, appID, accountName string, csvReader *csv.Reader, body io.ReadCloser, progressCb ProgressCallback, isDailyTask bool, dateRange *DateRange) (int64, error) {
	defer body.Close()

	// === preprocess: delete prior task data (avoid duplicates on re-run) ===
	// Daily: delete only current date range (install_time/event_time); keep history
	// Single: delete all history for task+app
	var deletedCount int64
	var err error
	if isDailyTask && dateRange != nil {
		// Daily: delete only current date range
		deletedCount, err = r.deleteExistingRecordsByTaskIDAndDateRange(ctx, tableName, taskID, []string{appID}, dateRange)
		if err != nil {
			log.Printf("[AutoPipe] Warning: Failed to delete date range data: %v", err)
		} else if deletedCount > 0 {
			log.Printf("[AutoPipe] ✓ Deleted %d records for task %s, app %s in date range %s to %s",
				deletedCount, taskID, appID, dateRange.FromDate.Format("2006-01-02"), dateRange.ToDate.Format("2006-01-02"))
		}
	} else {
		// Single: delete all history for task+app
		deletedCount, err = r.deleteExistingRecordsByTaskID(ctx, tableName, taskID, []string{appID})
		if err != nil {
			log.Printf("[AutoPipe] Warning: Failed to delete historical data: %v", err)
		} else if deletedCount > 0 {
			log.Printf("[AutoPipe] ✓ Deleted %d historical records for task %s, app %s", deletedCount, taskID, appID)
		}
	}

	// === insert progress: 30-80% ===
	// 30-35%: read and parse CSV header
	// 35-40%: prepare insert
	// 40-75%: batch insert (even spread)
	// 75-80%: final batch complete

	// read CSV header
	if progressCb != nil {
		progressCb(32) // 32%: start reading CSV header
	}

	headers, err := csvReader.Read()
	if err != nil {
		return 0, fmt.Errorf("read CSV headers: %w", err)
	}

	log.Printf("[AutoPipe] [32%%] CSV headers parsed: %d columns", len(headers))
	if len(headers) > 0 {
		log.Printf("[AutoPipe] First 5 headers: %v", headers[:min(5, len(headers))])
	}

	// normalize header field names
	normalizedHeaders := make([]string, len(headers))
	for i, h := range headers {
		normalizedHeaders[i] = strings.ToLower(strings.ReplaceAll(h, " ", "_"))
	}

	if progressCb != nil {
		progressCb(35) // 35%: CSV header parsed
	}

	// generate batch ID
	batchID := fmt.Sprintf("%s_%d", taskID, time.Now().Unix())

	var processed int64
	var rowCount int64
	var batchCount int64
	batch := make([]CSVRow, 0, 1000) // batch insert, 1000 rows per batch

	// insert progress 40-75% (smooth; update every 10 batches)
	const insertProgressStart = 40
	const insertProgressEnd = 75
	var lastReportedProgress int = insertProgressStart

	if progressCb != nil {
		progressCb(40) // 40%: start batch insert
		log.Printf("[AutoPipe] [40%%] Starting batch data insertion...")
	}

	var iosEnhancedCount int64 // count iOS-enriched rows

	// read data rows
	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("[AutoPipe] Warning: skip row due to parse error: %v", err)
			continue
		}

		rowCount++
		if rowCount == 1 {
			log.Printf("[AutoPipe] First data row (sample): %v", row[:min(3, len(row))])
		}

		// parse row
		csvRow := parseCSVRow(normalizedHeaders, row)

		// ========== iOS enrichment: fill missing fields from postback_url ==========
		var wasEnhanced bool
		csvRow, wasEnhanced = enhanceRowWithPostbackURL(csvRow, tableName)
		if wasEnhanced {
			iosEnhancedCount++
			if iosEnhancedCount == 1 {
				log.Printf("[AutoPipe] iOS data enhancement: Started parsing postback_url to fill missing fields")
			}
		}

		// add task metadata fields
		csvRow["task_id"] = taskID
		csvRow["batch_id"] = batchID
		csvRow["app_id"] = appID
		csvRow["account"] = accountName

		batch = append(batch, csvRow)

		// flush batch when full
		if len(batch) >= 1000 {
			count, err := r.insertBatch(ctx, tableName, normalizedHeaders, batch)
			if err != nil {
				log.Printf("[AutoPipe] Error inserting batch: %v", err)
				// continue; do not abort pipeline
			} else {
				processed += count
			}
			batch = batch[:0] // clear batch buffer
			batchCount++

			// progress update per batch (smooth 40-75%)
			// improved progress calc for small datasets
			if progressCb != nil && batchCount > 0 {
				// update progress each batch for smooth UI
				// linear progress 40% to 75%
				// estimate progress from batch count (min 10 batches)
				estimatedTotalBatches := int64(10) // min 10 batches to avoid jumping progress
				if batchCount > estimatedTotalBatches {
					estimatedTotalBatches = batchCount
				}
				increment := int((batchCount * 35) / estimatedTotalBatches) // 35% span (40-75%)
				newProgress := insertProgressStart + increment

				// cap at 75%
				if newProgress > insertProgressEnd {
					newProgress = insertProgressEnd
				}

				// update only when progress increases
				if newProgress > lastReportedProgress {
					progressCb(newProgress)
					lastReportedProgress = newProgress
					log.Printf("[AutoPipe] [%d%%] Batch %d processed, %d rows inserted so far", newProgress, batchCount, processed)
				}
			}
		}
	}

	// insert remaining rows
	if len(batch) > 0 {
		count, err := r.insertBatch(ctx, tableName, normalizedHeaders, batch)
		if err != nil {
			log.Printf("[AutoPipe] Error inserting final batch: %v", err)
		} else {
			processed += count
		}
	}

	// mark 80% when all CSV rows inserted
	if progressCb != nil {
		log.Printf("[AutoPipe] [80%%] All CSV data inserted successfully")
		progressCb(80)
	}

	log.Printf("[AutoPipe] CSV processing completed: total_rows=%d, inserted=%d", rowCount, processed)

	// log iOS enrichment stats
	if iosEnhancedCount > 0 {
		log.Printf("[AutoPipe] ✓ iOS data enhancement: %d rows enhanced from postback_url", iosEnhancedCount)
	}

	return processed, nil
}

// getTableColumns get table column names and types
func (r *Runner) getTableColumns(ctx context.Context, tableName string) (map[string]bool, map[string]string, error) {
	query := `
		SELECT COLUMN_NAME, DATA_TYPE
		FROM information_schema.COLUMNS 
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
	`
	rows, err := r.DB.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, nil, fmt.Errorf("query table columns: %w", err)
	}
	defer rows.Close()

	columns := make(map[string]bool)
	columnTypes := make(map[string]string)
	for rows.Next() {
		var colName, dataType string
		if err := rows.Scan(&colName, &dataType); err != nil {
			return nil, nil, fmt.Errorf("scan column info: %w", err)
		}
		// lowercase to match normalized CSV fields
		lowerColName := strings.ToLower(colName)
		columns[lowerColName] = true
		columnTypes[lowerColName] = dataType
	}

	return columns, columnTypes, rows.Err()
}

// convertValue convert value by column type
func convertValue(value string, dataType string) interface{} {
	if value == "" {
		return nil
	}

	// bool conversion (tinyint(1))
	if dataType == "tinyint" {
		lower := strings.ToLower(strings.TrimSpace(value))
		switch lower {
		case "true", "1", "yes":
			return 1
		case "false", "0", "no":
			return 0
		}
		// try integer parse for other values
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
		return nil
	}

	return value
}

// insertBatch batch insert with deduplication
func (r *Runner) insertBatch(ctx context.Context, tableName string, headers []string, batch []CSVRow) (int64, error) {
	if len(batch) == 0 {
		return 0, nil
	}

	// load actual table columns and types
	tableColumns, columnTypes, err := r.getTableColumns(ctx, tableName)
	if err != nil {
		return 0, fmt.Errorf("get table columns: %w", err)
	}

	// ========== dedup: delete existing duplicates ==========
	// collect IDs and time values in batch
	appsflyerIDs := make([]string, 0)
	advertisingIDs := make([]string, 0)
	appIDs := make([]string, 0)
	taskID := "" // taskID scopes all AutoPipe rows

	// pick time field by table type
	var timeField string
	switch tableName {
	case "Dashboard_Install_Postbacks", "Dashboard_Retargeting_Install_Postbacks":
		timeField = "install_time"
	case "Dashboard_In_App_Event_Postbacks", "Dashboard_Retargeting_In_App_Event_Postbacks":
		timeField = "event_time"
	}
	
	// collect time values for precise dedup
	timeValues := make(map[string]bool)

	for _, row := range batch {
		if appID, ok := row["app_id"]; ok && appID != "" {
			appIDs = append(appIDs, appID)
		}
		if afID, ok := row["appsflyer_id"]; ok && afID != "" {
			appsflyerIDs = append(appsflyerIDs, afID)
		}
		if adID, ok := row["advertising_id"]; ok && adID != "" {
			advertisingIDs = append(advertisingIDs, adID)
		}
		if tid, ok := row["task_id"]; ok && tid != "" && taskID == "" {
			taskID = tid // collect taskID (task-level delete already in insertCSVData)
		}
		// collect time values
		if timeField != "" {
			if timeVal, ok := row[timeField]; ok && timeVal != "" {
				timeValues[timeVal] = true
			}
		}
	}

	// dedup within task by appsflyer_id/advertising_id + app_id + time (scoped by task_id)
	if taskID != "" && (len(appsflyerIDs) > 0 || len(advertisingIDs) > 0) && timeField != "" {
		timeValuesList := make([]string, 0, len(timeValues))
		for tv := range timeValues {
			timeValuesList = append(timeValuesList, tv)
		}
		deletedCount, err := r.deleteExistingRecordsByUserIDAndTime(ctx, tableName, taskID, appsflyerIDs, advertisingIDs, appIDs, timeField, timeValuesList)
		if err != nil {
			log.Printf("[AutoPipe] Warning: Failed to delete by user ID and time (task %s): %v", taskID, err)
		} else if deletedCount > 0 {
			log.Printf("[AutoPipe] ✓ Deduplication (task %s, %s): Deleted %d existing records", taskID, timeField, deletedCount)
		}
	}
	// ========== dedup end ==========

	// build INSERT statement
	// include task_id, batch_id, app_id, account when columns exist
	allFields := make(map[string]bool)
	if tableColumns["task_id"] {
		allFields["task_id"] = true
	}
	if tableColumns["batch_id"] {
		allFields["batch_id"] = true
	}
	if tableColumns["app_id"] {
		allFields["app_id"] = true
	}
	if tableColumns["account"] {
		allFields["account"] = true
	}

	// include only columns present in table
	csvFieldCount := 0
	matchedFieldCount := 0
	for _, h := range headers {
		csvFieldCount++
		if tableColumns[h] {
			allFields[h] = true
			matchedFieldCount++
		}
	}

	log.Printf("[AutoPipe] Field mapping: csv_fields=%d, table_columns=%d, matched=%d, will_insert=%d",
		csvFieldCount, len(tableColumns), matchedFieldCount, len(allFields))

	// convert to ordered field list
	fields := make([]string, 0, len(allFields))
	for field := range allFields {
		fields = append(fields, field)
	}

	// build SQL
	placeholders := make([]string, len(batch))
	args := make([]interface{}, 0, len(batch)*len(fields))

	for i, row := range batch {
		valuePlaceholders := make([]string, len(fields))
		for j, field := range fields {
			valuePlaceholders[j] = "?"
			// use NULL when value missing
			if val, ok := row[field]; ok && val != "" {
				// convert value by column type
				dataType := columnTypes[field]
				convertedVal := convertValue(val, dataType)
				args = append(args, convertedVal)
			} else {
				args = append(args, nil)
			}
		}
		placeholders[i] = "(" + strings.Join(valuePlaceholders, ", ") + ")"
	}

	sql := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES %s",
		tableName,
		strings.Join(fields, ", "),
		strings.Join(placeholders, ", "),
	)

	// execute insert
	result, err := r.DB.ExecContext(ctx, sql, args...)
	if err != nil {
		return 0, fmt.Errorf("batch insert failed: %w", err)
	}

	count, _ := result.RowsAffected()
	return count, nil
}

// deleteExistingRecordsByUserID delete duplicate rows within same task
// match on task_id + appsflyer_id or advertising_id + app_id + time field
// time field by table: Install/Event use event_time (install time on Install tables)
func (r *Runner) deleteExistingRecordsByUserID(ctx context.Context, tableName, taskID string, appsflyerIDs, advertisingIDs, appIDs []string) (int64, error) {
	if taskID == "" {
		return 0, nil
	}
	if len(appsflyerIDs) == 0 && len(advertisingIDs) == 0 {
		return 0, nil
	}

	// time field: Install/Event both use event_time
	var timeField string
	switch tableName {
	case "Dashboard_Install_Postbacks", "Dashboard_Retargeting_Install_Postbacks":
		timeField = "event_time"
	case "Dashboard_In_App_Event_Postbacks", "Dashboard_Retargeting_In_App_Event_Postbacks":
		timeField = "event_time"
	default:
		return 0, fmt.Errorf("unknown table type: %s", tableName)
	}

	// dedupe ID lists
	appsflyerIDsMap := make(map[string]bool)
	for _, id := range appsflyerIDs {
		if id != "" {
			appsflyerIDsMap[id] = true
		}
	}
	uniqueAppsflyerIDs := make([]string, 0, len(appsflyerIDsMap))
	for id := range appsflyerIDsMap {
		uniqueAppsflyerIDs = append(uniqueAppsflyerIDs, id)
	}

	advertisingIDsMap := make(map[string]bool)
	for _, id := range advertisingIDs {
		if id != "" {
			advertisingIDsMap[id] = true
		}
	}
	uniqueAdvertisingIDs := make([]string, 0, len(advertisingIDsMap))
	for id := range advertisingIDsMap {
		uniqueAdvertisingIDs = append(uniqueAdvertisingIDs, id)
	}

	// unique app_id list
	appIDsMap := make(map[string]bool)
	for _, id := range appIDs {
		if id != "" {
			appIDsMap[id] = true
		}
	}
	uniqueAppIDs := make([]string, 0, len(appIDsMap))
	for id := range appIDsMap {
		uniqueAppIDs = append(uniqueAppIDs, id)
	}

	// build DELETE statement
	var conditions []string
	var args []interface{}

	// condition 1: appsflyer_id + app_id + time field
	if len(uniqueAppsflyerIDs) > 0 && len(uniqueAppIDs) > 0 {
		placeholders := make([]string, len(uniqueAppsflyerIDs))
		for i, id := range uniqueAppsflyerIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		appPlaceholders := make([]string, len(uniqueAppIDs))
		for i, id := range uniqueAppIDs {
			appPlaceholders[i] = "?"
			args = append(args, id)
		}
		conditions = append(conditions, fmt.Sprintf(
			"(appsflyer_id IN (%s) AND app_id IN (%s) AND %s IS NOT NULL)",
			strings.Join(placeholders, ", "),
			strings.Join(appPlaceholders, ", "),
			timeField,
		))
	}

	// condition 2: advertising_id + app_id + time field
	if len(uniqueAdvertisingIDs) > 0 && len(uniqueAppIDs) > 0 {
		placeholders := make([]string, len(uniqueAdvertisingIDs))
		for i, id := range uniqueAdvertisingIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		appPlaceholders := make([]string, len(uniqueAppIDs))
		for i, id := range uniqueAppIDs {
			appPlaceholders[i] = "?"
			args = append(args, id)
		}
		conditions = append(conditions, fmt.Sprintf(
			"(advertising_id IN (%s) AND app_id IN (%s) AND %s IS NOT NULL)",
			strings.Join(placeholders, ", "),
			strings.Join(appPlaceholders, ", "),
			timeField,
		))
	}

	if len(conditions) == 0 {
		return 0, nil
	}

	// delete scoped to same task_id
	deleteSQL := fmt.Sprintf(
		"DELETE FROM %s WHERE task_id = ? AND (%s)",
		tableName,
		strings.Join(conditions, " OR "),
	)
	args = append([]interface{}{taskID}, args...)

	log.Printf("[AutoPipe] Deduplication SQL: DELETE FROM %s WHERE task_id=%s (%d appsflyer_ids, %d advertising_ids, %d app_ids)",
		tableName, taskID, len(uniqueAppsflyerIDs), len(uniqueAdvertisingIDs), len(uniqueAppIDs))

	result, err := r.DB.ExecContext(ctx, deleteSQL, args...)
	if err != nil {
		return 0, fmt.Errorf("delete existing records: %w", err)
	}

	deletedCount, _ := result.RowsAffected()
	return deletedCount, nil
}

// deleteExistingRecordsByUserIDAndTime deletes duplicates within task (with time field)
// exact match on task_id + appsflyer_id or advertising_id + app_id + time
func (r *Runner) deleteExistingRecordsByUserIDAndTime(ctx context.Context, tableName, taskID string, appsflyerIDs, advertisingIDs, appIDs []string, timeField string, timeValues []string) (int64, error) {
	if taskID == "" {
		return 0, nil
	}
	if len(appsflyerIDs) == 0 && len(advertisingIDs) == 0 {
		return 0, nil
	}
	if len(timeValues) == 0 {
		// fallback when no time values: time field IS NOT NULL
		return r.deleteExistingRecordsByUserID(ctx, tableName, taskID, appsflyerIDs, advertisingIDs, appIDs)
	}

	// dedupe ID lists
	appsflyerIDsMap := make(map[string]bool)
	for _, id := range appsflyerIDs {
		if id != "" {
			appsflyerIDsMap[id] = true
		}
	}
	uniqueAppsflyerIDs := make([]string, 0, len(appsflyerIDsMap))
	for id := range appsflyerIDsMap {
		uniqueAppsflyerIDs = append(uniqueAppsflyerIDs, id)
	}

	advertisingIDsMap := make(map[string]bool)
	for _, id := range advertisingIDs {
		if id != "" {
			advertisingIDsMap[id] = true
		}
	}
	uniqueAdvertisingIDs := make([]string, 0, len(advertisingIDsMap))
	for id := range advertisingIDsMap {
		uniqueAdvertisingIDs = append(uniqueAdvertisingIDs, id)
	}

	// unique app_id list
	appIDsMap := make(map[string]bool)
	for _, id := range appIDs {
		if id != "" {
			appIDsMap[id] = true
		}
	}
	uniqueAppIDs := make([]string, 0, len(appIDsMap))
	for id := range appIDsMap {
		uniqueAppIDs = append(uniqueAppIDs, id)
	}

	// dedupe time values
	timeValuesMap := make(map[string]bool)
	for _, tv := range timeValues {
		if tv != "" {
			timeValuesMap[tv] = true
		}
	}
	uniqueTimeValues := make([]string, 0, len(timeValuesMap))
	for tv := range timeValuesMap {
		uniqueTimeValues = append(uniqueTimeValues, tv)
	}

	// build DELETE statement
	var conditions []string
	var args []interface{}

	// time placeholders (shared by both conditions)
	timePlaceholders := make([]string, len(uniqueTimeValues))
	for i := range uniqueTimeValues {
		timePlaceholders[i] = "?"
	}
	// time args added once, shared by both conditions
	timeArgs := make([]interface{}, len(uniqueTimeValues))
	for i, tv := range uniqueTimeValues {
		timeArgs[i] = tv
	}

	// condition 1: appsflyer_id + app_id + time field
	if len(uniqueAppsflyerIDs) > 0 && len(uniqueAppIDs) > 0 && len(uniqueTimeValues) > 0 {
		placeholders := make([]string, len(uniqueAppsflyerIDs))
		for i, id := range uniqueAppsflyerIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		appPlaceholders := make([]string, len(uniqueAppIDs))
		for i, id := range uniqueAppIDs {
			appPlaceholders[i] = "?"
			args = append(args, id)
		}
		// append time value args
		args = append(args, timeArgs...)
		conditions = append(conditions, fmt.Sprintf(
			"(appsflyer_id IN (%s) AND app_id IN (%s) AND %s IN (%s))",
			strings.Join(placeholders, ", "),
			strings.Join(appPlaceholders, ", "),
			timeField,
			strings.Join(timePlaceholders, ", "),
		))
	}

	// condition 2: advertising_id + app_id + time field
	if len(uniqueAdvertisingIDs) > 0 && len(uniqueAppIDs) > 0 && len(uniqueTimeValues) > 0 {
		placeholders := make([]string, len(uniqueAdvertisingIDs))
		for i, id := range uniqueAdvertisingIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		appPlaceholders := make([]string, len(uniqueAppIDs))
		for i, id := range uniqueAppIDs {
			appPlaceholders[i] = "?"
			args = append(args, id)
		}
		// append time args (shared by both conditions)
		args = append(args, timeArgs...)
		conditions = append(conditions, fmt.Sprintf(
			"(advertising_id IN (%s) AND app_id IN (%s) AND %s IN (%s))",
			strings.Join(placeholders, ", "),
			strings.Join(appPlaceholders, ", "),
			timeField,
			strings.Join(timePlaceholders, ", "),
		))
	}

	if len(conditions) == 0 {
		return 0, nil
	}

	// delete scoped to same task_id
	deleteSQL := fmt.Sprintf(
		"DELETE FROM %s WHERE task_id = ? AND (%s)",
		tableName,
		strings.Join(conditions, " OR "),
	)
	args = append([]interface{}{taskID}, args...)

	log.Printf("[AutoPipe] Deduplication SQL: DELETE FROM %s WHERE task_id=%s (%d appsflyer_ids, %d advertising_ids, %d app_ids, %d time_values, time_field=%s)",
		tableName, taskID, len(uniqueAppsflyerIDs), len(uniqueAdvertisingIDs), len(uniqueAppIDs), len(uniqueTimeValues), timeField)

	result, err := r.DB.ExecContext(ctx, deleteSQL, args...)
	if err != nil {
		return 0, fmt.Errorf("delete existing records by user ID and time: %w", err)
	}

	deletedCount, _ := result.RowsAffected()
	return deletedCount, nil
}

// deleteExistingRecordsByTaskID delete prior data for same task run
// prevents duplicates on repeated Single-mode runs
// deletes all rows for task_id regardless of time (manual task delete)
func (r *Runner) deleteExistingRecordsByTaskID(ctx context.Context, tableName, taskID string, appIDs []string) (int64, error) {
	if taskID == "" || len(appIDs) == 0 {
		return 0, nil
	}

	// dedupe app_id list
	appIDsMap := make(map[string]bool)
	for _, id := range appIDs {
		if id != "" {
			appIDsMap[id] = true
		}
	}
	uniqueAppIDs := make([]string, 0, len(appIDsMap))
	for id := range appIDsMap {
		uniqueAppIDs = append(uniqueAppIDs, id)
	}

	if len(uniqueAppIDs) == 0 {
		return 0, nil
	}

	// DELETE all rows for task_id + app_id (any time)
	appPlaceholders := make([]string, len(uniqueAppIDs))
	args := []interface{}{taskID}
	for i, id := range uniqueAppIDs {
		appPlaceholders[i] = "?"
		args = append(args, id)
	}

	deleteSQL := fmt.Sprintf(
		"DELETE FROM %s WHERE task_id = ? AND app_id IN (%s)",
		tableName,
		strings.Join(appPlaceholders, ", "),
	)

	log.Printf("[AutoPipe] Deduplication: Cleaning all data for task (task_id=%s, app_count=%d)",
		taskID, len(uniqueAppIDs))

	result, err := r.DB.ExecContext(ctx, deleteSQL, args...)
	if err != nil {
		return 0, fmt.Errorf("delete by task_id: %w", err)
	}

	deletedCount, _ := result.RowsAffected()
	return deletedCount, nil
}

// deleteExistingRecordsByTaskIDAndDateRange delete task data in date range
// Daily mode: delete current range only; keep history
// time field by table: Install/Event use event_time (install time on Install tables)
func (r *Runner) deleteExistingRecordsByTaskIDAndDateRange(ctx context.Context, tableName, taskID string, appIDs []string, dateRange *DateRange) (int64, error) {
	if taskID == "" || len(appIDs) == 0 || dateRange == nil {
		return 0, nil
	}

	// dedupe app_id list
	appIDsMap := make(map[string]bool)
	for _, id := range appIDs {
		if id != "" {
			appIDsMap[id] = true
		}
	}
	uniqueAppIDs := make([]string, 0, len(appIDsMap))
	for id := range appIDsMap {
		uniqueAppIDs = append(uniqueAppIDs, id)
	}

	if len(uniqueAppIDs) == 0 {
		return 0, nil
	}

	// time field: Install/Event both use event_time
	var timeField string
	switch tableName {
	case "Dashboard_Install_Postbacks", "Dashboard_Retargeting_Install_Postbacks":
		timeField = "event_time"
	case "Dashboard_In_App_Event_Postbacks", "Dashboard_Retargeting_In_App_Event_Postbacks":
		timeField = "event_time"
	default:
		return 0, fmt.Errorf("unknown table type: %s", tableName)
	}

	// DELETE task_id + app_id rows in date range
	// compare by day via DATE()
	appPlaceholders := make([]string, len(uniqueAppIDs))
	args := []interface{}{taskID}
	for i, id := range uniqueAppIDs {
		appPlaceholders[i] = "?"
		args = append(args, id)
	}
	args = append(args, dateRange.FromDate.Format("2006-01-02"), dateRange.ToDate.Format("2006-01-02"))

	deleteSQL := fmt.Sprintf(
		"DELETE FROM %s WHERE task_id = ? AND app_id IN (%s) AND %s IS NOT NULL AND DATE(%s) >= ? AND DATE(%s) <= ?",
		tableName,
		strings.Join(appPlaceholders, ", "),
		timeField, timeField, timeField,
	)

	log.Printf("[AutoPipe] Deduplication: Cleaning date range data for Daily task (task_id=%s, app_count=%d, date_range=%s to %s, time_field=%s)",
		taskID, len(uniqueAppIDs), dateRange.FromDate.Format("2006-01-02"), dateRange.ToDate.Format("2006-01-02"), timeField)

	result, err := r.DB.ExecContext(ctx, deleteSQL, args...)
	if err != nil {
		return 0, fmt.Errorf("delete by task_id and date range: %w", err)
	}

	deletedCount, _ := result.RowsAffected()
	return deletedCount, nil
}

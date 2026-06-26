package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	"github.com/joho/godotenv"
)

// GochatMaxConversationsPerUser max conversations retained per user
const GochatMaxConversationsPerUser = 20

// GochatAppTimezone app timezone (matches AutoPipe and frontend GOCHAT_APP_TIMEZONE)
const GochatAppTimezone = "Asia/Shanghai"

var gochatAppLocation *time.Location

func init() {
	loc, err := time.LoadLocation(GochatAppTimezone)
	if err != nil {
		log.Printf("Warning: failed to load %s timezone: %v", GochatAppTimezone, err)
		return
	}
	gochatAppLocation = loc
}

// formatGochatAPITime format session time as Asia/Shanghai RFC3339 (+08:00 offset)
func formatGochatAPITime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	if gochatAppLocation != nil {
		return t.In(gochatAppLocation).Format("2006-01-02T15:04:05-07:00")
	}
	return t.UTC().Format(time.RFC3339)
}

// ChatService AI chat service
type ChatService struct {
	APIKey    string
	BaseURL   string
	DB        *sql.DB      // MySQL DB (user config)
	PGDB      *sql.DB      // PostgreSQL DB (Gochat conversation storage)
	JWTSecret string
}

// ChatMessage chat message
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest chat request
type ChatRequest struct {
	Model          string        `json:"model"`
	Messages       []ChatMessage `json:"messages"`
	Stream         bool          `json:"stream,omitempty"`
	Temperature    float64       `json:"temperature,omitempty"`
	MaxTokens      int           `json:"max_tokens,omitempty"`
	Provider       string        `json:"provider,omitempty"`        // optional: "openai" | "deepseek" | ...
	ConversationID *string       `json:"conversation_id,omitempty"` // optional conversation ID; messages persisted when set
}

// ChatResponse chat response
type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int         `json:"index"`
		Message      ChatMessage `json:"message"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// StreamChunk streaming response chunk
type StreamChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int         `json:"index"`
		Delta        ChatMessage `json:"delta"`
		FinishReason *string     `json:"finish_reason"`
	} `json:"choices"`
}

// NewChatService create chat service instance
func NewChatService() *ChatService {
	// load .env (aligned with Flask) and override existing env vars
	// keeps JWT_SECRET_KEY in sync with Flask
	if err := godotenv.Overload(); err != nil {
		log.Printf("Note: .env file not found or error loading: %v (falling back to existing environment variables)", err)
	} else {
		log.Printf(".env file loaded and overrides existing environment variables (ensuring consistency with Flask)")
	}

	cfg := loadGochatServerConfig()
	apiKey := resolveGochatAPIKey()
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	log.Printf("GoChat engine=%s upstream=%s model=%s api_key=%s",
		GochatEngineVersion, baseURL, cfg.Model, safeAPIKeyPrefix(apiKey))

	db := mustInitDB()
	pgdb := mustInitPGDB()

	// read JWT_SECRET_KEY from env (.env preferred, aligned with Flask)
	jwtSecret := os.Getenv("JWT_SECRET_KEY")
	if jwtSecret == "" {
		jwtSecret = "change-me-in-production"
		log.Println("Warning: JWT_SECRET_KEY is not set; using dev placeholder. Set it in backend.env to match Flask.")
	} else {
		log.Printf("JWT_SECRET_KEY loaded (length: %d)", len(jwtSecret))
	}

	return &ChatService{
		APIKey:    apiKey,
		BaseURL:   baseURL,
		DB:        db,
		PGDB:      pgdb,
		JWTSecret: jwtSecret,
	}
}

func mustInitDB() *sql.DB {
	host := getEnv("DB_HOST", "127.0.0.1")
	port := getEnv("DB_PORT", "3306")
	user := getEnv("DB_USER", "root")
	password := getEnv("DB_PASSWORD", "")
	name := getEnv("DB_NAME", "appsflyer_rawdata")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&loc=UTC", user, password, host, port, name)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("failed to open database connection: %v", err)
	}

	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxIdleConns(10)
	db.SetMaxOpenConns(25)

	if err := db.Ping(); err != nil {
		log.Fatalf("failed to ping database: %v", err)
	}

	log.Printf("Connected to MySQL at %s:%s/%s", host, port, name)
	return db
}

func mustInitPGDB() *sql.DB {
	host := getEnv("PG_HOST", "127.0.0.1")
	port := getEnv("PG_PORT", "5432")
	user := getEnv("PG_USER", "postgres")
	password := getEnv("PG_PASSWORD", "postgres")
	dbname := getEnv("PG_DB", "gochat_db")

	// connect to default postgres DB to create target database
	defaultDSN := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=postgres sslmode=disable",
		host, port, user, password)
	defaultDB, err := sql.Open("postgres", defaultDSN)
	if err != nil {
		log.Printf("Warning: Failed to connect to PostgreSQL default database: %v", err)
		log.Printf("PostgreSQL features will be disabled. Gochat conversation storage will not be available.")
		return nil
	}
	defer defaultDB.Close()

	// check and create database if missing
	if err := createPGDatabaseIfNotExists(defaultDB, dbname); err != nil {
		log.Printf("Warning: Failed to create PostgreSQL database %s: %v", dbname, err)
		log.Printf("PostgreSQL features will be disabled. Gochat conversation storage will not be available.")
		return nil
	}

	// TIMESTAMP columns read/written as UTC; API output converted to Asia/Shanghai
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable timezone=UTC",
		host, port, user, password, dbname)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("Warning: Failed to open PostgreSQL connection: %v", err)
		log.Printf("PostgreSQL features will be disabled. Gochat conversation storage will not be available.")
		return nil
	}

	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxIdleConns(10)
	db.SetMaxOpenConns(25)

	if err := db.Ping(); err != nil {
		log.Printf("Warning: Failed to ping PostgreSQL database: %v", err)
		log.Printf("PostgreSQL features will be disabled. Gochat conversation storage will not be available.")
		return nil
	}

	log.Printf("Connected to PostgreSQL at %s:%s/%s", host, port, dbname)

	// initialize tables
	if err := initPGTables(db); err != nil {
		log.Printf("Warning: Failed to initialize PostgreSQL tables: %v", err)
		log.Printf("Gochat conversation storage may not work correctly.")
	}

	return db
}

func createPGDatabaseIfNotExists(db *sql.DB, dbname string) error {
	var exists bool
	err := db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)",
		dbname,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check database existence: %w", err)
	}

	if !exists {
		log.Printf("Creating PostgreSQL database: %s", dbname)
		// CREATE DATABASE cannot run inside a transaction
		// fmt.Sprintf SQL risk is low here; dbname comes from env
		// validation added for safety
		if !isValidDBName(dbname) {
			return fmt.Errorf("invalid database name: %s", dbname)
		}
		_, err = db.Exec(fmt.Sprintf("CREATE DATABASE %s", dbname))
		if err != nil {
			return fmt.Errorf("failed to create database: %w", err)
		}
		log.Printf("PostgreSQL database %s created successfully", dbname)
	} else {
		log.Printf("PostgreSQL database %s already exists", dbname)
	}
	return nil
}

func isValidDBName(name string) bool {
	// simple DB name validation: letters, digits, underscore only
	for _, r := range name {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			return false
		}
	}
	return len(name) > 0 && len(name) <= 63 // PostgreSQL limit
}

func initPGTables(db *sql.DB) error {
	// create conversations table
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS conversations (
			id VARCHAR(36) PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL,
			title VARCHAR(255) DEFAULT NULL,
			provider VARCHAR(50) DEFAULT 'openai',
			model VARCHAR(100) DEFAULT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP NULL DEFAULT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create conversations table: %w", err)
	}

	// create indexes
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at)`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at) WHERE deleted_at IS NULL`)

	// create chat_messages table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS chat_messages (
			id VARCHAR(36) PRIMARY KEY,
			conversation_id VARCHAR(36) NOT NULL,
			role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
			content TEXT NOT NULL,
			status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'error')),
			error_message TEXT NULL,
			token_count INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create chat_messages table: %w", err)
	}

	// create indexes
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON chat_messages(conversation_id)`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON chat_messages(created_at)`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_role ON chat_messages(role)`)

	// create updated_at trigger function
	db.Exec(`
		CREATE OR REPLACE FUNCTION update_updated_at_column()
		RETURNS TRIGGER AS $$
		BEGIN
			NEW.updated_at = CURRENT_TIMESTAMP;
			RETURN NEW;
		END;
		$$ language 'plpgsql'
	`)

	// create trigger
	db.Exec(`
		DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
		CREATE TRIGGER update_conversations_updated_at
			BEFORE UPDATE ON conversations
			FOR EACH ROW
			EXECUTE FUNCTION update_updated_at_column()
	`)

	log.Printf("PostgreSQL tables initialized successfully")
	return nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload != nil {
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			log.Printf("failed to encode JSON response: %v", err)
		}
	}
}

func (s *ChatService) countUserConversations(userID string) (int, error) {
	if s.PGDB == nil {
		return 0, errors.New("postgresql not connected")
	}
	var count int
	err := s.PGDB.QueryRow(
		"SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND deleted_at IS NULL",
		userID,
	).Scan(&count)
	return count, err
}

func (s *ChatService) canCreateConversation(userID string) (bool, error) {
	count, err := s.countUserConversations(userID)
	if err != nil {
		return false, err
	}
	return count < GochatMaxConversationsPerUser, nil
}

func errorJSON(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"message": message,
		"error": map[string]string{
			"message": message,
			"type":    "upstream_error",
		},
	})
}

// prependReadCloser prepend peeked bytes to body to avoid buffering full SSE stream on peek errors.
type prependReadCloser struct {
	prefix []byte
	body   io.ReadCloser
}

func (p *prependReadCloser) Read(b []byte) (int, error) {
	if len(p.prefix) > 0 {
		n := copy(b, p.prefix)
		p.prefix = p.prefix[n:]
		if n < len(b) {
			m, err := p.body.Read(b[n:])
			return n + m, err
		}
		return n, nil
	}
	return p.body.Read(b)
}

func (p *prependReadCloser) Close() error {
	return p.body.Close()
}

func peekSSEStreamForError(body io.ReadCloser) (prefix []byte, rest io.ReadCloser, errMsg string) {
	const maxPeek = 4096
	peeked, err := io.ReadAll(io.LimitReader(body, maxPeek))
	if err != nil {
		return nil, body, ""
	}
	for _, line := range strings.Split(string(peeked), "\n") {
		if msg, ok := sseLineUpstreamError([]byte(line)); ok {
			_, _ = io.Copy(io.Discard, body)
			return nil, io.NopCloser(bytes.NewReader(peeked)), msg
		}
	}
	return nil, &prependReadCloser{prefix: peeked, body: body}, ""
}

func sseLineUpstreamError(line []byte) (string, bool) {
	trimmed := strings.TrimSpace(string(line))
	if !strings.HasPrefix(trimmed, "data:") {
		return "", false
	}
	data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
	if data == "" || data == "[DONE]" {
		return "", false
	}
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return "", false
	}
	msg := strings.TrimSpace(payload.Error.Message)
	if msg == "" {
		return "", false
	}
	return msg, true
}

func extractUpstreamErrorMessage(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var wrapped struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &wrapped); err == nil {
		if m := strings.TrimSpace(wrapped.Error.Message); m != "" {
			return m
		}
		if m := strings.TrimSpace(wrapped.Message); m != "" {
			// only when top-level message looks like an API error, not SSE
			if !strings.HasPrefix(m, "data:") && len(m) < 4096 {
				return m
			}
		}
	}
	return ""
}

// corsMiddleware CORS middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Id, X-Requested-With, X-AI-Base-URL")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// handleChat handles chat requests
func (s *ChatService) handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Printf("=== GoChat Request Received ===")
	log.Printf("Method: %s, URL: %s", r.Method, r.URL.Path)
	log.Printf("Headers: X-User-ID=%s, Content-Type=%s, Accept=%s",
		r.Header.Get("X-User-ID"), r.Header.Get("Content-Type"), r.Header.Get("Accept"))

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		errorJSON(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	log.Printf("Request body length: %d bytes", len(body))

	var chatReq ChatRequest
	if err := json.Unmarshal(body, &chatReq); err != nil {
		log.Printf("Error unmarshaling request: %v", err)
		errorJSON(w, http.StatusBadRequest, "Invalid request format")
		return
	}

	applyGochatServerDefaults(&chatReq)

	userID := extractGochatUserID(r, s.JWTSecret)
	useStored := userID != "" && s.PGDB != nil
	log.Printf("GoChat user_id=%q persist=%v model=%s stream=%v", userID, useStored, chatReq.Model, chatReq.Stream)

	w.Header().Set("X-GoChat-Engine", GochatEngineVersion)

	baseURL, mimoAPIKey := s.resolveGochatUpstream()
	if mimoAPIKey == "" || isLikelyJWTToken(mimoAPIKey) {
		log.Printf("MiMo API key missing or invalid (prefix=%s)", safeAPIKeyPrefix(mimoAPIKey))
		errorJSON(w, http.StatusInternalServerError, "GoChat MiMo API key is missing on server. Rebuild and restart ai_chat_service.")
		return
	}
	log.Printf("MiMo upstream: %s/chat/completions key=%s engine=%s", baseURL, safeAPIKeyPrefix(mimoAPIKey), GochatEngineVersion)
	
	// conversation and message persistence
	var convID string
	var userMsgID, assistantMsgID string
	assistantMsgID = generateUUID() // pre-generate assistant message ID
	
	if useStored && s.PGDB != nil && chatReq.ConversationID != nil && *chatReq.ConversationID != "" {
		convID = *chatReq.ConversationID
		// verify conversation belongs to current user
		var exists bool
		err = s.PGDB.QueryRow(
			"SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
			convID, userID,
		).Scan(&exists)
		if err != nil || !exists {
			log.Printf("Conversation %s not found or access denied, creating new conversation", convID)
			convID = ""
		}
	}
	
	// create new conversation when no conversation ID
	if convID == "" && useStored && s.PGDB != nil {
		canCreate, limitErr := s.canCreateConversation(userID)
		if limitErr != nil {
			log.Printf("Error checking conversation limit: %v", limitErr)
			errorJSON(w, http.StatusInternalServerError, "Failed to check conversation limit")
			return
		}
		if !canCreate {
			errorJSON(
				w,
				http.StatusForbidden,
				fmt.Sprintf("Conversation limit reached (maximum %d per user)", GochatMaxConversationsPerUser),
			)
			return
		}

		convID = generateUUID()
		provider := GochatProviderDefault
		model := chatReq.Model
		_, err = s.PGDB.Exec(
			"INSERT INTO conversations (id, user_id, title, provider, model) VALUES ($1, $2, $3, $4, $5)",
			convID, userID, nil, provider, model,
		)
		if err != nil {
			log.Printf("Error creating conversation: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to create conversation")
			return
		}
		log.Printf("Created new conversation: %s", convID)
	}
	
	// save user message async to avoid blocking first upstream byte
	if convID != "" && useStored && s.PGDB != nil && len(chatReq.Messages) > 0 {
		for i := len(chatReq.Messages) - 1; i >= 0; i-- {
			if chatReq.Messages[i].Role == "user" {
				userContent := chatReq.Messages[i].Content
				userMsgID = generateUUID()
				go func(msgID, cID, content string) {
					_, err := s.PGDB.Exec(
						"INSERT INTO chat_messages (id, conversation_id, role, content, status) VALUES ($1, $2, $3, $4, $5)",
						msgID, cID, "user", content, "completed",
					)
					if err != nil {
						log.Printf("Error saving user message: %v", err)
					}
				}(userMsgID, convID, userContent)
				break
			}
		}
	}
	
	upstreamBody := sanitizeUpstreamChatBody(body)
	url := baseURL + "/chat/completions"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(upstreamBody))
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "Failed to create upstream request")
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+mimoAPIKey)
	req.Header.Set("api-key", mimoAPIKey)

	// send request
	client := &http.Client{
		Timeout: 300 * time.Second, // 5-minute timeout
	}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":{"message":"Failed to connect to OpenAI API: `+err.Error()+`","type":"server_error"}}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		msg := extractUpstreamErrorMessage(body)
		if msg == "" {
			msg = fmt.Sprintf("MiMo API error (HTTP %d)", resp.StatusCode)
		}
		log.Printf("Upstream MiMo error %d: %s", resp.StatusCode, msg)
		errorJSON(w, resp.StatusCode, msg)
		return
	}

	// detect streaming response
	isStreaming := chatReq.Stream || strings.Contains(r.Header.Get("Accept"), "text/event-stream")

	if isStreaming {
		prefix, streamBody, sseErr := peekSSEStreamForError(resp.Body)
		resp.Body = streamBody
		if sseErr != "" {
			log.Printf("MiMo SSE error (peek): %s", sseErr)
			errorJSON(w, http.StatusBadGateway, sseErr)
			return
		}

		// streaming response (SSE)
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // disable Nginx buffering
		
		// return conversation_id in response header for new conversation
		if convID != "" {
			w.Header().Set("X-Conversation-ID", convID)
		}

		// copy response headers except Content-Type, Content-Length, Access-Control-*
		for key, values := range resp.Header {
			lowerKey := strings.ToLower(key)
			if lowerKey == "content-type" || lowerKey == "content-length" || strings.HasPrefix(lowerKey, "access-control-") {
				continue
			}
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}

		w.WriteHeader(resp.StatusCode)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}

		if len(prefix) > 0 {
			w.Write(prefix)
			flusher.Flush()
		}

		scanner := bufio.NewScanner(resp.Body)
		buffer := make([]byte, 0, 256)
		var fullResponse strings.Builder
		fullResponse.Write(prefix)

		for scanner.Scan() {
			line := scanner.Bytes()
			fullResponse.Write(line)
			fullResponse.WriteByte('\n')
			buffer = append(buffer, line...)
			buffer = append(buffer, '\n')

			if len(buffer) > 0 {
				w.Write(buffer)
				flusher.Flush()
				buffer = buffer[:0]
			}
		}

		// flush remaining data if any
		if len(buffer) > 0 {
			w.Write(buffer)
			flusher.Flush()
		}

		if err := scanner.Err(); err != nil && err != io.EOF {
			log.Printf("Error reading stream: %v", err)
		}

		// persist assistant message after stream completes
		if convID != "" && useStored && s.PGDB != nil {
			go s.saveStreamingResponse(convID, fullResponse.String(), assistantMsgID)
		}
	} else {
		// non-streaming response
		// return conversation_id in response header for new conversation
		if convID != "" {
			w.Header().Set("X-Conversation-ID", convID)
		}
		
		// copy response headers
		for key, values := range resp.Header {
			lowerKey := strings.ToLower(key)
			if strings.HasPrefix(lowerKey, "access-control-") {
				continue
			}
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}

		w.WriteHeader(resp.StatusCode)

		// read full response body for persistence
		responseBody, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("Error reading response body: %v", err)
		} else {
			// write response body to client
			w.Write(responseBody)
			
			// persist assistant message after non-streaming response
			if convID != "" && useStored && s.PGDB != nil {
				go s.saveNonStreamingResponse(convID, string(responseBody), assistantMsgID)
			}
		}
	}
}

// saveStreamingResponse persist streaming response message
func (s *ChatService) saveStreamingResponse(convID, streamContent, msgID string) {
	if s.PGDB == nil {
		return
	}
	
	// parse stream and extract full message content
	content := s.parseStreamingContent(streamContent)
	if content == "" {
		return
	}
	
	if msgID == "" {
		msgID = generateUUID()
	}
	
	_, err := s.PGDB.Exec(
		"INSERT INTO chat_messages (id, conversation_id, role, content, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET content = $4, status = $5",
		msgID, convID, "assistant", content, "completed",
	)
	if err != nil {
		log.Printf("Error saving streaming response: %v", err)
	} else {
		log.Printf("Saved streaming response message: %s", msgID)
	}
}

// saveNonStreamingResponse persists non-streaming response messages
func (s *ChatService) saveNonStreamingResponse(convID, responseBody, msgID string) {
	if s.PGDB == nil {
		return
	}
	
	// parse JSON response and extract message content
	var chatResp ChatResponse
	if err := json.Unmarshal([]byte(responseBody), &chatResp); err != nil {
		log.Printf("Error parsing non-streaming response: %v", err)
		return
	}
	
	if len(chatResp.Choices) == 0 {
		return
	}
	
	content := chatResp.Choices[0].Message.Content
	if content == "" {
		return
	}
	
	if msgID == "" {
		msgID = generateUUID()
	}
	
	tokenCount := chatResp.Usage.TotalTokens
	_, err := s.PGDB.Exec(
		"INSERT INTO chat_messages (id, conversation_id, role, content, status, token_count) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET content = $4, status = $5, token_count = $6",
		msgID, convID, "assistant", content, "completed", tokenCount,
	)
	if err != nil {
		log.Printf("Error saving non-streaming response: %v", err)
	} else {
		log.Printf("Saved non-streaming response message: %s", msgID)
	}
}

// parseStreamingContent parse streaming content and extract full message
func (s *ChatService) parseStreamingContent(streamContent string) string {
	var fullContent strings.Builder
	lines := strings.Split(streamContent, "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		
		var chunk StreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		
		if len(chunk.Choices) == 0 {
			continue
		}
		var payload struct {
			Choices []struct {
				Delta struct {
					Content          *string `json:"content"`
					ReasoningContent *string `json:"reasoning_content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &payload); err == nil {
			if c := payload.Choices[0].Delta.Content; c != nil && *c != "" {
				fullContent.WriteString(*c)
			}
			continue
		}
		if chunk.Choices[0].Delta.Content != "" {
			fullContent.WriteString(chunk.Choices[0].Delta.Content)
		}
	}
	
	return fullContent.String()
}

// handleHealth health check
func (s *ChatService) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-GoChat-Engine", GochatEngineVersion)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "ok",
		"service":        "ai-chat-service",
		"gochat_engine":  GochatEngineVersion,
		"mimo_key_prefix": safeAPIKeyPrefix(resolveGochatAPIKey()),
		"time":           time.Now().Unix(),
	})
}

// ==================== conversation and message management API ====================

// Conversation conversation struct (internal scan)
type Conversation struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	Title           *string   `json:"title"`
	Provider        string    `json:"provider"`
	Model           *string   `json:"model"`
	LastUserMessage *string   `json:"last_user_message"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// conversationAPI conversation API response (times as Asia/Shanghai strings)
type conversationAPI struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	Title           *string `json:"title"`
	Provider        string  `json:"provider"`
	Model           *string `json:"model"`
	LastUserMessage *string `json:"last_user_message,omitempty"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func (c Conversation) toAPI() conversationAPI {
	return conversationAPI{
		ID:              c.ID,
		UserID:          c.UserID,
		Title:           c.Title,
		Provider:        c.Provider,
		Model:           c.Model,
		LastUserMessage: c.LastUserMessage,
		CreatedAt:       formatGochatAPITime(c.CreatedAt),
		UpdatedAt:       formatGochatAPITime(c.UpdatedAt),
	}
}

// Message message struct
type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	Status         string    `json:"status"`
	ErrorMessage   *string   `json:"error_message"`
	TokenCount     int       `json:"token_count"`
	CreatedAt      time.Time `json:"created_at"`
}

// CreateConversationRequest is the create-conversation payload
type CreateConversationRequest struct {
	Title    *string `json:"title"`
	Provider string  `json:"provider"`
	Model    *string `json:"model"`
}

// UpdateConversationRequest is the update-conversation payload
type UpdateConversationRequest struct {
	Title *string `json:"title"`
}

// handleConversations handle conversation list
func (s *ChatService) handleConversations(w http.ResponseWriter, r *http.Request) {
	userID := extractGochatUserID(r, s.JWTSecret)
	if userID == "" {
		errorJSON(w, http.StatusBadRequest, "Missing X-User-Id header")
		return
	}

	switch r.Method {
	case http.MethodGet:
		// list all conversations for user
		rows, err := s.PGDB.Query(`
			SELECT c.id, c.user_id, c.title, c.provider, c.model, c.created_at, c.updated_at,
				(
					SELECT m.content FROM chat_messages m
					WHERE m.conversation_id = c.id AND m.role = 'user'
					ORDER BY m.created_at DESC
					LIMIT 1
				) AS last_user_message
			FROM conversations c
			WHERE c.user_id = $1 AND c.deleted_at IS NULL
			ORDER BY c.updated_at DESC`,
			userID,
		)
		if err != nil {
			log.Printf("Error querying conversations: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to fetch conversations")
			return
		}
		defer rows.Close()

		conversations := []conversationAPI{}
		for rows.Next() {
			var conv Conversation
			var title, model, lastUserMessage sql.NullString
			err := rows.Scan(
				&conv.ID, &conv.UserID, &title, &conv.Provider, &model,
				&conv.CreatedAt, &conv.UpdatedAt, &lastUserMessage,
			)
			if err != nil {
				log.Printf("Error scanning conversation: %v", err)
				continue
			}
			if title.Valid {
				conv.Title = &title.String
			}
			if model.Valid {
				conv.Model = &model.String
			}
			if lastUserMessage.Valid {
				conv.LastUserMessage = &lastUserMessage.String
			}
			conversations = append(conversations, conv.toAPI())
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"conversations":     conversations,
			"max_conversations": GochatMaxConversationsPerUser,
			"timezone":          GochatAppTimezone,
		})

	case http.MethodPost:
		// create new conversation
		var req CreateConversationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorJSON(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		canCreate, err := s.canCreateConversation(userID)
		if err != nil {
			log.Printf("Error checking conversation limit: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to check conversation limit")
			return
		}
		if !canCreate {
			errorJSON(
				w,
				http.StatusForbidden,
				fmt.Sprintf("Conversation limit reached (maximum %d per user)", GochatMaxConversationsPerUser),
			)
			return
		}

		convID := generateUUID()
		provider := req.Provider
		if provider == "" {
			provider = "openai"
		}

		_, insertErr := s.PGDB.Exec(
			"INSERT INTO conversations (id, user_id, title, provider, model) VALUES ($1, $2, $3, $4, $5)",
			convID, userID, req.Title, provider, req.Model,
		)
		if insertErr != nil {
			log.Printf("Error creating conversation: %v", insertErr)
			errorJSON(w, http.StatusInternalServerError, "Failed to create conversation")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id": convID,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleConversationRoutes route dispatcher
func (s *ChatService) handleConversationRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/conversations")
	path = strings.Trim(path, "/")
	pathParts := strings.Split(path, "/")

	if len(pathParts) == 0 || pathParts[0] == "" {
		// /api/conversations — list or create
		s.handleConversations(w, r)
		return
	}

	convID := pathParts[0]

	if len(pathParts) == 1 {
		// /api/conversations/{id} — single conversation
		s.handleConversation(w, r, convID)
		return
	}

	if len(pathParts) == 2 && pathParts[1] == "messages" {
		// /api/conversations/{id}/messages — message list
		s.handleMessages(w, r, convID)
		return
	}

	http.Error(w, "Not found", http.StatusNotFound)
}

// handleConversation handle single conversation request
func (s *ChatService) handleConversation(w http.ResponseWriter, r *http.Request, convID string) {
	userID := extractGochatUserID(r, s.JWTSecret)
	if userID == "" {
		errorJSON(w, http.StatusBadRequest, "Missing X-User-Id header")
		return
	}

	switch r.Method {
	case http.MethodGet:
		// get conversation details
		var conv Conversation
		var title, model sql.NullString
		err := s.PGDB.QueryRow(
			"SELECT id, user_id, title, provider, model, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
			convID, userID,
		).Scan(&conv.ID, &conv.UserID, &title, &conv.Provider, &model, &conv.CreatedAt, &conv.UpdatedAt)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				errorJSON(w, http.StatusNotFound, "Conversation not found")
			} else {
				log.Printf("Error fetching conversation: %v", err)
				errorJSON(w, http.StatusInternalServerError, "Failed to fetch conversation")
			}
			return
		}
		if title.Valid {
			conv.Title = &title.String
		}
		if model.Valid {
			conv.Model = &model.String
		}

		writeJSON(w, http.StatusOK, conv.toAPI())

	case http.MethodPut:
		// update conversation
		var req UpdateConversationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorJSON(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		_, err := s.PGDB.Exec(
			"UPDATE conversations SET title = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
			req.Title, convID, userID,
		)
		if err != nil {
			log.Printf("Error updating conversation: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to update conversation")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"message": "Conversation updated"})

	case http.MethodDelete:
		// soft-delete conversation
		_, err := s.PGDB.Exec(
			"UPDATE conversations SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2",
			convID, userID,
		)
		if err != nil {
			log.Printf("Error deleting conversation: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to delete conversation")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"message": "Conversation deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleMessages handle message list
func (s *ChatService) handleMessages(w http.ResponseWriter, r *http.Request, convID string) {
	userID := extractGochatUserID(r, s.JWTSecret)
	if userID == "" {
		errorJSON(w, http.StatusBadRequest, "Missing X-User-Id header")
		return
	}

	// verify conversation belongs to current user
	var exists bool
	err := s.PGDB.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
		convID, userID,
	).Scan(&exists)
	if err != nil || !exists {
		errorJSON(w, http.StatusNotFound, "Conversation not found")
		return
	}

	if r.Method == http.MethodGet {
		// list all messages in conversation
		rows, err := s.PGDB.Query(
			"SELECT id, conversation_id, role, content, status, error_message, token_count, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
			convID,
		)
		if err != nil {
			log.Printf("Error querying messages: %v", err)
			errorJSON(w, http.StatusInternalServerError, "Failed to fetch messages")
			return
		}
		defer rows.Close()

		messages := []Message{}
		for rows.Next() {
			var msg Message
			var errorMsg sql.NullString
			err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.Role, &msg.Content, &msg.Status, &errorMsg, &msg.TokenCount, &msg.CreatedAt)
			if err != nil {
				log.Printf("Error scanning message: %v", err)
				continue
			}
			if errorMsg.Valid {
				msg.ErrorMessage = &errorMsg.String
			}
			messages = append(messages, msg)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"messages": messages,
		})
	} else {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// generateUUID generate UUID v4
func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Start start service
func (s *ChatService) Start(port string) error {
	http.HandleFunc("/health", corsMiddleware(s.handleHealth))
	http.HandleFunc("/api/health", corsMiddleware(s.handleHealth))
	http.HandleFunc("/api/chat/completions", corsMiddleware(s.handleChat))
	http.HandleFunc("/v1/chat/completions", corsMiddleware(s.handleChat)) // OpenAI-compatible path
	
	// conversation/message APIs (unified route dispatcher)
	http.HandleFunc("/api/conversations", corsMiddleware(s.handleConversationRoutes))
	http.HandleFunc("/api/conversations/", corsMiddleware(s.handleConversationRoutes))

	log.Printf("AI Chat Service starting on %s", port)
	log.Printf("API endpoints:")
	log.Printf("  - POST /api/chat/completions")
	log.Printf("  - POST /v1/chat/completions")
	log.Printf("  - GET  /health, /api/health")
	log.Printf("  - GET  /api/conversations (list conversations)")
	log.Printf("  - POST /api/conversations (create conversation)")
	log.Printf("  - GET  /api/conversations/{id} (get conversation)")
	log.Printf("  - PUT  /api/conversations/{id} (update conversation)")
	log.Printf("  - DELETE /api/conversations/{id} (delete conversation)")
	log.Printf("  - GET  /api/conversations/{id}/messages (get messages)")
	log.Printf("Note: GoChat settings are managed via Flask backend at /api/auth/gochat/settings")

	return http.ListenAndServe(port, nil)
}

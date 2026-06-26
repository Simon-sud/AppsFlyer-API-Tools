package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// GoChat uses Xiaomi MiMo Token Plan (OpenAI-compatible); server-side config, not frontend Settings.
// Docs: https://token-plan-cn.xiaomimimo.com/v1 (chat/completions)
// Anthropic-compatible: https://token-plan-cn.xiaomimimo.com/anthropic
const (
	GochatProviderDefault  = "openai"
	GochatBaseURLDefault   = "https://token-plan-cn.xiaomimimo.com/v1"
	GochatAnthropicBaseURL = "https://token-plan-cn.xiaomimimo.com/anthropic"
	GochatModelDefault     = "mimo-v2.5-pro"
	GochatModelFallback    = "mimo-v2.5"
	// GochatEngineVersion response header; confirms MiMo v2 deploy (not legacy Settings/DB key logic)
	GochatEngineVersion = "mimo-server-v2"
	// MiMo API key: set MIIMO_API_KEY (or GOCHAT_API_KEY) in environment — never commit real keys
	GochatAPIKeyDefault = ""
)

// GochatServerConfig server-bound upstream config
type GochatServerConfig struct {
	Provider string
	BaseURL  string
	APIKey   string
	Model    string
}

func getEnvFirst(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

func isLikelyJWTToken(s string) bool {
	t := strings.TrimSpace(s)
	return strings.HasPrefix(t, "eyJ") && strings.Count(t, ".") >= 2
}

func isValidMimoAPIKey(s string) bool {
	k := strings.TrimSpace(s)
	if k == "" || isLikelyJWTToken(k) {
		return false
	}
	// MiMo Token Plan keys start with tp-; do not send login JWT or sk- OpenAI keys upstream
	return strings.HasPrefix(k, "tp-") || strings.HasPrefix(k, "sk-")
}

// resolveGochatAPIKey default in-code tp- key; only MIIMO_* / GOCHAT_API_KEY override (ignores OPENAI_API_KEY to avoid .env pollution)
func resolveGochatAPIKey() string {
	for _, key := range []string{"MIIMO_API_KEY", "XIAOMIMIMO_API_KEY", "MIMO_API_KEY", "GOCHAT_API_KEY"} {
		if v := strings.TrimSpace(os.Getenv(key)); isValidMimoAPIKey(v) {
			return v
		}
	}
	if isValidMimoAPIKey(GochatAPIKeyDefault) {
		return GochatAPIKeyDefault
	}
	log.Println("GoChat: MIIMO_API_KEY / GOCHAT_API_KEY not set; upstream chat will fail until configured")
	return ""
}

// loadGochatServerConfig load MiMo / GoChat upstream
func loadGochatServerConfig() GochatServerConfig {
	apiKey := resolveGochatAPIKey()
	baseURL := strings.TrimSuffix(
		getEnvFirst("MIIMO_BASE_URL", "XIAOMIMIMO_BASE_URL", "GOCHAT_BASE_URL"),
		"/",
	)
	if baseURL == "" {
		baseURL = GochatBaseURLDefault
	}
	model := getEnvFirst("MIIMO_MODEL", "GOCHAT_MODEL", "OPENAI_MODEL")
	if model == "" {
		model = GochatModelDefault
	}
	return GochatServerConfig{
		Provider: GochatProviderDefault,
		BaseURL:  baseURL,
		APIKey:   apiKey,
		Model:    model,
	}
}

func normalizeGochatModel(model string) string {
	m := strings.TrimSpace(model)
	if m == "" {
		return GochatModelDefault
	}
	legacyDefaults := map[string]struct{}{
		"gpt-3.5-turbo": {}, "gpt-4": {}, "gpt-4o": {}, "gpt-4o-mini": {},
		"deepseek-chat": {}, "deepseek-reasoner": {},
	}
	if _, ok := legacyDefaults[m]; ok {
		return GochatModelDefault
	}
	return m
}

func applyGochatServerDefaults(chatReq *ChatRequest) {
	cfg := loadGochatServerConfig()
	chatReq.Provider = GochatProviderDefault
	m := strings.TrimSpace(chatReq.Model)
	if m == "" {
		chatReq.Model = cfg.Model
		if chatReq.Model == "" {
			chatReq.Model = GochatModelDefault
		}
		return
	}
	chatReq.Model = normalizeGochatModel(m)
}

func safeAPIKeyPrefix(key string) string {
	k := strings.TrimSpace(key)
	if len(k) <= 8 {
		return "***"
	}
	return k[:8] + "..."
}

// resolveGochatUpstream resolve GoChat upstream URL and MiMo API key (fixed tp- key, unrelated to login JWT)
func (s *ChatService) resolveGochatUpstream() (baseURL string, apiKey string) {
	cfg := loadGochatServerConfig()
	apiKey = resolveGochatAPIKey()
	baseURL = strings.TrimSuffix(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = GochatBaseURLDefault
	}
	return baseURL, apiKey
}

// sanitizeUpstreamChatBody strip app-only fields before sending JSON to MiMo
func sanitizeUpstreamChatBody(body []byte) []byte {
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}
	delete(payload, "provider")
	delete(payload, "conversation_id")
	out, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return out
}

// extractGochatUserID resolve current user ID (session isolation; does not block chat)
func extractGochatUserID(r *http.Request, jwtSecret string) string {
	for _, h := range []string{"X-User-Id", "X-User-ID"} {
		if id := strings.TrimSpace(r.Header.Get(h)); id != "" {
			return id
		}
	}
	if id := parseJWTUserIDLoose(r, jwtSecret); id != "" {
		return id
	}
	return ""
}

func parseJWTUserIDLoose(r *http.Request, jwtSecret string) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return ""
	}
	tokenString := strings.TrimSpace(authHeader[len("Bearer "):])
	if tokenString == "" || !strings.Contains(tokenString, ".") {
		return ""
	}

	if jwtSecret != "" {
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})
		if err == nil && token.Valid {
			if id := userIDFromClaims(token.Claims); id != "" {
				return id
			}
		}
	}

	if id := userIDFromUnverifiedJWT(tokenString); id != "" {
		log.Printf("GoChat: using user id from JWT payload without verified signature")
		return id
	}
	return ""
}

func userIDFromClaims(claims jwt.Claims) string {
	mc, ok := claims.(jwt.MapClaims)
	if !ok {
		return ""
	}
	if v, ok := mc["id"]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	if v, ok := mc["sub"]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	return ""
}

func userIDFromUnverifiedJWT(tokenString string) string {
	parts := strings.Split(tokenString, ".")
	if len(parts) < 2 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims map[string]interface{}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return ""
	}
	if v, ok := claims["id"].(string); ok && v != "" {
		return v
	}
	if v, ok := claims["sub"].(string); ok && v != "" {
		return v
	}
	return ""
}

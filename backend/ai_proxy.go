package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// OpenAIProxy OpenAI API proxy
type OpenAIProxy struct {
	APIKey  string
	BaseURL string
	Service *ChatService
}

// NewOpenAIProxy create OpenAI proxy instance
func NewOpenAIProxy() *OpenAIProxy {
	cfg := loadGochatServerConfig()
	apiKey := cfg.APIKey
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")

	return &OpenAIProxy{
		APIKey:  apiKey,
		BaseURL: baseURL,
		Service: NewChatService(),
	}
}

// proxyRequest generic proxy request handler
func (p *OpenAIProxy) proxyRequest(w http.ResponseWriter, r *http.Request, endpoint string) {
	apiKey := resolveGochatAPIKey()
	if apiKey == "" {
		http.Error(w, `{"error":{"message":"GoChat MiMo API key not configured","type":"internal_error"}}`, http.StatusInternalServerError)
		return
	}

	// read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":{"message":"Failed to read request body","type":"invalid_request_error"}}`, http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// build upstream request
	url := p.BaseURL + endpoint
	req, err := http.NewRequest(r.Method, url, bytes.NewBuffer(body))
	if err != nil {
		http.Error(w, `{"error":{"message":"Failed to create request","type":"internal_error"}}`, http.StatusInternalServerError)
		return
	}

	// set request headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("api-key", apiKey)

	// copy other headers (keep streaming-related headers)
	for key, values := range r.Header {
		lowerKey := strings.ToLower(key)
		// skip these headers; use our own
		if lowerKey == "authorization" || lowerKey == "host" || lowerKey == "content-length" {
			continue
		}
		// keep Accept, Cache-Control, etc.
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// send request（no timeout; supports streaming）
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":{"message":"Failed to connect to OpenAI API: `+err.Error()+`","type":"server_error"}}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// set status code
	w.WriteHeader(resp.StatusCode)

	// copy response body (streaming supported)
	_, err = io.Copy(w, resp.Body)
	if err != nil {
		// connection close during stream is expected
		return
	}
}

// ChatCompletionsHandler handle chat completions
func (p *OpenAIProxy) ChatCompletionsHandler(w http.ResponseWriter, r *http.Request) {
	if p.Service != nil {
		p.Service.handleChat(w, r)
		return
	}
	p.proxyRequest(w, r, "/chat/completions")
}

// CompletionsHandler handle text completions
func (p *OpenAIProxy) CompletionsHandler(w http.ResponseWriter, r *http.Request) {
	p.proxyRequest(w, r, "/completions")
}

// EmbeddingsHandler handle embeddings
func (p *OpenAIProxy) EmbeddingsHandler(w http.ResponseWriter, r *http.Request) {
	p.proxyRequest(w, r, "/embeddings")
}

// ModelsHandler handle models list
func (p *OpenAIProxy) ModelsHandler(w http.ResponseWriter, r *http.Request) {
	// return supported model list
	models := []map[string]interface{}{
		{
			"id":       "gpt-3.5-turbo",
			"object":   "model",
			"created":  1677610602,
			"owned_by": "openai",
		},
		{
			"id":       "gpt-4",
			"object":   "model",
			"created":  1677610602,
			"owned_by": "openai",
		},
		{
			"id":       "gpt-4-turbo",
			"object":   "model",
			"created":  1677610602,
			"owned_by": "openai",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	jsonResponse := map[string]interface{}{
		"object": "list",
		"data":   models,
	}

	jsonData, _ := json.Marshal(jsonResponse)
	w.Write(jsonData)
}

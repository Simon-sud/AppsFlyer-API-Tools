//go:build !autopipe
// +build !autopipe

package main

import (
	"log"
	"os"
	"strings"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	port := os.Getenv("AI_CHAT_PORT")
	if port == "" {
		port = ":5002"
	}
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}

	service := NewChatService()
	if err := service.Start(port); err != nil {
		log.Fatalf("Failed to start AI Chat Service: %v", err)
	}
}

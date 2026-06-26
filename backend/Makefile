# AppsFlyer Auto Pipe Go Backend Makefile

# 项目本地化配置
GOBIN := $(CURDIR)/bin
export GOBIN

# 工具版本
AIR_VERSION := latest

# 依赖模式：module（默认）或 vendor（本地化）
# 设置为 vendor 可完全本地化依赖，不依赖 ~/go/pkg/
GO_MOD_MODE := module

.PHONY: help
help: ## 显示帮助信息
	@echo "AppsFlyer Auto Pipe - Go Backend"
	@echo ""
	@echo "可用命令:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: setup
setup: ## 安装项目本地工具（air等）
	@echo "📦 安装项目本地工具到 ./bin 目录..."
	@mkdir -p bin
	@GOBIN=$(GOBIN) go install github.com/air-verse/air@$(AIR_VERSION)
	@echo "✅ 工具安装完成！"
	@echo "   - air: $(GOBIN)/air"

.PHONY: deps
deps: ## 下载Go依赖
	@echo "📥 下载Go依赖..."
	@go mod download
	@go mod tidy
	@echo "✅ 依赖下载完成！"

.PHONY: vendor
vendor: ## 创建vendor目录（本地化所有依赖）
	@echo "📦 创建vendor目录..."
	@go mod vendor
	@echo "✅ vendor创建完成！"
	@echo "📊 vendor大小: $$(du -sh vendor | cut -f1)"
	@echo ""
	@echo "💡 提示："
	@echo "   - 所有依赖已复制到 vendor/ 目录"
	@echo "   - 现在可以删除 ~/go/pkg/ 了"
	@echo "   - 使用 'make build-vendor' 编译"
	@echo "   - 使用 'make dev-vendor' 开发"

.PHONY: build
build: ## 编译项目（Module模式）
	@echo "🔨 编译项目 (Module模式)..."
	@go build -tags autopipe -o autopipe_runner .
	@echo "✅ 编译完成：./autopipe_runner"

.PHONY: build-vendor
build-vendor: ## 编译项目（Vendor模式 - 使用本地依赖）
	@echo "🔨 编译项目 (Vendor模式)..."
	@if [ ! -d "vendor" ]; then \
		echo "⚠️  vendor目录不存在，正在创建..."; \
		$(MAKE) vendor; \
	fi
	@go build -tags autopipe -mod=vendor -o autopipe_runner .
	@echo "✅ 编译完成：./autopipe_runner (使用vendor)"

.PHONY: dev
dev: ## 启动热重载开发模式（Module模式）
	@echo "🔥 启动热重载开发模式 (Module模式)..."
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@$(GOBIN)/air

.PHONY: dev-vendor
dev-vendor: ## 启动热重载开发模式（Vendor模式 - 使用本地依赖）
	@echo "🔥 启动热重载开发模式 (Vendor模式)..."
	@if [ ! -d "vendor" ]; then \
		echo "⚠️  vendor目录不存在，正在创建..."; \
		$(MAKE) vendor; \
	fi
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@$(GOBIN)/air -c .air.vendor.toml

.PHONY: dev-ai
dev-ai: ## 启动 AI Chat 热重载（Module模式，端口:5002）
	@echo "🔥 启动 AI Chat 热重载开发模式 (Module模式)..."
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@AI_CHAT_PORT=:5002 $(GOBIN)/air -c .air.ai.toml

.PHONY: dev-ai-vendor
dev-ai-vendor: ## 启动 AI Chat 热重载（Vendor模式，端口:5002）
	@echo "🔥 启动 AI Chat 热重载开发模式 (Vendor模式)..."
	@if [ ! -d "vendor" ]; then \
		echo "⚠️  vendor目录不存在，正在创建..."; \
		$(MAKE) vendor; \
	fi
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@AI_CHAT_PORT=:5002 $(GOBIN)/air -c .air.ai.vendor.toml

.PHONY: dev-all
dev-all: ## 一键热重载启动 Autopipe(:5001) 与 AI Chat(:5002)（Module模式）
	@echo "🔥 启动所有 Go 后端（Module模式）: Autopipe(:5001) + AI Chat(:5002)"
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@bash -c 'set -e; trap "kill 0" EXIT; \
		AUTOPIPE_PORT=:5001 $(GOBIN)/air -c .air.toml & \
		AI_CHAT_PORT=:5002 $(GOBIN)/air -c .air.ai.toml & \
		wait'

.PHONY: dev-all-vendor
dev-all-vendor: ## 一键热重载启动 Autopipe(:5001) 与 AI Chat(:5002)（Vendor模式）
	@echo "🔥 启动所有 Go 后端（Vendor模式）: Autopipe(:5001) + AI Chat(:5002)"
	@if [ ! -d "vendor" ]; then \
		echo "⚠️  vendor目录不存在，正在创建..."; \
		$(MAKE) vendor; \
	fi
	@if [ ! -f "$(GOBIN)/air" ]; then \
		echo "❌ air 未安装，正在安装..."; \
		$(MAKE) setup; \
	fi
	@mkdir -p tmp
	@bash -c 'set -e; trap "kill 0" EXIT; \
		AUTOPIPE_PORT=:5001 $(GOBIN)/air -c .air.vendor.toml & \
		AI_CHAT_PORT=:5002 $(GOBIN)/air -c .air.ai.vendor.toml & \
		wait'

.PHONY: run
run: build ## 编译并运行（生产模式）
	@echo "🚀 运行服务..."
	@./autopipe_runner

.PHONY: clean
clean: ## 清理编译产物和临时文件
	@echo "🧹 清理文件..."
	@rm -f autopipe_runner
	@rm -rf tmp
	@rm -f build-errors.log
	@echo "✅ 清理完成！"

.PHONY: clean-vendor
clean-vendor: ## 删除vendor目录
	@echo "🧹 删除vendor目录..."
	@rm -rf vendor
	@echo "✅ vendor已删除！"

.PHONY: clean-all
clean-all: clean ## 清理所有（包括本地工具）
	@echo "🧹 清理所有文件..."
	@rm -rf bin
	@echo "✅ 完全清理完成！"

.PHONY: check
check: ## 检查Go环境和依赖
	@echo "🔍 检查Go环境..."
	@go version
	@echo ""
	@echo "📦 Go模块状态:"
	@go mod verify
	@echo ""
	@echo "🛠️  本地工具:"
	@if [ -f "$(GOBIN)/air" ]; then \
		echo "  ✅ air: $(GOBIN)/air"; \
	else \
		echo "  ❌ air: 未安装（运行 'make setup' 安装）"; \
	fi
	@echo ""
	@echo "📁 依赖模式:"
	@if [ -d "vendor" ]; then \
		echo "  ✅ Vendor模式: vendor/ 存在 ($$(du -sh vendor 2>/dev/null | cut -f1))"; \
	else \
		echo "  ℹ️  Module模式: 使用 ~/go/pkg/ (运行 'make vendor' 切换)"; \
	fi

.PHONY: info
info: ## 显示项目信息
	@echo "📋 项目信息"
	@echo "-----------------------------------"
	@echo "项目路径: $(CURDIR)"
	@echo "Go版本:   $$(go version)"
	@echo "本地工具: $(GOBIN)"
	@echo "临时目录: $(CURDIR)/tmp"
	@echo ""
	@echo "📦 依赖列表:"
	@go list -m all

.DEFAULT_GOAL := help


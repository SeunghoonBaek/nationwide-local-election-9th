.DEFAULT_GOAL := help
.PHONY: help setup install env dev build start check lint clean reset

NPM := npm

help: ## Show available commands
	@echo ""
	@echo "  9th Local Election - Candidate & Pledge Comparison"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: install env ## One-time setup (install deps + create .env.local)
	@echo "Setup complete. Set NEC_SERVICE_KEY in .env.local."

install: ## Install dependencies
	$(NPM) install

env: ## Create .env.local from the example if it does not exist
	@if [ ! -f .env.local ]; then \
		cp .env.local.example .env.local; \
		echo ".env.local created - set the NEC_SERVICE_KEY value."; \
	else \
		echo ".env.local already exists."; \
	fi

dev: ## Run the dev server (http://localhost:3000)
	$(NPM) run dev

build: ## Production build
	$(NPM) run build

start: build ## Build then run in production mode
	$(NPM) run start

check: ## Check NEC API key / connectivity
	$(NPM) run check-nec

lint: ## Run ESLint
	$(NPM) run lint

clean: ## Remove build artifacts
	rm -rf .next

reset: ## Remove node_modules and build artifacts
	rm -rf .next node_modules

.PHONY: dev-backend dev-web build-web build test

dev-backend:
	go run ./cmd/server -password dev-password

dev-web:
	cd web && npm install && npm run dev

build-web:
	cd web && npm install && npm run build

build: build-web
	go build -o bin/aluka_ops.exe ./cmd/server

test:
	go test ./...

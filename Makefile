.SILENT:
.PHONY:

db:
	docker compose down -v --remove-orphans && docker compose up -d

build:
	go build -o ./.bin/main ./main.go

run: build
	./.bin/main
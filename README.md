# EVKO Release Stack

Корневая папка `evko` подготовлена для серверного запуска через Docker Compose.

## Что нужно на сервере

- Docker
- Docker Compose Plugin

Go, Node.js, npm и PostgreSQL отдельно на сервер ставить не нужно: всё собирается и запускается в контейнерах.

## Быстрый запуск

1. Залить папку `evko` на сервер.
2. По желанию создать `.env` на основе [.env.example](./.env.example).
3. Из корня `evko` выполнить:

```bash
docker compose up --build -d
```

4. Проверить состояние:

```bash
docker compose ps
```

## Что поднимется

- `postgres`: база данных с постоянным volume `postgres_data`
- `backend`: Go API с автоматическим применением миграций при старте
- `frontend`: production-сборка React, раздаваемая через nginx

## Порты по умолчанию

- фронт: `http://SERVER:8088`
- backend: `127.0.0.1:18080`

Backend по умолчанию опубликован только на `127.0.0.1`, чтобы наружу торчал только фронт. Внешние клиенты ходят в API через nginx по `/api/...`.

Если нужен другой порт или публикация backend наружу, это настраивается через `.env`.

## Полезные команды

Обновить и пересобрать стек:

```bash
docker compose up --build -d
```

Посмотреть логи:

```bash
docker compose logs -f
```

Остановить стек:

```bash
docker compose down
```

Остановить стек вместе с удалением базы:

```bash
docker compose down -v
```

## Переменные окружения

Основные настройки лежат в [.env.example](./.env.example):

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `FRONTEND_PORT`
- `BACKEND_BIND`, `BACKEND_PORT`
- `VITE_API_BASE_URL`, `VITE_USE_MOCK_DATA`, `VITE_MOCK_DELAY_MS`

Для production обычно достаточно:

- поставить свой `POSTGRES_PASSWORD`
- при необходимости сменить `FRONTEND_PORT` на `80`

Если база уже была инициализирована с другими `POSTGRES_USER/POSTGRES_PASSWORD`, то либо оставь совместимые значения в `.env`, либо пересоздай volume командой `docker compose down -v`.

## Учётные записи из seed

- `admin / admin`
- `ktp / ktp`
- `wfm / wfm`
- `client / client`
- `ebko / ebko`

## Проверка здоровья

- backend health: `GET /healthz`
- frontend health: `GET /`

Оба healthcheck уже встроены в `docker-compose.yml`.

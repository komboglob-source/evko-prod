# EBKO CRM Frontend

Фронтенд собирается и запускается из корневого стека [../../README.md](../../README.md).

## Локальные команды

```bash
npm ci
npm run lint
npm run build
```

## Production

Production-сборка делается Docker-образом из [Dockerfile](./Dockerfile), а nginx-конфигурация лежит в [nginx.conf](./nginx.conf).

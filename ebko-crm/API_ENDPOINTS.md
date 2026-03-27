# API endpoints для EBKO CRM

Документ описывает минимальный набор endpoint'ов, необходимых для текущего фронтенда и схемы `db.dbml`.
Базовый префикс: `/api/v1`.

## 1. Auth

### `POST /auth/login`
Назначение: вход по Basic Auth (`login:password`), создание сессии, выдача пары токенов.

Ответ `200`:
- `access_token: string`
- `refresh_token: string`

Ошибки: `400`, `401`, `405`, `500`.

### `POST /auth/refresh`
Назначение: перевыпуск токенов.

Body:
- `refresh_token: string`

Ответ `200`:
- `access_token: string`
- `refresh_token: string`

Ошибки: `400`, `401`, `405`, `500`.

### `POST /auth/logout`
Назначение: отзыв текущей сессии.

Header:
- `Authorization: Bearer <access_token>`

Ответ: `204`.

Ошибки: `401`, `405`, `500`.

## 2. Bootstrap

### `GET /bootstrap`
Назначение: единая загрузка стартовых данных для фронтенда.

Ответ `200`:
- `users: UserProfile[]`
- `employees: Employee[]`
- `clients: Client[]`
- `sites: Site[]`
- `equipment: Equipment[]`
- `appeals: Ticket[]`
- `products: Product[]`
- `equipment_types: EquipmentType[]`
- `ticket_types: TicketType[]`
- `ticket_statuses: TicketStatus[]`
- `ticket_criticalities: TicketCriticality[]`

## 3. Справочники

### `GET /products`
Назначение: `crm.Products`.

Ответ `200`:
- `{ id, name, description }[]`

### `GET /ticket-types`
Назначение: `tasks.Type`.

Ответ `200`:
- `{ id, name }[]`

### `GET /ticket-statuses`
Назначение: `tasks.Status`.

Ответ `200`:
- `{ id, name }[]`

### `GET /ticket-criticalities`
Назначение: `tasks.Criticality`.

Ответ `200`:
- `{ id, name, deadline }[]`

### `GET /equipment-types`
Назначение: `nri.Equipment_Types`.

Ответ `200`:
- `{ id, name, description }[]`

## 4. Профили и сотрудники

### `GET /employees`
Назначение: список сотрудников (`auth.Accounts + profiles.Profiles + hrm.Employees`).

Параметры:
- `search?`
- `role_id?`

Ответ `200`:
- `{ account_id, full_name, image, birth_date, position, phone_number, email, role, login, password_hash, hire_date }[]`

### `POST /employees`
Назначение: создать сотрудника.

Body:
- `login`
- `password_hash`
- `role_id`
- `full_name`
- `phone_number`
- `email`
- `image?`
- `birth_date?`
- `position?`
- `hire_date?`

Ответ `201`: созданный сотрудник в формате `/employees`.

### `PATCH /employees/{account_id}`
Назначение: обновить сотрудника.

Body: любой поднабор полей из `POST /employees`.

Ответ `200`: обновленный сотрудник.

### `DELETE /employees/{account_id}`
Назначение: удалить сотрудника.

Ответ: `204`.

### `PATCH /profiles/me`
Назначение: редактирование собственного профиля.

Body:
- `image?`
- `position?`
- `phone_number?`
- `email?`

Ответ `200`: обновленный профиль текущего пользователя.

## 5. Заказчики и представители

### `GET /clients`
Назначение: список клиентов с представителями.

Параметры:
- `search?`

Ответ `200`:
- `{ id, name, address, ceo_id, representatives: Representative[] }[]`

`Representative`:
- `{ account_id, client_id, full_name, phone_number, email, login, password_hash, role }`

### `POST /clients`
Назначение: создать клиента.

Body:
- `name`
- `address`
- `ceo_id?`

Ответ `201`: созданный клиент.

### `PATCH /clients/{client_id}`
Назначение: изменить клиента.

Body:
- `name?`
- `address?`
- `ceo_id?`

Ответ `200`: обновленный клиент.

### `DELETE /clients/{client_id}`
Назначение: удалить клиента.

Ответ: `204`.

### `POST /clients/{client_id}/representatives`
Назначение: создать представителя клиента.

Body:
- `login`
- `password_hash`
- `full_name`
- `phone_number`
- `email`
- `role` (для текущей системы: `client`)

Ответ `201`: созданный представитель.

### `PATCH /representatives/{account_id}`
Назначение: обновить представителя.

Body:
- `full_name?`
- `phone_number?`
- `email?`
- `login?`
- `password_hash?`
- `client_id?`

Ответ `200`: обновленный представитель.

### `DELETE /representatives/{account_id}`
Назначение: удалить представителя.

Ответ: `204`.

## 6. Площадки

### `GET /sites`
Назначение: список площадок.

Параметры:
- `client_id?`
- `responsible_id?`

Ответ `200`:
- `{ id, name, address, responsible_id, client_id, product_ids: string[] }[]`

Примечание: `product_ids` может собираться сервером из `crm.SitesProducts`.

### `POST /sites`
Назначение: создать площадку.

Body:
- `name`
- `address`
- `responsible_id`
- `client_id`
- `product_ids: string[]`

Ответ `201`: созданная площадка.

### `PATCH /sites/{site_id}`
Назначение: обновить площадку.

Body:
- `name?`
- `address?`
- `responsible_id?`
- `client_id?`
- `product_ids?` (полная замена списка)

Ответ `200`: обновленная площадка.

### `DELETE /sites/{site_id}`
Назначение: удалить площадку.

Ответ: `204`.

## 7. Оборудование

### `GET /equipment`
Назначение: список оборудования (`nri.Equipment`).

Параметры:
- `site_id?`
- `type_id?`
- `search?`
- `unassigned?=true|false` (если поддерживаете режим временно не привязанного оборудования)

Ответ `200`:
- `{ id, type_id, site_id, serial_number, name, weight, description }[]`

### `POST /equipment`
Назначение: создать единицу оборудования.

Body:
- `type_id`
- `site_id?`
- `serial_number`
- `name`
- `weight?`
- `description?`

Ответ `201`: созданная запись оборудования.

### `PATCH /equipment/{equipment_id}`
Назначение: обновить единицу оборудования.

Body:
- `type_id?`
- `site_id?`
- `serial_number?`
- `name?`
- `weight?`
- `description?`

Ответ `200`: обновленная запись.

### `PATCH /equipment/{equipment_id}/site`
Назначение: привязать/переместить оборудование на площадку из раздела заказчиков.

Body:
- `site_id` (или `null`, если поддерживается отвязка)

Ответ `200`: обновленная запись оборудования.

### `DELETE /equipment/{equipment_id}`
Назначение: удалить единицу оборудования.

Ответ: `204`.

## 8. Обращения (tasks.Tickets)

### `GET /appeals`
Назначение: список тикетов с фильтрацией.

Параметры:
- `status_id?`
- `type_id?`
- `criticality_id?`
- `client_id?`
- `site_id?`
- `responsible_id?`
- `search?`
- `created_from?`
- `created_to?`

Ответ `200`:
- `Ticket[]`

`Ticket`:
- `{ id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id, created_at, created_by, updated_at, updated_by, responsible_id, linked_ticket_ids, comments }`

### `POST /appeals`
Назначение: создать обращение.

Body:
- `title`
- `description`
- `type_id`
- `status_id`
- `criticality_id`
- `client_id`
- `site_id?`
- `product_id?`
- `responsible_id?`
- `created_by`
- `updated_by`

Ответ `201`: созданный тикет.

### `GET /appeals/{appeal_id}`
Назначение: карточка тикета.

Ответ `200`: `Ticket`.

### `PATCH /appeals/{appeal_id}`
Назначение: обновить поля тикета (статус, критичность, ответственный, и т.д.).

Body: любой поднабор полей тикета.

Ответ `200`: обновленный тикет.

### `DELETE /appeals/{appeal_id}`
Назначение: удалить тикет (опционально, если бизнес-логика допускает).

Ответ: `204`.

## 9. Комментарии и связи

### `GET /appeals/{appeal_id}/comments`
Назначение: список комментариев тикета.

Ответ `200`:
- `{ id, ticket_id, is_closed_comment, created_by, created_at, updated_at, contents, files? }[]`

### `POST /appeals/{appeal_id}/comments`
Назначение: добавить комментарий.

Body:
- `contents`
- `is_closed_comment?` (default `false`)
- `files?` (метаданные вложений)

Ответ `201`: созданный комментарий.

### `PATCH /appeals/{appeal_id}/comments/{comment_id}`
Назначение: обновить комментарий.

Body:
- `contents?`
- `is_closed_comment?`

Ответ `200`: обновленный комментарий.

### `DELETE /appeals/{appeal_id}/comments/{comment_id}`
Назначение: удалить комментарий.

Ответ: `204`.

### `POST /appeals/{appeal_id}/links`
Назначение: связать обращение с другим обращением.

Body:
- `linked_appeal_id`

Ответ `201`: `{ appeal_id, linked_appeal_id }`.

### `DELETE /appeals/{appeal_id}/links/{linked_appeal_id}`
Назначение: удалить связь между обращениями.

Ответ: `204`.

## 10. Реакции на комментарии (по схеме БД)

### `GET /reactions`
Назначение: справочник реакций (`tasks.Reactions`).

### `POST /appeals/{appeal_id}/comments/{comment_id}/reactions`
Назначение: поставить реакцию.

Body:
- `reaction_id`

### `DELETE /appeals/{appeal_id}/comments/{comment_id}/reactions/{reaction_id}`
Назначение: убрать реакцию.

---

## Рекомендации по общему контракту

- Все даты/время: ISO-8601 (`timestamptz`).
- Для списков: поддержать пагинацию (`page`, `page_size`, `total`).
- Для ошибок: единый формат `{ error_code, message, details? }`.
- Для оптимистичных апдейтов фронта желательно возвращать обновленную сущность в `PATCH`.

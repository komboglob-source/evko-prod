# API Endpoints for EBKO CRM

This document is the working API contract for the backend in [CRM_BE](e:/evko/CRM_BE) and the frontend in [CRM_FE](e:/evko/CRM_FE).

Base prefix: `/api/v1`

## General Rules

- Authentication module is not redesigned. `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/logout` must stay compatible with the current backend implementation.
- Errors stay in the current backend style: plain text via HTTP status codes, without a unified JSON error envelope.
- All list endpoints return plain arrays without extra wrappers.
- Dates and timestamps are returned in ISO-8601 format.
- Passwords and password hashes are never returned from profile and list endpoints.
- Physical delete is used.
- Backend validates relation integrity and field consistency on create/update endpoints. If related fields are inconsistent, backend returns `400 Bad Request` with plain-text message `all fields are inconsistent`.
- `DELETE /appeals/{appeal_id}` is allowed only for appeals in statuses `Created` and `Opened`.
- Site client is derived through `responsible_id -> crm.Representatives.client_id`.
- Changing `responsible_id` for a site may automatically change the derived `client_id`.
- Comment files are out of scope for now. If needed later, they are represented inside text or description payloads, not as a separate attachments API.

## 1. Auth

### `POST /auth/login`

Purpose: login via Basic Auth and issue access and refresh tokens.

Request header:

- `Authorization: Basic <base64(login:password)>`

Response `200`:

- `{ access_token, refresh_token }`

Errors:

- `400`
- `401`
- `405`
- `500`

### `POST /auth/refresh`

Purpose: refresh token pair.

Request body:

- `refresh_token`

Response `200`:

- `{ access_token, refresh_token }`

Errors:

- `400`
- `401`
- `405`
- `500`

### `POST /auth/logout`

Purpose: revoke current session.

Request header:

- `Authorization: Bearer <access_token>`

Response:

- `204`

Errors:

- `401`
- `405`
- `500`

## 2. Bootstrap and Dictionaries

### `GET /bootstrap`

Purpose: lightweight bootstrap with dictionaries only.

Response `200`:

- `{ products, equipment_types, ticket_types, ticket_statuses, ticket_criticalities, reactions }`

Where:

- `products: Product[]`
- `equipment_types: EquipmentType[]`
- `ticket_types: TicketType[]`
- `ticket_statuses: TicketStatus[]`
- `ticket_criticalities: TicketCriticality[]`
- `reactions: Reaction[]`

`Reaction`:

- `{ id, name, picture }`

Rules:

- `picture` is returned as base64-encoded content

### `GET /products`

Purpose: list of products from `crm.Products`.

Response `200`:

- `Product[]`

`Product`:

- `{ id, name, description }`

### `GET /equipment-types`

Purpose: list of equipment types from `nri.Equipment_Types`.

Response `200`:

- `EquipmentType[]`

`EquipmentType`:

- `{ id, name, description }`

### `GET /ticket-types`

Purpose: list of ticket types from `tasks.Type`.

Response `200`:

- `TicketType[]`

`TicketType`:

- `{ id, name }`

Allowed `name` values for the current system:

- `KTP`
- `WFM`

### `GET /ticket-statuses`

Purpose: list of ticket statuses from `tasks.Status`.

Response `200`:

- `TicketStatus[]`

`TicketStatus`:

- `{ id, name }`

Allowed `name` values for the current system:

- `Created`
- `Opened`
- `Customer Pending`
- `Done`
- `Verified`

### `GET /ticket-criticalities`

Purpose: list of ticket criticalities from `tasks.Criticality`.

Response `200`:

- `TicketCriticality[]`

`TicketCriticality`:

- `{ id, name, deadline }`

## 3. Profiles

### `GET /profiles/me`

Purpose: return current authenticated profile.

Response `200`:

- `ProfileMe`

`ProfileMe` common fields:

- `account_id`
- `login`
- `role`
- `full_name`
- `phone_number`
- `email`
- `image`
- `birth_date`
- `position`

Optional fields by profile type:

- `hire_date` for employee profiles
- `client_id` for representative profiles

Allowed `role` values:

- `admin`
- `ktp`
- `wfm`
- `client`
- `ebko`

### `PATCH /profiles/me`

Purpose: update current authenticated profile.

Request body:

- `full_name?`
- `phone_number?`
- `email?`
- `image?`
- `birth_date?`
- `position?`

Response `200`:

- updated `ProfileMe`

Errors:

- `400`
- `401`
- `404`
- `405`
- `500`

## 4. Employees

### `GET /employees`

Purpose: list employee profiles from `auth.Accounts + profiles.Profiles + hrm.Employees`.

Query parameters:

- `account_id?`
- `login?`
- `role?`
- `full_name?`
- `phone_number?`
- `email?`
- `position?`
- `birth_date_from?`
- `birth_date_to?`
- `hire_date_from?`
- `hire_date_to?`
- `q?`

Response `200`:

- `Employee[]`

`Employee`:

- `{ account_id, login, role, full_name, phone_number, email, image, birth_date, position, hire_date }`

Allowed `role` values for this endpoint:

- `admin`
- `ktp`
- `wfm`
- `ebko`

### `POST /employees`

Purpose: create employee account and profile.

Request body:

- `login`
- `password`
- `role`
- `full_name`
- `phone_number`
- `email`
- `image?`
- `birth_date?`
- `position?`
- `hire_date?`

Response `201`:

- created `Employee`

Server rule:

- `password` is hashed on the backend before storing in `auth.Accounts.password_hash`

### `PATCH /employees/{account_id}`

Purpose: update employee account and profile.

Request body:

- `login?`
- `password?`
- `role?`
- `full_name?`
- `phone_number?`
- `email?`
- `image?`
- `birth_date?`
- `position?`
- `hire_date?`

Response `200`:

- updated `Employee`

### `DELETE /employees/{account_id}`

Purpose: physically delete employee account and related profile.

Response:

- `204`

## 5. Clients and Representatives

### `GET /clients`

Purpose: list clients with nested representatives.

Query parameters:

- `id?`
- `name?`
- `address?`
- `ceo_id?`
- `representative_account_id?`
- `representative_login?`
- `representative_full_name?`
- `representative_phone_number?`
- `representative_email?`
- `representative_position?`
- `representative_birth_date_from?`
- `representative_birth_date_to?`
- `q?`

Response `200`:

- `Client[]`

`Client`:

- `{ id, name, address, ceo_id, representatives }`

`Representative`:

- `{ account_id, client_id, login, role, full_name, phone_number, email, image, birth_date, position }`

Representative `role` in the current system:

- `client`

### `POST /clients`

Purpose: create client.

Request body:

- `name`
- `address`
- `ceo_id?`

Response `201`:

- created `Client`

### `PATCH /clients/{client_id}`

Purpose: update client.

Request body:

- `name?`
- `address?`
- `ceo_id?`

Response `200`:

- updated `Client`

### `DELETE /clients/{client_id}`

Purpose: physically delete client.

Response:

- `204`

### `POST /clients/{client_id}/representatives`

Purpose: create representative for a specific client.

Request body:

- `login`
- `password`
- `full_name`
- `phone_number`
- `email`
- `image?`
- `birth_date?`
- `position?`

Response `201`:

- created `Representative`

Server rules:

- representative role is always `client`
- `password` is hashed on the backend before storing in `auth.Accounts.password_hash`

### `PATCH /representatives/{account_id}`

Purpose: update representative account and profile.

Request body:

- `login?`
- `password?`
- `client_id?`
- `full_name?`
- `phone_number?`
- `email?`
- `image?`
- `birth_date?`
- `position?`

Response `200`:

- updated `Representative`

### `DELETE /representatives/{account_id}`

Purpose: physically delete representative.

Response:

- `204`

## 6. Sites

### `GET /sites`

Purpose: list client sites.

Query parameters:

- `id?`
- `name?`
- `address?`
- `client_id?`
- `responsible_id?`
- `product_id?`
- `q?`

Response `200`:

- `Site[]`

`Site`:

- `{ id, name, address, responsible_id, client_id, product_ids }`

Rules:

- `client_id` is derived from the current `responsible_id`
- `product_ids` is assembled from `crm.SitesProducts`

### `POST /sites`

Purpose: create site.

Request body:

- `responsible_id`
- `name`
- `address`
- `product_ids`

Response `201`:

- created `Site`

### `PATCH /sites/{site_id}`

Purpose: update site.

Request body:

- `responsible_id?`
- `name?`
- `address?`
- `product_ids?`

Response `200`:

- updated `Site`

Rule:

- if `responsible_id` changes to a representative of another client, the derived `client_id` changes automatically

### `DELETE /sites/{site_id}`

Purpose: physically delete site.

Response:

- `204`

## 7. Equipment

### `GET /equipment`

Purpose: list equipment units from `nri.Equipment`.

Query parameters:

- `id?`
- `site_id?`
- `type_id?`
- `client_id?`
- `product_id?`
- `serial_number?`
- `name?`
- `description?`
- `q?`

Response `200`:

- `Equipment[]`

`Equipment`:

- `{ id, type_id, site_id, serial_number, name, weight, description }`

### `POST /equipment`

Purpose: create equipment unit.

Request body:

- `type_id`
- `site_id`
- `serial_number?`
- `name`
- `weight?`
- `description?`

Response `201`:

- created `Equipment`

### `PATCH /equipment/{equipment_id}`

Purpose: update equipment unit.

Request body:

- `type_id?`
- `site_id?`
- `serial_number?`
- `name?`
- `weight?`
- `description?`

Response `200`:

- updated `Equipment`

### `DELETE /equipment/{equipment_id}`

Purpose: physically delete equipment unit.

Response:

- `204`

## 8. Appeals

### `GET /appeals`

Purpose: list appeals with filters.

Query parameters:

- `id?`
- `title?`
- `description?`
- `type_id?`
- `status_id?`
- `criticality_id?`
- `client_id?`
- `site_id?`
- `product_id?`
- `responsible_id?`
- `created_by?`
- `updated_by?`
- `created_from?`
- `created_to?`
- `updated_from?`
- `updated_to?`
- `q?`

Response `200`:

- `AppealListItem[]`

`AppealListItem`:

- `{ id, title, type_id, status_id, criticality_id, client_id, site_id, product_id, created_at, created_by, updated_at, updated_by, responsible_id }`

### `POST /appeals`

Purpose: create appeal.

Request body:

- `title`
- `description`
- `type_id`
- `criticality_id`
- `client_id`
- `site_id?`
- `product_id?`
- `responsible_id?`
- `status_id?`

Response `201`:

- created `Appeal`

Rules:

- if `status_id` is omitted, backend sets `Created`
- `created_at` and `updated_at` are set on the backend
- `created_by` and `updated_by` are derived from the authenticated user

### `GET /appeals/{appeal_id}`

Purpose: return full appeal card without comments and links.

Response `200`:

- `Appeal`

`Appeal`:

- `{ id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id, created_at, created_by, updated_at, updated_by, responsible_id }`

### `PATCH /appeals/{appeal_id}`

Purpose: update appeal fields.

Request body:

- `title?`
- `description?`
- `type_id?`
- `status_id?`
- `criticality_id?`
- `client_id?`
- `site_id?`
- `product_id?`
- `responsible_id?`

Response `200`:

- updated `Appeal`

Rules:

- `updated_at` is set on the backend
- `updated_by` is derived from the authenticated user

### `DELETE /appeals/{appeal_id}`

Purpose: physically delete appeal.

Response:

- `204`

Rules:

- delete is allowed only for appeals with status `Created` or `Opened`
- for all other statuses backend returns an error status

## 9. Appeal Comments

### `GET /appeals/{appeal_id}/comments`

Purpose: list comments for appeal.

Response `200`:

- `Comment[]`

`Comment`:

- `{ id, ticket_id, is_closed_comment, created_by, author_name, created_at, updated_at, contents, reaction_ids }`

### `POST /appeals/{appeal_id}/comments`

Purpose: create comment for appeal.

Request body:

- `contents`
- `is_closed_comment?`

Response `201`:

- created `Comment`

Rules:

- `is_closed_comment` defaults to `false`
- `created_by` is derived from the authenticated user

### `PATCH /appeals/{appeal_id}/comments/{comment_id}`

Purpose: update appeal comment.

Request body:

- `contents?`
- `is_closed_comment?`

Response `200`:

- updated `Comment`

### `DELETE /appeals/{appeal_id}/comments/{comment_id}`

Purpose: physically delete appeal comment.

Response:

- `204`

## 10. Appeal Links

### `GET /appeals/{appeal_id}/links`

Purpose: list links for appeal.

Response `200`:

- `AppealLink[]`

`AppealLink`:

- `{ appeal_id, linked_appeal_id, relation_type, linked_appeal }`

`linked_appeal`:

- `{ id, title, type_id, status_id, criticality_id }`

Rules:

- `relation_type` is stored as `varchar(20)`
- backend returns directed relations from the current appeal to the linked appeal
- current response values are:
  `related`
  `parent_for`
  `subtask_for`
- `parent_for` means the current appeal is the parent and the linked appeal is the subtask
- `subtask_for` means the current appeal is the subtask and the linked appeal is the parent

### `POST /appeals/{appeal_id}/links`

Purpose: create a relation between two appeals.

Request body:

- `linked_appeal_id`
- `relation_type?`

Response `201`:

- created `AppealLink`

Rules:

- `relation_type` is stored as `varchar(20)`
- if `relation_type` is omitted, backend uses `related`
- allowed request values are `related` and `subtask`
- backend validates self-link protection
- backend validates uniqueness of the appeal pair
- for `related`, backend creates two rows:
  `(appeal -> linked, related)`
  `(linked -> appeal, related)`
- for `subtask`, backend treats the current appeal as the parent and creates:
  `(appeal -> linked, parent_for)`
  `(linked -> appeal, subtask_for)`

### `DELETE /appeals/{appeal_id}/links/{linked_appeal_id}`

Purpose: physically delete a relation between two appeals.

Response:

- `204`

## 11. Comment Reactions

Available reactions are delivered via `GET /bootstrap`.

### `POST /appeals/{appeal_id}/comments/{comment_id}/reactions`

Purpose: add reaction to a comment.

Request body:

- `reaction_id`

Response `201`:

- updated `Comment`

Rules:

- backend validates that `appeal_id`, `comment_id`, and `reaction_id` exist
- backend prevents duplicate `(comment_id, reaction_id)` pairs

### `DELETE /appeals/{appeal_id}/comments/{comment_id}/reactions/{reaction_id}`

Purpose: delete reaction from a comment.

Response:

- `204`

## 12. Current Out of Scope

The following items are not part of the current implementation contract:

- separate comment attachments API
- pagination contract
- unified JSON error format

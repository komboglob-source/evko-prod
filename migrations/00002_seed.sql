-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN

-- AUTHENTICATION --

INSERT INTO "auth"."Roles" (id, name, description) VALUES
    (1, 'admin',  'Администратор системы'),
    (2, 'ktp',    'Оператор КТП'),
    (3, 'wfm',    'Инженер WFM'),
    (4, 'client', 'Представитель клиента'),
    (5, 'ebko',   'Генеральный директор')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "auth"."Permissions" (id, name, description) VALUES
    -- Обращения
    (1,  'tickets.view_all',       'Просмотр всех обращений'),
    (2,  'tickets.view_own',       'Просмотр своих обращений'),
    (3,  'tickets.create',         'Создание обращений'),
    (4,  'tickets.edit',           'Редактирование обращений'),
    (5,  'tickets.change_status',  'Изменение статуса и критичности'),
    (6,  'tickets.comment',        'Добавление комментариев с медиа'),
    (7,  'tickets.assign',         'Назначение ответственного'),
    (8,  'tickets.subtask',        'Создание подзадач'),
    (9,  'tickets.time_track',     'Трекинг времени'),
    -- Сотрудники
    (10, 'employees.view',         'Просмотр списка сотрудников'),
    (11, 'employees.manage',       'Добавление/удаление/редактирование сотрудников'),
    (12, 'roles.manage',           'Управление ролями'),
    (13, 'employees.schedule',     'Управление отсутствиями и дежурствами'),
    -- Клиенты
    (14, 'clients.view',           'Просмотр клиентов и представителей'),
    (15, 'clients.manage',         'Создание и редактирование клиентов и представителей'),
    -- Площадки и оборудование
    (16, 'equipment.view',         'Просмотр оборудования'),
    (17, 'sites.view',             'Просмотр площадок'),
    (18, 'sites.manage',           'Создание/редактирование/удаление площадок'),
    (19, 'equipment.manage',       'Создание/редактирование/удаление оборудования'),
    (20, 'equipment.assign',       'Привязка оборудования к площадке'),
    -- Отчёты
    (21, 'reports.view',           'Формирование отчётов по времени'),
    (22, 'reports.download',       'Скачивание отчётов в Excel'),
    -- Доска задач
    (23, 'dashboard.manage',       'Просмотр/создание/редактирование/удаление дашбордов'),
    -- Профиль
    (24, 'profile.view',           'Просмотр профиля'),
    (25, 'profile.edit_photo',     'Редактирование фото профиля'),
    -- AHTUNG AHTUNG
    (27, 'ebko.selfdestroy',       'Удаление EBKO_CRM')
ON CONFLICT (id) DO NOTHING;

-- admin: все права
INSERT INTO "auth"."RolePermissions" (role_id, permission_id)
SELECT 1, id FROM "auth"."Permissions"
ON CONFLICT DO NOTHING;

-- ktp: обращения (все), сотрудники (просмотр + расписание), клиенты (просмотр),
--      площадки/оборудование (просмотр), отчёты, дашборды, профиль
INSERT INTO "auth"."RolePermissions" (role_id, permission_id) VALUES
    (2, 1),  -- tickets.view_all
    (2, 2),  -- tickets.view_own
    (2, 3),  -- tickets.create
    (2, 4),  -- tickets.edit
    (2, 5),  -- tickets.change_status
    (2, 6),  -- tickets.comment
    (2, 7),  -- tickets.assign
    (2, 8),  -- tickets.subtask
    (2, 9),  -- tickets.time_track
    (2, 10), -- employees.view
    (2, 13), -- employees.schedule
    (2, 14), -- clients.view
    (2, 16), -- equipment.view
    (2, 17), -- sites.view
    (2, 21), -- reports.view
    (2, 22), -- reports.download
    (2, 23), -- dashboard.manage
    (2, 24), -- profile.view
    (2, 25)  -- profile.edit_photo
ON CONFLICT DO NOTHING;

-- wfm: как ktp + управление оборудованием и привязка к площадке
INSERT INTO "auth"."RolePermissions" (role_id, permission_id) VALUES
    (3, 1),  -- tickets.view_all
    (3, 2),  -- tickets.view_own
    (3, 3),  -- tickets.create
    (3, 4),  -- tickets.edit
    (3, 5),  -- tickets.change_status
    (3, 6),  -- tickets.comment
    (3, 7),  -- tickets.assign
    (3, 8),  -- tickets.subtask
    (3, 9),  -- tickets.time_track
    (3, 10), -- employees.view
    (3, 13), -- employees.schedule
    (3, 14), -- clients.view
    (3, 16), -- equipment.view
    (3, 17), -- sites.view
    (3, 19), -- equipment.manage
    (3, 20), -- equipment.assign
    (3, 21), -- reports.view
    (3, 22), -- reports.download
    (3, 23), -- dashboard.manage
    (3, 24), -- profile.view
    (3, 25)  -- profile.edit_photo
ON CONFLICT DO NOTHING;

-- client: только свои обращения, просмотр клиентов/площадок/оборудования, дашборды
INSERT INTO "auth"."RolePermissions" (role_id, permission_id) VALUES
    (4, 2),  -- tickets.view_own
    (4, 3),  -- tickets.create
    (4, 4),  -- tickets.edit
    (4, 5),  -- tickets.change_status (Verified/Canceled)
    (4, 6),  -- tickets.comment
    (4, 14), -- clients.view (только себя — фильтрация на уровне API)
    (4, 16), -- equipment.view (только свои)
    (4, 17), -- sites.view (только свои)
    (4, 23)  -- dashboard.manage
ON CONFLICT DO NOTHING;

-- ebko: просмотр всего, отчёты
INSERT INTO "auth"."RolePermissions" (role_id, permission_id) VALUES
    (5, 1),  -- tickets.view_all
    (5, 10), -- employees.view
    (5, 11), -- employees.manage
    (5, 14), -- clients.view
    (5, 16), -- equipment.view
    (5, 17), -- sites.view
    (5, 21), -- reports.view
    (5, 22), -- reports.download
    (5, 23), -- dashboard.manage
    (5, 27)  -- ebko.selfdestroy
ON CONFLICT DO NOTHING;

INSERT INTO "auth"."Accounts" (login, password_hash, role_id) VALUES
    ('Admin',  '$2b$10$dkeluugj8FEkhEClmgQwPe.8vzncY8QsnhL1YBLDF6MSHvR9LcGuW', 1), -- admin password: "admin"
    ('Ktp',    '$2b$10$mwW12Og7TV5qMgEYz0xRg.tye6JM1NO/DAc4s.dCpwunZ/amsP8v.', 2), -- Ktp password: "ktp"
    ('Wfm',    '$2b$10$o910fZEQTSaxgX.59OZegO/rwcQz.JsAF4XRTAEIgHUsSCfSbrnxS', 3), -- Wfm password: "wfm"
    ('Client', '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4), -- Client password: "client"
    ('Ebko',   '$2b$10$1naMl.AAq6hdUAWBasAFLOmuoUlbXrRYUQO2NiNxYeCTdioa8u0Qu', 5) -- Ebko password: "ebko"
ON CONFLICT DO NOTHING;

-- PROFILES --

INSERT INTO "auth"."Accounts" (login, password_hash, role_id) VALUES
    ('Client2', '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4),
    ('North',   '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4)
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Egor Vlasov', '+7 (900) 100-10-10', 'admin@ebko.local', NULL, DATE '1988-05-16', 'CRM Administrator'
FROM "auth"."Accounts" WHERE login = 'Admin'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Ilya Novikov', '+7 (900) 101-10-10', 'ktp@ebko.local', NULL, DATE '1994-07-09', 'KTP Operator'
FROM "auth"."Accounts" WHERE login = 'Ktp'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Mark Gromov', '+7 (900) 102-10-10', 'wfm@ebko.local', NULL, DATE '1996-11-03', 'WFM Engineer'
FROM "auth"."Accounts" WHERE login = 'Wfm'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Irina Smirnova', '+7 (903) 111-11-11', 'i.smirnova@alpha-log.ru', NULL, DATE '1991-03-11', 'Client Representative'
FROM "auth"."Accounts" WHERE login = 'Client'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Oleg Ebko', '+7 (900) 104-10-10', 'ebko@ebko.local', NULL, DATE '1982-12-14', 'EBKO Director'
FROM "auth"."Accounts" WHERE login = 'Ebko'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Alexander Nesterov', '+7 (903) 111-11-12', 'a.nesterov@alpha-log.ru', NULL, DATE '1990-07-21', 'Client Representative'
FROM "auth"."Accounts" WHERE login = 'Client2'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Dmitriy Polyakov', '+7 (911) 123-45-67', 'd.polyakov@severnet.ru', NULL, DATE '1989-12-09', 'Client Representative'
FROM "auth"."Accounts" WHERE login = 'North'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2022-11-01' FROM "auth"."Accounts" WHERE login = 'Admin'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2023-02-15' FROM "auth"."Accounts" WHERE login = 'Ktp'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2023-06-20' FROM "auth"."Accounts" WHERE login = 'Wfm'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2021-09-01' FROM "auth"."Accounts" WHERE login = 'Ebko'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Clients" (id, name, address, ceo_id) VALUES
    (1, 'Alpha Logistik', 'Moscow, Letnyaya 16', (SELECT id FROM "auth"."Accounts" WHERE login = 'Client')),
    (2, 'Sever Net',      'Saint Petersburg, Rechnoy 7', (SELECT id FROM "auth"."Accounts" WHERE login = 'North'))
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 1 FROM "auth"."Accounts" WHERE login = 'Client'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 1 FROM "auth"."Accounts" WHERE login = 'Client2'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 2 FROM "auth"."Accounts" WHERE login = 'North'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Sites" (id, responsible_id, name, address) VALUES
    (1, (SELECT id FROM "auth"."Accounts" WHERE login = 'Client'),  'Letnyaya 18', 'Moscow, Letnyaya 18, office 11'),
    (2, (SELECT id FROM "auth"."Accounts" WHERE login = 'Client2'), 'Ilmenskaya 4', 'Moscow, Ilmenskaya 4'),
    (3, (SELECT id FROM "auth"."Accounts" WHERE login = 'North'),   'Novaya 51', 'Saint Petersburg, Novaya 51')
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Products" (id, name, description) VALUES
    (1, 'MKD', 'Multiservice access complex'),
    (2, 'Internet', 'Internet access service'),
    (3, 'IP Telephony', 'IP telephony service')
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."SitesProducts" (site_id, product_id) VALUES
    (1, 1),
    (1, 2),
    (2, 3),
    (3, 2)
ON CONFLICT DO NOTHING;

INSERT INTO "nri"."Equipment_Types" (id, name, description) VALUES
    (1, 'Subscriber Equipment', 'Customer side equipment'),
    (2, 'Passive Network Units', 'Passive infrastructure components'),
    (3, 'Switching Systems', 'Switching equipment'),
    (4, 'Software', 'Software components')
ON CONFLICT DO NOTHING;

INSERT INTO "nri"."ProductEquipment_Types" (product_id, equipment_type_id) VALUES
    (1, 3),
    (2, 3),
    (2, 1),
    (3, 4)
ON CONFLICT DO NOTHING;

INSERT INTO "nri"."Equipment" (id, type_id, site_id, serial_number, name, weight, description) VALUES
    (1, 3, 1, 'SN-10010000000123', 'MKD Gateway 24', 3.20, 'Access gateway for IP telephony'),
    (2, 3, 3, 'SN-20020000000456', 'Router B2B Pro', 2.70, 'Corporate routing equipment'),
    (3, 4, 2, 'SN-30030000000789', 'IP PBX Core License', 0.00, 'Core virtual PBX license'),
    (4, 1, 2, 'SN-40040000000111', 'ONU CPE-8', 1.40, 'Reserve subscriber device')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Type" (id, name) VALUES
    (1, 'KTP'),
    (2, 'WFM')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Status" (id, name) VALUES
    (1, 'Created'),
    (2, 'Opened'),
    (3, 'Customer Pending'),
    (4, 'Done'),
    (5, 'Verified')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Criticality" (id, name, deadline) VALUES
    (1, 'Basic', INTERVAL '30 days'),
    (2, 'Important', INTERVAL '15 days'),
    (3, 'Critical', INTERVAL '1 day')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Reactions" (id, name, picture) VALUES
    (1, 'like', convert_to('like', 'UTF8')),
    (2, 'dislike', convert_to('dislike', 'UTF8')),
    (3, 'done', convert_to('done', 'UTF8'))
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Tickets" (
    id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
    created_at, created_by, updated_at, updated_by, responsible_id
) VALUES
    (1, 'CRM-1001', 'Periodic internet outages on Letnyaya 18 site.', 1, 2, 3, 1, 1, 2, TIMESTAMPTZ '2026-02-12T08:10:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Client'), TIMESTAMPTZ '2026-02-24T10:30:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp'), (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp')),
    (2, 'CRM-1002', 'Outgoing IP telephony calls fail with 503.', 1, 2, 2, 2, 3, 3, TIMESTAMPTZ '2026-02-18T12:00:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'North'), TIMESTAMPTZ '2026-02-24T09:10:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp'), (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp')),
    (3, 'WORK-2001', 'Engineer dispatch to Letnyaya 18 for onsite diagnostics.', 2, 2, 2, 1, 1, 2, TIMESTAMPTZ '2026-02-20T14:05:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp'), TIMESTAMPTZ '2026-02-24T07:35:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'), (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm')),
    (4, 'CRM-1003', 'Consultation about new internal numbers and call routing.', 1, 3, 1, 1, 2, 3, TIMESTAMPTZ '2026-02-22T11:15:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Client2'), TIMESTAMPTZ '2026-02-24T06:45:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp'), (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp')),
    (5, 'WORK-2002', 'Planned replacement of the old router in Saint Petersburg.', 2, 4, 1, 2, 3, 2, TIMESTAMPTZ '2026-02-10T08:00:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'), TIMESTAMPTZ '2026-02-23T16:20:00Z', (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'), (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'))
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."ConnectedTickets" (first_task_id, second_task_id, relation_type) VALUES
    (1, 3, 'related')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."Comments" (id, ticket_id, is_closed_comment, created_by, created_at, updated_at, contents) VALUES
    (1, 1, FALSE, (SELECT id FROM "auth"."Accounts" WHERE login = 'Client'), TIMESTAMPTZ '2026-02-23T09:12:00Z', TIMESTAMPTZ '2026-02-23T09:12:00Z', 'Confirmed the problem, outages happened three times yesterday.'),
    (2, 1, FALSE, (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp'), TIMESTAMPTZ '2026-02-24T10:30:00Z', TIMESTAMPTZ '2026-02-24T10:30:00Z', 'Collected logs from the router and prepared the report template.'),
    (3, 3, FALSE, (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'), TIMESTAMPTZ '2026-02-24T07:35:00Z', TIMESTAMPTZ '2026-02-24T07:35:00Z', 'Engineer will be onsite from 11:00, waiting for access to the server room.'),
    (4, 5, TRUE,  (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm'), TIMESTAMPTZ '2026-02-23T16:20:00Z', TIMESTAMPTZ '2026-02-23T16:20:00Z', 'Replacement completed, issue resolved.')
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."CommentsReactions" (comment_id, reaction_id) VALUES
    (1, 1),
    (2, 3),
    (4, 3)
ON CONFLICT DO NOTHING;

PERFORM setval(pg_get_serial_sequence('"crm"."Clients"', 'id'), COALESCE((SELECT MAX(id) FROM "crm"."Clients"), 1), true);
PERFORM setval(pg_get_serial_sequence('"crm"."Sites"', 'id'), COALESCE((SELECT MAX(id) FROM "crm"."Sites"), 1), true);
PERFORM setval(pg_get_serial_sequence('"crm"."Products"', 'id'), COALESCE((SELECT MAX(id) FROM "crm"."Products"), 1), true);
PERFORM setval(pg_get_serial_sequence('"nri"."Equipment_Types"', 'id'), COALESCE((SELECT MAX(id) FROM "nri"."Equipment_Types"), 1), true);
PERFORM setval(pg_get_serial_sequence('"nri"."Equipment"', 'id'), COALESCE((SELECT MAX(id) FROM "nri"."Equipment"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Type"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Type"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Status"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Status"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Criticality"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Criticality"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Tickets"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Tickets"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Comments"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Comments"), 1), true);



END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM "auth"."RolePermissions" WHERE role_id IN (1, 2, 3, 4, 5);
DELETE FROM "auth"."Permissions" WHERE id BETWEEN 1 AND 27;
DELETE FROM "auth"."Roles" WHERE id IN (1, 2, 3, 4, 5);

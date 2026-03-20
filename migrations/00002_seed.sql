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



END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM "auth"."RolePermissions" WHERE role_id IN (1, 2, 3, 4, 5);
DELETE FROM "auth"."Permissions" WHERE id BETWEEN 1 AND 27;
DELETE FROM "auth"."Roles" WHERE id IN (1, 2, 3, 4, 5);

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN

INSERT INTO "auth"."Accounts" (login, password_hash, role_id) VALUES
    ('KtpBackup', '$2b$10$mwW12Og7TV5qMgEYz0xRg.tye6JM1NO/DAc4s.dCpwunZ/amsP8v.', 2),
    ('WfmLead',   '$2b$10$o910fZEQTSaxgX.59OZegO/rwcQz.JsAF4XRTAEIgHUsSCfSbrnxS', 3),
    ('South',     '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4),
    ('Delta',     '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4),
    ('Vector',    '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe', 4)
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Анна Белова', '+7 (900) 105-10-10', 'ktp-backup@ebko.local', NULL, DATE '1995-02-19', 'Оператор КТП'
FROM "auth"."Accounts" WHERE login = 'KtpBackup'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Сергей Климов', '+7 (900) 106-10-10', 'wfm-lead@ebko.local', NULL, DATE '1991-08-30', 'Старший инженер WFM'
FROM "auth"."Accounts" WHERE login = 'WfmLead'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Юлия Черкасова', '+7 (912) 555-10-10', 'y.cherkasova@south-service.ru', NULL, DATE '1993-06-07', 'Представитель заказчика'
FROM "auth"."Accounts" WHERE login = 'South'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Павел Егоров', '+7 (913) 555-20-20', 'p.egorov@delta-retail.ru', NULL, DATE '1988-09-22', 'Представитель заказчика'
FROM "auth"."Accounts" WHERE login = 'Delta'
ON CONFLICT DO NOTHING;

INSERT INTO "profiles"."Profiles" (account_id, full_name, phone_number, email, image, birth_date, position)
SELECT id, 'Наталья Ларионова', '+7 (914) 555-30-30', 'n.larionova@vector-warehouse.ru', NULL, DATE '1990-12-13', 'Представитель заказчика'
FROM "auth"."Accounts" WHERE login = 'Vector'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2024-03-18' FROM "auth"."Accounts" WHERE login = 'KtpBackup'
ON CONFLICT DO NOTHING;

INSERT INTO "hrm"."Employees" (account_id, hire_date)
SELECT id, DATE '2022-05-12' FROM "auth"."Accounts" WHERE login = 'WfmLead'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Clients" (id, name, address, ceo_id) VALUES
    (3, 'Южные Телеком Сервисы', 'Краснодар, улица Южная, 3', (SELECT id FROM "auth"."Accounts" WHERE login = 'South')),
    (4, 'Дельта Ритейл', 'Екатеринбург, улица Складская, 21', (SELECT id FROM "auth"."Accounts" WHERE login = 'Delta')),
    (5, 'Вектор Склад', 'Новосибирск, улица Индустриальная, 44', (SELECT id FROM "auth"."Accounts" WHERE login = 'Vector'))
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 3 FROM "auth"."Accounts" WHERE login = 'South'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 4 FROM "auth"."Accounts" WHERE login = 'Delta'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Representatives" (account_id, client_id)
SELECT id, 5 FROM "auth"."Accounts" WHERE login = 'Vector'
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."Sites" (id, responsible_id, name, address) VALUES
    (4, (SELECT id FROM "auth"."Accounts" WHERE login = 'Client2'), 'Лобачевского 12', 'Москва, улица Лобачевского, 12'),
    (5, (SELECT id FROM "auth"."Accounts" WHERE login = 'North'),   'Промышленная 8', 'Санкт-Петербург, улица Промышленная, 8'),
    (6, (SELECT id FROM "auth"."Accounts" WHERE login = 'South'),   'Южная 3', 'Краснодар, улица Южная, 3'),
    (7, (SELECT id FROM "auth"."Accounts" WHERE login = 'Delta'),   'Складская 21', 'Екатеринбург, улица Складская, 21'),
    (8, (SELECT id FROM "auth"."Accounts" WHERE login = 'Vector'),  'Индустриальная 44', 'Новосибирск, улица Индустриальная, 44'),
    (9, (SELECT id FROM "auth"."Accounts" WHERE login = 'South'),   'Набережная 6', 'Краснодар, Набережная улица, 6')
ON CONFLICT DO NOTHING;

INSERT INTO "crm"."SitesProducts" (site_id, product_id) VALUES
    (4, 1),
    (4, 3),
    (5, 1),
    (5, 2),
    (6, 2),
    (6, 3),
    (7, 1),
    (7, 2),
    (8, 1),
    (8, 3),
    (9, 1),
    (9, 2),
    (9, 3)
ON CONFLICT DO NOTHING;

INSERT INTO "nri"."Equipment" (id, type_id, site_id, serial_number, name, weight, description) VALUES
    (5, 3, 4, 'SN-50050000000222', 'Коммутатор доступа AS-48', 4.80, 'Коммутатор доступа для расширения сервиса МКД и IP-телефонии.'),
    (6, 1, 5, 'SN-60060000000333', 'ONT GPON-24', 1.10, 'Абонентский терминал для подключения резервного интернет-канала.'),
    (7, 4, 6, 'SN-70070000000444', 'Лицензия Softswitch Branch', 0.00, 'Лицензия на дополнительный узел IP-телефонии.'),
    (8, 3, 7, 'SN-80080000000555', 'Маршрутизатор Edge X', 2.40, 'Маршрутизатор для основной B2B-площадки заказчика.'),
    (9, 2, 8, 'SN-90090000000666', 'Оптический кросс 19U', 6.30, 'Пассивный оптический кросс для стойки на площадке клиента.'),
    (10, 3, 9, 'SN-10100000000777', 'Core Switch 10G', 5.10, 'Ядровой коммутатор для агрегации каналов и телефонии.'),
    (11, 1, 6, 'SN-11110000000888', 'Резервный ONU-16', 0.90, 'Резервное абонентское устройство для аварийной замены.'),
    (12, 3, 7, 'SN-12120000000999', 'Шлюз телефонии TG-8', 1.70, 'Шлюз для подключения аналоговых линий на складе.'),
    (13, 4, 8, 'SN-13130000001010', 'Monitoring Agent Pro', 0.00, 'Программный агент мониторинга для удалённой диагностики площадки.'),
    (14, 2, 5, 'SN-14140000001111', 'Пассивный сплиттер 1x8', 0.40, 'Пассивный сплиттер для переразвода оптической линии.')
ON CONFLICT DO NOTHING;

WITH seeded_tickets (
    id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
    created_at, created_login, updated_at, updated_login, responsible_login
) AS (
    VALUES
        (6,  'CRM-1004', 'Заказчик сообщает о кратковременных обрывах интернет-канала в рабочее время.', 1, 1, 1, 1, 1, 2, '2026-02-25T08:15:00Z', 'Client',   '2026-02-25T08:15:00Z', 'Client',   'Ktp'),
        (7,  'CRM-1005', 'Необходимо проверить нестабильность сервиса интернет на основной площадке клиента.', 1, 1, 2, 2, 3, 2, '2026-02-25T09:30:00Z', 'North',    '2026-02-25T09:30:00Z', 'North',    'KtpBackup'),
        (8,  'CRM-1006', 'Критичное обращение по потере связи на южной площадке заказчика.', 1, 1, 3, 3, 6, 2, '2026-02-25T10:45:00Z', 'South',    '2026-02-25T10:45:00Z', 'South',    'Ktp'),
        (9,  'CRM-1007', 'Требуется открыть диагностику по качеству голосовой связи на IP-телефонии.', 1, 2, 1, 1, 2, 3, '2026-02-26T08:20:00Z', 'Client2',  '2026-02-26T09:00:00Z', 'Ktp',      'Ktp'),
        (10, 'CRM-1008', 'Открыта заявка на нестабильную работу интернет-доступа в торговой зоне склада.', 1, 2, 2, 4, 7, 1, '2026-02-26T09:10:00Z', 'Delta',    '2026-02-26T10:40:00Z', 'KtpBackup','KtpBackup'),
        (11, 'CRM-1009', 'Срочное обращение по деградации сервиса на новосибирской площадке.', 1, 2, 3, 5, 8, 1, '2026-02-26T10:00:00Z', 'Vector',   '2026-02-26T10:25:00Z', 'Ktp',      'Ktp'),
        (12, 'CRM-1010', 'Ожидаем данные от клиента по схеме подключения и последним изменениям.', 1, 3, 1, 2, 5, 1, '2026-02-27T08:10:00Z', 'North',    '2026-02-27T08:55:00Z', 'KtpBackup','KtpBackup'),
        (13, 'CRM-1011', 'Поставлена на удержание заявка до подтверждения конфигурации IP-телефонии.', 1, 3, 2, 3, 9, 3, '2026-02-27T09:20:00Z', 'South',    '2026-02-27T10:05:00Z', 'Ktp',      'Ktp'),
        (14, 'CRM-1012', 'Критичное обращение ожидает подтверждения контактного лица и окна работ.', 1, 3, 3, 1, 4, 3, '2026-02-27T11:00:00Z', 'Client2',  '2026-02-27T11:25:00Z', 'KtpBackup','KtpBackup'),
        (15, 'CRM-1013', 'Заявка закрыта после консультации по параметрам услуги интернет.', 1, 4, 1, 4, 7, 2, '2026-02-28T08:05:00Z', 'Delta',    '2026-02-28T12:10:00Z', 'Ktp',      'Ktp'),
        (16, 'CRM-1014', 'Исполнено обращение по перенастройке телефонии и подтверждено со стороны клиента.', 1, 4, 2, 5, 8, 3, '2026-02-28T09:40:00Z', 'Vector',   '2026-02-28T13:15:00Z', 'KtpBackup','KtpBackup'),
        (17, 'CRM-1015', 'Критичная заявка выполнена после восстановления связи на северной площадке.', 1, 4, 3, 2, 3, 2, '2026-02-28T10:50:00Z', 'North',    '2026-02-28T14:30:00Z', 'Ktp',      'Ktp'),
        (18, 'CRM-1016', 'Клиент подтвердил качество услуги после устранения замечаний по сервису МКД.', 1, 5, 1, 1, 1, 1, '2026-03-01T08:00:00Z', 'Client',   '2026-03-01T10:20:00Z', 'Ktp',      'Ktp'),
        (19, 'CRM-1017', 'Подтверждено выполнение обращения по южной площадке и закрыт вопрос по IP-телефонии.', 1, 5, 2, 3, 6, 3, '2026-03-01T09:15:00Z', 'South',    '2026-03-01T11:40:00Z', 'KtpBackup','KtpBackup'),
        (20, 'CRM-1018', 'Проверка завершена, клиент верифицировал восстановление интернет-канала.', 1, 5, 3, 2, 5, 2, '2026-03-01T10:30:00Z', 'North',    '2026-03-01T12:50:00Z', 'Ktp',      'Ktp'),
        (21, 'WORK-2003', 'Создан выездной наряд для осмотра узла связи на площадке Летняя 18.', 2, 1, 1, 1, 1, 2, '2026-03-02T08:00:00Z', 'Ktp',       '2026-03-02T08:00:00Z', 'Ktp',       'Wfm'),
        (22, 'WORK-2004', 'Подготовлен новый наряд на обследование коммутатора на промышленной площадке.', 2, 1, 2, 2, 5, 1, '2026-03-02T08:45:00Z', 'KtpBackup', '2026-03-02T08:45:00Z', 'KtpBackup', 'WfmLead'),
        (23, 'WORK-2005', 'Срочный выезд для диагностики телефонного узла на южной площадке.', 2, 1, 3, 3, 6, 3, '2026-03-02T09:30:00Z', 'Ktp',       '2026-03-02T09:30:00Z', 'Ktp',       'Wfm'),
        (24, 'WORK-2006', 'Наряд открыт для замены абонентского оборудования и осмотра трассы.', 2, 2, 1, 1, 4, 1, '2026-03-03T08:20:00Z', 'KtpBackup', '2026-03-03T09:10:00Z', 'Wfm',       'Wfm'),
        (25, 'WORK-2007', 'Инженерская задача в работе по проверке резервного канала на складе.', 2, 2, 2, 4, 7, 2, '2026-03-03T09:10:00Z', 'Ktp',       '2026-03-03T11:20:00Z', 'WfmLead',   'WfmLead'),
        (26, 'WORK-2008', 'Критичный выезд на новосибирскую площадку для замены программного агента.', 2, 2, 3, 5, 8, 3, '2026-03-03T10:00:00Z', 'KtpBackup', '2026-03-03T10:55:00Z', 'Wfm',       'Wfm'),
        (27, 'WORK-2009', 'Ожидается подтверждение окна работ по северной площадке от клиента.', 2, 3, 1, 2, 3, 2, '2026-03-04T08:15:00Z', 'Ktp',       '2026-03-04T10:05:00Z', 'WfmLead',   'WfmLead'),
        (28, 'WORK-2010', 'Наряд ожидает допуска на площадку для выполнения работ по сервису МКД.', 2, 3, 2, 3, 9, 1, '2026-03-04T09:00:00Z', 'KtpBackup', '2026-03-04T10:30:00Z', 'Wfm',       'Wfm'),
        (29, 'WORK-2011', 'Критичный наряд на ожидании доступа в серверную комнату клиента.', 2, 3, 3, 1, 2, 3, '2026-03-04T10:10:00Z', 'Ktp',       '2026-03-04T11:40:00Z', 'WfmLead',   'WfmLead'),
        (30, 'WORK-2012', 'Работы выполнены, произведена замена оборудования на складе заказчика.', 2, 4, 1, 4, 7, 1, '2026-03-05T08:05:00Z', 'KtpBackup', '2026-03-05T14:00:00Z', 'Wfm',       'Wfm'),
        (31, 'WORK-2013', 'Исполнен выезд по обновлению конфигурации оборудования на площадке клиента.', 2, 4, 2, 5, 8, 1, '2026-03-05T08:50:00Z', 'Ktp',       '2026-03-05T15:30:00Z', 'WfmLead',   'WfmLead'),
        (32, 'WORK-2014', 'Критичное выездное задание завершено после восстановления интернет-сервиса.', 2, 4, 3, 2, 5, 2, '2026-03-05T09:40:00Z', 'KtpBackup', '2026-03-05T16:10:00Z', 'Wfm',       'Wfm'),
        (33, 'WORK-2015', 'Клиент подтвердил качество выполненных работ по площадке Лобачевского 12.', 2, 5, 1, 1, 4, 3, '2026-03-06T08:00:00Z', 'Ktp',       '2026-03-06T11:15:00Z', 'Wfm',       'Wfm'),
        (34, 'WORK-2016', 'Проверка завершена, подтверждено восстановление сервиса на южной площадке.', 2, 5, 2, 3, 6, 2, '2026-03-06T09:20:00Z', 'KtpBackup', '2026-03-06T12:25:00Z', 'WfmLead',   'WfmLead'),
        (35, 'WORK-2017', 'Критичный выезд закрыт после подтверждения устойчивой работы канала связи.', 2, 5, 3, 2, 3, 2, '2026-03-06T10:10:00Z', 'Ktp',       '2026-03-06T13:40:00Z', 'Wfm',       'Wfm')
)
INSERT INTO "tasks"."Tickets" (
    id, title, description, type_id, status_id, criticality_id, client_id, site_id, product_id,
    created_at, created_by, updated_at, updated_by, responsible_id
)
SELECT
    seeded_tickets.id,
    seeded_tickets.title,
    seeded_tickets.description,
    seeded_tickets.type_id,
    seeded_tickets.status_id,
    seeded_tickets.criticality_id,
    seeded_tickets.client_id,
    seeded_tickets.site_id,
    seeded_tickets.product_id,
    seeded_tickets.created_at::timestamptz,
    created_accounts.id,
    seeded_tickets.updated_at::timestamptz,
    updated_accounts.id,
    responsible_accounts.id
FROM seeded_tickets
JOIN "auth"."Accounts" created_accounts ON created_accounts.login = seeded_tickets.created_login
JOIN "auth"."Accounts" updated_accounts ON updated_accounts.login = seeded_tickets.updated_login
JOIN "auth"."Accounts" responsible_accounts ON responsible_accounts.login = seeded_tickets.responsible_login
ON CONFLICT DO NOTHING;

WITH seeded_links (first_task_id, second_task_id, relation_type) AS (
    VALUES
        (9, 24, 'parent_for'),
        (24, 9, 'subtask_for'),
        (10, 25, 'parent_for'),
        (25, 10, 'subtask_for'),
        (13, 28, 'related'),
        (28, 13, 'related')
)
INSERT INTO "tasks"."ConnectedTickets" (first_task_id, second_task_id, relation_type)
SELECT first_task_id, second_task_id, relation_type
FROM seeded_links
ON CONFLICT DO NOTHING;

WITH seeded_comments (id, ticket_id, is_closed_comment, created_login, created_at, updated_at, contents) AS (
    VALUES
        (5,  6,  FALSE, 'Client',   '2026-02-25T08:25:00Z', '2026-02-25T08:25:00Z', 'Проблема проявляется в пиковые часы, просим ускорить диагностику.'),
        (6,  9,  FALSE, 'Ktp',      '2026-02-26T09:05:00Z', '2026-02-26T09:05:00Z', 'Запросил у заказчика трассировки и проверяю состояние шлюза телефонии.'),
        (7, 13,  FALSE, 'South',    '2026-02-27T09:35:00Z', '2026-02-27T09:35:00Z', 'Схема подключения отправлена, ждём уточнения по времени окна работ.'),
        (8, 24,  FALSE, 'Wfm',      '2026-03-03T09:30:00Z', '2026-03-03T09:30:00Z', 'Инженер выехал на площадку, ожидаем подтверждение допуска.'),
        (9, 29,  FALSE, 'WfmLead',  '2026-03-04T11:10:00Z', '2026-03-04T11:10:00Z', 'Подготовили резервный комплект оборудования на случай аварийной замены.'),
        (10, 31, TRUE,  'WfmLead',  '2026-03-05T15:35:00Z', '2026-03-05T15:35:00Z', 'Работы завершены, сервис восстановлен и проверен совместно с заказчиком.'),
        (11, 18, TRUE,  'Client',   '2026-03-01T10:25:00Z', '2026-03-01T10:25:00Z', 'Подтверждаем, качество услуги восстановлено, заявку можно закрывать.'),
        (12, 35, TRUE,  'Wfm',      '2026-03-06T13:45:00Z', '2026-03-06T13:45:00Z', 'Канал работает стабильно, аварийных событий после выезда не фиксируется.')
)
INSERT INTO "tasks"."Comments" (id, ticket_id, is_closed_comment, created_by, created_at, updated_at, contents)
SELECT
    seeded_comments.id,
    seeded_comments.ticket_id,
    seeded_comments.is_closed_comment,
    created_accounts.id,
    seeded_comments.created_at::timestamptz,
    seeded_comments.updated_at::timestamptz,
    seeded_comments.contents
FROM seeded_comments
JOIN "auth"."Accounts" created_accounts ON created_accounts.login = seeded_comments.created_login
ON CONFLICT DO NOTHING;

INSERT INTO "tasks"."CommentsReactions" (comment_id, reaction_id) VALUES
    (5, 1),
    (8, 1),
    (10, 3),
    (11, 3),
    (12, 3)
ON CONFLICT DO NOTHING;

PERFORM setval(pg_get_serial_sequence('"crm"."Clients"', 'id'), COALESCE((SELECT MAX(id) FROM "crm"."Clients"), 1), true);
PERFORM setval(pg_get_serial_sequence('"crm"."Sites"', 'id'), COALESCE((SELECT MAX(id) FROM "crm"."Sites"), 1), true);
PERFORM setval(pg_get_serial_sequence('"nri"."Equipment"', 'id'), COALESCE((SELECT MAX(id) FROM "nri"."Equipment"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Tickets"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Tickets"), 1), true);
PERFORM setval(pg_get_serial_sequence('"tasks"."Comments"', 'id'), COALESCE((SELECT MAX(id) FROM "tasks"."Comments"), 1), true);

END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM "tasks"."CommentsReactions" WHERE comment_id BETWEEN 5 AND 12;
DELETE FROM "tasks"."Comments" WHERE id BETWEEN 5 AND 12;
DELETE FROM "tasks"."ConnectedTickets"
WHERE (first_task_id BETWEEN 9 AND 28 OR second_task_id BETWEEN 9 AND 28)
  AND (
      (first_task_id = 9 AND second_task_id = 24) OR
      (first_task_id = 24 AND second_task_id = 9) OR
      (first_task_id = 10 AND second_task_id = 25) OR
      (first_task_id = 25 AND second_task_id = 10) OR
      (first_task_id = 13 AND second_task_id = 28) OR
      (first_task_id = 28 AND second_task_id = 13)
  );
DELETE FROM "tasks"."Tickets" WHERE id BETWEEN 6 AND 35;
DELETE FROM "nri"."Equipment" WHERE id BETWEEN 5 AND 14;
DELETE FROM "crm"."SitesProducts" WHERE site_id BETWEEN 4 AND 9;
DELETE FROM "crm"."Sites" WHERE id BETWEEN 4 AND 9;
DELETE FROM "crm"."Representatives"
WHERE account_id IN (
    SELECT id FROM "auth"."Accounts" WHERE login IN ('South', 'Delta', 'Vector')
);
DELETE FROM "crm"."Clients" WHERE id IN (3, 4, 5);
DELETE FROM "hrm"."Employees"
WHERE account_id IN (
    SELECT id FROM "auth"."Accounts" WHERE login IN ('KtpBackup', 'WfmLead')
);
DELETE FROM "profiles"."Profiles"
WHERE account_id IN (
    SELECT id FROM "auth"."Accounts" WHERE login IN ('KtpBackup', 'WfmLead', 'South', 'Delta', 'Vector')
);
DELETE FROM "auth"."Accounts" WHERE login IN ('KtpBackup', 'WfmLead', 'South', 'Delta', 'Vector');

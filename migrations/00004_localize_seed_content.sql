-- +goose Up
-- +goose StatementBegin
UPDATE "profiles"."Profiles" profiles
SET full_name = 'Егор Власов',
    position = 'Администратор CRM'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Admin')
  AND profiles.full_name = 'Egor Vlasov'
  AND COALESCE(profiles.position, '') = 'CRM Administrator';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Илья Новиков',
    position = 'Оператор КТП'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp')
  AND profiles.full_name = 'Ilya Novikov'
  AND COALESCE(profiles.position, '') = 'KTP Operator';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Марк Громов',
    position = 'Инженер WFM'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm')
  AND profiles.full_name = 'Mark Gromov'
  AND COALESCE(profiles.position, '') = 'WFM Engineer';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Ирина Смирнова',
    position = 'Представитель заказчика'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Client')
  AND profiles.full_name = 'Irina Smirnova'
  AND COALESCE(profiles.position, '') = 'Client Representative';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Олег ЕБКО',
    position = 'Генеральный директор ЕБКО'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Ebko')
  AND profiles.full_name = 'Oleg Ebko'
  AND COALESCE(profiles.position, '') = 'EBKO Director';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Александр Нестеров',
    position = 'Представитель заказчика'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Client2')
  AND profiles.full_name = 'Alexander Nesterov'
  AND COALESCE(profiles.position, '') = 'Client Representative';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Дмитрий Поляков',
    position = 'Представитель заказчика'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'North')
  AND profiles.full_name = 'Dmitriy Polyakov'
  AND COALESCE(profiles.position, '') = 'Client Representative';

UPDATE "crm"."Clients"
SET name = 'Альфа Логистик',
    address = 'Москва, улица Летняя, 16'
WHERE id = 1
  AND name = 'Alpha Logistik'
  AND address = 'Moscow, Letnyaya 16';

UPDATE "crm"."Clients"
SET name = 'Север Нет',
    address = 'Санкт-Петербург, Речной проспект, 7'
WHERE id = 2
  AND name = 'Sever Net'
  AND address = 'Saint Petersburg, Rechnoy 7';

UPDATE "crm"."Sites"
SET name = 'Летняя 18',
    address = 'Москва, улица Летняя, 18, офис 11'
WHERE id = 1
  AND name = 'Letnyaya 18'
  AND address = 'Moscow, Letnyaya 18, office 11';

UPDATE "crm"."Sites"
SET name = 'Ильменская 4',
    address = 'Москва, улица Ильменская, 4'
WHERE id = 2
  AND name = 'Ilmenskaya 4'
  AND address = 'Moscow, Ilmenskaya 4';

UPDATE "crm"."Sites"
SET name = 'Новая 51',
    address = 'Санкт-Петербург, улица Новая, 51'
WHERE id = 3
  AND name = 'Novaya 51'
  AND address = 'Saint Petersburg, Novaya 51';

UPDATE "tasks"."Tickets"
SET description = 'Периодически пропадает связь по услуге интернет на площадке Летняя 18.'
WHERE id = 1
  AND description = 'Periodic internet outages on Letnyaya 18 site.';

UPDATE "tasks"."Tickets"
SET description = 'Исходящие вызовы IP-телефонии завершаются ошибкой 503.'
WHERE id = 2
  AND description = 'Outgoing IP telephony calls fail with 503.';

UPDATE "tasks"."Tickets"
SET description = 'Выезд инженера на площадку Летняя 18 для очной диагностики.'
WHERE id = 3
  AND description = 'Engineer dispatch to Letnyaya 18 for onsite diagnostics.';

UPDATE "tasks"."Tickets"
SET description = 'Консультация по новым внутренним номерам и маршрутизации звонков.'
WHERE id = 4
  AND description = 'Consultation about new internal numbers and call routing.';

UPDATE "tasks"."Tickets"
SET description = 'Плановая замена старого маршрутизатора на площадке в Санкт-Петербурге.'
WHERE id = 5
  AND description = 'Planned replacement of the old router in Saint Petersburg.';

UPDATE "tasks"."Comments"
SET contents = 'Подтверждаю проблему, вчера связь пропадала три раза.'
WHERE id = 1
  AND contents = 'Confirmed the problem, outages happened three times yesterday.';

UPDATE "tasks"."Comments"
SET contents = 'Собрал логи с маршрутизатора и подготовил шаблон отчёта.'
WHERE id = 2
  AND contents = 'Collected logs from the router and prepared the report template.';

UPDATE "tasks"."Comments"
SET contents = 'Инженер будет на площадке с 11:00, ожидаем доступ в серверную.'
WHERE id = 3
  AND contents = 'Engineer will be onsite from 11:00, waiting for access to the server room.';

UPDATE "tasks"."Comments"
SET contents = 'Замена выполнена, проблема устранена.'
WHERE id = 4
  AND contents = 'Replacement completed, issue resolved.';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
UPDATE "profiles"."Profiles" profiles
SET full_name = 'Egor Vlasov',
    position = 'CRM Administrator'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Admin')
  AND profiles.full_name = 'Егор Власов'
  AND COALESCE(profiles.position, '') = 'Администратор CRM';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Ilya Novikov',
    position = 'KTP Operator'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Ktp')
  AND profiles.full_name = 'Илья Новиков'
  AND COALESCE(profiles.position, '') = 'Оператор КТП';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Mark Gromov',
    position = 'WFM Engineer'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Wfm')
  AND profiles.full_name = 'Марк Громов'
  AND COALESCE(profiles.position, '') = 'Инженер WFM';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Irina Smirnova',
    position = 'Client Representative'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Client')
  AND profiles.full_name = 'Ирина Смирнова'
  AND COALESCE(profiles.position, '') = 'Представитель заказчика';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Oleg Ebko',
    position = 'EBKO Director'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Ebko')
  AND profiles.full_name = 'Олег ЕБКО'
  AND COALESCE(profiles.position, '') = 'Генеральный директор ЕБКО';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Alexander Nesterov',
    position = 'Client Representative'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'Client2')
  AND profiles.full_name = 'Александр Нестеров'
  AND COALESCE(profiles.position, '') = 'Представитель заказчика';

UPDATE "profiles"."Profiles" profiles
SET full_name = 'Dmitriy Polyakov',
    position = 'Client Representative'
WHERE profiles.account_id = (SELECT id FROM "auth"."Accounts" WHERE login = 'North')
  AND profiles.full_name = 'Дмитрий Поляков'
  AND COALESCE(profiles.position, '') = 'Представитель заказчика';

UPDATE "crm"."Clients"
SET name = 'Alpha Logistik',
    address = 'Moscow, Letnyaya 16'
WHERE id = 1
  AND name = 'Альфа Логистик'
  AND address = 'Москва, улица Летняя, 16';

UPDATE "crm"."Clients"
SET name = 'Sever Net',
    address = 'Saint Petersburg, Rechnoy 7'
WHERE id = 2
  AND name = 'Север Нет'
  AND address = 'Санкт-Петербург, Речной проспект, 7';

UPDATE "crm"."Sites"
SET name = 'Letnyaya 18',
    address = 'Moscow, Letnyaya 18, office 11'
WHERE id = 1
  AND name = 'Летняя 18'
  AND address = 'Москва, улица Летняя, 18, офис 11';

UPDATE "crm"."Sites"
SET name = 'Ilmenskaya 4',
    address = 'Moscow, Ilmenskaya 4'
WHERE id = 2
  AND name = 'Ильменская 4'
  AND address = 'Москва, улица Ильменская, 4';

UPDATE "crm"."Sites"
SET name = 'Novaya 51',
    address = 'Saint Petersburg, Novaya 51'
WHERE id = 3
  AND name = 'Новая 51'
  AND address = 'Санкт-Петербург, улица Новая, 51';

UPDATE "tasks"."Tickets"
SET description = 'Periodic internet outages on Letnyaya 18 site.'
WHERE id = 1
  AND description = 'Периодически пропадает связь по услуге интернет на площадке Летняя 18.';

UPDATE "tasks"."Tickets"
SET description = 'Outgoing IP telephony calls fail with 503.'
WHERE id = 2
  AND description = 'Исходящие вызовы IP-телефонии завершаются ошибкой 503.';

UPDATE "tasks"."Tickets"
SET description = 'Engineer dispatch to Letnyaya 18 for onsite diagnostics.'
WHERE id = 3
  AND description = 'Выезд инженера на площадку Летняя 18 для очной диагностики.';

UPDATE "tasks"."Tickets"
SET description = 'Consultation about new internal numbers and call routing.'
WHERE id = 4
  AND description = 'Консультация по новым внутренним номерам и маршрутизации звонков.';

UPDATE "tasks"."Tickets"
SET description = 'Planned replacement of the old router in Saint Petersburg.'
WHERE id = 5
  AND description = 'Плановая замена старого маршрутизатора на площадке в Санкт-Петербурге.';

UPDATE "tasks"."Comments"
SET contents = 'Confirmed the problem, outages happened three times yesterday.'
WHERE id = 1
  AND contents = 'Подтверждаю проблему, вчера связь пропадала три раза.';

UPDATE "tasks"."Comments"
SET contents = 'Collected logs from the router and prepared the report template.'
WHERE id = 2
  AND contents = 'Собрал логи с маршрутизатора и подготовил шаблон отчёта.';

UPDATE "tasks"."Comments"
SET contents = 'Engineer will be onsite from 11:00, waiting for access to the server room.'
WHERE id = 3
  AND contents = 'Инженер будет на площадке с 11:00, ожидаем доступ в серверную.';

UPDATE "tasks"."Comments"
SET contents = 'Replacement completed, issue resolved.'
WHERE id = 4
  AND contents = 'Замена выполнена, проблема устранена.';
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    internal_account_id bigint;
    internal_client_id bigint;
    internal_site_id bigint;
BEGIN
    INSERT INTO "auth"."Accounts" (login, password_hash, role_id)
    VALUES (
        'EbkoInternal',
        '$2b$10$whV4b1k1ctc8jMFJ0u6QK.ZsZGYRfsTZicvu.14C3n4w0GM/Ptnfe',
        4
    )
    ON CONFLICT (login) DO NOTHING;

    SELECT id INTO internal_account_id
    FROM "auth"."Accounts"
    WHERE login = 'EbkoInternal';

    INSERT INTO "profiles"."Profiles" (
        account_id,
        full_name,
        phone_number,
        email,
        image,
        birth_date,
        position
    )
    VALUES (
        internal_account_id,
        'Сервисный аккаунт ЭБКО',
        '+7 (900) 120-10-10',
        'internal@ebko.local',
        NULL,
        DATE '1992-01-10',
        'Внутренний заказчик'
    )
    ON CONFLICT (account_id) DO NOTHING;

    INSERT INTO "crm"."Clients" (name, address, ceo_id)
    VALUES ('ЭБКО', 'Москва, улица Центральная, 1', internal_account_id)
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO internal_client_id
    FROM "crm"."Clients"
    WHERE name = 'ЭБКО';

    UPDATE "crm"."Clients"
    SET ceo_id = internal_account_id
    WHERE id = internal_client_id
      AND ceo_id IS DISTINCT FROM internal_account_id;

    INSERT INTO "crm"."Representatives" (account_id, client_id)
    VALUES (internal_account_id, internal_client_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO "crm"."Sites" (responsible_id, name, address)
    SELECT internal_account_id, 'Головной офис ЭБКО', 'Москва, улица Центральная, 1'
    WHERE NOT EXISTS (
        SELECT 1
        FROM "crm"."Sites"
        WHERE responsible_id = internal_account_id
          AND name = 'Головной офис ЭБКО'
          AND address = 'Москва, улица Центральная, 1'
    );

    SELECT id INTO internal_site_id
    FROM "crm"."Sites"
    WHERE responsible_id = internal_account_id
      AND name = 'Головной офис ЭБКО'
      AND address = 'Москва, улица Центральная, 1'
    ORDER BY id
    LIMIT 1;

    INSERT INTO "crm"."SitesProducts" (site_id, product_id)
    SELECT internal_site_id, product_id
    FROM (VALUES (1), (2), (3)) AS products(product_id)
    WHERE internal_site_id IS NOT NULL
    ON CONFLICT DO NOTHING;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
    internal_account_id bigint;
    internal_client_id bigint;
    internal_site_id bigint;
BEGIN
    SELECT id INTO internal_account_id
    FROM "auth"."Accounts"
    WHERE login = 'EbkoInternal';

    SELECT id INTO internal_client_id
    FROM "crm"."Clients"
    WHERE name = 'ЭБКО';

    SELECT id INTO internal_site_id
    FROM "crm"."Sites"
    WHERE responsible_id = internal_account_id
      AND name = 'Головной офис ЭБКО'
      AND address = 'Москва, улица Центральная, 1'
    ORDER BY id
    LIMIT 1;

    IF internal_site_id IS NOT NULL THEN
        DELETE FROM "crm"."SitesProducts"
        WHERE site_id = internal_site_id;

        DELETE FROM "crm"."Sites"
        WHERE id = internal_site_id;
    END IF;

    IF internal_client_id IS NOT NULL AND internal_account_id IS NOT NULL THEN
        DELETE FROM "crm"."Representatives"
        WHERE account_id = internal_account_id
          AND client_id = internal_client_id;
    END IF;

    IF internal_client_id IS NOT NULL THEN
        DELETE FROM "crm"."Clients"
        WHERE id = internal_client_id;
    END IF;

    IF internal_account_id IS NOT NULL THEN
        DELETE FROM "profiles"."Profiles"
        WHERE account_id = internal_account_id;

        DELETE FROM "auth"."Accounts"
        WHERE id = internal_account_id;
    END IF;
END $$;
-- +goose StatementEnd

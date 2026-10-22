DROP INDEX IF EXISTS app_secrets_app_id_command_name;
DROP INDEX IF EXISTS app_secrets_app_id_global_name;

DELETE FROM app_secrets WHERE command_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_secrets_app_id_name
    ON app_secrets (app_id, name)
    WHERE name IS NOT NULL;

ALTER TABLE app_secrets
    DROP COLUMN IF EXISTS is_secret,
    DROP COLUMN IF EXISTS command_id;

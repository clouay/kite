DROP INDEX IF EXISTS app_secrets_app_id_event_listener_name;
DROP INDEX IF EXISTS app_secrets_app_id_command_name;
DROP INDEX IF EXISTS app_secrets_app_id_global_name;

CREATE UNIQUE INDEX IF NOT EXISTS app_secrets_app_id_name
    ON app_secrets (app_id, name)
    WHERE name IS NOT NULL;

ALTER TABLE app_secrets
    DROP COLUMN IF EXISTS event_listener_id,
    DROP COLUMN IF EXISTS command_id,
    DROP COLUMN IF EXISTS is_secret;

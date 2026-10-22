ALTER TABLE app_secrets
    ADD COLUMN IF NOT EXISTS command_id TEXT REFERENCES commands(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_secret BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX IF EXISTS app_secrets_app_id_name;

CREATE UNIQUE INDEX IF NOT EXISTS app_secrets_app_id_global_name
    ON app_secrets (app_id, name)
    WHERE name IS NOT NULL AND command_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_secrets_app_id_command_name
    ON app_secrets (app_id, command_id, name)
    WHERE name IS NOT NULL AND command_id IS NOT NULL;

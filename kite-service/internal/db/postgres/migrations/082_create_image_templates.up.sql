CREATE TABLE image_templates (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    creator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    width INTEGER NOT NULL DEFAULT 800,
    height INTEGER NOT NULL DEFAULT 400,
    format TEXT NOT NULL DEFAULT 'png',
    data JSONB NOT NULL DEFAULT '{"layers":[]}',
    sample_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX image_templates_app_id ON image_templates(app_id);

-- name: GetImageTemplate :one
SELECT * FROM image_templates WHERE id = $1 AND app_id = $2;

-- name: GetImageTemplatesByApp :many
SELECT * FROM image_templates WHERE app_id = $1 ORDER BY created_at DESC;

-- name: CountImageTemplatesByApp :one
SELECT COUNT(*) FROM image_templates WHERE app_id = $1;

-- name: CreateImageTemplate :one
INSERT INTO image_templates (
    id,
    app_id,
    name,
    description,
    creator_user_id,
    width,
    height,
    format,
    data,
    sample_data,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
) RETURNING *;

-- name: UpdateImageTemplate :one
UPDATE image_templates SET
    name = $3,
    description = $4,
    width = $5,
    height = $6,
    format = $7,
    data = $8,
    sample_data = $9,
    updated_at = $10
WHERE id = $1 AND app_id = $2 RETURNING *;

-- name: DeleteImageTemplate :one
DELETE FROM image_templates WHERE id = $1 AND app_id = $2 RETURNING *;

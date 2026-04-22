-- Skill CRUD

-- name: ListSkillsByWorkspace :many
SELECT * FROM skill
WHERE workspace_id = $1
ORDER BY name ASC;

-- name: GetSkill :one
SELECT * FROM skill
WHERE id = $1;

-- name: GetSkillInWorkspace :one
SELECT * FROM skill
WHERE id = $1 AND workspace_id = $2;

-- name: CreateSkill :one
INSERT INTO skill (workspace_id, name, description, content, config, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateSkill :one
UPDATE skill SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    content = COALESCE(sqlc.narg('content'), content),
    config = COALESCE(sqlc.narg('config'), config),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteSkill :exec
DELETE FROM skill WHERE id = $1;

-- Skill File CRUD

-- name: ListSkillFiles :many
SELECT * FROM skill_file
WHERE skill_id = $1
ORDER BY path ASC;

-- name: GetSkillFile :one
SELECT * FROM skill_file
WHERE id = $1;

-- name: UpsertSkillFile :one
INSERT INTO skill_file (skill_id, path, content)
VALUES ($1, $2, $3)
ON CONFLICT (skill_id, path) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = now()
RETURNING *;

-- name: DeleteSkillFile :exec
DELETE FROM skill_file WHERE id = $1;

-- name: DeleteSkillFilesBySkill :exec
DELETE FROM skill_file WHERE skill_id = $1;

-- Agent-Skill junction

-- name: ListAgentSkills :many
SELECT s.* FROM skill s
JOIN agent_skill ask ON ask.skill_id = s.id
WHERE ask.agent_id = $1
ORDER BY s.name ASC;

-- name: AddAgentSkill :exec
INSERT INTO agent_skill (agent_id, skill_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveAgentSkill :exec
DELETE FROM agent_skill
WHERE agent_id = $1 AND skill_id = $2;

-- name: RemoveAllAgentSkills :exec
DELETE FROM agent_skill WHERE agent_id = $1;

-- name: ListAgentSkillsByWorkspace :many
SELECT ask.agent_id, s.id, s.name, s.description
FROM agent_skill ask
JOIN skill s ON s.id = ask.skill_id
WHERE s.workspace_id = $1
ORDER BY s.name ASC;

-- Admin Skills (cross-workspace)

-- name: ListAllSkillsForAdmin :many
SELECT s.*, w.name as workspace_name, w.slug as workspace_slug
FROM skill s
JOIN workspace w ON w.id = s.workspace_id
JOIN workspace_member wm ON wm.workspace_id = w.id
WHERE wm.user_id = $1 AND wm.role IN ('owner', 'admin')
ORDER BY w.name ASC, s.name ASC;

-- name: GetSkillWithWorkspace :one
SELECT s.*, w.name as workspace_name, w.slug as workspace_slug
FROM skill s
JOIN workspace w ON w.id = s.workspace_id
WHERE s.id = $1;

-- name: CopySkillToWorkspace :one
INSERT INTO skill (workspace_id, name, description, content, config, created_by)
SELECT $2, 
    CASE 
        WHEN EXISTS (SELECT 1 FROM skill WHERE workspace_id = $2 AND name = s.name)
        THEN s.name || ' (Copy)'
        ELSE s.name
    END,
    s.description, s.content, s.config, $3
FROM skill s
WHERE s.id = $1
RETURNING *;

-- name: CopySkillFilesToSkill :many
INSERT INTO skill_file (skill_id, path, content)
SELECT $2, path, content
FROM skill_file
WHERE skill_id = $1
RETURNING *;

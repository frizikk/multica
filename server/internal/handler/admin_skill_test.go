package handler

import (
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/stretchr/testify/assert"
)

func TestAdminSkillFromDB(t *testing.T) {
	skill := db.Skill{
		ID:          pgtype.UUID{Valid: true},
		WorkspaceID: pgtype.UUID{Valid: true},
		Name:        "Test Skill",
		Description: "Test Description",
		Content:     "Test Content",
		Config:      []byte(`{"key": "value"}`),
		CreatedBy:   pgtype.UUID{Valid: true},
	}

	resp := adminSkillFromDB(skill, "My Workspace", "my-workspace")

	assert.Equal(t, "Test Skill", resp.Name)
	assert.Equal(t, "Test Description", resp.Description)
	assert.Equal(t, "Test Content", resp.Content)
	assert.Equal(t, "My Workspace", resp.WorkspaceName)
	assert.Equal(t, "my-workspace", resp.WorkspaceSlug)
}

func TestAdminSkillFromDB_NullConfig(t *testing.T) {
	skill := db.Skill{
		ID:          pgtype.UUID{Valid: true},
		WorkspaceID: pgtype.UUID{Valid: true},
		Name:        "Test Skill",
		Description: "Test Description",
		Content:     "Test Content",
		Config:      nil,
	}

	resp := adminSkillFromDB(skill, "My Workspace", "my-workspace")

	assert.Equal(t, "Test Skill", resp.Name)
	// Config should be empty map when nil
	configMap, ok := resp.Config.(map[string]any)
	assert.True(t, ok)
	assert.Empty(t, configMap)
}

func TestAdminSkillResponse_JSON(t *testing.T) {
	resp := AdminSkillResponse{
		ID:            "test-id",
		WorkspaceID:   "ws-id",
		WorkspaceName: "My Workspace",
		WorkspaceSlug: "my-workspace",
		Name:          "Test Skill",
		Description:   "Test Description",
		Content:       "Test Content",
		Config:        map[string]any{"key": "value"},
		CreatedBy:     nil,
		CreatedAt:     "2024-01-01T00:00:00Z",
		UpdatedAt:     "2024-01-01T00:00:00Z",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded AdminSkillResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, resp.Name, decoded.Name)
	assert.Equal(t, resp.WorkspaceName, decoded.WorkspaceName)
}

func TestCopySkillRequest_JSON(t *testing.T) {
	req := CopySkillRequest{
		TargetWorkspaceIDs: []string{"ws-1", "ws-2", "ws-3"},
	}

	data, err := json.Marshal(req)
	assert.NoError(t, err)

	var decoded CopySkillRequest
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, 3, len(decoded.TargetWorkspaceIDs))
	assert.Contains(t, decoded.TargetWorkspaceIDs, "ws-1")
}

func TestCopySkillResponse_JSON(t *testing.T) {
	resp := CopySkillResponse{
		CopiedSkills: []SkillResponse{
			{ID: "skill-1", Name: "Skill 1"},
			{ID: "skill-2", Name: "Skill 2"},
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded CopySkillResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(decoded.CopiedSkills))
}

func TestListAllSkillsResponse_JSON(t *testing.T) {
	resp := ListAllSkillsResponse{
		Skills: []AdminSkillResponse{
			{
				ID:            "skill-1",
				WorkspaceName: "Workspace A",
				WorkspaceSlug: "workspace-a",
				Name:          "Skill 1",
			},
			{
				ID:            "skill-2",
				WorkspaceName: "Workspace B",
				WorkspaceSlug: "workspace-b",
				Name:          "Skill 2",
			},
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var decoded ListAllSkillsResponse
	err = json.Unmarshal(data, &decoded)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(decoded.Skills))
	assert.Equal(t, "Workspace A", decoded.Skills[0].WorkspaceName)
	assert.Equal(t, "Workspace B", decoded.Skills[1].WorkspaceName)
}

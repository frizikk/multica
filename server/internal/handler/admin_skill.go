package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// AdminSkillResponse represents a skill with workspace information for admin view
type AdminSkillResponse struct {
	ID             string `json:"id"`
	WorkspaceID    string `json:"workspace_id"`
	WorkspaceName  string `json:"workspace_name"`
	WorkspaceSlug  string `json:"workspace_slug"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Content        string `json:"content"`
	Config         any    `json:"config"`
	CreatedBy      *string `json:"created_by"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

// ListAllSkillsResponse represents the response for listing all admin skills
type ListAllSkillsResponse struct {
	Skills []AdminSkillResponse `json:"skills"`
}

// CopySkillRequest represents the request to copy a skill to multiple workspaces
type CopySkillRequest struct {
	TargetWorkspaceIDs []string `json:"target_workspace_ids"`
}

// CopySkillResponse represents the response after copying a skill
type CopySkillResponse struct {
	CopiedSkills []SkillResponse `json:"copied_skills"`
}

// adminSkillFromDB converts a database skill with workspace info to AdminSkillResponse
func adminSkillFromDB(s db.Skill, workspaceName, workspaceSlug string) AdminSkillResponse {
	var config any
	if s.Config != nil {
		json.Unmarshal(s.Config, &config)
	}
	if config == nil {
		config = map[string]any{}
	}

	return AdminSkillResponse{
		ID:             uuidToString(s.ID),
		WorkspaceID:    uuidToString(s.WorkspaceID),
		WorkspaceName:  workspaceName,
		WorkspaceSlug:  workspaceSlug,
		Name:           s.Name,
		Description:    s.Description,
		Content:        s.Content,
		Config:         config,
		CreatedBy:      uuidToPtr(s.CreatedBy),
		CreatedAt:      timestampToString(s.CreatedAt),
		UpdatedAt:      timestampToString(s.UpdatedAt),
	}
}

// ListAllSkills returns all skills from workspaces where the user is owner or admin
func (h *Handler) ListAllSkills(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	skills, err := h.Queries.ListAllSkillsForAdmin(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list skills")
		return
	}

	resp := make([]AdminSkillResponse, len(skills))
	for i, s := range skills {
		resp[i] = adminSkillFromDB(s.Skill, s.WorkspaceName, s.WorkspaceSlug)
	}

	writeJSON(w, http.StatusOK, ListAllSkillsResponse{Skills: resp})
}

// GetSkillAdmin returns a single skill with workspace info (admin access required)
func (h *Handler) GetSkillAdmin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	skillID := parseUUID(id)

	// Get skill with workspace info
	skill, err := h.Queries.GetSkillWithWorkspace(r.Context(), skillID)
	if err != nil {
		writeError(w, http.StatusNotFound, "skill not found")
		return
	}

	// Check if user is owner/admin of the source workspace
	wsID := uuidToString(skill.Skill.WorkspaceID)
	_, ok := h.requireWorkspaceRole(w, r, wsID, "skill not found", "owner", "admin")
	if !ok {
		return
	}

	resp := adminSkillFromDB(skill.Skill, skill.WorkspaceName, skill.WorkspaceSlug)
	writeJSON(w, http.StatusOK, resp)
}

// CopySkill copies a skill to multiple target workspaces
func (h *Handler) CopySkill(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	skillID := parseUUID(id)

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	// Get skill with workspace info to verify source access
	skill, err := h.Queries.GetSkillWithWorkspace(r.Context(), skillID)
	if err != nil {
		writeError(w, http.StatusNotFound, "skill not found")
		return
	}

	// Check if user is owner/admin of the source workspace
	sourceWsID := uuidToString(skill.Skill.WorkspaceID)
	_, ok = h.requireWorkspaceRole(w, r, sourceWsID, "skill not found", "owner", "admin")
	if !ok {
		return
	}

	var req CopySkillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.TargetWorkspaceIDs) == 0 {
		writeError(w, http.StatusBadRequest, "target_workspace_ids is required")
		return
	}

	// Validate access to all target workspaces
	for _, targetWsID := range req.TargetWorkspaceIDs {
		_, ok := h.requireWorkspaceRole(w, r, targetWsID, "access denied to target workspace", "owner", "admin")
		if !ok {
			return
		}
	}

	// Copy skill to each target workspace
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	copiedSkills := make([]SkillResponse, 0, len(req.TargetWorkspaceIDs))

	for _, targetWsID := range req.TargetWorkspaceIDs {
		// Copy the skill
		newSkill, err := qtx.CopySkillToWorkspace(r.Context(), db.CopySkillToWorkspaceParams{
			ID:          skillID,
			WorkspaceID: parseUUID(targetWsID),
			CreatedBy:   parseUUID(userID),
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to copy skill: "+err.Error())
			return
		}

		// Copy skill files
		_, err = qtx.CopySkillFilesToSkill(r.Context(), db.CopySkillFilesToSkillParams{
			SkillID:   skillID,
			NewSkillID: newSkill.ID,
		})
		if err != nil && err != pgx.ErrNoRows {
			// Log error but don't fail - files are optional
			slog.Warn("failed to copy skill files", append(logger.RequestAttrs(r), "error", err)...)
		}

		copiedSkills = append(copiedSkills, skillToResponse(newSkill))

		// Publish event for target workspace
		actorType, actorID := h.resolveActor(r, userID, targetWsID)
		h.publish(protocol.EventSkillCreated, targetWsID, actorType, actorID, map[string]any{
			"skill": skillToResponse(newSkill),
			"copied_from": id,
		})
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, CopySkillResponse{CopiedSkills: copiedSkills})
}

// DeleteSkillAdmin deletes a skill from a workspace (admin only)
func (h *Handler) DeleteSkillAdmin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	skillID := parseUUID(id)

	// Get skill with workspace info
	skill, err := h.Queries.GetSkillWithWorkspace(r.Context(), skillID)
	if err != nil {
		writeError(w, http.StatusNotFound, "skill not found")
		return
	}

	// Check if user is owner/admin of the workspace
	wsID := uuidToString(skill.Skill.WorkspaceID)
	_, ok := h.requireWorkspaceRole(w, r, wsID, "skill not found", "owner", "admin")
	if !ok {
		return
	}

	// Delete the skill (this will also delete skill files via CASCADE)
	if err := h.Queries.DeleteSkill(r.Context(), skillID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete skill")
		return
	}

	// Publish event
	userID, _ := requireUserID(w, r)
	actorType, actorID := h.resolveActor(r, userID, wsID)
	h.publish(protocol.EventSkillDeleted, wsID, actorType, actorID, map[string]any{
		"skill_id": id,
		"skill_name": skill.Skill.Name,
	})

	w.WriteHeader(http.StatusNoContent)
}

// SyncSkillRequest represents the request to sync a skill across workspaces
type SyncSkillRequest struct {
	SkillName      string   `json:"skill_name"`
	SourceSkillID  string   `json:"source_skill_id"`
	TargetWorkspaceIDs []string `json:"target_workspace_ids"`
}

// SyncSkillResponse represents the response after syncing a skill
type SyncSkillResponse struct {
	Added   []SkillResponse `json:"added"`
	Removed []SkillResponse `json:"removed"`
}

// BatchSyncSkillsRequest represents a batch of skill sync operations
type BatchSyncSkillsRequest struct {
	Operations []SkillSyncOperation `json:"operations"`
}

// SkillSyncOperation represents a single skill sync operation
type SkillSyncOperation struct {
	SkillName          string   `json:"skill_name"`
	SourceSkillID      string   `json:"source_skill_id"`
	TargetWorkspaceIDs []string `json:"target_workspace_ids"`
}

// BatchSyncSkillsResponse represents the response after batch sync
type BatchSyncSkillsResponse struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
	Total   int `json:"total"`
}

// BatchSyncSkills synchronizes multiple skills across workspaces in one operation
func (h *Handler) BatchSyncSkills(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req BatchSyncSkillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Operations) == 0 {
		writeError(w, http.StatusBadRequest, "operations array is required")
		return
	}

	// Validate access to all source skills and target workspaces
	for _, op := range req.Operations {
		if op.SkillName == "" || op.SourceSkillID == "" {
			writeError(w, http.StatusBadRequest, "skill_name and source_skill_id are required for all operations")
			return
		}

		sourceSkillID := parseUUID(op.SourceSkillID)
		sourceSkill, err := h.Queries.GetSkillWithWorkspace(r.Context(), sourceSkillID)
		if err != nil {
			writeError(w, http.StatusNotFound, "source skill not found: "+op.SkillName)
			return
		}

		sourceWsID := uuidToString(sourceSkill.Skill.WorkspaceID)
		_, ok := h.requireWorkspaceRole(w, r, sourceWsID, "skill not found", "owner", "admin")
		if !ok {
			return
		}

		// Validate access to all target workspaces
		for _, targetWsID := range op.TargetWorkspaceIDs {
			_, ok := h.requireWorkspaceRole(w, r, targetWsID, "access denied to target workspace", "owner", "admin")
			if !ok {
				return
			}
		}
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	var totalAdded, totalRemoved int

	// Process each operation
	for _, op := range req.Operations {
		sourceSkillID := parseUUID(op.SourceSkillID)

		// Get all existing skills with this name
		allSkills, err := qtx.ListAllSkillsForAdmin(r.Context(), parseUUID(userID))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list skills")
			return
		}

		// Find skills with the same name
		existingSkillsByWorkspace := make(map[string]db.Skill)
		for _, s := range allSkills {
			if s.Skill.Name == op.SkillName {
				existingSkillsByWorkspace[uuidToString(s.Skill.WorkspaceID)] = s.Skill
			}
		}

		// Build target set
		targetSet := make(map[string]bool)
		for _, wsID := range op.TargetWorkspaceIDs {
			targetSet[wsID] = true
		}

		sourceWsID := ""
		for wsID, skill := range existingSkillsByWorkspace {
			if uuidToString(skill.ID) == op.SourceSkillID {
				sourceWsID = wsID
				break
			}
		}

		// Add skills where needed
		for _, wsID := range op.TargetWorkspaceIDs {
			if _, exists := existingSkillsByWorkspace[wsID]; !exists {
				newSkill, err := qtx.CopySkillToWorkspace(r.Context(), db.CopySkillToWorkspaceParams{
					ID:          sourceSkillID,
					WorkspaceID: parseUUID(wsID),
					CreatedBy:   parseUUID(userID),
				})
				if err != nil {
					writeError(w, http.StatusInternalServerError, "failed to copy skill: "+err.Error())
					return
				}

				_, err = qtx.CopySkillFilesToSkill(r.Context(), db.CopySkillFilesToSkillParams{
					SkillID:    sourceSkillID,
					NewSkillID: newSkill.ID,
				})
				if err != nil && err != pgx.ErrNoRows {
					slog.Warn("failed to copy skill files", append(logger.RequestAttrs(r), "error", err)...)
				}

				totalAdded++

				actorType, actorID := h.resolveActor(r, userID, wsID)
				h.publish(protocol.EventSkillCreated, wsID, actorType, actorID, map[string]any{
					"skill":       skillToResponse(newSkill),
					"synced_from": op.SourceSkillID,
				})
			}
		}

		// Remove skills where not needed
		for wsID, skill := range existingSkillsByWorkspace {
			if !targetSet[wsID] && wsID != sourceWsID {
				err := qtx.DeleteSkillByNameInWorkspace(r.Context(), db.DeleteSkillByNameInWorkspaceParams{
					WorkspaceID: skill.WorkspaceID,
					Name:        skill.Name,
				})
				if err != nil {
					slog.Warn("failed to delete skill during sync", append(logger.RequestAttrs(r), "error", err)...)
					continue
				}

				totalRemoved++

				actorType, actorID := h.resolveActor(r, userID, wsID)
				h.publish(protocol.EventSkillDeleted, wsID, actorType, actorID, map[string]any{
					"skill_id":   uuidToString(skill.ID),
					"skill_name": skill.Name,
					"reason":     "batch_sync",
				})
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, BatchSyncSkillsResponse{
		Added:   totalAdded,
		Removed: totalRemoved,
		Total:   totalAdded + totalRemoved,
	})
}

// SyncSkill synchronizes a skill across target workspaces (adds where missing, removes where not in list)
func (h *Handler) SyncSkill(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req SyncSkillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.SkillName == "" || req.SourceSkillID == "" {
		writeError(w, http.StatusBadRequest, "skill_name and source_skill_id are required")
		return
	}

	sourceSkillID := parseUUID(req.SourceSkillID)

	// Get source skill to verify access and get details
	sourceSkill, err := h.Queries.GetSkillWithWorkspace(r.Context(), sourceSkillID)
	if err != nil {
		writeError(w, http.StatusNotFound, "source skill not found")
		return
	}

	sourceWsID := uuidToString(sourceSkill.Skill.WorkspaceID)
	_, ok = h.requireWorkspaceRole(w, r, sourceWsID, "skill not found", "owner", "admin")
	if !ok {
		return
	}

	// Validate access to all target workspaces
	for _, targetWsID := range req.TargetWorkspaceIDs {
		_, ok := h.requireWorkspaceRole(w, r, targetWsID, "access denied to target workspace", "owner", "admin")
		if !ok {
			return
		}
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	var added []SkillResponse
	var removed []SkillResponse

	// Get all existing skills with this name across user's workspaces
	allSkills, err := qtx.ListAllSkillsForAdmin(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list skills")
		return
	}

	// Find skills with the same name
	existingSkillsByWorkspace := make(map[string]db.Skill)
	for _, s := range allSkills {
		if s.Skill.Name == req.SkillName {
			existingSkillsByWorkspace[uuidToString(s.Skill.WorkspaceID)] = s.Skill
		}
	}

	// Process each target workspace
	targetSet := make(map[string]bool)
	for _, wsID := range req.TargetWorkspaceIDs {
		targetSet[wsID] = true
	}

	// Add skill to workspaces where it doesn't exist
	for _, wsID := range req.TargetWorkspaceIDs {
		if _, exists := existingSkillsByWorkspace[wsID]; !exists {
			// Skill doesn't exist in this workspace - create it
			newSkill, err := qtx.CopySkillToWorkspace(r.Context(), db.CopySkillToWorkspaceParams{
				ID:          sourceSkillID,
				WorkspaceID: parseUUID(wsID),
				CreatedBy:   parseUUID(userID),
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to copy skill: "+err.Error())
				return
			}

			// Copy skill files
			_, err = qtx.CopySkillFilesToSkill(r.Context(), db.CopySkillFilesToSkillParams{
				SkillID:    sourceSkillID,
				NewSkillID: newSkill.ID,
			})
			if err != nil && err != pgx.ErrNoRows {
				slog.Warn("failed to copy skill files", append(logger.RequestAttrs(r), "error", err)...)
			}

			added = append(added, skillToResponse(newSkill))

			// Publish event
			actorType, actorID := h.resolveActor(r, userID, wsID)
			h.publish(protocol.EventSkillCreated, wsID, actorType, actorID, map[string]any{
				"skill":       skillToResponse(newSkill),
				"synced_from": req.SourceSkillID,
			})
		}
	}

	// Remove skill from workspaces where it exists but shouldn't
	for wsID, skill := range existingSkillsByWorkspace {
		if !targetSet[wsID] && wsID != sourceWsID {
			// Skill exists but not in target list - delete it
			err := qtx.DeleteSkillByNameInWorkspace(r.Context(), db.DeleteSkillByNameInWorkspaceParams{
				WorkspaceID: skill.WorkspaceID,
				Name:        skill.Name,
			})
			if err != nil {
				slog.Warn("failed to delete skill during sync", append(logger.RequestAttrs(r), "error", err)...)
				continue
			}

			removed = append(removed, skillToResponse(skill))

			// Publish event
			actorType, actorID := h.resolveActor(r, userID, wsID)
			h.publish(protocol.EventSkillDeleted, wsID, actorType, actorID, map[string]any{
				"skill_id":   uuidToString(skill.ID),
				"skill_name": skill.Name,
				"reason":     "sync",
			})
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, SyncSkillResponse{
		Added:   added,
		Removed: removed,
	})
}

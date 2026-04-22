"use client";

import { useState, useMemo } from "react";
import { Check, Save, RotateCcw, Sparkles } from "lucide-react";
import type { AdminSkill, Workspace } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { Badge } from "@multica/ui/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@multica/ui/components/ui/scroll-area";

interface SkillsMatrixProps {
  skills: AdminSkill[];
  workspaces: Workspace[];
  onSyncSkill?: (skillName: string, sourceSkillId: string, targetWorkspaceIds: string[]) => void;
}

interface SkillRow {
  name: string;
  skills: Map<string, AdminSkill>; // workspace_id -> skill
  workspaceIds: string[];
  sourceSkill: AdminSkill | null; // The "primary" skill to copy from
}

function groupSkillsByName(skills: AdminSkill[]): SkillRow[] {
  const groups = new Map<string, Map<string, AdminSkill>>();

  for (const skill of skills) {
    if (!groups.has(skill.name)) {
      groups.set(skill.name, new Map());
    }
    groups.get(skill.name)!.set(skill.workspace_id, skill);
  }

  return Array.from(groups.entries())
    .map(([name, skillMap]) => {
      const skillsArray = Array.from(skillMap.values());
      // Pick the first skill as source (preferably from the first workspace alphabetically)
      const sourceSkill = skillsArray.sort((a, b) => 
        a.workspace_name.localeCompare(b.workspace_name)
      )[0] || null;
      
      return {
        name,
        skills: skillMap,
        workspaceIds: Array.from(skillMap.keys()),
        sourceSkill,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SkillsMatrix({ skills, workspaces, onSyncSkill }: SkillsMatrixProps) {
  // Track which skill row is being edited
  const [editingRow, setEditingRow] = useState<string | null>(null);
  // Track the desired state for the editing row
  const [desiredWorkspaces, setDesiredWorkspaces] = useState<Set<string>>(new Set());
  // Track if sync is in progress
  const [syncing, setSyncing] = useState(false);

  const skillRows = useMemo(() => groupSkillsByName(skills), [skills]);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  const startEditing = (row: SkillRow) => {
    setEditingRow(row.name);
    // Initialize with current state (workspaces where skill exists)
    setDesiredWorkspaces(new Set(row.workspaceIds));
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setDesiredWorkspaces(new Set());
  };

  const handleSave = async (row: SkillRow) => {
    if (!row.sourceSkill || !onSyncSkill) return;
    
    setSyncing(true);
    try {
      await onSyncSkill(
        row.name,
        row.sourceSkill.id,
        Array.from(desiredWorkspaces)
      );
      setEditingRow(null);
      setDesiredWorkspaces(new Set());
    } finally {
      setSyncing(false);
    }
  };

  const toggleWorkspace = (workspaceId: string) => {
    setDesiredWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  // Calculate changes for the editing row
  const getChanges = (row: SkillRow) => {
    const current = new Set(row.workspaceIds);
    const desired = desiredWorkspaces;
    
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    
    for (const wsId of desired) {
      if (!current.has(wsId)) toAdd.push(wsId);
    }
    for (const wsId of current) {
      if (!desired.has(wsId)) toRemove.push(wsId);
    }
    
    return { toAdd, toRemove };
  };

  if (skillRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Sparkles className="h-12 w-12 mb-4 text-muted-foreground/30" />
        <p className="text-sm">No skills found</p>
        <p className="text-xs mt-1 max-w-xs text-center">
          Create skills in your workspaces to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {skillRows.length} unique skills across {workspaces.length} workspaces
        </div>
        <div className="text-xs text-muted-foreground">
          Click on a skill row to edit workspace assignments
        </div>
      </div>

      {/* Matrix table */}
      <ScrollArea className="border rounded-md">
        <div className="min-w-[600px]">
          {/* Header row */}
          <div className="flex border-b bg-muted/50">
            <div className="w-64 p-3 font-medium text-sm border-r">Skill</div>
            {sortedWorkspaces.map((ws) => (
              <div
                key={ws.id}
                className="w-32 p-3 text-sm text-center border-r last:border-r-0"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate block">{ws.name}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{ws.name}</p>
                    <p className="text-xs text-muted-foreground">{ws.slug}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>

          {/* Skill rows */}
          <div className="divide-y">
            {skillRows.map((row) => {
              const isEditing = editingRow === row.name;
              const { toAdd, toRemove } = isEditing ? getChanges(row) : { toAdd: [], toRemove: [] };
              const hasChanges = toAdd.length > 0 || toRemove.length > 0;

              return (
                <div 
                  key={row.name} 
                  className={`flex ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                >
                  <div className="w-64 p-3 border-r">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                        <Sparkles className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium truncate">{row.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {row.workspaceIds.length}
                      </Badge>
                    </div>
                    
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => handleSave(row)}
                          disabled={!hasChanges || syncing}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {syncing ? "Saving..." : "Save"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={cancelEditing}
                          disabled={syncing}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                    {isEditing && hasChanges && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {toAdd.length > 0 && (
                          <span className="text-green-600">+{toAdd.length} to add </span>
                        )}
                        {toRemove.length > 0 && (
                          <span className="text-red-600">-{toRemove.length} to remove</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {sortedWorkspaces.map((ws) => {
                    const skill = row.skills.get(ws.id);
                    const exists = !!skill;
                    
                    if (isEditing) {
                      // Edit mode - checkbox to toggle
                      const isChecked = desiredWorkspaces.has(ws.id);
                      return (
                        <div
                          key={ws.id}
                          className={`w-32 p-3 flex items-center justify-center border-r last:border-r-0 ${
                            isChecked !== exists ? (isChecked ? 'bg-green-50' : 'bg-red-50') : ''
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleWorkspace(ws.id)}
                          />
                        </div>
                      );
                    }
                    
                    // View mode - just show status
                    return (
                      <div
                        key={ws.id}
                        className="w-32 p-3 flex items-center justify-center border-r last:border-r-0"
                      >
                        <button
                          onClick={() => startEditing(row)}
                          className={`flex items-center justify-center w-6 h-6 rounded border ${
                            exists
                              ? "border-primary bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
                              : "border-border hover:border-primary/50 cursor-pointer"
                          }`}
                        >
                          {exists && <Check className="h-4 w-4" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded bg-primary flex items-center justify-center text-primary-foreground">
            <Check className="h-3 w-3" />
          </div>
          <span>Skill exists</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded bg-green-50 border-green-200" />
          <span>Will be added</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded bg-red-50 border-red-200" />
          <span>Will be removed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded hover:border-primary/50" />
          <span>Click to edit</span>
        </div>
      </div>
    </div>
  );
}

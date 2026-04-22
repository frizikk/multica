"use client";

import { useState, useMemo, useCallback } from "react";
import { Save, RotateCcw, Sparkles } from "lucide-react";
import type { AdminSkill, Workspace } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { Badge } from "@multica/ui/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@multica/ui/components/ui/scroll-area";

interface SkillsMatrixProps {
  skills: AdminSkill[];
  workspaces: Workspace[];
  onBatchSync: (operations: { skill_name: string; source_skill_id: string; target_workspace_ids: string[] }[]) => Promise<void>;
}

interface SkillRow {
  name: string;
  skills: Map<string, AdminSkill>;
  workspaceIds: string[];
  sourceSkill: AdminSkill | null;
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

export function SkillsMatrix({ skills, workspaces, onBatchSync }: SkillsMatrixProps) {
  // Store the desired state for all skills
  const [desiredState, setDesiredState] = useState<Map<string, Set<string>>>(() => {
    const initial = new Map<string, Set<string>>();
    skills.forEach(skill => {
      if (!initial.has(skill.name)) {
        initial.set(skill.name, new Set());
      }
      initial.get(skill.name)!.add(skill.workspace_id);
    });
    return initial;
  });

  const [syncing, setSyncing] = useState(false);

  const skillRows = useMemo(() => groupSkillsByName(skills), [skills]);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  // Calculate changes
  const getChanges = useCallback(() => {
    const operations: { skill_name: string; source_skill_id: string; target_workspace_ids: string[] }[] = [];
    let totalAdditions = 0;
    let totalRemovals = 0;

    for (const row of skillRows) {
      if (!row.sourceSkill) continue;

      const currentWorkspaces = new Set(row.workspaceIds);
      const desiredWorkspaces = desiredState.get(row.name) || new Set<string>();

      // Check if there's any change
      const hasChanges = 
        currentWorkspaces.size !== desiredWorkspaces.size ||
        [...currentWorkspaces].some(id => !desiredWorkspaces.has(id)) ||
        [...desiredWorkspaces].some(id => !currentWorkspaces.has(id));

      if (hasChanges) {
        operations.push({
          skill_name: row.name,
          source_skill_id: row.sourceSkill.id,
          target_workspace_ids: [...desiredWorkspaces],
        });

        // Count changes
        for (const wsId of desiredWorkspaces) {
          if (!currentWorkspaces.has(wsId)) totalAdditions++;
        }
        for (const wsId of currentWorkspaces) {
          if (!desiredWorkspaces.has(wsId)) totalRemovals++;
        }
      }
    }

    return { operations, totalAdditions, totalRemovals };
  }, [skillRows, desiredState]);

  const { operations, totalAdditions, totalRemovals } = getChanges();
  const hasChanges = operations.length > 0;
  const totalChanges = totalAdditions + totalRemovals;

  const toggleSkillWorkspace = (skillName: string, workspaceId: string) => {
    setDesiredState((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(skillName) || []);
      
      if (current.has(workspaceId)) {
        current.delete(workspaceId);
      } else {
        current.add(workspaceId);
      }
      
      next.set(skillName, current);
      return next;
    });
  };

  const handleSave = async () => {
    if (!hasChanges || operations.length === 0) return;
    
    setSyncing(true);
    try {
      await onBatchSync(operations);
      // Reset to match new server state
      const newState = new Map<string, Set<string>>();
      for (const op of operations) {
        newState.set(op.skill_name, new Set(op.target_workspace_ids));
      }
      setDesiredState(newState);
    } finally {
      setSyncing(false);
    }
  };

  const handleReset = () => {
    const initial = new Map<string, Set<string>>();
    skills.forEach(skill => {
      if (!initial.has(skill.name)) {
        initial.set(skill.name, new Set());
      }
      initial.get(skill.name)!.add(skill.workspace_id);
    });
    setDesiredState(initial);
  };

  // Get status for a cell
  const getCellStatus = (skillName: string, workspaceId: string, exists: boolean) => {
    const desired = desiredState.get(skillName) || new Set<string>();
    const willExist = desired.has(workspaceId);
    
    if (exists && willExist) return 'unchanged';
    if (!exists && willExist) return 'will-add';
    if (exists && !willExist) return 'will-remove';
    return 'unchanged-no-skill';
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
      {/* Header with save button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {skillRows.length} skills across {workspaces.length} workspaces
        </div>
        
        {hasChanges && (
          <div className="flex items-center gap-3">
            <span className="text-sm">
              <span className="text-green-600 font-medium">+{totalAdditions}</span>
              {' / '}
              <span className="text-red-600 font-medium">-{totalRemovals}</span>
            </span>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleReset}
              disabled={syncing}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={syncing}
            >
              <Save className="h-4 w-4 mr-1" />
              {syncing ? 'Saving...' : `Save ${totalChanges} changes`}
            </Button>
          </div>
        )}
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
              const rowHasChanges = operations.some(op => op.skill_name === row.name);

              return (
                <div 
                  key={row.name} 
                  className={`flex ${rowHasChanges ? 'bg-yellow-50/50' : ''}`}
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
                      {rowHasChanges && (
                        <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
                          modified
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {sortedWorkspaces.map((ws) => {
                    const skill = row.skills.get(ws.id);
                    const exists = !!skill;
                    const status = getCellStatus(row.name, ws.id, exists);
                    const isChecked = (desiredState.get(row.name) || new Set()).has(ws.id);

                    return (
                      <div
                        key={ws.id}
                        className={`w-32 p-3 flex items-center justify-center border-r last:border-r-0 ${
                          status === 'will-add' ? 'bg-green-50' : 
                          status === 'will-remove' ? 'bg-red-50' : ''
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleSkillWorkspace(row.name, ws.id)}
                        />
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
          <Checkbox checked={true} disabled className="opacity-100" />
          <span>Skill enabled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
          <span className="text-green-600">Will be added</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-50 border border-red-200 rounded" />
          <span className="text-red-600">Will be removed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-50 border border-yellow-200 rounded" />
          <span className="text-yellow-700">Row modified</span>
        </div>
        <div className="ml-auto">
          Changes are applied when you click <strong>Save</strong>
        </div>
      </div>
    </div>
  );
}

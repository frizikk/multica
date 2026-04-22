"use client";

import { useState, useMemo } from "react";
import { Check, Copy, Sparkles, Trash2 } from "lucide-react";
import type { AdminSkill, Workspace } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { Badge } from "@multica/ui/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@multica/ui/components/ui/scroll-area";

interface SkillsMatrixProps {
  skills: AdminSkill[];
  workspaces: Workspace[];
  onCopySkill: (skillId: string, targetWorkspaceIds: string[]) => void;
  onDeleteSkill?: (skillId: string, skillName: string) => void;
}

interface SkillRow {
  name: string;
  skills: Map<string, AdminSkill>; // workspace_id -> skill
  workspaceIds: string[];
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
    .map(([name, skillMap]) => ({
      name,
      skills: skillMap,
      workspaceIds: Array.from(skillMap.keys()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SkillsMatrix({ skills, workspaces, onCopySkill, onDeleteSkill }: SkillsMatrixProps) {
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set());

  const skillRows = useMemo(() => groupSkillsByName(skills), [skills]);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  const handleCopy = () => {
    if (!selectedSkillId || selectedWorkspaces.size === 0) return;
    onCopySkill(selectedSkillId, Array.from(selectedWorkspaces));
    setSelectedSkillId(null);
    setSelectedWorkspaces(new Set());
  };

  const handleDelete = () => {
    if (!selectedSkillId || !onDeleteSkill) return;
    const skill = skills.find((s) => s.id === selectedSkillId);
    if (!skill) return;
    onDeleteSkill(selectedSkillId, skill.name);
    setSelectedSkillId(null);
    setSelectedWorkspaces(new Set());
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
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {skillRows.length} unique skills across {workspaces.length} workspaces
        </div>
        {selectedSkillId && (
          <div className="flex items-center gap-2">
            {selectedWorkspaces.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  Copy to {selectedWorkspaces.size} workspace(s)
                </span>
                <Button size="sm" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </>
            )}
            {onDeleteSkill && (
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
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
            {skillRows.map((row) => (
              <div key={row.name} className="flex hover:bg-muted/30">
                <div className="w-64 p-3 border-r flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                    <Sparkles className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium truncate">{row.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {row.workspaceIds.length}
                  </Badge>
                </div>
                {sortedWorkspaces.map((ws) => {
                  const skill = row.skills.get(ws.id);
                  const isSelected = skill?.id === selectedSkillId;
                  const isTarget = skill === undefined && selectedSkillId && selectedWorkspaces.has(ws.id);

                  return (
                    <div
                      key={ws.id}
                      className={`w-32 p-3 flex items-center justify-center border-r last:border-r-0 ${
                        isSelected ? "bg-primary/10" : isTarget ? "bg-primary/5" : ""
                      }`}
                    >
                      {skill ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                if (selectedSkillId === skill.id) {
                                  setSelectedSkillId(null);
                                  setSelectedWorkspaces(new Set());
                                } else {
                                  setSelectedSkillId(skill.id);
                                  setSelectedWorkspaces(new Set());
                                }
                              }}
                              className={`flex items-center justify-center w-6 h-6 rounded border ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              {isSelected && <Check className="h-4 w-4" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-sm">{skill.name}</p>
                            <p className="text-xs text-muted-foreground">Click to select for copying</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={selectedWorkspaces.has(ws.id)}
                                onCheckedChange={(checked) => {
                                  if (!selectedSkillId) return;
                                  setSelectedWorkspaces((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      next.add(ws.id);
                                    } else {
                                      next.delete(ws.id);
                                    }
                                    return next;
                                  });
                                }}
                                disabled={!selectedSkillId}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {selectedSkillId
                              ? "Select to copy skill here"
                              : "Select a skill first"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded flex items-center justify-center">
            <Check className="h-3 w-3" />
          </div>
          <span>Skill exists</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border rounded bg-primary/10" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox disabled />
          <span>Target workspace (select to copy)</span>
        </div>
      </div>
    </div>
  );
}

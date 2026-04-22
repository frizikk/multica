"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import type { AdminSkill } from "@multica/core/types";
import { api } from "@multica/core/api";
import { adminSkillListOptions, adminKeys } from "@multica/core/workspace/queries";
import { workspaceListOptions } from "@multica/core/workspace/queries";
import { Button } from "@multica/ui/components/ui/button";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { PageHeader } from "../../layout/page-header";
import { SkillsMatrix } from "./skills-matrix";
import { CopySkillDialog } from "./copy-skill-dialog";

export default function AdminSkillsPage() {
  const qc = useQueryClient();
  const [selectedSkill, setSelectedSkill] = useState<AdminSkill | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const { data: skillsData, isLoading: skillsLoading } = useQuery(
    adminSkillListOptions()
  );
  const { data: workspacesData, isLoading: workspacesLoading } = useQuery(
    workspaceListOptions()
  );

  const skills = skillsData?.skills ?? [];
  const workspaces = workspacesData ?? [];

  const isLoading = skillsLoading || workspacesLoading;

  const handleCopySkill = async (skillId: string, targetWorkspaceIds: string[]) => {
    try {
      const response = await api.copySkill(skillId, {
        target_workspace_ids: targetWorkspaceIds,
      });
      qc.invalidateQueries({ queryKey: adminKeys.skills() });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(`Skill copied to ${response.copied_skills.length} workspace(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy skill");
      throw err;
    }
  };

  const handleMatrixCopy = (skillId: string, targetWorkspaceIds: string[]) => {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    setSelectedSkill(skill);
    setCopyDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <PageHeader>
          <Skeleton className="h-6 w-48" />
        </PageHeader>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader className="justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" />
          <h1 className="text-sm font-semibold">Skills Admin</h1>
          <span className="text-xs text-muted-foreground">
            ({skills.length} skills across {workspaces.length} workspaces)
          </span>
        </div>
      </PageHeader>

      <div className="flex-1 p-6 overflow-auto">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Sparkles className="h-12 w-12 mb-4 text-muted-foreground/30" />
            <p className="text-sm">No skills found across your workspaces</p>
            <p className="text-xs mt-1 max-w-xs text-center">
              Create skills in your workspaces to manage them here. This view shows all
              skills from workspaces where you are an owner or admin.
            </p>
          </div>
        ) : (
          <SkillsMatrix
            skills={skills}
            workspaces={workspaces}
            onCopySkill={handleMatrixCopy}
          />
        )}
      </div>

      <CopySkillDialog
        skill={selectedSkill}
        workspaces={workspaces}
        open={copyDialogOpen}
        onClose={() => {
          setCopyDialogOpen(false);
          setSelectedSkill(null);
        }}
        onConfirm={async (targetWorkspaceIds) => {
          if (!selectedSkill) return;
          await handleCopySkill(selectedSkill.id, targetWorkspaceIds);
          setCopyDialogOpen(false);
          setSelectedSkill(null);
        }}
      />
    </div>
  );
}

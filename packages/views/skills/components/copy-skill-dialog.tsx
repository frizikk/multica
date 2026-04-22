"use client";

import { useState } from "react";
import { Copy, AlertCircle } from "lucide-react";
import type { AdminSkill, Workspace } from "@multica/core/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@multica/ui/components/ui/dialog";
import { Button } from "@multica/ui/components/ui/button";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { Label } from "@multica/ui/components/ui/label";
import { Badge } from "@multica/ui/components/ui/badge";
import { ScrollArea } from "@multica/ui/components/ui/scroll-area";

interface CopySkillDialogProps {
  skill: AdminSkill | null;
  workspaces: Workspace[];
  open: boolean;
  onClose: () => void;
  onConfirm: (targetWorkspaceIds: string[]) => Promise<void>;
}

export function CopySkillDialog({
  skill,
  workspaces,
  open,
  onClose,
  onConfirm,
}: CopySkillDialogProps) {
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!skill) return null;

  // Filter out workspaces that already have this skill
  const availableWorkspaces = workspaces.filter(
    (ws) => ws.id !== skill.workspace_id
  );

  const handleToggle = (workspaceId: string) => {
    setSelectedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedWorkspaces.size === availableWorkspaces.length) {
      setSelectedWorkspaces(new Set());
    } else {
      setSelectedWorkspaces(new Set(availableWorkspaces.map((ws) => ws.id)));
    }
  };

  const handleConfirm = async () => {
    if (selectedWorkspaces.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      await onConfirm(Array.from(selectedWorkspaces));
      setSelectedWorkspaces(new Set());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy skill");
    } finally {
      setLoading(false);
    }
  };

  const isAllSelected =
    availableWorkspaces.length > 0 &&
    selectedWorkspaces.size === availableWorkspaces.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy Skill
          </DialogTitle>
          <DialogDescription>
            Copy <Badge variant="secondary">{skill.name}</Badge> to other workspaces
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium">Target Workspaces</Label>
            {availableWorkspaces.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-auto py-1 px-2"
              >
                {isAllSelected ? "Deselect All" : "Select All"}
              </Button>
            )}
          </div>

          {availableWorkspaces.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border rounded-md">
              No available workspaces to copy to
            </div>
          ) : (
            <ScrollArea className="h-[300px] border rounded-md p-2">
              <div className="space-y-2">
                {availableWorkspaces.map((ws) => (
                  <label
                    key={ws.id}
                    className="flex items-start gap-3 p-3 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedWorkspaces.has(ws.id)}
                      onCheckedChange={() => handleToggle(ws.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ws.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ws.slug}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedWorkspaces.size > 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Will copy to {selectedWorkspaces.size} workspace
              {selectedWorkspaces.size !== 1 ? "s" : ""}
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedWorkspaces.size === 0 || loading}
          >
            {loading ? "Copying..." : "Copy Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

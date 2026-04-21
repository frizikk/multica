"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueSubscriber } from "@multica/core/types";
import type {
  SubscriberAddedPayload,
  SubscriberRemovedPayload,
} from "@multica/core/types";
import { issueSubscribersOptions, issueKeys } from "@multica/core/issues/queries";
import { useToggleIssueSubscriber } from "@multica/core/issues/mutations";
import { useWSEvent, useWSReconnect } from "@multica/core/realtime";

export function useIssueSubscribers(issueId: string, userId?: string) {
  const qc = useQueryClient();
  const { data: subscribers = [], isLoading: loading } = useQuery({
    ...issueSubscribersOptions(issueId),
    // Poll every 30s as a fallback when WebSocket events may be missed
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    // Required: staleTime must be 0 for refetchInterval to work reliably
    staleTime: 0,
    // Refetch when user returns to the tab (in addition to polling)
    refetchOnWindowFocus: true,
  });

  const toggleMutation = useToggleIssueSubscriber(issueId);

  // Reconnect recovery
  useWSReconnect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: issueKeys.subscribers(issueId) });
    }, [qc, issueId]),
  );

  // --- WS event handlers ---

  useWSEvent(
    "subscriber:added",
    useCallback(
      (payload: unknown) => {
        const p = payload as SubscriberAddedPayload;
        if (p.issue_id !== issueId) return;
        qc.setQueryData<IssueSubscriber[]>(
          issueKeys.subscribers(issueId),
          (old) => {
            if (!old) return old;
            if (
              old.some(
                (s) =>
                  s.user_id === p.user_id && s.user_type === p.user_type,
              )
            )
              return old;
            return [
              ...old,
              {
                issue_id: p.issue_id,
                user_type: p.user_type as "member" | "agent",
                user_id: p.user_id,
                reason: p.reason as IssueSubscriber["reason"],
                created_at: new Date().toISOString(),
              },
            ];
          },
        );
      },
      [qc, issueId],
    ),
  );

  useWSEvent(
    "subscriber:removed",
    useCallback(
      (payload: unknown) => {
        const p = payload as SubscriberRemovedPayload;
        if (p.issue_id !== issueId) return;
        qc.setQueryData<IssueSubscriber[]>(
          issueKeys.subscribers(issueId),
          (old) =>
            old?.filter(
              (s) =>
                !(s.user_id === p.user_id && s.user_type === p.user_type),
            ),
        );
      },
      [qc, issueId],
    ),
  );

  // --- Mutations ---

  const isSubscribed = subscribers.some(
    (s) => s.user_type === "member" && s.user_id === userId,
  );

  const toggleSubscriber = useCallback(
    async (
      subUserId: string,
      userType: "member" | "agent",
      currentlySubscribed: boolean,
    ) => {
      toggleMutation.mutate({
        userId: subUserId,
        userType,
        subscribed: currentlySubscribed,
      });
    },
    [toggleMutation],
  );

  const toggleSubscribe = useCallback(() => {
    if (userId) toggleSubscriber(userId, "member", isSubscribed);
  }, [userId, isSubscribed, toggleSubscriber]);

  return {
    subscribers,
    loading,
    isSubscribed,
    toggleSubscribe,
    toggleSubscriber,
  };
}

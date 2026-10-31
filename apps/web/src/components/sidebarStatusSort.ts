import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { toSortableTimestamp } from "@t3tools/client-runtime/state/thread-sort";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./Sidebar.logic";

type StatusSortThread = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Parameters<typeof hasUnseenCompletion>[0] &
  Pick<EnvironmentThreadShell, "id" | "environmentId" | "createdAt" | "unsettledAt">;

function statusGroup(thread: StatusSortThread): number {
  const status = resolveSidebarThreadStatus(thread);
  if (status === "input" || status === "approval" || status === "request") return 0;
  if (status === "failed" || status === "limited") return 1;
  if (status === "ready" && hasUnseenCompletion(thread)) return 2;
  return 3;
}

/**
 * Fork order for the main list: needs input, failed, unread Done, then the rest
 * (read). Each group runs oldest first; read threads by when they were last opened.
 */
export function sortThreadsByStatus<T extends StatusSortThread>(
  threads: readonly T[],
  observedReturnAt?: (thread: T) => number | undefined,
): T[] {
  const keys = new Map(
    threads.map((thread) => {
      const group = statusGroup(thread);
      const returnedAt = Math.max(
        toSortableTimestamp(thread.createdAt) ?? 0,
        toSortableTimestamp(thread.unsettledAt ?? undefined) ?? 0,
        toSortableTimestamp(thread.latestRun?.requestedAt ?? undefined) ?? 0,
        toSortableTimestamp(thread.latestRun?.completedAt ?? undefined) ?? 0,
        observedReturnAt?.(thread) ?? 0,
      );
      const at =
        group === 3
          ? (toSortableTimestamp(thread.lastVisitedAt ?? undefined) ?? returnedAt)
          : returnedAt;
      return [thread, { group, at }] as const;
    }),
  );
  return [...threads].sort((left, right) => {
    const a = keys.get(left)!;
    const b = keys.get(right)!;
    return (
      a.group - b.group ||
      a.at - b.at ||
      left.id.localeCompare(right.id) ||
      left.environmentId.localeCompare(right.environmentId)
    );
  });
}

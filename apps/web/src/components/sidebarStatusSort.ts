import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { statusWithOpenSpecQuestions } from "@t3tools/client-runtime/state/spec-questions";
import { sortThreadsByStatusGroup } from "@t3tools/client-runtime/state/thread-sort";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./Sidebar.logic";

type StatusSortThread = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Parameters<typeof hasUnseenCompletion>[0] &
  Pick<
    EnvironmentThreadShell,
    "id" | "environmentId" | "createdAt" | "unsettledAt" | "latestRun" | "lastVisitedAt"
  >;

function statusGroup(thread: StatusSortThread, hasOpenSpecQuestions: boolean) {
  const status = statusWithOpenSpecQuestions(
    resolveSidebarThreadStatus(thread),
    thread,
    hasOpenSpecQuestions,
  );
  if (status === "input" || status === "approval" || status === "request") return 0;
  if (status === "failed" || status === "limited") return 1;
  if (status === "ready" && hasUnseenCompletion(thread)) return 2;
  return 3;
}

export function sortThreadsByStatus<T extends StatusSortThread>(
  threads: readonly T[],
  observedReturnAt?: (thread: T) => number | undefined,
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
): T[] {
  return sortThreadsByStatusGroup(
    threads,
    (thread) => statusGroup(thread, hasOpenSpecQuestions(thread)),
    observedReturnAt,
  );
}

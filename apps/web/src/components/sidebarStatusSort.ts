import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { statusWithOpenSpecQuestions } from "@t3tools/client-runtime/state/spec-questions";
import { threadHasPlanReady } from "@t3tools/client-runtime/state/thread-inbox";
import {
  applyThreadStatusTab,
  sortThreadsByStatusTime,
  THREAD_STATUS_TABS,
} from "@t3tools/client-runtime/state/thread-sort";
import type {
  ThreadListTab,
  ThreadStatusSections,
  ThreadStatusTab,
  ThreadStatusTabCounts,
} from "@t3tools/client-runtime/state/thread-sort";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./Sidebar.logic";

type StatusSortThread = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Parameters<typeof hasUnseenCompletion>[0] &
  Parameters<typeof threadHasPlanReady>[0] &
  Pick<
    EnvironmentThreadShell,
    | "id"
    | "environmentId"
    | "createdAt"
    | "unsettledAt"
    | "latestRun"
    | "latestUserMessageAt"
    | "hasPendingSignIn"
  >;

export const SIDEBAR_STATUS_TABS = THREAD_STATUS_TABS;
export type SidebarStatusTab = ThreadStatusTab;
export type SidebarStatusTabCounts = ThreadStatusTabCounts;

function statusOf(thread: StatusSortThread, hasOpenSpecQuestions: boolean) {
  return statusWithOpenSpecQuestions(
    resolveSidebarThreadStatus(thread),
    thread,
    hasOpenSpecQuestions,
  );
}

/** The tab a main-list thread files under; on the Working shelf (`shelf`) only Working or Waiting. */
function listTabOf(
  thread: StatusSortThread,
  hasOpenSpecQuestions: boolean,
  shelf = false,
): ThreadListTab {
  const status = statusOf(thread, hasOpenSpecQuestions);
  if (status === "input" || status === "approval" || status === "request") return "input";
  if (thread.hasPendingSignIn === true || threadHasPlanReady(thread)) return "input";
  if (status === "waiting") return "waiting";
  if (shelf || status === "working") return "working";
  if (status === "failed" || status === "limited") return "failed";
  if (status === "ready" && hasUnseenCompletion(thread)) return "done";
  return "read";
}

export function sortThreadsByStatus<T extends StatusSortThread>(
  threads: readonly T[],
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
): T[] {
  return sortThreadsByStatusTime(threads, (thread) =>
    listTabOf(thread, hasOpenSpecQuestions(thread)),
  );
}

/**
 * The status tab the sidebar files one thread under, for the chat header's status chip.
 * It reads the thread alone, so a thread in its Working exit grace already shows its next status.
 */
export function sidebarStatusTabOf(
  thread: StatusSortThread,
  input: {
    readonly snoozed: boolean;
    readonly settled: boolean;
    readonly hasOpenSpecQuestions: boolean;
  },
): Exclude<SidebarStatusTab, "all"> {
  if (input.snoozed) return "snoozed";
  if (input.settled) return "settled";
  return listTabOf(thread, input.hasOpenSpecQuestions);
}

/** The status tabs over the sidebar's sections; see `applyThreadStatusTab`. */
export function applySidebarStatusTab<T extends StatusSortThread>(
  sections: ThreadStatusSections<T>,
  requested: SidebarStatusTab,
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
) {
  return applyThreadStatusTab(sections, requested, (thread, shelf) =>
    listTabOf(thread, hasOpenSpecQuestions(thread), shelf),
  );
}

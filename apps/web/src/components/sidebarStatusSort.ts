import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { statusWithOpenSpecQuestions } from "@t3tools/client-runtime/state/spec-questions";
import {
  applyThreadStatusTab,
  sortPinnedThreadsByOrderKey,
  sortThreadsByStatusGroup,
  THREAD_STATUS_TABS,
} from "@t3tools/client-runtime/state/thread-sort";
import type {
  ThreadStatusSections,
  ThreadStatusTab,
  ThreadStatusTabCounts,
} from "@t3tools/client-runtime/state/thread-sort";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./Sidebar.logic";

type StatusSortThread = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Parameters<typeof hasUnseenCompletion>[0] &
  Pick<
    EnvironmentThreadShell,
    "id" | "environmentId" | "createdAt" | "unsettledAt" | "latestRun" | "lastVisitedAt"
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

function statusGroup(thread: StatusSortThread, hasOpenSpecQuestions: boolean) {
  const status = statusOf(thread, hasOpenSpecQuestions);
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
  return statusOf(thread, input.hasOpenSpecQuestions) === "working"
    ? "working"
    : (["input", "failed", "done", "read"] as const)[
        statusGroup(thread, input.hasOpenSpecQuestions)
      ]!;
}

/** The status tabs over the sidebar's sections; see `applyThreadStatusTab`. */
export function applySidebarStatusTab<T extends StatusSortThread>(
  sections: ThreadStatusSections<T>,
  requested: SidebarStatusTab,
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
) {
  return applyThreadStatusTab(sections, requested, (thread) => {
    const tab = sidebarStatusTabOf(thread, {
      snoozed: false,
      settled: false,
      hasOpenSpecQuestions: hasOpenSpecQuestions(thread),
    });
    return tab === "snoozed" || tab === "settled" ? "read" : tab;
  });
}

/** The pin filter lists pinned threads by status like the main list; otherwise by dragged order. */
export function sortPinnedSection<
  T extends StatusSortThread & { readonly pinOrderKey?: string | null },
>(
  threads: readonly T[],
  pinnedOnly: boolean,
  observedReturnAt?: (thread: T) => number | undefined,
  hasOpenSpecQuestions?: (thread: T) => boolean,
): T[] {
  return pinnedOnly
    ? sortThreadsByStatus(threads, observedReturnAt, hasOpenSpecQuestions)
    : sortPinnedThreadsByOrderKey(threads);
}

import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { statusWithOpenSpecQuestions } from "@t3tools/client-runtime/state/spec-questions";
import {
  sortPinnedThreadsByOrderKey,
  sortThreadsByStatusGroup,
} from "@t3tools/client-runtime/state/thread-sort";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./Sidebar.logic";

type StatusSortThread = Parameters<typeof resolveSidebarThreadStatus>[0] &
  Parameters<typeof hasUnseenCompletion>[0] &
  Pick<
    EnvironmentThreadShell,
    "id" | "environmentId" | "createdAt" | "unsettledAt" | "latestRun" | "lastVisitedAt"
  >;

export const SIDEBAR_STATUS_TABS = ["input", "failed", "done", "read"] as const;
export type SidebarStatusTab = "all" | (typeof SIDEBAR_STATUS_TABS)[number];
export type SidebarStatusTabCounts = Record<SidebarStatusTab, number>;

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
 * Counts each status tab and narrows the lists to the chosen one.
 * A tab whose group is empty falls back to "all", so it can be dropped from the row.
 * A working thread left in these lists belongs to no group and shows under "all" only.
 */
export function applySidebarStatusTab<T extends StatusSortThread>(
  lists: readonly (readonly T[])[],
  requested: SidebarStatusTab,
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
): {
  readonly tab: SidebarStatusTab;
  readonly counts: SidebarStatusTabCounts;
  readonly lists: readonly (readonly T[])[];
} {
  const counts: SidebarStatusTabCounts = { all: 0, input: 0, failed: 0, done: 0, read: 0 };
  const tabOf = new Map<T, SidebarStatusTab>();
  for (const thread of lists.flat()) {
    const hasOpen = hasOpenSpecQuestions(thread);
    counts.all += 1;
    if (statusOf(thread, hasOpen) === "working") continue;
    const tab = SIDEBAR_STATUS_TABS[statusGroup(thread, hasOpen)]!;
    tabOf.set(thread, tab);
    counts[tab] += 1;
  }
  const tab = counts[requested] === 0 ? "all" : requested;
  return {
    tab,
    counts,
    lists:
      tab === "all"
        ? lists
        : lists.map((list) => list.filter((thread) => tabOf.get(thread) === tab)),
  };
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

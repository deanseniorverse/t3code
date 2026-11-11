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

/** In list order: the four status groups of the main list, then the shelves. */
export const SIDEBAR_STATUS_TABS = [
  "input",
  "failed",
  "done",
  "read",
  "working",
  "snoozed",
  "settled",
] as const;
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

interface SidebarStatusSections<T> {
  readonly pinned: readonly T[];
  readonly active: readonly T[];
  readonly working: readonly T[];
  readonly snoozed: readonly T[];
  readonly settled: readonly T[];
}

/**
 * Counts each status tab and narrows the sections to the chosen one.
 * A tab with no threads falls back to "all", so it can be dropped from the row; "settled"
 * never does here, because older settled threads load in pages the caller counts.
 * A working thread still in the pinned or main list counts as Working.
 */
export function applySidebarStatusTab<T extends StatusSortThread>(
  sections: SidebarStatusSections<T>,
  requested: SidebarStatusTab,
  hasOpenSpecQuestions: (thread: T) => boolean = () => false,
): SidebarStatusSections<T> & {
  readonly tab: SidebarStatusTab;
  readonly counts: SidebarStatusTabCounts;
} {
  const counts: SidebarStatusTabCounts = {
    all: 0,
    input: 0,
    failed: 0,
    done: 0,
    read: 0,
    working: sections.working.length,
    snoozed: sections.snoozed.length,
    settled: sections.settled.length,
  };
  const tabOf = new Map<T, SidebarStatusTab>();
  for (const thread of [...sections.pinned, ...sections.active]) {
    const hasOpen = hasOpenSpecQuestions(thread);
    const tab =
      statusOf(thread, hasOpen) === "working"
        ? "working"
        : SIDEBAR_STATUS_TABS[statusGroup(thread, hasOpen)]!;
    tabOf.set(thread, tab);
    counts[tab] += 1;
  }
  for (const tab of SIDEBAR_STATUS_TABS) counts.all += counts[tab];
  const tab = requested !== "settled" && counts[requested] === 0 ? "all" : requested;
  if (tab === "all") return { ...sections, tab, counts };
  const listed = (list: readonly T[]) => list.filter((thread) => tabOf.get(thread) === tab);
  return {
    tab,
    counts,
    pinned: listed(sections.pinned),
    active: listed(sections.active),
    working: tab === "working" ? sections.working : [],
    snoozed: tab === "snoozed" ? sections.snoozed : [],
    settled: tab === "settled" ? sections.settled : [],
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

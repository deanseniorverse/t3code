// @effect-diagnostics globalDate:off - The tracker runs in atom subscriptions, outside an Effect runtime.
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { parseThreadKey, threadKey } from "./entities.ts";
import { type AtomCommand, runAtomCommand } from "./runtime.ts";
import { claimThreadOpen } from "./threadSearch.ts";
import type { VisitThreadInput } from "../operations/commands.ts";

const IDLE_TRACKER: Atom.Atom<void> = Atom.make(undefined).pipe(
  Atom.withLabel("thread-visit-tracker:idle"),
);

interface VisitedShell {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly updatedAt: string;
  readonly lastVisitedAt?: string | null | undefined;
  readonly latestRun: { readonly completedAt: string | null } | null;
  /**
   * When a scheduled wake the user is looking at took effect. A wake later
   * than `updatedAt` is an update the server never sent, so the watermark
   * advances to it.
   */
  readonly wokeAt?: string | null | undefined;
}

export interface ThreadVisitTrackerOptions {
  readonly threadShellAtom: (ref: ScopedThreadRef) => Atom.Atom<VisitedShell | null>;
  readonly visit: AtomCommand<
    { readonly environmentId: EnvironmentId; readonly input: VisitThreadInput },
    unknown,
    unknown
  >;
  /**
   * Servers without visit tracking leave `lastVisitedAt` undefined; a client
   * that keeps its own watermark for them records the visit here instead.
   */
  readonly markLocalVisit?: (ref: ScopedThreadRef, visitedAt: string) => void;
}

/**
 * While mounted, a tracker counts as the user viewing the thread. The visit is
 * sent when they leave, so a thread keeps its status and place in the list while
 * it is open; a quick look away from a Done thread is not lost to a jump.
 */
export function createThreadVisitTracker(options: ThreadVisitTrackerOptions) {
  const family = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    return Atom.make((get) => {
      const registry = get.registry;
      // Showing the thread is the open, whether or not its shell has arrived.
      // A palette pick already sent the open with its query.
      let openPending = claimThreadOpen(ref.environmentId, ref.threadId, Date.now());
      let held: { readonly shell: VisitedShell; readonly visitedAt: string } | null = null;
      let heldLocally: string | null = null;
      let seenLastVisitedAtMs: number | null = null;
      // A mark-unread on the open thread stays until newer activity lands.
      let unreadThroughMs: number | null = null;

      const onShell = (shell: VisitedShell | null) => {
        if (shell === null) return;
        const shellUpdatedAtMs = Date.parse(shell.updatedAt);
        if (Number.isNaN(shellUpdatedAtMs)) return;
        const wokeAtMs = shell.wokeAt ? Date.parse(shell.wokeAt) : NaN;
        const wakeIsLatest = wokeAtMs > shellUpdatedAtMs;
        const visitedAt = wakeIsLatest && shell.wokeAt ? shell.wokeAt : shell.updatedAt;
        const updatedAtMs = wakeIsLatest ? wokeAtMs : shellUpdatedAtMs;
        if (shell.lastVisitedAt === undefined) {
          heldLocally = visitedAt;
          return;
        }
        const lastVisitedAtMs = shell.lastVisitedAt ? Date.parse(shell.lastVisitedAt) : NaN;
        const previousLastVisitedAtMs = seenLastVisitedAtMs;
        seenLastVisitedAtMs = Number.isNaN(lastVisitedAtMs) ? null : lastVisitedAtMs;
        // Nothing is sent while the thread is open, so a watermark that changes and still
        // trails the thread's activity was rewound on purpose.
        if (
          previousLastVisitedAtMs !== null &&
          seenLastVisitedAtMs !== null &&
          seenLastVisitedAtMs !== previousLastVisitedAtMs &&
          seenLastVisitedAtMs < updatedAtMs
        ) {
          unreadThroughMs = Math.max(unreadThroughMs ?? 0, updatedAtMs);
        }
        if (unreadThroughMs !== null && updatedAtMs <= unreadThroughMs) {
          held = null;
          return;
        }
        const alreadyVisited = !Number.isNaN(lastVisitedAtMs) && lastVisitedAtMs >= updatedAtMs;
        held = alreadyVisited && !openPending ? null : { shell, visitedAt };
      };

      get.addFinalizer(() => {
        if (heldLocally !== null) options.markLocalVisit?.(ref, heldLocally);
        if (held === null) return;
        void runAtomCommand(
          registry,
          options.visit,
          {
            environmentId: held.shell.environmentId,
            input: {
              threadId: held.shell.id,
              visitedAt: held.visitedAt,
              ...(openPending ? { opened: true } : {}),
            },
          },
          { reportFailure: false },
        );
      });

      // `subscribe`, not `get`: a rebuild would reset this state on every streaming tick.
      get.subscribe(options.threadShellAtom(ref), onShell, { immediate: true });
    }).pipe(Atom.withLabel(`thread-visit-tracker:${key}`));
  });
  return (ref: ScopedThreadRef | null) => (ref === null ? IDLE_TRACKER : family(threadKey(ref)));
}

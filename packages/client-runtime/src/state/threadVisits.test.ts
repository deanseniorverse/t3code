import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import type { VisitThreadInput } from "../operations/commands.ts";
import { claimThreadOpen } from "./threadSearch.ts";
import { createThreadVisitTracker } from "./threadVisits.ts";

const environmentId = EnvironmentId.make("env-visits");

interface Shell {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly updatedAt: string;
  readonly lastVisitedAt?: string | null;
  readonly latestRun: { readonly completedAt: string | null } | null;
  readonly wokeAt?: string | null;
}

// The registry disposes an unmounted atom on its next task.
async function leave(unmount: () => void) {
  unmount();
  await vi.advanceTimersByTimeAsync(0);
}

function at(seconds: number) {
  return `2026-01-01T00:00:${String(seconds).padStart(2, "0")}.000Z`;
}

// claimThreadOpen dedupes per thread in module state, so each test opens its own thread.
function setup(threadName: string, initial: Omit<Shell, "environmentId" | "id"> | null) {
  vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
  const threadId = ThreadId.make(threadName);
  const ref = { environmentId, threadId };
  const shellAtom = Atom.make<Shell | null>(
    initial === null ? null : { environmentId, id: threadId, ...initial },
  );
  const visits: Array<VisitThreadInput> = [];
  const localVisits: Array<string> = [];
  const tracker = createThreadVisitTracker({
    threadShellAtom: () => shellAtom,
    visit: {
      label: "test-visit",
      run: async (_registry, value) => {
        visits.push(value.input);
        return AsyncResult.success(undefined);
      },
    },
    markLocalVisit: (_ref, visitedAt) => localVisits.push(visitedAt),
  });
  const registry = AtomRegistry.make();
  return {
    ref,
    visits,
    localVisits,
    mount: () => registry.mount(tracker(ref)),
    update: (patch: Partial<Shell>) => {
      const current = registry.get(shellAtom);
      registry.set(shellAtom, {
        environmentId,
        id: threadId,
        updatedAt: at(0),
        latestRun: null,
        ...current,
        ...patch,
      });
    },
    [Symbol.dispose]: () => vi.useRealTimers(),
  };
}

it("sends nothing while the thread is open, then one visit with the latest activity on leaving", async () => {
  using t = setup("thread-leave", {
    updatedAt: at(10),
    lastVisitedAt: at(0),
    latestRun: { completedAt: at(10) },
  });
  const unmount = t.mount();
  t.update({ updatedAt: at(20), latestRun: { completedAt: at(20) } });
  expect(t.visits).toEqual([]);

  await leave(unmount);
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(20), opened: true }]);
});

it("sends the open on leaving even when nothing new happened", async () => {
  using t = setup("thread-read", { updatedAt: at(10), lastVisitedAt: at(10), latestRun: null });
  await leave(t.mount());
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(10), opened: true }]);
});

it("sends nothing on leaving when a palette pick sent the open and nothing is new", async () => {
  using t = setup("thread-palette", { updatedAt: at(10), lastVisitedAt: at(10), latestRun: null });
  claimThreadOpen(environmentId, t.ref.threadId, Date.UTC(2026, 0, 1));
  await leave(t.mount());
  expect(t.visits).toEqual([]);
});

it("keeps a mark-unread on the open thread until new activity lands", async () => {
  using t = setup("thread-unread", { updatedAt: at(10), lastVisitedAt: at(8), latestRun: null });
  const unmount = t.mount();
  t.update({ lastVisitedAt: at(5) });
  t.update({ updatedAt: at(30) });
  t.update({ lastVisitedAt: at(5), updatedAt: at(10) });
  await leave(unmount);
  expect(t.visits).toEqual([]);
});

it("reads the thread again when activity lands after a mark-unread", async () => {
  using t = setup("thread-unread-new", {
    updatedAt: at(10),
    lastVisitedAt: at(8),
    latestRun: null,
  });
  const unmount = t.mount();
  t.update({ lastVisitedAt: at(5) });
  t.update({ updatedAt: at(30) });
  await leave(unmount);
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(30), opened: true }]);
});

it("records local visits on leaving for servers without tracking", async () => {
  using t = setup("thread-local", null);
  const unmount = t.mount();
  t.update({ updatedAt: at(10), latestRun: null });
  t.update({ updatedAt: at(11) });
  expect(t.localVisits).toEqual([]);
  await leave(unmount);
  expect(t.visits).toEqual([]);
  expect(t.localVisits).toEqual([at(11)]);
});

it("advances the watermark to a wake on leaving", async () => {
  using t = setup("thread-wake", { updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  const unmount = t.mount();
  t.update({ wokeAt: at(15) });
  await leave(unmount);
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(15), opened: true }]);
});

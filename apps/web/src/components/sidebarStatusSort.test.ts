import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { sortThreadsByStatus } from "./sidebarStatusSort";

const environmentId = EnvironmentId.make("environment-local");
const base = presentThreadShell(environmentId, makeThreadFixture().source);
const at = (minute: number) => `2026-03-09T10:${String(minute).padStart(2, "0")}:00.000Z`;
const runtime = {
  status: "failed" as const,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: "boom",
  updatedAt: at(0),
};

function thread(id: string, minute: number, overrides: Partial<typeof base> = {}) {
  return {
    ...base,
    id: ThreadId.make(id),
    createdAt: at(0),
    unsettledAt: null,
    runtime: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    latestRun: {
      runId: RunId.make(`run-${id}`),
      status: "completed" as const,
      requestedAt: at(minute),
      startedAt: at(minute),
      completedAt: at(minute),
      assistantMessageId: null,
    },
    lastVisitedAt: at(0),
    ...overrides,
  };
}

describe("sortThreadsByStatus", () => {
  it("orders input, failed, unread done, then read by oldest visit, each oldest first", () => {
    const done = (id: string, minute: number) => thread(id, minute);
    const read = (id: string, visitedMinute: number) =>
      thread(id, 1, { lastVisitedAt: at(visitedMinute) });
    const threads = [
      read("read-recent", 50),
      done("done-new", 30),
      thread("failed", 20, { runtime }),
      read("read-old", 40),
      thread("input-new", 15, { hasPendingUserInput: true }),
      done("done-old", 10),
      thread("input-old", 5, { hasPendingApprovals: true }),
    ];

    expect(sortThreadsByStatus(threads).map((entry) => entry.id)).toEqual([
      "input-old",
      "input-new",
      "failed",
      "done-old",
      "done-new",
      "read-old",
      "read-recent",
    ]);
  });
});

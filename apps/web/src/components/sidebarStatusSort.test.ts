import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { sidebarStatusTabOf } from "./sidebarStatusSort";

describe("sidebarStatusTabOf", () => {
  const idle = makeThreadFixture({ runtime: null });
  const finishedRun = {
    runId: RunId.make("run-plan"),
    status: "completed" as const,
    requestedAt: idle.createdAt,
    startedAt: idle.createdAt,
    completedAt: idle.createdAt,
    assistantMessageId: null,
  };
  const plain = { snoozed: false, settled: false, hasOpenSpecQuestions: false };

  it.each([
    { name: "a snoozed thread", thread: idle, input: { ...plain, snoozed: true }, tab: "snoozed" },
    { name: "a settled thread", thread: idle, input: { ...plain, settled: true }, tab: "settled" },
    {
      name: "a running thread",
      thread: { ...idle, runtime: { ...makeThreadFixture().runtime!, status: "running" as const } },
      input: plain,
      tab: "working",
    },
    {
      name: "an idle thread",
      thread: { ...idle, runtime: { ...makeThreadFixture().runtime!, status: "idle" as const } },
      input: plain,
      tab: "waiting",
    },
    {
      name: "a finished plan waiting for approval",
      thread: {
        ...idle,
        interactionMode: "plan" as const,
        hasActionableProposedPlan: true,
        latestRun: finishedRun,
      },
      input: plain,
      tab: "input",
    },
    {
      name: "a thread waiting on sign-in",
      thread: { ...idle, hasPendingSignIn: true },
      input: plain,
      tab: "input",
    },
    {
      name: "a thread with an open spec question",
      thread: idle,
      input: { ...plain, hasOpenSpecQuestions: true },
      tab: "input",
    },
    {
      name: "a thread waiting on input",
      thread: { ...idle, hasPendingUserInput: true },
      input: plain,
      tab: "input",
    },
  ])("files $name under $tab", ({ thread, input, tab }) => {
    expect(sidebarStatusTabOf(thread, input)).toBe(tab);
  });
});

import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { sidebarStatusTabOf, sortPinnedSection } from "./sidebarStatusSort";

describe("sortPinnedSection", () => {
  const first = makeThreadFixture({ id: ThreadId.make("first-pin") });
  const second = makeThreadFixture({ id: ThreadId.make("second-pin") });
  const pinned = [
    { ...first, pinnedAt: first.createdAt, pinOrderKey: "a" },
    { ...second, pinnedAt: second.createdAt, pinOrderKey: "b" },
  ];
  const waitingOnInput = (thread: { readonly id: string }) => thread.id === "second-pin";

  it("keeps the dragged pin order with the filter off", () => {
    expect(
      sortPinnedSection(pinned, false, undefined, waitingOnInput).map((thread) => thread.id),
    ).toEqual(["first-pin", "second-pin"]);
  });

  it("sorts by status with the filter on, so input-needed pins rise", () => {
    expect(
      sortPinnedSection(pinned, true, undefined, waitingOnInput).map((thread) => thread.id),
    ).toEqual(["second-pin", "first-pin"]);
  });
});

describe("sidebarStatusTabOf", () => {
  const idle = makeThreadFixture();
  const plain = { snoozed: false, settled: false, hasOpenSpecQuestions: false };

  it.each([
    { name: "a snoozed thread", thread: idle, input: { ...plain, snoozed: true }, tab: "snoozed" },
    { name: "a settled thread", thread: idle, input: { ...plain, settled: true }, tab: "settled" },
    {
      name: "a running thread",
      thread: { ...idle, runtime: { ...idle.runtime!, status: "running" as const } },
      input: plain,
      tab: "working",
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

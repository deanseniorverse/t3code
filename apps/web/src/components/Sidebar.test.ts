import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { partitionSidebarThreads } from "./Sidebar";

describe("partitionSidebarThreads", () => {
  const idle = makeThreadFixture();
  const thread = (id: string, pinOrderKey: string | null, working: boolean) => ({
    ...idle,
    id: ThreadId.make(id),
    pinnedAt: pinOrderKey === null ? null : idle.createdAt,
    pinOrderKey,
    ...(working ? { runtime: { ...idle.runtime!, status: "running" as const } } : {}),
  });
  const threads = [
    thread("pinned-working", "a", true),
    thread("pinned-idle", "b", false),
    thread("unpinned-working", null, true),
    thread("unpinned-idle", null, false),
  ];

  it.each([
    {
      pinnedOnly: false,
      pinned: ["pinned-working", "pinned-idle"],
      active: ["unpinned-idle"],
      working: ["unpinned-working"],
    },
    { pinnedOnly: true, pinned: ["pinned-idle"], active: [], working: ["pinned-working"] },
  ])("places threads with the pin filter $pinnedOnly", (expected) => {
    const partition = partitionSidebarThreads({
      threads,
      scopedProjectKeys: null,
      delegatedUnderParent: new Set(),
      serverConfigs: new Map(),
      optimisticDrop: null,
      workingShelfEnabled: true,
      openSpecThreads: new Set(),
      pinnedOnly: expected.pinnedOnly,
      statusTab: "all",
      clockKey: "",
    });
    const ids = (list: readonly { readonly id: string }[]) => list.map((entry) => entry.id);
    expect({
      pinned: ids(partition.pinnedThreads),
      active: ids(partition.activeThreads),
      working: ids(partition.workingThreads),
    }).toEqual({ pinned: expected.pinned, active: expected.active, working: expected.working });
  });

  it.each([
    {
      statusTab: "input" as const,
      tab: "input",
      pinned: ["pinned-idle"],
      active: [],
      working: [],
    },
    {
      statusTab: "failed" as const,
      tab: "all",
      pinned: ["pinned-working", "pinned-idle"],
      active: ["unpinned-idle"],
      working: ["unpinned-working"],
    },
  ])("narrows to the $statusTab tab, or to all when that group is empty", (expected) => {
    const partition = partitionSidebarThreads({
      threads,
      scopedProjectKeys: null,
      delegatedUnderParent: new Set(),
      serverConfigs: new Map(),
      optimisticDrop: null,
      workingShelfEnabled: true,
      openSpecThreads: new Set(["environment-test:pinned-idle"]),
      pinnedOnly: false,
      statusTab: expected.statusTab,
      clockKey: "",
    });
    const ids = (list: readonly { readonly id: string }[]) => list.map((entry) => entry.id);
    expect({
      tab: partition.statusTab,
      counts: partition.statusTabCounts,
      pinned: ids(partition.pinnedThreads),
      active: ids(partition.activeThreads),
      working: ids(partition.workingThreads),
      searchable: partition.searchableThreads.length,
    }).toEqual({
      tab: expected.tab,
      counts: { all: 3, input: 1, failed: 0, done: 0, read: 1 },
      pinned: expected.pinned,
      active: expected.active,
      working: expected.working,
      searchable: 4,
    });
  });
});

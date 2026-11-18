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
    runtime: working ? { ...idle.runtime!, status: "running" as const } : null,
  });
  const threads = [
    thread("pinned-working", "a", true),
    thread("pinned-idle", "b", false),
    thread("unpinned-working", null, true),
    thread("unpinned-idle", null, false),
  ];

  const ids = (list: readonly { readonly id: string }[]) =>
    list.map((entry) => entry.id).toSorted();

  it.each([
    {
      pinnedOnly: false,
      active: ["pinned-idle", "unpinned-idle"],
      working: ["pinned-working", "unpinned-working"],
    },
    { pinnedOnly: true, active: ["pinned-idle"], working: ["pinned-working"] },
  ])("lists pins with the rest, and the pin filter $pinnedOnly only filters", (expected) => {
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
    expect({
      active: ids(partition.activeThreads),
      working: ids(partition.workingThreads),
    }).toEqual({ active: expected.active, working: expected.working });
  });

  it.each([
    {
      statusTab: "input" as const,
      tab: "input",
      active: ["pinned-idle"],
      working: [],
    },
    {
      statusTab: "working" as const,
      tab: "working",
      active: [],
      working: ["pinned-working", "unpinned-working"],
    },
    {
      statusTab: "failed" as const,
      tab: "all",
      active: ["pinned-idle", "unpinned-idle"],
      working: ["pinned-working", "unpinned-working"],
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
    expect({
      tab: partition.statusTab,
      counts: partition.statusTabCounts,
      active: ids(partition.activeThreads),
      working: ids(partition.workingThreads),
      searchable: partition.searchableThreads.length,
    }).toEqual({
      tab: expected.tab,
      counts: {
        all: 4,
        input: 1,
        failed: 0,
        done: 0,
        read: 1,
        working: 2,
        waiting: 0,
        snoozed: 0,
        settled: 0,
      },
      active: expected.active,
      working: expected.working,
      searchable: 4,
    });
  });

  it("keeps settled threads under the pin filter, since settling clears the pin", () => {
    const settled = {
      ...thread("settled", null, false),
      settledOverride: "settled" as const,
      settledAt: idle.createdAt,
    };
    const partition = partitionSidebarThreads({
      threads: [...threads, settled],
      scopedProjectKeys: null,
      delegatedUnderParent: new Set(),
      serverConfigs: new Map([[idle.environmentId, {}]]) as never,
      optimisticDrop: null,
      workingShelfEnabled: true,
      openSpecThreads: new Set(),
      pinnedOnly: true,
      statusTab: "settled",
      clockKey: "",
    });
    expect(partition.settledThreads.map((entry) => entry.id)).toEqual(["settled"]);
    expect(partition.activeThreads).toEqual([]);
  });
});

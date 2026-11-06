import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { sortPinnedSection } from "./sidebarStatusSort";

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

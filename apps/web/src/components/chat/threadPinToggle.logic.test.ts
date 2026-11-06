import { describe, expect, it } from "vite-plus/test";

import { resolveThreadPinToggle } from "./threadPinToggle.logic";

const base = {
  isServerThread: true,
  thread: { pinnedAt: null },
  pinningSupported: true,
  canOperate: true,
};

describe("resolveThreadPinToggle", () => {
  it("offers pin or unpin from the thread's pin state", () => {
    expect(resolveThreadPinToggle(base)).toEqual({ pinned: false, label: "Pin thread" });
    expect(
      resolveThreadPinToggle({ ...base, thread: { pinnedAt: "2026-11-05T10:00:00.000Z" } }),
    ).toEqual({ pinned: true, label: "Unpin thread" });
  });

  it.each([
    ["a draft", { isServerThread: false }],
    ["a thread not loaded yet", { thread: null }],
    ["a machine without pinning", { pinningSupported: false }],
    ["a read-only connection", { canOperate: false }],
  ])("hides the toggle for %s", (_name, override) => {
    expect(resolveThreadPinToggle({ ...base, ...override })).toBeNull();
  });
});

import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { planFavoritePinMigration } from "./favoritePinMigration";

const support: Record<string, boolean> = { mac: true, old: false };
const supportsPinning = (environmentId: EnvironmentId) => support[environmentId];

describe("planFavoritePinMigration", () => {
  it("pins starred threads on machines that pin, drops the rest, and waits for unknown machines", () => {
    const plan = planFavoritePinMigration({
      keys: ["mac:starred", "mac:already-pinned", "old:starred", "offline:starred", "broken"],
      supportsPinning,
      isPinned: (ref) => ref.threadId === "already-pinned",
    });

    expect(plan.pin.map(scopedThreadKey)).toEqual(["mac:starred"]);
    expect(plan.drop).toEqual(["mac:starred", "mac:already-pinned", "old:starred", "broken"]);
  });

  it("does nothing on a second run once the pins have landed", () => {
    const keys = ["mac:starred"];
    const first = planFavoritePinMigration({ keys, supportsPinning, isPinned: () => false });
    const remaining = keys.filter((key) => !first.drop.includes(key));
    const second = planFavoritePinMigration({
      keys: remaining,
      supportsPinning,
      isPinned: () => true,
    });

    expect(second).toEqual({ pin: [], drop: [] });
    // Even if the keys were somehow kept, a landed pin is not sent again.
    expect(planFavoritePinMigration({ keys, supportsPinning, isPinned: () => true }).pin).toEqual(
      [],
    );
  });
});

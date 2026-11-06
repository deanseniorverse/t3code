// Fork-only: turns the old browser-only thread favorites into server pins, once.
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

export interface FavoritePinMigrationPlan {
  readonly pin: readonly ScopedThreadRef[];
  /** Keys that are done: pinned, already pinned, unparseable, or on a machine without pinning. */
  readonly drop: readonly string[];
}

/**
 * Keys wait while their environment's config is unknown (`undefined`), since that machine
 * may not have connected yet. Pinning twice is harmless; the server keeps the first pin.
 */
export function planFavoritePinMigration(input: {
  readonly keys: readonly string[];
  readonly supportsPinning: (environmentId: EnvironmentId) => boolean | undefined;
  readonly isPinned: (ref: ScopedThreadRef) => boolean;
}): FavoritePinMigrationPlan {
  const pin: ScopedThreadRef[] = [];
  const drop: string[] = [];
  for (const key of input.keys) {
    const ref = parseScopedThreadKey(key);
    if (ref === null) {
      drop.push(key);
      continue;
    }
    const supported = input.supportsPinning(ref.environmentId);
    if (supported === undefined) continue;
    drop.push(key);
    if (supported && !input.isPinned(ref)) pin.push(ref);
  }
  return { pin, drop };
}

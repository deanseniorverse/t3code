// Fork-only: the chat header's pin toggle, so a thread the pin filter hides can still be pinned.
export interface ThreadPinToggleState {
  readonly pinned: boolean;
  readonly label: "Pin thread" | "Unpin thread";
}

export function resolveThreadPinToggle(input: {
  readonly isServerThread: boolean;
  readonly thread: { readonly pinnedAt?: string | null | undefined } | null;
  readonly pinningSupported: boolean;
  readonly canOperate: boolean;
}): ThreadPinToggleState | null {
  if (!input.isServerThread || input.thread === null) return null;
  if (!input.pinningSupported || !input.canOperate) return null;
  const pinned = input.thread.pinnedAt != null;
  return { pinned, label: pinned ? "Unpin thread" : "Pin thread" };
}

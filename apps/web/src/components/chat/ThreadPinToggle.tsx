// Fork-only: see threadPinToggle.logic.ts.
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { PinIcon } from "lucide-react";

import { useThreadActions } from "~/hooks/useThreadActions";
import { cn } from "~/lib/utils";
import { useQuietThreadShell, useServerConfigs } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resolveThreadPinToggle } from "./threadPinToggle.logic";

export function ThreadPinToggle(props: {
  readonly threadRef: ScopedThreadRef;
  readonly isServerThread: boolean;
}) {
  const { threadRef } = props;
  const thread = useQuietThreadShell(props.isServerThread ? threadRef : null);
  const pinningSupported = useServerConfigs().has(threadRef.environmentId);
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const { pinThread, confirmAndUnpinThread } = useThreadActions();
  const toggle = resolveThreadPinToggle({
    isServerThread: props.isServerThread,
    thread,
    pinningSupported,
    canOperate,
  });
  if (toggle === null) return null;
  const handleClick = async () => {
    const result = toggle.pinned
      ? await confirmAndUnpinThread(threadRef)
      : await pinThread(threadRef);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: toggle.pinned ? "Failed to unpin thread" : "Failed to pin thread",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={toggle.label}
            aria-pressed={toggle.pinned}
            onClick={() => void handleClick()}
          />
        }
      >
        <PinIcon aria-hidden className={cn(toggle.pinned && "fill-current")} />
      </TooltipTrigger>
      <TooltipPopup side="top">{toggle.label}</TooltipPopup>
    </Tooltip>
  );
}

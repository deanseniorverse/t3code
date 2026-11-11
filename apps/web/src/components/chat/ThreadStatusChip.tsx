// Fork-only: the thread's status after its title; a click chooses that status tab in the sidebar.
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { useOpenSpecThreads } from "../../specQuestionsState";
import { useQuietThreadShell, useServerConfigs } from "../../state/entities";
import { useUiStateStore } from "../../uiStateStore";
import { STATUS_TAB_LABELS } from "../sidebar/SidebarThreadFilters";
import { sidebarStatusTabOf } from "../sidebarStatusSort";
import { Badge } from "../ui/badge";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const NO_THREADS: ReadonlyArray<EnvironmentThreadShell> = [];
const threadKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

/** Outside the component: reading the clock is not a render-pure call. */
function statusTabOf(
  thread: EnvironmentThreadShell,
  configLoaded: boolean,
  hasOpenSpecQuestions: boolean,
) {
  return sidebarStatusTabOf(thread, {
    snoozed: configLoaded && effectiveSnoozed(thread, { now: new Date().toISOString() }),
    settled: configLoaded && thread.settledOverride === "settled",
    hasOpenSpecQuestions,
  });
}

export function ThreadStatusChip(props: { readonly threadRef: ScopedThreadRef }) {
  const thread = useQuietThreadShell(props.threadRef);
  const configLoaded = useServerConfigs().has(props.threadRef.environmentId);
  const listed =
    thread !== null &&
    thread.archivedAt === null &&
    thread.lineage.relationshipToParent !== "subagent";
  const openSpecThreads = useOpenSpecThreads(listed ? [thread] : NO_THREADS, threadKey);
  const setStatusTab = useUiStateStore((store) => store.setSidebarStatusTab);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  if (!listed) return null;
  const tab = statusTabOf(thread, configLoaded, openSpecThreads.has(threadKey(thread)));
  const label = STATUS_TAB_LABELS[tab];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            size="sm"
            render={
              <button
                type="button"
                aria-label={`Status: ${label}. Show ${label} threads`}
                onClick={() => {
                  setStatusTab(tab);
                  if (isMobile) setOpenMobile(true);
                  else setOpen(true);
                }}
              />
            }
            className="shrink-0 cursor-pointer"
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipPopup side="top">Show {label} threads in the list</TooltipPopup>
    </Tooltip>
  );
}

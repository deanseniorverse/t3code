// Fork-only: the thread's spec, its ticket link and open questions.
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { FileTextIcon, MessageCircleQuestionIcon, TicketIcon } from "lucide-react";

import { useRightPanelStore } from "../../rightPanelStore";
import { useSpecQuestionsUi, useThreadSpec } from "../../specQuestionsState";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { THREAD_DETAILS_PANEL_ICON_CLASS } from "./threadDetailsPanelStyles";
import { specDocPath } from "@t3tools/client-runtime/state/spec-questions";

/** Hidden unless the thread's branch or title names a spec found in one of its folders or projects. */
export function ThreadSpecPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const spec = useThreadSpec(threadRef);
  const reveal = useSpecQuestionsUi((state) => state.reveal);
  if (spec === null) return null;
  const openCount = spec.openQuestions.length;
  return (
    <ThreadDetailsSection headingId="thread-details-spec-heading" title="Spec">
      <div className="flex flex-col">
        <ThreadDetailsControl
          size="sm"
          variant="ghost"
          part="row"
          multiline
          onClick={() => useRightPanelStore.getState().openFile(threadRef, specDocPath(spec))}
        >
          <FileTextIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          <span className="min-w-0 truncate">{spec.title ?? spec.slug}</span>
        </ThreadDetailsControl>
        {spec.ticket ? (
          <ThreadDetailsControl
            size="sm"
            variant="ghost"
            part="row"
            render={<a href={spec.ticket.url} target="_blank" rel="noreferrer" />}
          >
            <TicketIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
            <span className="min-w-0 truncate">{spec.ticket.key}</span>
          </ThreadDetailsControl>
        ) : null}
        <ThreadDetailsControl
          size="sm"
          variant="ghost"
          part="row"
          disabled={openCount === 0}
          onClick={() => reveal(threadRef)}
        >
          <MessageCircleQuestionIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          <span className="min-w-0 truncate">
            {openCount === 0
              ? "No open questions"
              : `${openCount} open question${openCount === 1 ? "" : "s"}`}
          </span>
        </ThreadDetailsControl>
      </div>
    </ThreadDetailsSection>
  );
}

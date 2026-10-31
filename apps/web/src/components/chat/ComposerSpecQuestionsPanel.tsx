// Fork-only: answers a framework spec's questions.yml from the composer drawer.
import type { ScopedThreadRef } from "@t3tools/contracts";
import { specDirectory, type SpecQuestion } from "@t3tools/shared/specQuestions";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useRightPanelStore } from "../../rightPanelStore";
import {
  useSpecQuestionActions,
  useSpecQuestionsUi,
  type ThreadSpec,
} from "../../specQuestionsState";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { ComposerBanner } from "./ComposerBanner";

// Company OS name written on comments; questions.yml comments carry a person's full name.
const SPEC_COMMENT_AUTHOR = "Dean Mraz";

/**
 * The composer's top drawer when a spec has open questions. With an agent question open
 * too, tabs switch between the two; each keeps its own expand state.
 */
export function ComposerSpecQuestionsDrawer(props: {
  readonly threadRef: ScopedThreadRef;
  readonly spec: ThreadSpec | null;
  readonly disabled: boolean;
  readonly agentPanel: ReactNode;
}) {
  const key = `${props.threadRef.environmentId}:${props.threadRef.threadId}`;
  const storedTab = useSpecQuestionsUi((state) => state.tabByThread[key]);
  const setTab = useSpecQuestionsUi((state) => state.setTab);
  const openCount = props.spec?.openQuestions.length ?? 0;
  if (openCount === 0 || props.spec === null) return <>{props.agentPanel}</>;
  const specPanel = (
    <SpecQuestionsCard threadRef={props.threadRef} spec={props.spec} disabled={props.disabled} />
  );
  if (props.agentPanel === null || props.agentPanel === undefined) return specPanel;
  const tab = storedTab ?? "agent";
  return (
    <>
      <div role="tablist" className="flex gap-1 px-3 pt-1.5">
        <TabButton selected={tab === "agent"} onSelect={() => setTab(props.threadRef, "agent")}>
          Agent question
        </TabButton>
        <TabButton selected={tab === "spec"} onSelect={() => setTab(props.threadRef, "spec")}>
          Spec questions · {openCount}
        </TabButton>
      </div>
      {tab === "agent" ? props.agentPanel : specPanel}
    </>
  );
}

function TabButton(props: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <Button
      role="tab"
      aria-selected={props.selected}
      size="compact"
      variant={props.selected ? "outline" : "ghost-muted"}
      onClick={props.onSelect}
    >
      {props.children}
    </Button>
  );
}

function SpecQuestionsCard(props: {
  threadRef: ScopedThreadRef;
  spec: ThreadSpec;
  disabled: boolean;
}) {
  const { spec, threadRef } = props;
  const key = `${threadRef.environmentId}:${threadRef.threadId}`;
  const expanded = useSpecQuestionsUi((state) => state.expandedByThread[key] ?? true);
  const setExpanded = useSpecQuestionsUi((state) => state.setExpanded);
  const actions = useSpecQuestionActions(threadRef, spec);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const questions = spec.openQuestions;
  const position = Math.min(index, questions.length - 1);
  const question = questions[position]!;
  const move = (step: number) => {
    setIndex((position + step + questions.length) % questions.length);
    setSelected(null);
    setNote("");
    setAssignee(null);
  };
  const run = async <T,>(task: () => Promise<T>, done: string | ((result: T) => string)) => {
    setBusy(true);
    try {
      const result = await task();
      toastManager.add({ type: "success", title: typeof done === "string" ? done : done(result) });
      setSelected(null);
      setNote("");
      setAssignee(null);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not update questions.yml",
        description: error instanceof Error ? error.message : String(error),
      });
    }
    setBusy(false);
  };
  const trimmedNote = note.trim();
  // pb-questions answers: a letter, a letter plus a tweak, or free text.
  const answer =
    selected === null ? trimmedNote : trimmedNote ? `${selected}. ${trimmedNote}` : selected;
  const locked = props.disabled || busy;

  return (
    <Collapsible open={expanded} onOpenChange={(open) => setExpanded(threadRef, open)}>
      <CollapsibleTrigger
        render={<ComposerBanner.Row render={<button type="button" />} />}
        title={expanded ? "Hide the spec question" : "Show the spec question"}
        className="px-4 pt-1.5"
      >
        <ComposerBanner.Content>
          <span className="shrink-0 text-muted-foreground">
            {spec.ticket?.key ?? spec.slug} · Q{question.number}
          </span>
          {!expanded ? (
            <>
              <ComposerBanner.Separator />
              <span className="min-w-0 flex-1 truncate text-secondary-label">
                {question.question}
              </span>
            </>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions className="gap-0">
          {questions.length > 1 ? (
            <ComposerBanner.Count>
              {position + 1}/{questions.length}
            </ComposerBanner.Count>
          ) : null}
          <ComposerBanner.ToggleIcon expanded={expanded} />
        </ComposerBanner.Actions>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ComposerBanner.Scroll>
          <ComposerBanner.Body className="ps-6 pe-4 pb-2 wrap-anywhere sm:ps-5.5">
            <p className="pt-2 text-sm text-foreground">{question.question}</p>
            <SpecQuestionMeta threadRef={threadRef} spec={spec} question={question} />
            <div className="-ms-2 mt-1.5 sm:-ms-1.5">
              {question.options.map((option) => {
                const isSelected = selected === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={locked}
                    onClick={() => setSelected(isSelected ? null : option.key)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md py-1.5 ps-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/25 sm:ps-1.5",
                      isSelected ? "text-foreground" : "text-foreground/75 hover:bg-muted/30",
                      locked ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs font-medium uppercase",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {option.key}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm">
                        {option.text}
                        {option.recommended ? (
                          <Badge variant="info" className="ms-2 align-middle">
                            Recommended
                          </Badge>
                        ) : null}
                      </span>
                      {option.why ? (
                        <span className="text-2xs text-secondary-label">{option.why}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {question.comments.length > 0 ? (
              <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-xs">
                {question.comments.map((comment) => (
                  <li
                    key={`${comment.by}:${comment.at}:${comment.text}`}
                    className="text-secondary-label"
                  >
                    <span className="font-medium text-foreground/85">{comment.by}</span>
                    {comment.at ? ` · ${comment.at}` : ""}: {comment.text}
                  </li>
                ))}
              </ul>
            ) : null}
            <Textarea
              size="sm"
              className="mt-2"
              value={note}
              disabled={locked}
              placeholder={
                selected === null
                  ? "Type your own answer, or a comment"
                  : `Optional tweak to ${selected}, e.g. "but per center"`
              }
              onChange={(event) => setNote(event.currentTarget.value)}
            />
            {assignee !== null ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  size="compact"
                  autoFocus
                  value={assignee}
                  disabled={locked}
                  placeholder="Full Company OS name, e.g. Paul Staff"
                  onChange={(event) => setAssignee(event.currentTarget.value)}
                />
                <Button
                  size="compact"
                  disabled={locked || assignee.trim() === ""}
                  onClick={() =>
                    void run(
                      () => actions.assign(question, assignee.trim()),
                      `Q${question.number} assigned to ${assignee.trim()}`,
                    )
                  }
                >
                  Assign
                </Button>
                <Button size="compact" variant="ghost-muted" onClick={() => setAssignee(null)}>
                  Cancel
                </Button>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                size="compact"
                disabled={locked || answer === ""}
                onClick={() =>
                  void run(
                    () => actions.answer(question, answer),
                    (handedOff) =>
                      handedOff
                        ? "All questions answered. Asked the agent to review and replan."
                        : `Saved the answer to Q${question.number} in questions.yml`,
                  )
                }
              >
                Answer
              </Button>
              <Button
                size="compact"
                variant="outline"
                disabled={locked || trimmedNote === ""}
                onClick={() =>
                  void run(
                    () => actions.comment(question, SPEC_COMMENT_AUTHOR, trimmedNote),
                    `Commented on Q${question.number}`,
                  )
                }
              >
                Comment
              </Button>
              <Button
                size="compact"
                variant="ghost-muted"
                disabled={locked}
                onClick={() => setAssignee(question.assignee ?? "")}
              >
                Assign to…
              </Button>
              <Button
                size="compact"
                variant="ghost-muted"
                disabled={locked || questions.length < 2}
                onClick={() => move(1)}
              >
                Skip for now
              </Button>
              {questions.length > 1 ? (
                <span className="ms-auto flex items-center">
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Previous question"
                    onClick={() => move(-1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Next question"
                    onClick={() => move(1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                </span>
              ) : null}
            </div>
          </ComposerBanner.Body>
        </ComposerBanner.Scroll>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function SpecQuestionMeta(props: {
  threadRef: ScopedThreadRef;
  spec: ThreadSpec;
  question: SpecQuestion;
}) {
  const { question, spec } = props;
  const source = question.source === null ? null : /^(.*?)(?::(\d+))?$/.exec(question.source);
  const details = [
    question.assignee ? `For ${question.assignee}` : null,
    question.priority ? `Priority ${question.priority}` : null,
  ].filter((value) => value !== null);
  if (!question.heading && !source && details.length === 0) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-secondary-label">
      {question.heading ? <span>{question.heading}</span> : null}
      {source ? (
        <button
          type="button"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          onClick={() =>
            useRightPanelStore
              .getState()
              .openFile(
                props.threadRef,
                `${spec.root}/${specDirectory(spec.slug)}/${source[1]}`,
                source[2] === undefined ? undefined : Number(source[2]),
              )
          }
        >
          {question.source}
        </button>
      ) : null}
      {details.map((detail) => (
        <span key={detail}>· {detail}</span>
      ))}
    </p>
  );
}

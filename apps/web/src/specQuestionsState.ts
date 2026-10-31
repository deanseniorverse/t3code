// Fork-only: a thread's framework spec, its Company OS ticket and its open questions.
import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  editSpecQuestion,
  openSpecQuestions,
  parseSpecQuestions,
  parseSpecSummary,
  specAnswersCompleteMessage,
  specDirectory,
  specSlugForThread,
  type SpecQuestion,
  type SpecQuestionEdit,
  type SpecSummary,
} from "@t3tools/shared/specQuestions";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useEffectEvent } from "react";
import { create } from "zustand";

import { newMessageId } from "~/lib/utils";
import { useProjects, useThreadShell } from "./state/entities";
import { projectEnvironment } from "./state/projects";
import { threadEnvironment } from "./state/threads";
import { useAtomCommand } from "./state/use-atom-command";
import { useAtomQueryRunner } from "./state/use-atom-query-runner";
import { useOrchestrationCommand } from "./state/use-orchestration-command";

export interface ThreadSpec extends SpecSummary {
  readonly slug: string;
  readonly root: string;
  readonly questions: ReadonlyArray<SpecQuestion>;
  readonly openQuestions: ReadonlyArray<SpecQuestion>;
}

const readFileAtom = (environmentId: ScopedThreadRef["environmentId"], cwd: string, path: string) =>
  projectEnvironment.readFile({
    environmentId,
    input: { cwd, relativePath: path, allowMissing: true },
  });

const NO_SPEC_ATOM = Atom.make<ThreadSpec | null>(null);

// Keyed by JSON so the probe order is part of the key; the first root holding the spec wins.
const threadSpecAtom = Atom.family((key: string) =>
  Atom.make((get): ThreadSpec | null => {
    const [environmentId, slug, roots] = JSON.parse(key) as [
      ScopedThreadRef["environmentId"],
      string,
      string[],
    ];
    const directory = specDirectory(slug);
    for (const root of roots) {
      const spec = get(readFileAtom(environmentId, root, `${directory}/spec.md`));
      if (!AsyncResult.isSuccess(spec)) {
        if (AsyncResult.isFailure(spec)) continue;
        return null;
      }
      if (spec.value.exists === false) continue;
      const questionsFile = get(readFileAtom(environmentId, root, `${directory}/questions.yml`));
      const questions =
        AsyncResult.isSuccess(questionsFile) && questionsFile.value.exists !== false
          ? parseSpecQuestions(questionsFile.value.contents)
          : [];
      return {
        slug,
        root,
        ...parseSpecSummary(spec.value.contents),
        questions,
        openQuestions: openSpecQuestions(questions),
      };
    }
    return null;
  }).pipe(Atom.withLabel(`thread-spec:${key}`)),
);

function threadSpecKey(
  thread: EnvironmentThreadShell | null,
  projectRoots: ReadonlyArray<string>,
): string | null {
  if (thread === null) return null;
  const slug = specSlugForThread(thread);
  if (slug === null) return null;
  const roots = [
    ...new Set([
      ...(thread.worktreePath ? [thread.worktreePath] : []),
      ...(thread.folders ?? []),
      ...projectRoots,
    ]),
  ];
  return JSON.stringify([thread.environmentId, slug, roots]);
}

export function useThreadSpec(threadRef: ScopedThreadRef | null): ThreadSpec | null {
  const thread = useThreadShell(threadRef);
  const projects = useProjects();
  const ownRoot = projects.find(
    (project) =>
      project.environmentId === thread?.environmentId && project.id === thread?.projectId,
  )?.workspaceRoot;
  const projectRoots = [
    ...(ownRoot ? [ownRoot] : []),
    ...projects
      .filter((project) => project.environmentId === thread?.environmentId)
      .map((project) => project.workspaceRoot),
  ];
  const key = threadSpecKey(thread, projectRoots);
  const spec = useAtomValue(key === null ? NO_SPEC_ATOM : threadSpecAtom(key));
  const reread = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const questionsTarget =
    spec === null || thread === null
      ? null
      : {
          environmentId: thread.environmentId,
          input: {
            cwd: spec.root,
            relativePath: `${specDirectory(spec.slug)}/questions.yml`,
            allowMissing: true,
          },
        };
  const questionsKey = questionsTarget === null ? null : JSON.stringify(questionsTarget);
  const completedAt = thread?.latestRun?.completedAt ?? null;
  const rereadQuestions = useEffectEvent((key: string) => void reread(JSON.parse(key)));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- agents edit questions.yml on disk during a turn; re-read it when one ends
  useEffect(() => {
    if (completedAt !== null && questionsKey !== null) rereadQuestions(questionsKey);
  }, [completedAt, questionsKey]);
  return spec;
}

type SpecDrawerTab = "agent" | "spec";

interface SpecQuestionsUiState {
  readonly expandedByThread: Readonly<Record<string, boolean>>;
  readonly tabByThread: Readonly<Record<string, SpecDrawerTab>>;
  readonly setExpanded: (threadRef: ScopedThreadRef, expanded: boolean) => void;
  readonly setTab: (threadRef: ScopedThreadRef, tab: SpecDrawerTab) => void;
  readonly reveal: (threadRef: ScopedThreadRef) => void;
}

export const useSpecQuestionsUi = create<SpecQuestionsUiState>((set) => ({
  expandedByThread: {},
  tabByThread: {},
  setExpanded: (threadRef, expanded) =>
    set((state) => ({
      expandedByThread: { ...state.expandedByThread, [scopedThreadKey(threadRef)]: expanded },
    })),
  setTab: (threadRef, tab) =>
    set((state) => ({ tabByThread: { ...state.tabByThread, [scopedThreadKey(threadRef)]: tab } })),
  reveal: (threadRef) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      return {
        expandedByThread: { ...state.expandedByThread, [key]: true },
        tabByThread: { ...state.tabByThread, [key]: "spec" },
      };
    }),
}));

export function useSpecQuestionActions(threadRef: ScopedThreadRef, spec: ThreadSpec | null) {
  const thread = useThreadShell(threadRef);
  const readFile = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, {
    label: "spec question save",
  });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: true,
  });

  // Re-read before each edit, so a change an agent made meanwhile is not overwritten.
  const save = async (question: SpecQuestion, edit: SpecQuestionEdit): Promise<string | null> => {
    if (spec === null) return null;
    const target = {
      environmentId: threadRef.environmentId,
      input: {
        cwd: spec.root,
        relativePath: `${specDirectory(spec.slug)}/questions.yml`,
        allowMissing: true,
      },
    };
    const current = await readFile(target);
    if (current._tag === "Failure") throw squashAtomCommandFailure(current);
    const next = editSpecQuestion(current.value.contents, question.number, edit);
    if (next === null) throw new Error(`Q${question.number} is no longer in questions.yml.`);
    const written = await writeFile({
      environmentId: threadRef.environmentId,
      input: { cwd: target.input.cwd, relativePath: target.input.relativePath, contents: next },
    });
    if (written._tag === "Failure") return null;
    await readFile(target);
    return next;
  };

  // Answers only go to the file; the agent hears once, when the last open question is answered.
  const answer = async (question: SpecQuestion, value: string) => {
    const next = await save(question, { kind: "answer", answer: value });
    if (next === null || thread === null) return false;
    if (openSpecQuestions(parseSpecQuestions(next)).length > 0) return false;
    const sent = await startTurn({
      environmentId: threadRef.environmentId,
      input: {
        threadId: thread.id,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: specAnswersCompleteMessage(spec!.slug, spec!.root),
          attachments: [],
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
      },
    });
    return sent._tag === "Success";
  };

  return {
    answer,
    assign: (question: SpecQuestion, assignee: string) =>
      save(question, { kind: "assign", assignee }),
    comment: (question: SpecQuestion, by: string, text: string) =>
      save(question, {
        kind: "comment",
        comment: { by, at: new Date().toISOString().slice(0, 10), text },
      }),
  };
}

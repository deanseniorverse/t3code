// Fork-only: a thread's framework spec, its Company OS ticket and its open questions.
import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  createSpecQuestionActions,
  createThreadSpecAtoms,
  specQuestionsFileTarget,
  threadSpecKey,
  type ThreadSpec,
} from "@t3tools/client-runtime/state/spec-questions";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";
import { create } from "zustand";

import { newMessageId } from "~/lib/utils";
import { useProjects, useThreadShell } from "./state/entities";
import { projectEnvironment } from "./state/projects";
import { threadEnvironment } from "./state/threads";
import { useAtomCommand } from "./state/use-atom-command";
import { useAtomQueryRunner } from "./state/use-atom-query-runner";
import { useOrchestrationCommand } from "./state/use-orchestration-command";

export type { ThreadSpec } from "@t3tools/client-runtime/state/spec-questions";

const threadSpecs = createThreadSpecAtoms(projectEnvironment.readFile);

export function useThreadSpec(threadRef: ScopedThreadRef | null): ThreadSpec | null {
  const thread = useThreadShell(threadRef);
  const spec = useAtomValue(threadSpecs.threadSpecAtom(threadSpecKey(thread, useProjects())));
  const reread = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const questionsKey =
    spec === null || thread === null
      ? null
      : JSON.stringify(specQuestionsFileTarget(thread.environmentId, spec));
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
  return createSpecQuestionActions({ thread, spec, readFile, writeFile, startTurn, newMessageId });
}

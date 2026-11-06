// Fork-only: a thread's spec, its ticket link and its open questions.
import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  createSpecQuestionActions,
  createThreadSpecAtoms,
  isSpecListThread,
  specQuestionsFileTarget,
  threadSpecKey,
  threadSpecRefreshTargets,
  threadSpecsKey,
  type ThreadSpec,
} from "@t3tools/client-runtime/state/spec-questions";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
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
    spec === null || thread === null ? null : JSON.stringify(specQuestionsFileTarget(spec));
  const completedAt = thread?.latestRun?.completedAt ?? null;
  const rereadQuestions = useEffectEvent((key: string) => void reread(JSON.parse(key)));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- agents edit questions.yml on disk during a turn; re-read it when one ends
  useEffect(() => {
    if (completedAt !== null && questionsKey !== null) rereadQuestions(questionsKey);
  }, [completedAt, questionsKey]);
  return spec;
}

/** Which listed threads have an open spec question, kept current as turns end and on focus. */
export function useOpenSpecThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  threadKey: (thread: EnvironmentThreadShell) => string,
): ReadonlySet<string> {
  const listed = threads.filter(isSpecListThread);
  const specs = useAtomValue(
    threadSpecs.threadSpecsAtom(threadSpecsKey(listed, useProjects(), threadKey)),
  );
  const reread = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const turnsKey = listed
    .filter((thread) => specs.has(threadKey(thread)))
    .map((thread) => thread.latestRun?.completedAt ?? "")
    .join();
  const refresh = useEffectEvent(() => {
    for (const target of threadSpecRefreshTargets(specs)) void reread(target);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- agents edit spec files on disk during a turn; re-read them when one ends
  useEffect(() => {
    if (turnsKey !== "") refresh();
  }, [turnsKey]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- spec files also change outside T3; re-read them when the user comes back
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return new Set(
    [...specs].filter(([, spec]) => spec.openQuestions.length > 0).map(([key]) => key),
  );
}

/** A row's own read of the same spec, so its status matches the list's order. */
export function useThreadHasOpenSpecQuestions(thread: EnvironmentThreadShell): boolean {
  const projects = useProjects();
  const spec = useAtomValue(
    threadSpecs.threadSpecAtom(threadSpecKey(isSpecListThread(thread) ? thread : null, projects)),
  );
  return (spec?.openQuestions.length ?? 0) > 0;
}

type SpecDrawerTab = "agent" | "spec";

interface SpecQuestionsUiState {
  readonly expandedByThread: Readonly<Record<string, boolean>>;
  readonly tabByThread: Readonly<Record<string, SpecDrawerTab>>;
  readonly setExpanded: (threadRef: ScopedThreadRef, expanded: boolean) => void;
  readonly setTab: (threadRef: ScopedThreadRef, tab: SpecDrawerTab) => void;
  readonly reveal: (threadRef: ScopedThreadRef) => void;
  readonly savedRevisionByThread: Readonly<Record<string, number>>;
  readonly noteSaved: (threadRef: ScopedThreadRef) => void;
}

export const useSpecQuestionsUi = create<SpecQuestionsUiState>((set) => ({
  expandedByThread: {},
  tabByThread: {},
  savedRevisionByThread: {},
  noteSaved: (threadRef) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      return {
        savedRevisionByThread: {
          ...state.savedRevisionByThread,
          [key]: (state.savedRevisionByThread[key] ?? 0) + 1,
        },
      };
    }),
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
  const noteSaved = useSpecQuestionsUi((state) => state.noteSaved);
  return createSpecQuestionActions({
    thread,
    spec,
    readFile,
    writeFile: async (value) => {
      const written = await writeFile(value);
      if (written._tag === "Success") noteSaved(threadRef);
      return written;
    },
    startTurn,
    newMessageId,
  });
}

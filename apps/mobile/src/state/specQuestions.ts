// Fork-only: a thread's spec and the actions that answer its questions.
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
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
import { MessageId } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";
import { AppState } from "react-native";

import { uuidv4 } from "../lib/uuid";
import { useProjects } from "./entities";
import { projectEnvironment } from "./projects";
import { threadEnvironment } from "./threads";
import { useAtomCommand } from "./use-atom-command";
import { useAtomQueryRunner } from "./use-atom-query-runner";

const threadSpecs = createThreadSpecAtoms(projectEnvironment.readFile);

export function useThreadSpec(thread: EnvironmentThreadShell | null): ThreadSpec | null {
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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
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

export function useSpecQuestionActions(
  thread: EnvironmentThreadShell | null,
  spec: ThreadSpec | null,
) {
  const readFile = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, {
    label: "spec question save",
  });
  const startTurn = useAtomCommand(threadEnvironment.startTurn, "spec answers complete");
  return createSpecQuestionActions({
    thread,
    spec,
    readFile,
    writeFile,
    startTurn,
    newMessageId: () => MessageId.make(uuidv4()),
  });
}

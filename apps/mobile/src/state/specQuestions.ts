// Fork-only: a thread's framework spec and the actions that answer its questions.yml.
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  createSpecQuestionActions,
  createThreadSpecAtoms,
  specQuestionsFileTarget,
  threadSpecKey,
  type ThreadSpec,
} from "@t3tools/client-runtime/state/spec-questions";
import { MessageId } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";

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

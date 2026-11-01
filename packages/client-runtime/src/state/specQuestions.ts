// Fork-only: a thread's spec, its ticket link and its open questions.
import type { EnvironmentId, MessageId, ProjectReadFileResult } from "@t3tools/contracts";
import {
  DEFAULT_SPECS_CONFIG,
  editSpecQuestionsFile,
  fillSpecPath,
  openSpecQuestions,
  parseSpecsConfig,
  parseSpecSummary,
  readSpecQuestions,
  SPECS_CONFIG_FILE,
  specAnswersCompleteMessage,
  specSlugForThread,
  type SpecQuestion,
  type SpecQuestionEdit,
  type SpecSummary,
} from "@t3tools/shared/specQuestions";
import * as DateTime from "effect/DateTime";
import { AsyncResult, Atom } from "effect/reactivity";

import type { StartThreadTurnInput } from "../operations/commands.ts";
import type { EnvironmentProject, EnvironmentThreadShell } from "./models.ts";
import { squashAtomCommandFailure, type AtomCommandResult } from "./runtime.ts";

export interface ThreadSpec extends SpecSummary {
  readonly environmentId: EnvironmentId;
  readonly slug: string;
  readonly root: string;
  /** Relative to `root`. Single-file specs use the same path for both. */
  readonly docPath: string;
  readonly questionsPath: string;
  readonly commentAuthor: string | null;
  readonly completeMessage: string;
  readonly questions: ReadonlyArray<SpecQuestion>;
  readonly openQuestions: ReadonlyArray<SpecQuestion>;
}

export interface SpecFileTarget {
  readonly environmentId: EnvironmentId;
  readonly input: { readonly cwd: string; readonly relativePath: string; allowMissing: true };
}

function specFileTarget(
  environmentId: EnvironmentId,
  root: string,
  relativePath: string,
): SpecFileTarget {
  return { environmentId, input: { cwd: root, relativePath, allowMissing: true } };
}

export function specQuestionsFileTarget(
  spec: Pick<ThreadSpec, "environmentId" | "root" | "questionsPath">,
): SpecFileTarget {
  return specFileTarget(spec.environmentId, spec.root, spec.questionsPath);
}

export function specDocPath(spec: Pick<ThreadSpec, "root" | "docPath">): string {
  return `${spec.root}/${spec.docPath}`;
}

/** Absolute path of a question's `source`, which is relative to the spec's folder. */
export function specFilePath(spec: Pick<ThreadSpec, "root" | "docPath">, file: string): string {
  const folder = spec.docPath.includes("/")
    ? spec.docPath.slice(0, spec.docPath.lastIndexOf("/"))
    : "";
  return folder ? `${spec.root}/${folder}/${file}` : `${spec.root}/${file}`;
}

/** Splits a question's `source` (`file` or `file:line`) for opening it. */
export function parseSpecQuestionSource(
  source: string | null,
): { readonly file: string; readonly line: number | undefined } | null {
  const match = source === null ? null : /^(.*?)(?::(\d+))?$/.exec(source);
  if (!match?.[1]) return null;
  return { file: match[1], line: match[2] === undefined ? undefined : Number(match[2]) };
}

/**
 * Key for `createThreadSpecAtoms`: the thread's worktree, its attached folders, its own project,
 * then every project in its environment. The first root holding the spec wins.
 */
export function threadSpecKey(
  thread: EnvironmentThreadShell | null,
  projects: ReadonlyArray<EnvironmentProject>,
): string | null {
  if (thread === null) return null;
  const slug = specSlugForThread(thread);
  if (slug === null) return null;
  const ownRoot = projects.find(
    (project) => project.environmentId === thread.environmentId && project.id === thread.projectId,
  )?.workspaceRoot;
  const roots = [
    ...new Set([
      ...(thread.worktreePath ? [thread.worktreePath] : []),
      ...(thread.folders ?? []),
      ...(ownRoot ? [ownRoot] : []),
      ...projects
        .filter((project) => project.environmentId === thread.environmentId)
        .map((project) => project.workspaceRoot),
    ]),
  ];
  return JSON.stringify([thread.environmentId, slug, roots]);
}

export function createThreadSpecAtoms<E>(
  readFile: (
    target: SpecFileTarget,
  ) => Atom.Atom<AsyncResult.AsyncResult<ProjectReadFileResult, E>>,
) {
  const noSpecAtom = Atom.make<ThreadSpec | null>(null);
  const family = Atom.family((key: string) =>
    Atom.make((get): ThreadSpec | null => {
      const [environmentId, slug, roots] = JSON.parse(key) as [EnvironmentId, string, string[]];
      for (const root of roots) {
        const configFile = get(readFile(specFileTarget(environmentId, root, SPECS_CONFIG_FILE)));
        if (AsyncResult.isFailure(configFile)) continue;
        if (!AsyncResult.isSuccess(configFile)) return null;
        const config =
          configFile.value.exists === false
            ? DEFAULT_SPECS_CONFIG
            : parseSpecsConfig(configFile.value.contents);
        for (const location of config.specs) {
          const docPath = fillSpecPath(location.doc, slug);
          const doc = get(readFile(specFileTarget(environmentId, root, docPath)));
          if (AsyncResult.isFailure(doc)) continue;
          if (!AsyncResult.isSuccess(doc)) return null;
          if (doc.value.exists === false) continue;
          const questionsPath = location.questions
            ? fillSpecPath(location.questions, slug)
            : docPath;
          const questionsFile =
            questionsPath === docPath
              ? doc
              : get(readFile(specFileTarget(environmentId, root, questionsPath)));
          const questions =
            AsyncResult.isSuccess(questionsFile) && questionsFile.value.exists !== false
              ? readSpecQuestions(questionsPath, questionsFile.value.contents)
              : [];
          return {
            environmentId,
            slug,
            root,
            docPath,
            questionsPath,
            commentAuthor: config.commentAuthor,
            completeMessage: config.completeMessage,
            ...parseSpecSummary(doc.value.contents, config.ticket),
            questions,
            openQuestions: openSpecQuestions(questions),
          };
        }
      }
      return null;
    }).pipe(Atom.withLabel(`thread-spec:${key}`)),
  );
  const listFamily = Atom.family((listKey: string) =>
    Atom.make((get): ReadonlyMap<string, ThreadSpec> => {
      const entries = JSON.parse(listKey) as ReadonlyArray<readonly [string, string]>;
      const specs = new Map<string, ThreadSpec>();
      for (const [threadKey, specKey] of entries) {
        const spec = get(family(specKey));
        if (spec !== null) specs.set(threadKey, spec);
      }
      return specs;
    }).pipe(Atom.withLabel("thread-specs")),
  );
  return {
    threadSpecAtom: (key: string | null) => (key === null ? noSpecAtom : family(key)),
    threadSpecsAtom: listFamily,
  };
}

/** Key for `threadSpecsAtom`: the threads worth reading, by the key the caller looks them up with. */
export function threadSpecsKey(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  projects: ReadonlyArray<EnvironmentProject>,
  threadKey: (thread: EnvironmentThreadShell) => string,
): string {
  return JSON.stringify(
    threads.flatMap((thread) => {
      const key = threadSpecKey(thread, projects);
      return key === null ? [] : [[threadKey(thread), key]];
    }),
  );
}

/** Reads to repeat so a list's specs stay current: both of each found spec's files. */
export function threadSpecRefreshTargets(
  specs: ReadonlyMap<string, ThreadSpec>,
): ReadonlyArray<SpecFileTarget> {
  const targets = new Map<string, SpecFileTarget>();
  for (const spec of specs.values()) {
    for (const path of new Set([spec.docPath, spec.questionsPath])) {
      const target = specFileTarget(spec.environmentId, spec.root, path);
      targets.set(JSON.stringify(target), target);
    }
  }
  return [...targets.values()];
}

/** Settled threads can be many and are finished with, so their spec files are not read. */
export function isSpecListThread(thread: Pick<EnvironmentThreadShell, "settledOverride">): boolean {
  return thread.settledOverride !== "settled";
}

/** An open spec question is needs input once nothing else is happening on the thread. */
export function statusWithOpenSpecQuestions<S extends string>(
  status: S,
  thread: { readonly runtime: { readonly status: string } | null },
  hasOpenQuestions: boolean,
): S | "input" {
  if (!hasOpenQuestions) return status;
  return status === "ready" || (status === "waiting" && thread.runtime?.status === "idle")
    ? "input"
    : status;
}

type SpecQuestionThread = Pick<
  EnvironmentThreadShell,
  "environmentId" | "id" | "modelSelection" | "runtimeMode" | "interactionMode"
>;

export function createSpecQuestionActions(options: {
  readonly thread: SpecQuestionThread | null;
  readonly spec: ThreadSpec | null;
  readonly readFile: (
    target: SpecFileTarget,
  ) => Promise<AtomCommandResult<ProjectReadFileResult, unknown>>;
  readonly writeFile: (value: {
    readonly environmentId: EnvironmentId;
    readonly input: { readonly cwd: string; readonly relativePath: string; contents: string };
  }) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly startTurn: (value: {
    readonly environmentId: EnvironmentId;
    readonly input: StartThreadTurnInput;
  }) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly newMessageId: () => MessageId;
}) {
  const { thread, spec } = options;

  // Re-read before each edit, so a change an agent made meanwhile is not overwritten.
  const save = async (question: SpecQuestion, edit: SpecQuestionEdit): Promise<string | null> => {
    if (spec === null || thread === null) return null;
    const target = specQuestionsFileTarget(spec);
    const current = await options.readFile(target);
    if (current._tag === "Failure") throw squashAtomCommandFailure(current);
    const next = editSpecQuestionsFile(
      spec.questionsPath,
      current.value.contents,
      question.number,
      edit,
    );
    if (next === null)
      throw new Error(`Q${question.number} is no longer in ${spec.questionsPath}.`);
    const written = await options.writeFile({
      environmentId: thread.environmentId,
      input: { cwd: target.input.cwd, relativePath: target.input.relativePath, contents: next },
    });
    if (written._tag === "Failure") return null;
    await options.readFile(target);
    return next;
  };

  // Answers only go to the file; the agent hears once, when the last open question is answered.
  const answer = async (question: SpecQuestion, value: string): Promise<boolean> => {
    const next = await save(question, { kind: "answer", answer: value });
    if (next === null || thread === null || spec === null) return false;
    if (openSpecQuestions(readSpecQuestions(spec.questionsPath, next)).length > 0) return false;
    const sent = await options.startTurn({
      environmentId: thread.environmentId,
      input: {
        threadId: thread.id,
        message: {
          messageId: options.newMessageId(),
          role: "user",
          text: specAnswersCompleteMessage(
            spec.completeMessage,
            spec.slug,
            `${spec.root}/${spec.questionsPath}`,
          ),
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
        comment: { by, at: DateTime.formatIsoDateUtc(DateTime.nowUnsafe()), text },
      }),
  };
}

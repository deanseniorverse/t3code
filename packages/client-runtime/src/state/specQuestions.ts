// Fork-only: a thread's framework spec, its Company OS ticket and its open questions.
import type { EnvironmentId, MessageId, ProjectReadFileResult } from "@t3tools/contracts";
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
import * as DateTime from "effect/DateTime";
import { AsyncResult, Atom } from "effect/reactivity";

import type { StartThreadTurnInput } from "../operations/commands.ts";
import type { EnvironmentProject, EnvironmentThreadShell } from "./models.ts";
import { squashAtomCommandFailure, type AtomCommandResult } from "./runtime.ts";

export interface ThreadSpec extends SpecSummary {
  readonly slug: string;
  readonly root: string;
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
  environmentId: EnvironmentId,
  spec: Pick<ThreadSpec, "slug" | "root">,
): SpecFileTarget {
  return specFileTarget(environmentId, spec.root, `${specDirectory(spec.slug)}/questions.yml`);
}

/** Absolute path of a file in the spec's folder, e.g. `spec.md` or a question's source. */
export function specFilePath(spec: Pick<ThreadSpec, "slug" | "root">, file: string): string {
  return `${spec.root}/${specDirectory(spec.slug)}/${file}`;
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
      const directory = specDirectory(slug);
      for (const root of roots) {
        const spec = get(readFile(specFileTarget(environmentId, root, `${directory}/spec.md`)));
        if (!AsyncResult.isSuccess(spec)) {
          if (AsyncResult.isFailure(spec)) continue;
          return null;
        }
        if (spec.value.exists === false) continue;
        const questionsFile = get(readFile(specQuestionsFileTarget(environmentId, { slug, root })));
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
  return { threadSpecAtom: (key: string | null) => (key === null ? noSpecAtom : family(key)) };
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
    const target = specQuestionsFileTarget(thread.environmentId, spec);
    const current = await options.readFile(target);
    if (current._tag === "Failure") throw squashAtomCommandFailure(current);
    const next = editSpecQuestion(current.value.contents, question.number, edit);
    if (next === null) throw new Error(`Q${question.number} is no longer in questions.yml.`);
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
    if (openSpecQuestions(parseSpecQuestions(next)).length > 0) return false;
    const sent = await options.startTurn({
      environmentId: thread.environmentId,
      input: {
        threadId: thread.id,
        message: {
          messageId: options.newMessageId(),
          role: "user",
          text: specAnswersCompleteMessage(spec.slug, spec.root),
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

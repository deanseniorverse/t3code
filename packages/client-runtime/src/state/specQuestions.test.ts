import { EnvironmentId, MessageId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { parseSpecQuestions } from "@t3tools/shared/specQuestions";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { createSpecQuestionActions, statusWithOpenSpecQuestions } from "./specQuestions.ts";

const environmentId = EnvironmentId.make("environment-local");
const thread = {
  environmentId,
  id: ThreadId.make("thread-1"),
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
};
const QUESTIONS = `questions:
  - number: 1
    question: "Own item?"
    answer:
  - number: 2
    question: "Ship tagging now?"
    answer:
`;

function harness(initial: string) {
  let contents = initial;
  const readFile = vi.fn(async () =>
    AsyncResult.success({
      relativePath: "questions.yml",
      contents,
      byteLength: 0,
      truncated: false,
    }),
  );
  const writeFile = vi.fn(async (value: { readonly input: { contents: string } }) => {
    contents = value.input.contents;
    return AsyncResult.success(undefined);
  });
  const startTurn = vi.fn(async () => AsyncResult.success(undefined));
  const spec = {
    environmentId,
    slug: "2026-10-photos",
    root: "/repo",
    docPath: "specs/2026-10-photos/spec.md",
    questionsPath: "specs/2026-10-photos/questions.yml",
    commentAuthor: null,
    completeMessage: "Done {slug}: {path}",
    title: null,
    ticket: null,
  };
  const actions = createSpecQuestionActions({
    thread,
    spec: { ...spec, questions: [], openQuestions: [] },
    readFile,
    writeFile,
    startTurn,
    newMessageId: () => MessageId.make("message-1"),
  });
  return { actions, readFile, writeFile, startTurn, contents: () => contents };
}

describe("createSpecQuestionActions", () => {
  it("re-reads around each answer and tells the agent once, after the last open question", async () => {
    const h = harness(QUESTIONS);
    const [first, second] = parseSpecQuestions(QUESTIONS);

    await expect(h.actions.answer(first!, "a")).resolves.toBe(false);
    expect(h.readFile).toHaveBeenCalledTimes(2);
    expect(h.startTurn).not.toHaveBeenCalled();

    await expect(h.actions.answer(second!, "b. but per center")).resolves.toBe(true);
    expect(parseSpecQuestions(h.contents()).map((question) => question.answer)).toEqual([
      "a",
      "b. but per center",
    ]);
    expect(h.startTurn).toHaveBeenCalledTimes(1);
    expect(h.startTurn).toHaveBeenCalledWith({
      environmentId,
      input: {
        threadId: thread.id,
        message: {
          messageId: "message-1",
          role: "user",
          text: "Done 2026-10-photos: /repo/specs/2026-10-photos/questions.yml",
          attachments: [],
        },
        modelSelection: thread.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
      },
    });
  });

  it("refuses an edit to a question an agent removed meanwhile", async () => {
    const h = harness(QUESTIONS);
    const [first] = parseSpecQuestions(QUESTIONS);
    const gone = { ...first!, number: 9 };

    await expect(h.actions.assign(gone, "Paul Staff")).rejects.toThrow(
      "Q9 is no longer in specs/2026-10-photos/questions.yml.",
    );
    expect(h.writeFile).not.toHaveBeenCalled();
  });
});

describe("statusWithOpenSpecQuestions", () => {
  const idle = { runtime: { status: "idle" } };
  const running = { runtime: { status: "running" } };

  it("flags a thread with nothing else happening, and leaves other statuses alone", () => {
    expect(statusWithOpenSpecQuestions("ready", { runtime: null }, true)).toBe("input");
    expect(statusWithOpenSpecQuestions("waiting", idle, true)).toBe("input");
    expect(statusWithOpenSpecQuestions("waiting", running, true)).toBe("waiting");
    expect(statusWithOpenSpecQuestions("working", running, true)).toBe("working");
    expect(statusWithOpenSpecQuestions("failed", { runtime: null }, true)).toBe("failed");
    expect(statusWithOpenSpecQuestions("ready", { runtime: null }, false)).toBe("ready");
  });
});

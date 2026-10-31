// Fork-only: reads and answers a framework spec's questions.yml (see pb-questions).
import { isMap, isSeq, parseDocument, YAMLSeq, type YAMLMap } from "yaml";

const SPEC_SLUG_PATTERN = /^\d{4}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const COS_TICKET_PATTERN = /^D-(\d+)$/;
const COS_BASE_URL = "https://os.seniorverse.dev";

export interface SpecQuestionOption {
  readonly key: string;
  readonly text: string;
  readonly recommended: boolean;
  readonly why: string | null;
}

export interface SpecQuestionComment {
  readonly by: string;
  readonly at: string;
  readonly text: string;
}

export interface SpecQuestion {
  readonly number: number;
  readonly question: string;
  readonly source: string | null;
  readonly heading: string | null;
  readonly options: ReadonlyArray<SpecQuestionOption>;
  readonly assignee: string | null;
  readonly priority: string | null;
  readonly comments: ReadonlyArray<SpecQuestionComment>;
  readonly answer: string | null;
}

export interface SpecSummary {
  readonly title: string | null;
  readonly ticket: { readonly key: string; readonly url: string } | null;
}

/** pb-t3 names spec threads (and their branches) after the slug. */
export function specSlugForThread(thread: {
  readonly branch: string | null;
  readonly title: string;
}): string | null {
  const branchLeaf = thread.branch?.split("/").at(-1) ?? null;
  if (branchLeaf !== null && SPEC_SLUG_PATTERN.test(branchLeaf)) return branchLeaf;
  const title = thread.title.trim();
  return SPEC_SLUG_PATTERN.test(title) ? title : null;
}

export function specDirectory(slug: string): string {
  return `specs/${slug}`;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
};

export function parseSpecSummary(markdown: string): SpecSummary {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  const cos = frontMatter ? text(parseDocument(frontMatter).toJS({ maxAliasCount: 0 })?.cos) : null;
  const ticketNumber = cos === null ? null : COS_TICKET_PATTERN.exec(cos)?.[1];
  const title = /^# (.+)$/m.exec(markdown.replace(/^---\n[\s\S]*?\n---/, ""))?.[1]?.trim();
  return {
    title: title ?? null,
    ticket:
      cos !== null && ticketNumber !== undefined
        ? { key: cos, url: `${COS_BASE_URL}/dev/${ticketNumber}` }
        : null,
  };
}

export function parseSpecQuestions(yamlText: string): SpecQuestion[] {
  const raw: unknown = parseDocument(yamlText).toJS({ maxAliasCount: 0 });
  const list =
    raw !== null && typeof raw === "object" && "questions" in raw ? raw.questions : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry: Record<string, unknown> | null): SpecQuestion[] => {
    if (entry === null || typeof entry !== "object") return [];
    const number = Number(entry.number);
    const question = text(entry.question);
    if (!Number.isInteger(number) || question === null) return [];
    const options = Array.isArray(entry.options) ? entry.options : [];
    const comments = Array.isArray(entry.comments) ? entry.comments : [];
    return [
      {
        number,
        question,
        source: text(entry.source),
        heading: text(entry.heading),
        options: options.flatMap((option: Record<string, unknown> | null) => {
          const key = text(option?.key);
          const optionText = text(option?.text);
          return key === null || optionText === null
            ? []
            : [
                {
                  key,
                  text: optionText,
                  recommended: option?.recommended === true,
                  why: text(option?.why),
                },
              ];
        }),
        assignee: text(entry.assignee),
        priority: text(entry.priority),
        comments: comments.flatMap((comment: Record<string, unknown> | null) => {
          const commentText = text(comment?.text);
          return commentText === null
            ? []
            : [{ by: text(comment?.by) ?? "", at: text(comment?.at) ?? "", text: commentText }];
        }),
        answer: text(entry.answer),
      },
    ];
  });
}

export function openSpecQuestions(questions: ReadonlyArray<SpecQuestion>): SpecQuestion[] {
  return questions.filter((question) => question.answer === null);
}

export type SpecQuestionEdit =
  | { readonly kind: "answer"; readonly answer: string }
  | { readonly kind: "assign"; readonly assignee: string }
  | { readonly kind: "comment"; readonly comment: SpecQuestionComment };

/**
 * Applies one people-owned edit and keeps the rest of the file as written. Returns null when the
 * question is gone, for example because an agent applied it meanwhile.
 */
export function editSpecQuestion(
  yamlText: string,
  number: number,
  edit: SpecQuestionEdit,
): string | null {
  const document = parseDocument(yamlText);
  const list = document.get("questions");
  if (!isSeq(list)) return null;
  const entry = list.items.find(
    (item): item is YAMLMap => isMap(item) && Number(item.get("number")) === number,
  );
  if (entry === undefined) return null;
  const quoted = (value: string) => {
    const node = document.createNode(value);
    node.type = "QUOTE_DOUBLE";
    return node;
  };
  switch (edit.kind) {
    case "answer":
      entry.set("answer", quoted(edit.answer));
      break;
    case "assign":
      entry.set("assignee", quoted(edit.assignee));
      break;
    case "comment": {
      const comment = document.createNode({ by: "", at: "", text: "" }) as YAMLMap;
      comment.set("by", quoted(edit.comment.by));
      comment.set("at", quoted(edit.comment.at));
      comment.set("text", quoted(edit.comment.text));
      const comments = entry.get("comments");
      if (isSeq(comments)) {
        comments.flow = false;
        comments.items.push(comment);
      } else {
        const sequence = new YAMLSeq();
        sequence.items.push(comment);
        entry.set("comments", sequence);
      }
      break;
    }
  }
  return document.toString({ lineWidth: 0 });
}

// The full path, because spec threads usually run in another repo with the framework attached.
export function specAnswersCompleteMessage(slug: string, root: string): string {
  return `Answers are complete for ${slug}: every question in ${root}/${specDirectory(slug)}/questions.yml has an answer. Review them, apply them per pb-questions, and replan the spec.`;
}

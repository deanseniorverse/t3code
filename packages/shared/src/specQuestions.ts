// Fork-only: reads and answers a spec's questions, in a questions.yml or a fenced YAML block.
import { isMap, isSeq, parseDocument, YAMLSeq, type YAMLMap } from "yaml";

const SPEC_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const OPEN_QUESTIONS_SECTION = /^## Open Questions[ \t]*$([\s\S]*?)(?=^## |(?![\s\S]))/im;
const QUESTIONS_FENCE = /^```ya?ml[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/m;
const DEFAULT_COMPLETE_MESSAGE =
  "Answers are complete for {slug}: every question in {path} has an answer. Review them, apply them, and replan the spec.";

/** A spec's main file, and its questions file. With no `questions`, they are a block in `doc`. */
export interface SpecLocation {
  readonly doc: string;
  readonly questions: string | null;
}

export interface SpecTicketConfig {
  readonly field: string;
  readonly pattern: string;
  readonly url: string;
}

export interface SpecsConfig {
  readonly specs: ReadonlyArray<SpecLocation>;
  readonly ticket: SpecTicketConfig | null;
  readonly commentAuthor: string | null;
  readonly completeMessage: string;
}

export const SPECS_CONFIG_FILE = "t3-specs.json";

export const DEFAULT_SPECS_CONFIG: SpecsConfig = {
  specs: [{ doc: "specs/{slug}/spec.md", questions: "specs/{slug}/questions.yml" }],
  ticket: null,
  commentAuthor: null,
  completeMessage: DEFAULT_COMPLETE_MESSAGE,
};

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

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/** A missing or broken config falls back to the defaults, so a bad file cannot break the thread. */
export function parseSpecsConfig(json: string): SpecsConfig {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_SPECS_CONFIG;
  }
  if (raw === null || typeof raw !== "object") return DEFAULT_SPECS_CONFIG;
  const entries = Array.isArray(raw.specs) ? raw.specs : [];
  const specs = entries.flatMap((entry: Record<string, unknown> | null): SpecLocation[] => {
    const doc = nonEmptyString(entry?.doc);
    return doc === null ? [] : [{ doc, questions: nonEmptyString(entry?.questions) }];
  });
  const ticket = raw.ticket as Record<string, unknown> | null | undefined;
  const field = nonEmptyString(ticket?.field);
  const pattern = nonEmptyString(ticket?.pattern);
  const url = nonEmptyString(ticket?.url);
  return {
    specs: specs.length > 0 ? specs : DEFAULT_SPECS_CONFIG.specs,
    ticket: field && pattern && url ? { field, pattern, url } : null,
    commentAuthor: nonEmptyString(raw.commentAuthor),
    completeMessage: nonEmptyString(raw.completeMessage) ?? DEFAULT_COMPLETE_MESSAGE,
  };
}

export function fillSpecPath(template: string, slug: string): string {
  return template.replaceAll("{slug}", slug);
}

/** A thread names its spec by title, then by its branch's last part; related specs can share a branch. */
export function specSlugForThread(thread: {
  readonly branch: string | null;
  readonly title: string;
}): string | null {
  const title = thread.title.trim();
  if (SPEC_SLUG_PATTERN.test(title)) return title;
  const branchLeaf = thread.branch?.split("/").at(-1) ?? null;
  return branchLeaf !== null && SPEC_SLUG_PATTERN.test(branchLeaf) ? branchLeaf : null;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
};

function resolveSpecTicket(frontMatter: string | undefined, config: SpecTicketConfig | null) {
  if (!frontMatter || config === null) return null;
  const key = text(parseDocument(frontMatter).toJS({ maxAliasCount: 0 })?.[config.field]);
  if (key === null) return null;
  let match: RegExpExecArray | null;
  try {
    match = new RegExp(config.pattern).exec(key);
  } catch {
    return null;
  }
  if (match === null) return null;
  const groups = match;
  return { key, url: config.url.replace(/\{(\d+)\}/g, (_, index) => groups[Number(index)] ?? "") };
}

export function parseSpecSummary(markdown: string, ticket: SpecTicketConfig | null): SpecSummary {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  const title = /^# (.+)$/m.exec(markdown.replace(/^---\n[\s\S]*?\n---/, ""))?.[1]?.trim();
  return { title: title ?? null, ticket: resolveSpecTicket(frontMatter, ticket) };
}

/** Where the YAML sits in a spec file: the first fence under its Open Questions section. */
function findQuestionsBlock(
  markdown: string,
): { readonly start: number; readonly end: number } | null {
  const section = OPEN_QUESTIONS_SECTION.exec(markdown);
  if (section === null) return null;
  const fence = QUESTIONS_FENCE.exec(section[1] ?? "");
  if (fence === null) return null;
  const sectionBody = section.index + section[0].length - (section[1] ?? "").length;
  const start = sectionBody + fence.index + fence[0].indexOf(fence[1] ?? "");
  return { start, end: start + (fence[1] ?? "").length };
}

const isMarkdownPath = (path: string) => /\.(md|markdown)$/i.test(path);

/** The questions in a spec's questions file, whichever way it holds them. */
export function readSpecQuestions(path: string, contents: string): SpecQuestion[] {
  if (!isMarkdownPath(path)) return parseSpecQuestions(contents);
  const block = findQuestionsBlock(contents);
  return block === null ? [] : parseSpecQuestions(contents.slice(block.start, block.end));
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
function editSpecQuestion(yamlText: string, number: number, edit: SpecQuestionEdit): string | null {
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
/** `editSpecQuestion` for a whole file or a markdown block; the rest of the file is unchanged. */
export function editSpecQuestionsFile(
  path: string,
  contents: string,
  number: number,
  edit: SpecQuestionEdit,
): string | null {
  if (!isMarkdownPath(path)) return editSpecQuestion(contents, number, edit);
  const block = findQuestionsBlock(contents);
  if (block === null) return null;
  const next = editSpecQuestion(contents.slice(block.start, block.end), number, edit);
  return next === null ? null : contents.slice(0, block.start) + next + contents.slice(block.end);
}

export function specAnswersCompleteMessage(template: string, slug: string, path: string): string {
  return template.replaceAll("{slug}", slug).replaceAll("{path}", path);
}

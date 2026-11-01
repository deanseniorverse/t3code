import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_SPECS_CONFIG,
  editSpecQuestionsFile,
  openSpecQuestions,
  parseSpecQuestions,
  parseSpecsConfig,
  parseSpecSummary,
  readSpecQuestions,
  specSlugForThread,
} from "./specQuestions.ts";

const QUESTIONS = `questions:
  - number: 1
    question: "Where does Photos sit: its own item or under Activities?"
    source: plan.md:78
    heading: "Requirements › 4. Gallery page"
    options:
      - key: a
        text: "Its own sidebar item."
        recommended: true
        why: "the prototype places it there"
      - key: b
        text: "Under Activities."
    assignee:
    priority:
    comments: []
    answer:
  - number: 2
    question: "Ship tagging now?"
    options:
      - key: a
        text: "Defer it."
    comments:
      - by: "Paul Staff"
        at: "2026-10-20"
        text: "Leaning a"
    answer: a
`;

describe("specQuestions", () => {
  it("finds the slug from the title, then the branch", () => {
    expect(specSlugForThread({ branch: "dean/photos", title: "Photos work" })).toBe("photos");
    expect(specSlugForThread({ branch: "shared-branch", title: "auth-workspaces" })).toBe(
      "auth-workspaces",
    );
    expect(specSlugForThread({ branch: null, title: "Photos work" })).toBeNull();
  });

  it("reads the spec title and the ticket link its config describes", () => {
    const ticket = { field: "cos", pattern: "^D-(\\d+)$", url: "https://tickets.test/dev/{1}" };
    const markdown = "---\nslug: photos\ncos: D-141\n---\n\n# Photos: capture\n\n## Idea\n";
    expect(parseSpecSummary(markdown, ticket)).toEqual({
      title: "Photos: capture",
      ticket: { key: "D-141", url: "https://tickets.test/dev/141" },
    });
    expect(parseSpecSummary(markdown, null).ticket).toBeNull();
    expect(parseSpecSummary("# No front matter\n", ticket).ticket).toBeNull();
  });

  it("falls back to the default config when a repo's file is broken", () => {
    expect(parseSpecsConfig("{ not json")).toBe(DEFAULT_SPECS_CONFIG);
    const config = parseSpecsConfig('{"specs":[{"doc":"tickets/{slug}.md"},{"questions":"x"}]}');
    expect(config.specs).toEqual([{ doc: "tickets/{slug}.md", questions: null }]);
    expect(config.commentAuthor).toBeNull();
  });

  it("reads and answers a fenced block, leaving the rest of the spec file as written", () => {
    const blockYaml = 'questions:\n  - number: 1\n    question: "Free text only?"\n    answer:\n';
    const markdown = `---\nstatus: active\n---\n\n# A spec\n\n## Open Questions\n\n\`\`\`yaml\n${blockYaml}\`\`\`\n\n## Problem\n\n\`\`\`yaml\nquestions: not these\n\`\`\`\n`;

    expect(readSpecQuestions("a.md", markdown)).toMatchObject([{ number: 1, options: [] }]);
    expect(readSpecQuestions("a.md", "# No section\n")).toEqual([]);

    const answered = editSpecQuestionsFile("a.md", markdown, 1, { kind: "answer", answer: "yes" })!;
    expect(answered).toBe(
      markdown.replace('Free text only?"\n    answer:', 'Free text only?"\n    answer: "yes"'),
    );
    expect(
      editSpecQuestionsFile("a.md", "# No section\n", 1, { kind: "answer", answer: "a" }),
    ).toBeNull();
  });

  it("parses questions and keeps only unanswered ones open", () => {
    const questions = parseSpecQuestions(QUESTIONS);
    expect(questions[0]).toMatchObject({
      number: 1,
      heading: "Requirements › 4. Gallery page",
      options: [
        { key: "a", recommended: true, why: "the prototype places it there" },
        { key: "b", recommended: false, why: null },
      ],
      answer: null,
    });
    expect(questions[1]?.comments).toEqual([
      { by: "Paul Staff", at: "2026-10-20", text: "Leaning a" },
    ]);
    expect(openSpecQuestions(questions).map((question) => question.number)).toEqual([1]);
  });

  it("writes one people-owned field and leaves the rest of the file as written", () => {
    const answered = editSpecQuestionsFile("questions.yml", QUESTIONS, 1, {
      kind: "answer",
      answer: "a. but per center",
    })!;
    expect(answered).toBe(
      QUESTIONS.replace(
        "    answer:\n  - number: 2",
        '    answer: "a. but per center"\n  - number: 2',
      ),
    );

    const assigned = editSpecQuestionsFile("questions.yml", QUESTIONS, 1, {
      kind: "assign",
      assignee: "Paul Staff",
    })!;
    expect(parseSpecQuestions(assigned)[0]?.assignee).toBe("Paul Staff");

    const commented = editSpecQuestionsFile("questions.yml", QUESTIONS, 1, {
      kind: "comment",
      comment: { by: "Dean Mraz", at: "2026-10-30", text: "Ask Paul: per center?" },
    })!;
    expect(parseSpecQuestions(commented)[0]?.comments).toEqual([
      { by: "Dean Mraz", at: "2026-10-30", text: "Ask Paul: per center?" },
    ]);
    expect(
      editSpecQuestionsFile("questions.yml", QUESTIONS, 9, { kind: "answer", answer: "a" }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  editSpecQuestion,
  openSpecQuestions,
  parseSpecQuestions,
  parseSpecSummary,
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
  it("finds the slug from the branch, then the title", () => {
    expect(specSlugForThread({ branch: "dean/2026-10-photos", title: "x" })).toBe("2026-10-photos");
    expect(specSlugForThread({ branch: "main", title: "2026-10-photos" })).toBe("2026-10-photos");
    expect(specSlugForThread({ branch: null, title: "Photos work" })).toBeNull();
  });

  it("reads the spec title and Company OS ticket", () => {
    expect(
      parseSpecSummary(
        "---\nslug: 2026-10-photos\ncos: D-141\n---\n\n# Photos: capture\n\n## Idea\n",
      ),
    ).toEqual({
      title: "Photos: capture",
      ticket: { key: "D-141", url: "https://os.seniorverse.dev/dev/141" },
    });
    expect(parseSpecSummary("# No front matter\n").ticket).toBeNull();
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
    const answered = editSpecQuestion(QUESTIONS, 1, {
      kind: "answer",
      answer: "a. but per center",
    })!;
    expect(answered).toBe(
      QUESTIONS.replace(
        "    answer:\n  - number: 2",
        '    answer: "a. but per center"\n  - number: 2',
      ),
    );

    const assigned = editSpecQuestion(QUESTIONS, 1, { kind: "assign", assignee: "Paul Staff" })!;
    expect(parseSpecQuestions(assigned)[0]?.assignee).toBe("Paul Staff");

    const commented = editSpecQuestion(QUESTIONS, 1, {
      kind: "comment",
      comment: { by: "Dean Mraz", at: "2026-10-30", text: "Ask Paul: per center?" },
    })!;
    expect(parseSpecQuestions(commented)[0]?.comments).toEqual([
      { by: "Dean Mraz", at: "2026-10-30", text: "Ask Paul: per center?" },
    ]);
    expect(editSpecQuestion(QUESTIONS, 9, { kind: "answer", answer: "a" })).toBeNull();
  });
});

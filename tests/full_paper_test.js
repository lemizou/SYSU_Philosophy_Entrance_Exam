"use strict";

require("../web/full_paper.js");

const assert = require("node:assert/strict");
const actualQuestions = require("../data/questions.json");

const allQuestions = [
  { id: "w24-a1", year: 2024, subject: "外国哲学史", section: "第一类", number: 1 },
  { id: "w24-a2", year: 2024, subject: "外国哲学史", section: "第一类", number: 2 },
  { id: "w24-b1", year: 2024, subject: "外国哲学史", section: "第二类", number: 1 },
  { id: "c24-a1", year: 2024, subject: "中国哲学史", section: "第一类", number: 1 },
  { id: "w25-a1", year: 2025, subject: "外国哲学史", section: "第一类", number: 1 },
  {
    id: "w25-b1",
    year: 2025,
    subject: "外国哲学史",
    section: "第二类",
    number: 1,
    section_instruction: "任选一题"
  },
  { id: "w25-c1", year: 2025, subject: "外国哲学史", section: "第三类", number: 1 }
];

const papers = FullPaper.build(
  allQuestions,
  [allQuestions[4], allQuestions[0], allQuestions[3]]
);

assert.deepEqual(
  papers.map((paper) => [paper.subject, paper.year]),
  [
    ["外国哲学史", 2025],
    ["外国哲学史", 2024],
    ["中国哲学史", 2024]
  ]
);
assert.deepEqual(
  papers[1].questions.map((question) => question.id),
  ["w24-a1", "w24-a2", "w24-b1"]
);
assert.ok(
  papers[1].questions.every((question) => question.subject === "外国哲学史"),
  "同一全卷内不得混入其他科目"
);

const groups = FullPaper.sectionGroups(papers[0].questions);
assert.deepEqual(
  groups.map((group) => [group.section, group.questions.map((question) => question.id)]),
  [
    ["第一类", ["w25-a1"]],
    ["第二类", ["w25-b1"]],
    ["第三类", ["w25-c1"]]
  ]
);
assert.equal(groups[1].instruction, "任选一题");

const actualPaper = FullPaper.build(
  actualQuestions,
  actualQuestions.filter((question) =>
    question.year === 2025 && question.subject === "外国哲学史")
)[0];
assert.deepEqual(
  actualPaper.questions.map((question) => question.id),
  actualQuestions
    .filter((question) =>
      question.year === 2025 && question.subject === "外国哲学史")
    .map((question) => question.id),
  "实际题库的全卷顺序必须与 questions.json 完全一致"
);

console.log("FULL_PAPER_TESTS_OK");

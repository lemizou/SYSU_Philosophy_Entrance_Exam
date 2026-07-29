"use strict";

require("../web/search_query.js");
require("../web/tag_filters.js");
require("../web/search_engine.js");

const assert = require("node:assert/strict");

const questions = [
  {
    id: "q1", year: 2024, subject: "外国哲学史", section: "第一类",
    question: "比较康德与黑格尔。", passage: "",
    philosophers: ["康德", "黑格尔"], schools: ["先验哲学"],
    periods: ["近代哲学"], topics: ["认识论"], works: []
  },
  {
    id: "q2", year: 2023, subject: "中国哲学史", section: "第三类",
    question: "朱熹的理气论。", passage: "",
    philosophers: ["朱熹"], schools: ["宋明理学"],
    periods: [], topics: [], works: []
  }
];
const aliases = new Map([["安瑟伦", "安瑟尔谟"]]);
const canonicalize = SearchEngine.createCanonicalizer(aliases);
const conditions = {
  keyword: "康德 黑格尔",
  years: [2024],
  subjects: ["外国哲学史"],
  sections: ["第一类"],
  tags: { philosophers: ["康德", "朱熹"], topics: ["认识论"] }
};

assert.deepEqual(
  SearchEngine.filter(questions, conditions, canonicalize).map((q) => q.id),
  ["q1"]
);
assert.deepEqual(
  SearchEngine.filter(
    questions,
    { keyword: "", years: [], subjects: [], sections: [], tags: {} },
    canonicalize
  ).map((q) => q.id),
  ["q1", "q2"]
);

console.log("SEARCH_ENGINE_TESTS_OK");

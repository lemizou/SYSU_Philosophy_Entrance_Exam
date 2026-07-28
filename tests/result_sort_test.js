"use strict";

require("../web/search_highlight.js");
require("../web/result_sort.js");

const assert = require("node:assert/strict");

const questions = [
  {
    id: "older-title",
    year: 2020,
    question: "康德的先验哲学",
    passage: "",
    philosophers: ["康德"]
  },
  {
    id: "newer-passage",
    year: 2024,
    question: "阅读材料",
    passage: "这段材料讨论康德。",
    philosophers: []
  },
  {
    id: "middle",
    year: 2022,
    question: "朱熹的理气论",
    passage: "",
    philosophers: ["朱熹"]
  }
];
const fields = ["philosophers"];
const canonicalize = SearchHighlight.normalize;

assert.deepEqual(
  ResultSort.sort(questions, "year_desc", [], fields, canonicalize).map((q) => q.id),
  ["newer-passage", "middle", "older-title"]
);
assert.deepEqual(
  ResultSort.sort(questions, "year_asc", [], fields, canonicalize).map((q) => q.id),
  ["older-title", "middle", "newer-passage"]
);
assert.deepEqual(
  ResultSort.sort(questions, "relevance", ["康德"], fields, canonicalize).map(
    (q) => q.id
  ),
  ["older-title", "newer-passage", "middle"]
);
assert.deepEqual(
  ResultSort.sort(questions, "relevance", [], fields, canonicalize).map((q) => q.id),
  ["newer-passage", "middle", "older-title"]
);
assert.throws(
  () => ResultSort.sort(questions, "unknown", [], fields, canonicalize),
  /未知排序方式/
);

console.log("RESULT_SORT_TESTS_OK");

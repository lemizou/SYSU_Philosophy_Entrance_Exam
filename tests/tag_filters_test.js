"use strict";

require("../web/tag_filters.js");

const assert = require("node:assert/strict");

const questions = [
  { philosophers: ["康德", "黑格尔"], topics: ["认识论"] },
  { philosophers: ["康德"], topics: [] },
  { philosophers: ["朱熹"], topics: ["认识论"] }
];
const fields = ["philosophers", "topics"];
const counts = TagFilters.countByField(questions, fields);

assert.equal(counts.get("philosophers\u0000康德"), 2);
assert.equal(counts.get("philosophers\u0000黑格尔"), 1);
assert.equal(counts.get("topics\u0000认识论"), 2);

const normalize = (value) => String(value).toLocaleLowerCase();
assert.equal(
  TagFilters.matches(["康德", "黑格尔"], ["康德", "朱熹"], normalize),
  true
);
assert.equal(
  TagFilters.matches(["康德", "黑格尔"], ["朱熹", "庄子"], normalize),
  false
);
assert.equal(TagFilters.matches([], [], normalize), true);

const selected = [];
TagFilters.toggle(selected, "康德");
assert.deepEqual(selected, ["康德"]);
TagFilters.toggle(selected, "黑格尔");
assert.deepEqual(selected, ["康德", "黑格尔"]);
TagFilters.toggle(selected, "康德");
assert.deepEqual(selected, ["黑格尔"]);

console.log("TAG_FILTER_TESTS_OK");

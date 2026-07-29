"use strict";

require("../web/url_state.js");

const assert = require("node:assert/strict");

const state = {
  keyword: '康德 "哥白尼转向"',
  subject: "外国哲学史",
  yearFrom: "2020",
  yearTo: "2025",
  section: "第一类",
  sortMode: "year_desc",
  tags: {
    philosophers: ["康德", "黑格尔"],
    schools: ["先验哲学"],
    periods: [],
    topics: ["认识论"],
    works: []
  }
};

const query = UrlState.serialize(state);
const restored = UrlState.parse(query);
assert.deepEqual(restored, state);
assert.match(query, /q=/);
assert.match(query, /person=/);

const defaults = UrlState.serialize({
  keyword: "",
  subject: "",
  yearFrom: "",
  yearTo: "",
  section: "",
  sortMode: "relevance",
  tags: Object.fromEntries(
    Object.keys(UrlState.TAG_PARAMS).map((field) => [field, []])
  )
});
assert.equal(defaults, "");

const duplicateTags = UrlState.parse("?person=康德&person=康德&person=黑格尔");
assert.deepEqual(duplicateTags.tags.philosophers, ["康德", "黑格尔"]);

const legacyParameters = UrlState.parse(
  "?q=康德&verification=cross_checked&unknown=ignored"
);
assert.equal("verification" in legacyParameters, false);
assert.equal(UrlState.serialize(legacyParameters), "q=%E5%BA%B7%E5%BE%B7");

console.log("URL_STATE_TESTS_OK");

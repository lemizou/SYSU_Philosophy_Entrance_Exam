"use strict";

require("../web/url_state.js");

const assert = require("node:assert/strict");

const state = {
  keyword: '康德 "哥白尼转向"',
  subject: "外国哲学史",
  yearFrom: "2020",
  yearTo: "2025",
  section: "简答",
  verification: "cross_checked",
  sortMode: "year_desc",
  tags: {
    philosophers: ["康德", "黑格尔"],
    schools: ["先验哲学"],
    periods: [],
    topics: ["认识论"],
    works: []
  },
  tagModes: {
    philosophers: "all",
    schools: "any",
    periods: "any",
    topics: "any",
    works: "any"
  }
};

const query = UrlState.serialize(state);
const restored = UrlState.parse(query);
assert.deepEqual(restored, state);
assert.match(query, /q=/);
assert.match(query, /person=/);
assert.match(query, /person_mode=all/);

const defaults = UrlState.serialize({
  keyword: "",
  subject: "",
  yearFrom: "",
  yearTo: "",
  section: "",
  verification: "",
  sortMode: "relevance",
  tags: Object.fromEntries(
    Object.keys(UrlState.TAG_PARAMS).map((field) => [field, []])
  ),
  tagModes: Object.fromEntries(
    Object.keys(UrlState.TAG_PARAMS).map((field) => [field, "any"])
  )
});
assert.equal(defaults, "");

const noTagsWithAllMode = {
  ...UrlState.parse(""),
  tagModes: Object.fromEntries(
    Object.keys(UrlState.TAG_PARAMS).map((field) => [field, "all"])
  )
};
assert.equal(UrlState.serialize(noTagsWithAllMode), "");

const duplicateTags = UrlState.parse("?person=康德&person=康德&person=黑格尔");
assert.deepEqual(duplicateTags.tags.philosophers, ["康德", "黑格尔"]);

console.log("URL_STATE_TESTS_OK");

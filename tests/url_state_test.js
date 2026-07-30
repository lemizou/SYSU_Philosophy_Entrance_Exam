"use strict";

require("../web/url_state.js");

const assert = require("node:assert/strict");

const state = {
  keyword: '康德 "哥白尼转向"',
  subject: "外国哲学史",
  years: ["2020", "2022", "2025"],
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
assert.match(query, /year=2020/);

const defaults = UrlState.serialize({
  keyword: "",
  subject: "",
  years: [],
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

const duplicateYears = UrlState.parse("?year=2025&year=2025&year=2024");
assert.deepEqual(duplicateYears.years, ["2025", "2024"]);

const legacyParameters = UrlState.parse(
  "?q=康德&verification=cross_checked&unknown=ignored"
);
assert.equal("verification" in legacyParameters, false);
assert.equal(UrlState.serialize(legacyParameters), "q=%E5%BA%B7%E5%BE%B7");

const fullPaper = UrlState.parse("?subject=外国哲学史&section=full_paper");
assert.equal(fullPaper.section, "full_paper");
assert.match(UrlState.serialize(fullPaper), /section=full_paper/);

const legacyYearRange = UrlState.parse("?from=2020&to=2025");
assert.deepEqual(legacyYearRange.years, []);
assert.equal(legacyYearRange.yearFrom, "2020");
assert.equal(legacyYearRange.yearTo, "2025");

console.log("URL_STATE_TESTS_OK");

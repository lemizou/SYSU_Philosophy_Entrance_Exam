"use strict";

require("../web/search_query.js");

const assert = require("node:assert/strict");

function matchingIds(expression) {
  const documents = [
    { id: "q1", text: "比较康德与黑格尔的认识论" },
    { id: "q2", text: "安瑟尔谟的上帝存在证明" },
    { id: "q3", text: "朱熹的理气论" }
  ];
  const query = SearchQuery.parse(expression);
  return documents
    .filter((document) =>
      SearchQuery.matches(query, (term) => document.text.includes(term)))
    .map((document) => document.id);
}

assert.deepEqual(matchingIds("康德 黑格尔"), ["q1"]);
assert.deepEqual(matchingIds("康德 OR 朱熹"), ["q1", "q3"]);
assert.deepEqual(matchingIds('"康德与黑格尔"'), ["q1"]);
assert.deepEqual(matchingIds("康德 OR 朱熹 -黑格尔"), ["q3"]);
assert.deepEqual(matchingIds("-黑格尔"), ["q2", "q3"]);
assert.throws(() => SearchQuery.parse("康德 OR"), /OR 两侧/);
assert.throws(() => SearchQuery.parse('"康德'), /引号没有闭合/);

console.log("WEB_QUERY_TESTS_OK");

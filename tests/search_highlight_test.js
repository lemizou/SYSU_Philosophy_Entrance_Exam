"use strict";

require("../web/search_highlight.js");

const assert = require("node:assert/strict");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[
      character
    ]);
const aliases = new Map([["安瑟伦", "安瑟尔谟"]]);
const canonicalize = (value) =>
  SearchHighlight.normalize(aliases.get(SearchHighlight.normalize(value)) || value);

assert.equal(
  SearchHighlight.highlight("康德与黑格尔", ["康德"], canonicalize, escapeHtml),
  '<mark class="match">康德</mark>与黑格尔'
);
assert.equal(
  SearchHighlight.highlight("哥白尼 转向", ["哥白尼转向"], canonicalize, escapeHtml),
  '<mark class="match">哥白尼 转向</mark>'
);
assert.equal(
  SearchHighlight.hasMatch("安瑟尔谟", ["安瑟伦"], canonicalize),
  true
);
assert.equal(
  SearchHighlight.highlight("<康德>", ["康德"], canonicalize, escapeHtml),
  '&lt;<mark class="match">康德</mark>&gt;'
);

const longText = `${"甲".repeat(80)}康德${"乙".repeat(80)}`;
const excerpt = SearchHighlight.snippet(
  longText,
  ["康德"],
  canonicalize,
  escapeHtml,
  12
);
assert.match(excerpt, /^…/);
assert.match(excerpt, /<mark class="match">康德<\/mark>/);
assert.match(excerpt, /…$/);
assert.ok(excerpt.length < longText.length);

console.log("SEARCH_HIGHLIGHT_TESTS_OK");

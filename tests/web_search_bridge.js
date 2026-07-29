"use strict";

require("../web/search_query.js");
require("../web/tag_filters.js");
require("../web/search_engine.js");
require("../web/search_highlight.js");
require("../web/result_sort.js");

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const questions = JSON.parse(
  fs.readFileSync(path.join(root, "data", "questions.json"), "utf8")
);
const taxonomy = JSON.parse(
  fs.readFileSync(path.join(root, "data", "tag_taxonomy.json"), "utf8")
);
const conditions = JSON.parse(fs.readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
const canonicalize = SearchEngine.createCanonicalizer(
  SearchEngine.createAliasMap(taxonomy)
);
const keywordQuery = SearchQuery.parse(conditions.keyword || "");
const matched = SearchEngine.filter(
  questions,
  { ...conditions, keywordQuery },
  canonicalize
);
const terms = [...new Set(keywordQuery.positiveGroups.flat())];
const sorted = ResultSort.sort(
  matched,
  conditions.sortMode || "relevance",
  terms,
  SearchEngine.TAG_FIELDS,
  canonicalize
);
process.stdout.write(JSON.stringify(sorted.map((question) => question.id)));

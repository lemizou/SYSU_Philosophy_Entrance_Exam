(function (global) {
  "use strict";

  const MODES = ["relevance", "year_desc", "year_asc"];

  function score(question, terms, tagFields, canonicalize) {
    let total = 0;
    for (const term of terms) {
      if (SearchHighlight.hasMatch(question.question, [term], canonicalize)) {
        total += 8;
      }
      if (
        tagFields.some((field) =>
          (question[field] || []).some((name) =>
            SearchHighlight.hasMatch(name, [term], canonicalize)))
      ) {
        total += 5;
      }
      if (SearchHighlight.hasMatch(question.passage, [term], canonicalize)) {
        total += 2;
      }
    }
    return total;
  }

  function sort(questions, mode, terms, tagFields, canonicalize) {
    if (!MODES.includes(mode)) throw new Error(`未知排序方式：${mode}`);
    const effectiveMode =
      mode === "relevance" && !terms.length ? "year_desc" : mode;
    return questions
      .map((question, index) => ({ question, index }))
      .sort((left, right) => {
        const leftYear = Number(left.question.year || 0);
        const rightYear = Number(right.question.year || 0);
        if (effectiveMode === "year_asc") {
          return leftYear - rightYear
            || String(left.question.id).localeCompare(String(right.question.id));
        }
        if (effectiveMode === "year_desc") {
          return rightYear - leftYear
            || String(left.question.id).localeCompare(String(right.question.id));
        }
        const scoreDifference =
          score(right.question, terms, tagFields, canonicalize)
          - score(left.question, terms, tagFields, canonicalize);
        return scoreDifference
          || rightYear - leftYear
          || left.index - right.index;
      })
      .map((item) => item.question);
  }

  global.ResultSort = { MODES, score, sort };
})(typeof window === "undefined" ? globalThis : window);

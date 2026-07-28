(function (global) {
  "use strict";

  function parse(value) {
    const text = String(value ?? "");
    const tokens = [];
    let index = 0;

    while (index < text.length) {
      while (index < text.length && /\s/u.test(text[index])) index += 1;
      if (index >= text.length) break;

      const excluded = text[index] === "-";
      if (excluded) {
        index += 1;
        if (index >= text.length || /\s/u.test(text[index])) {
          throw new Error("减号后必须紧跟要排除的关键词");
        }
      }

      const quoted = text[index] === '"';
      let term;
      if (quoted) {
        index += 1;
        const end = text.indexOf('"', index);
        if (end === -1) throw new Error("引号没有闭合");
        term = text.slice(index, end);
        index = end + 1;
        if (index < text.length && !/\s/u.test(text[index])) {
          throw new Error("引号短语后需要空格");
        }
      } else {
        let end = index;
        while (end < text.length && !/\s/u.test(text[end])) end += 1;
        term = text.slice(index, end);
        index = end;
      }

      if (!term) throw new Error("关键词不能为空");
      tokens.push({ term, excluded, quoted });
    }

    const positiveGroups = [[]];
    const excludedTerms = [];
    let sawOr = false;
    for (const token of tokens) {
      if (
        !token.excluded
        && !token.quoted
        && token.term.toLocaleLowerCase() === "or"
      ) {
        if (!positiveGroups.at(-1).length) {
          throw new Error("OR 两侧都必须有正向关键词");
        }
        positiveGroups.push([]);
        sawOr = true;
      } else if (token.excluded) {
        if (!excludedTerms.includes(token.term)) excludedTerms.push(token.term);
      } else if (!positiveGroups.at(-1).includes(token.term)) {
        positiveGroups.at(-1).push(token.term);
      }
    }

    if (sawOr && !positiveGroups.at(-1).length) {
      throw new Error("OR 两侧都必须有正向关键词");
    }
    return {
      positiveGroups: positiveGroups.filter((group) => group.length),
      excludedTerms
    };
  }

  function matches(query, contains) {
    if (query.excludedTerms.some(contains)) return false;
    if (!query.positiveGroups.length) return true;
    return query.positiveGroups.some((group) => group.every(contains));
  }

  global.SearchQuery = { parse, matches };
})(typeof window === "undefined" ? globalThis : window);

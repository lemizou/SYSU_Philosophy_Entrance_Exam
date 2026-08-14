(function (global) {
  "use strict";

  function chineseNgrams(text) {
    const normalized = String(text ?? "").toLocaleLowerCase();
    const tokens = normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || [];
    return tokens.flatMap((token) => {
      if (!/\p{Script=Han}/u.test(token)) return [token];
      const grams = [token];
      for (let size = 2; size <= Math.min(6, token.length); size += 1) {
        for (let index = 0; index <= token.length - size; index += 1) {
          grams.push(token.slice(index, index + size));
        }
      }
      return grams;
    });
  }

  function create(questions, aliases) {
    if (!global.MiniSearch) throw new Error("MiniSearch 未加载");
    const index = new global.MiniSearch({
      fields: ["question", "concepts", "tags", "passage"],
      storeFields: ["id"],
      tokenize: chineseNgrams,
      searchOptions: {
        boost: { question: 8, concepts: 6, tags: 5, passage: 2 },
        prefix: true,
        fuzzy: (term) => term.length >= 4 && !/^\d{4}$/u.test(term) ? 0.24 : false
      }
    });
    index.addAll(questions.map((question) => ({
      id: question.id,
      question: question.question || "",
      passage: global.SearchEngine?.searchableText(question)
        || [question.passage, question.section_instruction].filter(Boolean).join(" "),
      concepts: aliases.conceptsFor(question).join(" "),
      tags: [question.year, ...["philosophers", "schools", "periods", "topics", "works"]
        .flatMap((field) => question[field] || [])].filter(Boolean).join(" ")
    })));
    return {
      search(query) {
        if (!String(query || "").trim()) return new Map();
        const results = index.search(query);
        const minimumScore = (results[0]?.score || 0) * 0.05;
        return new Map(results
          .filter((result) => result.score >= minimumScore)
          .slice(0, 50)
          .map((result) => [result.id, result.score]));
      }
    };
  }

  function createRecords(records, aliases) {
    if (!global.MiniSearch) throw new Error("MiniSearch 未加载");
    const index = new global.MiniSearch({
      fields: ["text", "concepts"],
      storeFields: ["id"],
      tokenize: chineseNgrams,
      searchOptions: {
        boost: { text: 8, concepts: 6 },
        prefix: true,
        fuzzy: (term) => term.length >= 4 && !/^\d{4}$/u.test(term) ? 0.24 : false
      }
    });
    index.addAll(records.map((record) => ({
      id: record.id,
      text: record.text || "",
      concepts: aliases.conceptsForText(record.text || "").join(" ")
    })));
    return {
      search(query) {
        if (!String(query || "").trim()) return new Set(records.map((record) => record.id));
        const groups = String(query).trim().split(/\s+/u).map((term) => {
          const results = index.search(term);
          const minimumScore = (results[0]?.score || 0) * 0.05;
          return new Set(results
            .filter((result) => result.score >= minimumScore)
            .slice(0, 50)
            .map((result) => result.id));
        });
        return new Set([...groups[0]].filter((id) =>
          groups.slice(1).every((group) => group.has(id))));
      }
    };
  }

  global.SearchIndex = { chineseNgrams, create, createRecords };
})(typeof window === "undefined" ? globalThis : window);

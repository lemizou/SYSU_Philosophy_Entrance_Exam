(function (global) {
  "use strict";

  const TAG_FIELDS = ["philosophers", "schools", "periods", "topics", "works"];

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase().replace(/\s+/g, "");
  }

  function normalizeSubject(value) {
    return value === "西方哲学史" ? "外国哲学史" : value;
  }

  function createAliasMap(taxonomy) {
    return new Map(
      (taxonomy.tags || []).flatMap((tag) =>
        (tag.aliases || []).map((alias) => [normalize(alias), tag.name]))
    );
  }

  function createCanonicalizer(aliasMap) {
    return (value) => {
      const normalized = normalize(value);
      return normalize(aliasMap.get(normalized) || value);
    };
  }

  function searchableValues(question = {}) {
    return [
      String(question.year || ""),
      question.subject,
      question.section,
      question.number ? `第${question.number}题` : "",
      question.question,
      question.passage,
      question.section_instruction,
      ...TAG_FIELDS.flatMap((field) => question[field] || [])
    ].filter(Boolean);
  }

  function searchableText(question) {
    return searchableValues(question).join(" ");
  }

  function matches(question, conditions, canonicalize, expandTerm = (term) => [term]) {
    const keywordQuery = conditions.keywordQuery
      || global.SearchQuery.parse(conditions.keyword || "");
    if (keywordQuery.positiveGroups.length || keywordQuery.excludedTerms.length) {
      const searchable = searchableValues(question).map(normalize);
      const contains = (term) => {
        const needles = expandTerm(term).flatMap((variant) => [
          normalize(variant),
          canonicalize(variant)
        ]).filter(Boolean);
        return needles.some((needle) =>
          searchable.some((value) => value.includes(needle)));
      };
      if (!global.SearchQuery.matches(keywordQuery, contains)) return false;
    }
    if (conditions.years?.length && !conditions.years.includes(question.year)) {
      return false;
    }
    if (
      conditions.subjects?.length
      && !conditions.subjects.map(normalizeSubject)
        .includes(normalizeSubject(question.subject))
    ) {
      return false;
    }
    if (
      conditions.sections?.length
      && !conditions.sections.includes(question.section)
    ) {
      return false;
    }
    return TAG_FIELDS.every((field) =>
      global.TagFilters.matches(
        question[field] || [],
        conditions.tags?.[field] || [],
        canonicalize
      )
    );
  }

  function filter(questions, conditions, canonicalize, expandTerm) {
    return questions.filter((question) =>
      matches(question, conditions, canonicalize, expandTerm));
  }

  global.SearchEngine = {
    TAG_FIELDS,
    normalize,
    normalizeSubject,
    createAliasMap,
    createCanonicalizer,
    searchableValues,
    searchableText,
    matches,
    filter
  };
})(typeof window === "undefined" ? globalThis : window);

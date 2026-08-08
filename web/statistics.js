(function (global) {
  "use strict";

  const TAG_FIELDS = {
    philosopher: "philosophers",
    school: "schools",
    period: "periods",
    topic: "topics",
    work: "works"
  };

  function filterQuestions(questions, filters = {}) {
    return questions.filter((question) => {
      if (filters.subject && question.subject !== filters.subject) return false;
      if (filters.section && question.section !== filters.section) return false;
      if (filters.yearFrom && question.year < Number(filters.yearFrom)) return false;
      if (filters.yearTo && question.year > Number(filters.yearTo)) return false;
      return true;
    });
  }

  function summarize(questions, tagType = "topic", filters = {}) {
    const filtered = filterQuestions(questions, filters);
    const field = TAG_FIELDS[tagType] || TAG_FIELDS.topic;
    const years = [...new Set(filtered.map((question) => question.year))].sort((a, b) => a - b);
    const byYear = new Map(years.map((year) => [year, 0]));
    const tags = new Map();

    for (const question of filtered) {
      const questionTags = new Set(question[field] || []);
      if (questionTags.size) {
        byYear.set(question.year, (byYear.get(question.year) || 0) + 1);
      }
      for (const tag of questionTags) {
        if (!tags.has(tag)) tags.set(tag, { name: tag, count: 0, years: new Map() });
        const item = tags.get(tag);
        item.count += 1;
        item.years.set(question.year, (item.years.get(question.year) || 0) + 1);
      }
    }

    const ranking = [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
    return {
      filtered,
      years,
      byYear,
      ranking,
      tagCount: ranking.length,
      chartQuestionCount: [...byYear.values()].reduce((total, count) => total + count, 0),
      maxYearCount: Math.max(0, ...byYear.values()),
      maxCellCount: Math.max(0, ...ranking.flatMap((item) => [...item.years.values()]))
    };
  }

  global.ExamStatistics = { TAG_FIELDS, filterQuestions, summarize };
})(typeof window === "undefined" ? globalThis : window);

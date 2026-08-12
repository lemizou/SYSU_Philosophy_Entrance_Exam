(function (global) {
  "use strict";

  const TAG_PARAMS = {
    philosophers: "person",
    schools: "school",
    periods: "period",
    topics: "topic",
    works: "work"
  };

  function emptyTags() {
    return Object.fromEntries(Object.keys(TAG_PARAMS).map((field) => [field, []]));
  }

  function parse(search) {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const tags = emptyTags();
    for (const [field, parameter] of Object.entries(TAG_PARAMS)) {
      tags[field] = [...new Set(params.getAll(parameter).filter(Boolean))];
    }
    return {
      keyword: params.get("q") || "",
      subject: params.get("subject") || "",
      years: [...new Set(params.getAll("year").filter(Boolean))],
      yearFrom: params.get("from") || "",
      yearTo: params.get("to") || "",
      section: params.get("section") || "",
      sortMode: params.get("sort") || "relevance",
      tags
    };
  }

  function serialize(state) {
    const params = new URLSearchParams();
    if (state.keyword) params.set("q", state.keyword);
    if (state.subject) params.set("subject", state.subject);
    for (const year of state.years || []) params.append("year", year);
    if (state.yearFrom) params.set("from", state.yearFrom);
    if (state.yearTo) params.set("to", state.yearTo);
    if (state.section) params.set("section", state.section);
    if (state.sortMode && state.sortMode !== "relevance") {
      params.set("sort", state.sortMode);
    }
    for (const [field, parameter] of Object.entries(TAG_PARAMS)) {
      const values = state.tags[field] || [];
      for (const value of values) params.append(parameter, value);
    }
    return params.toString();
  }

  global.UrlState = { TAG_PARAMS, parse, serialize };
})(typeof window === "undefined" ? globalThis : window);

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

  function emptyTagModes() {
    return Object.fromEntries(Object.keys(TAG_PARAMS).map((field) => [field, "any"]));
  }

  function parse(search) {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const tags = emptyTags();
    const tagModes = emptyTagModes();
    for (const [field, parameter] of Object.entries(TAG_PARAMS)) {
      tags[field] = [...new Set(params.getAll(parameter).filter(Boolean))];
      const mode = params.get(`${parameter}_mode`);
      if (mode === "all") tagModes[field] = "all";
    }
    return {
      keyword: params.get("q") || "",
      subject: params.get("subject") || "",
      yearFrom: params.get("from") || "",
      yearTo: params.get("to") || "",
      section: params.get("section") || "",
      verification: params.get("verification") || "",
      sortMode: params.get("sort") || "relevance",
      tags,
      tagModes
    };
  }

  function serialize(state) {
    const params = new URLSearchParams();
    if (state.keyword) params.set("q", state.keyword);
    if (state.subject) params.set("subject", state.subject);
    if (state.yearFrom) params.set("from", state.yearFrom);
    if (state.yearTo) params.set("to", state.yearTo);
    if (state.section) params.set("section", state.section);
    if (state.verification) params.set("verification", state.verification);
    if (state.sortMode && state.sortMode !== "relevance") {
      params.set("sort", state.sortMode);
    }
    for (const [field, parameter] of Object.entries(TAG_PARAMS)) {
      const values = state.tags[field] || [];
      for (const value of values) params.append(parameter, value);
      if (values.length && state.tagModes[field] === "all") {
        params.set(`${parameter}_mode`, "all");
      }
    }
    return params.toString();
  }

  global.UrlState = { TAG_PARAMS, parse, serialize };
})(typeof window === "undefined" ? globalThis : window);

(function (global) {
  "use strict";

  function countByField(questions, fields) {
    const counts = new Map();
    for (const field of fields) {
      for (const question of questions) {
        for (const name of question[field] || []) {
          const key = `${field}\u0000${name}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    return counts;
  }

  function matches(availableValues, requestedValues, mode, canonicalize) {
    if (!requestedValues.length) return true;
    const available = new Set(availableValues.map(canonicalize));
    const requested = requestedValues.map(canonicalize);
    return mode === "all"
      ? requested.every((value) => available.has(value))
      : requested.some((value) => available.has(value));
  }

  function toggle(values, value) {
    const index = values.indexOf(value);
    if (index === -1) values.push(value);
    else values.splice(index, 1);
    return values;
  }

  global.TagFilters = { countByField, matches, toggle };
})(typeof window === "undefined" ? globalThis : window);

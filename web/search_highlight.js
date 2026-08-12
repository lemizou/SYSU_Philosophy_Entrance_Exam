(function (global) {
  "use strict";

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase().replace(/\s+/gu, "");
  }

  function normalizedWithMap(value) {
    const source = String(value ?? "");
    let normalized = "";
    const sourceIndexes = [];
    let sourceIndex = 0;
    for (const character of source) {
      const lowered = character.toLocaleLowerCase();
      if (!/\s/u.test(character)) {
        normalized += lowered;
        for (let index = 0; index < lowered.length; index += 1) {
          sourceIndexes.push(sourceIndex);
        }
      }
      sourceIndex += character.length;
    }
    return { source, normalized, sourceIndexes };
  }

  function needlesForTerm(term, canonicalize) {
    return [...new Set([normalize(term), canonicalize(term)].filter(Boolean))];
  }

  function ranges(value, terms, canonicalize) {
    const mapped = normalizedWithMap(value);
    const found = [];
    for (const term of terms) {
      for (const needle of needlesForTerm(term, canonicalize)) {
        let fromIndex = 0;
        while (fromIndex <= mapped.normalized.length - needle.length) {
          const matchIndex = mapped.normalized.indexOf(needle, fromIndex);
          if (matchIndex === -1) break;
          const start = mapped.sourceIndexes[matchIndex];
          const nextNormalizedIndex = matchIndex + needle.length;
          const end = nextNormalizedIndex < mapped.sourceIndexes.length
            ? mapped.sourceIndexes[nextNormalizedIndex]
            : mapped.source.length;
          found.push([start, end]);
          fromIndex = matchIndex + Math.max(needle.length, 1);
        }
      }
    }

    found.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const merged = [];
    for (const range of found) {
      const previous = merged.at(-1);
      if (previous && range[0] <= previous[1]) {
        previous[1] = Math.max(previous[1], range[1]);
      } else {
        merged.push([...range]);
      }
    }
    return merged;
  }

  function hasMatch(value, terms, canonicalize) {
    return ranges(value, terms, canonicalize).length > 0;
  }

  function highlight(value, terms, canonicalize, escapeHtml) {
    const source = String(value ?? "");
    const matches = ranges(source, terms, canonicalize);
    if (!matches.length) return escapeHtml(source);

    let cursor = 0;
    let output = "";
    for (const [start, end] of matches) {
      output += escapeHtml(source.slice(cursor, start));
      output += `<mark class="match">${escapeHtml(source.slice(start, end))}</mark>`;
      cursor = end;
    }
    output += escapeHtml(source.slice(cursor));
    return output;
  }

  function snippet(value, terms, canonicalize, escapeHtml, radius = 58) {
    const source = String(value ?? "");
    const firstRange = ranges(source, terms, canonicalize)[0];
    if (!firstRange) return "";
    const start = Math.max(0, firstRange[0] - radius);
    const end = Math.min(source.length, firstRange[1] + radius);
    const excerpt = source.slice(start, end);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < source.length ? "…" : "";
    return `${prefix}${highlight(excerpt, terms, canonicalize, escapeHtml)}${suffix}`;
  }

  global.SearchHighlight = { hasMatch, highlight, normalize, ranges, snippet };
})(typeof window === "undefined" ? globalThis : window);

(function (global) {
  "use strict";

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase().replace(/\s+/gu, "");
  }

  function create(groups) {
    const variantsByTerm = new Map();
    for (const group of groups || []) {
      const variants = [...new Set([group.canonical, ...(group.aliases || [])]
        .map(normalize).filter(Boolean))];
      for (const variant of variants) variantsByTerm.set(variant, variants);
    }
    return {
      expand(term) {
        const normalized = normalize(term);
        return variantsByTerm.get(normalized) || (normalized ? [normalized] : []);
      },
      conceptsForText(text) {
        const searchable = normalize(text);
        const concepts = [];
        for (const group of groups || []) {
          const variants = [group.canonical, ...(group.aliases || [])];
          if (variants.some((variant) => searchable.includes(normalize(variant)))) {
            concepts.push(...variants);
          }
        }
        return [...new Set(concepts)];
      },
      conceptsFor(question) {
        const text = [
          question.question,
          question.passage,
          ...(question.philosophers || []),
          ...(question.schools || []),
          ...(question.periods || []),
          ...(question.topics || []),
          ...(question.works || [])
        ].join(" ");
        return this.conceptsForText(text);
      }
    };
  }

  global.ConceptAliases = { normalize, create };
})(typeof window === "undefined" ? globalThis : window);

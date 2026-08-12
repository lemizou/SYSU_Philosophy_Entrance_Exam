(function (global) {
  "use strict";

  const SECTION_VALUE = "full_paper";

  function paperKey(question) {
    return `${question.subject}\u0000${question.year}`;
  }

  function build(allQuestions, orderedMatches) {
    const orderedKeys = [];
    const seen = new Set();
    for (const question of orderedMatches) {
      const key = paperKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      orderedKeys.push(key);
    }

    const papers = new Map(orderedKeys.map((key) => [key, []]));
    for (const question of allQuestions) {
      const paper = papers.get(paperKey(question));
      if (paper) paper.push(question);
    }

    return orderedKeys.map((key) => {
      const paperQuestions = papers.get(key);
      const first = paperQuestions[0];
      return {
        id: `paper:${first.subject}:${first.year}`,
        year: first.year,
        subject: first.subject,
        questions: paperQuestions
      };
    });
  }

  function sectionGroups(questions) {
    const groups = [];
    for (const question of questions) {
      const section = question.section || "未标注题型";
      const previous = groups.at(-1);
      if (!previous || previous.section !== section) {
        groups.push({
          section,
          instruction: question.section_instruction || "",
          questions: [question]
        });
      } else {
        previous.questions.push(question);
        if (!previous.instruction && question.section_instruction) {
          previous.instruction = question.section_instruction;
        }
      }
    }
    return groups;
  }

  global.FullPaper = { SECTION_VALUE, build, sectionGroups };
})(typeof window === "undefined" ? globalThis : window);

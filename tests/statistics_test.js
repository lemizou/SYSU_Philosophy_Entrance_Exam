const assert = require("assert");
require("../web/statistics.js");

const questions = [
  { year: 2024, subject: "中国哲学史", section: "第一类", topics: ["认识论"], philosophers: ["孔子"] },
  { year: 2024, subject: "中国哲学史", section: "第二类", topics: ["认识论", "伦理学"], philosophers: ["孟子"] },
  { year: 2025, subject: "外国哲学史", section: "第一类", topics: ["认识论"], philosophers: ["康德"] }
];

const all = ExamStatistics.summarize(questions, "topic");
assert.deepStrictEqual(all.years, [2024, 2025]);
assert.strictEqual(all.byYear.get(2024), 2);
assert.strictEqual(all.ranking[0].name, "认识论");
assert.strictEqual(all.ranking[0].count, 3);
assert.strictEqual(all.ranking[0].years.get(2024), 2);

const chinese = ExamStatistics.summarize(questions, "philosopher", { subject: "中国哲学史" });
assert.strictEqual(chinese.filtered.length, 2);
assert.deepStrictEqual(chinese.ranking.map((item) => item.name).sort(), ["孔子", "孟子"]);

const works = ExamStatistics.summarize(questions, "work");
assert.deepStrictEqual([...works.byYear.entries()], [[2024, 0], [2025, 0]]);
assert.strictEqual(works.chartQuestionCount, 0);

const firstSection = ExamStatistics.summarize(questions, "topic", { section: "第一类" });
assert.deepStrictEqual([...firstSection.byYear.entries()], [[2024, 1], [2025, 1]]);
assert.strictEqual(firstSection.chartQuestionCount, 2);

console.log("statistics_test.js: ok");

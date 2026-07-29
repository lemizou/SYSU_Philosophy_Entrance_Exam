"""题库 JSON 的基本结构契约测试。"""

from __future__ import annotations

import json
import unittest
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = PROJECT_ROOT / "data" / "questions.json"
TAXONOMY_PATH = PROJECT_ROOT / "data" / "tag_taxonomy.json"

REQUIRED_FIELDS = {
    "id",
    "year",
    "subject",
    "section",
    "number",
    "question",
    "philosophers",
    "schools",
    "periods",
    "topics",
    "works",
    "sources",
    "verification",
}
TAG_FIELDS = ("philosophers", "schools", "periods", "topics", "works")
OPTIONAL_TEXT_FIELDS = (
    "passage",
    "section_instruction",
    "source_note",
    "transcription_note",
)
SUBJECTS = {"中国哲学史", "外国哲学史"}
SECTION_TYPES = {"第一类", "第二类", "第三类"}
VERIFICATION_STATES = {"single_source", "cross_checked"}
PASSAGE_STATES = {"full_text", "source_summary"}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


class DataIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.questions = load_json(QUESTIONS_PATH)
        cls.taxonomy = load_json(TAXONOMY_PATH)

    def test_top_level_shapes(self) -> None:
        self.assertIsInstance(self.questions, list)
        self.assertGreater(len(self.questions), 0)
        self.assertIsInstance(self.taxonomy, dict)
        self.assertIsInstance(self.taxonomy.get("tags"), list)

    def test_question_required_fields_and_scalar_types(self) -> None:
        for index, question in enumerate(self.questions):
            with self.subTest(index=index, question_id=question.get("id")):
                self.assertIsInstance(question, dict)
                self.assertFalse(REQUIRED_FIELDS - question.keys())
                self.assertIsInstance(question["id"], str)
                self.assertTrue(question["id"].strip())
                self.assertIsInstance(question["year"], int)
                self.assertGreaterEqual(question["year"], 2000)
                self.assertLessEqual(question["year"], 2100)
                self.assertIn(question["subject"], SUBJECTS)
                self.assertIn(question["section"], SECTION_TYPES)
                self.assertIsInstance(question["number"], int)
                self.assertGreater(question["number"], 0)
                self.assertIsInstance(question["question"], str)
                self.assertTrue(question["question"].strip())
                self.assertIn(question["verification"], VERIFICATION_STATES)

                for field in OPTIONAL_TEXT_FIELDS:
                    if field in question:
                        self.assertIsInstance(question[field], str)
                        self.assertTrue(question[field].strip())

                if "passage_status" in question:
                    self.assertIn(question["passage_status"], PASSAGE_STATES)
                    self.assertIn("passage", question)

    def test_question_ids_are_unique(self) -> None:
        ids = [question["id"] for question in self.questions]
        duplicates = [
            question_id
            for question_id, count in Counter(ids).items()
            if count > 1
        ]
        self.assertEqual(duplicates, [])

    def test_each_paper_uses_category_prefix_in_order(self) -> None:
        expected_order = ["第一类", "第二类", "第三类"]
        paper_sections: dict[tuple[int, str], list[str]] = {}
        for question in self.questions:
            key = (question["year"], question["subject"])
            sections = paper_sections.setdefault(key, [])
            if question["section"] not in sections:
                sections.append(question["section"])
        for paper, sections in paper_sections.items():
            with self.subTest(paper=paper):
                self.assertEqual(sections, expected_order[: len(sections)])

    def test_tag_fields_are_string_arrays(self) -> None:
        for question in self.questions:
            for field in TAG_FIELDS:
                with self.subTest(question_id=question["id"], field=field):
                    values = question[field]
                    self.assertIsInstance(values, list)
                    self.assertTrue(all(isinstance(value, str) for value in values))
                    self.assertTrue(all(value.strip() for value in values))

    def test_work_tags_have_meaningful_coverage(self) -> None:
        registered_works = {
            tag["name"]
            for tag in self.taxonomy["tags"]
            if tag.get("type") == "work"
        }
        tagged_questions = [
            question for question in self.questions if question["works"]
        ]
        explicitly_titled_questions = [
            question
            for question in self.questions
            if "《"
            in "\n".join(
                str(question.get(field, ""))
                for field in ("question", "passage", "section_instruction")
            )
        ]

        self.assertGreaterEqual(len(registered_works), 60)
        self.assertGreaterEqual(len(tagged_questions), 100)
        used_works = {
            work for question in self.questions for work in question["works"]
        }
        self.assertEqual(registered_works, used_works)
        self.assertTrue(
            all(question["works"] for question in explicitly_titled_questions)
        )

    def test_sources_have_valid_locations(self) -> None:
        for question in self.questions:
            with self.subTest(question_id=question["id"]):
                sources = question["sources"]
                self.assertIsInstance(sources, list)
                self.assertGreater(len(sources), 0)
                for source in sources:
                    self.assertIsInstance(source, dict)
                    self.assertIsInstance(source.get("file"), str)
                    self.assertTrue(source["file"].strip())
                    if "page" in source:
                        self.assertIsInstance(source["page"], int)
                        self.assertGreater(source["page"], 0)
                    if "pages" in source:
                        self.assertIsInstance(source["pages"], list)
                        self.assertGreater(len(source["pages"]), 0)
                        self.assertTrue(
                            all(
                                isinstance(page, int) and page > 0
                                for page in source["pages"]
                            )
                        )


if __name__ == "__main__":
    unittest.main()

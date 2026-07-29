"""统一检索条件模型的最小契约测试。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from search import (  # noqa: E402
    SearchConditions,
    filter_questions,
    parse_keyword_query,
    sort_questions,
)


QUESTIONS = [
    {
        "id": "q1",
        "year": 2024,
        "subject": "外国哲学史",
        "section": "第一类",
        "verification": "cross_checked",
        "question": "比较康德与黑格尔。",
        "passage": "",
        "philosophers": ["康德", "黑格尔"],
        "schools": ["先验哲学"],
        "periods": ["近代哲学"],
        "topics": ["认识论"],
        "works": [],
    },
    {
        "id": "q2",
        "year": 2023,
        "subject": "外国哲学史",
        "section": "第二类",
        "verification": "single_source",
        "question": "安瑟尔谟的上帝存在证明。",
        "passage": "",
        "philosophers": ["安瑟尔谟"],
        "schools": [],
        "periods": ["中世纪哲学"],
        "topics": ["上帝存在证明"],
        "works": [],
    },
    {
        "id": "q3",
        "year": 2024,
        "subject": "中国哲学史",
        "section": "第三类",
        "verification": "cross_checked",
        "question": "朱熹的理气论。",
        "passage": "",
        "philosophers": ["朱熹"],
        "schools": ["宋明理学"],
        "periods": [],
        "topics": [],
        "works": [],
    },
]

ALIASES = {"安瑟伦": "安瑟尔谟"}


class SearchConditionsTest(unittest.TestCase):
    def ids(self, conditions: SearchConditions) -> list[str]:
        return [
            question["id"]
            for question in filter_questions(QUESTIONS, conditions, ALIASES)
        ]

    def test_different_dimensions_use_and(self) -> None:
        conditions = SearchConditions(
            keyword="比较",
            tags={"philosophers": ("康德",)},
            years=(2024,),
            subjects=("外国哲学史",),
        )
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_regular_values_use_or(self) -> None:
        conditions = SearchConditions(years=(2023, 2024))
        self.assertEqual(self.ids(conditions), ["q1", "q2", "q3"])

    def test_tag_any_mode(self) -> None:
        conditions = SearchConditions(
            tags={"philosophers": ("康德", "朱熹")},
            tag_modes={"philosophers": "any"},
        )
        self.assertEqual(self.ids(conditions), ["q1", "q3"])

    def test_tag_all_mode(self) -> None:
        conditions = SearchConditions(
            tags={"philosophers": ("康德", "黑格尔")},
            tag_modes={"philosophers": "all"},
        )
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_different_tag_categories_use_and(self) -> None:
        conditions = SearchConditions(
            tags={
                "philosophers": ("康德",),
                "topics": ("认识论",),
            }
        )
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_alias_is_canonicalized(self) -> None:
        conditions = SearchConditions(tags={"philosophers": ("安瑟伦",)})
        self.assertEqual(self.ids(conditions), ["q2"])

    def test_subject_alias_is_canonicalized(self) -> None:
        conditions = SearchConditions(subjects=("西方哲学史",))
        self.assertEqual(self.ids(conditions), ["q1", "q2"])

    def test_invalid_tag_mode_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            SearchConditions(tag_modes={"philosophers": "xor"})

    def test_space_separated_terms_use_and(self) -> None:
        conditions = SearchConditions(keyword="康德 黑格尔")
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_or_separates_positive_groups(self) -> None:
        conditions = SearchConditions(keyword="康德 OR 安瑟伦")
        self.assertEqual(self.ids(conditions), ["q1", "q2"])

    def test_quoted_phrase_stays_together(self) -> None:
        conditions = SearchConditions(keyword='"康德与黑格尔"')
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_excluded_terms_apply_to_every_or_group(self) -> None:
        conditions = SearchConditions(keyword="康德 OR 朱熹 -黑格尔")
        self.assertEqual(self.ids(conditions), ["q3"])

    def test_query_can_contain_only_excluded_terms(self) -> None:
        conditions = SearchConditions(keyword="-黑格尔")
        self.assertEqual(self.ids(conditions), ["q2", "q3"])

    def test_keyword_and_structured_filters_still_use_and(self) -> None:
        conditions = SearchConditions(
            keyword="康德 OR 朱熹",
            subjects=("外国哲学史",),
        )
        self.assertEqual(self.ids(conditions), ["q1"])

    def test_malformed_query_is_rejected(self) -> None:
        for expression in ("康德 OR", "OR 康德", '"康德', "- 康德"):
            with self.subTest(expression=expression):
                with self.assertRaises(ValueError):
                    parse_keyword_query(expression)

    def test_section_and_verification_filters_use_and(self) -> None:
        conditions = SearchConditions(
            years=(2023, 2024),
            sections=("第三类",),
            verification=("cross_checked",),
        )
        self.assertEqual(self.ids(conditions), ["q3"])

    def test_year_sorting(self) -> None:
        conditions = SearchConditions()
        descending = sort_questions(QUESTIONS, conditions, "year_desc")
        ascending = sort_questions(QUESTIONS, conditions, "year_asc")
        self.assertEqual([question["id"] for question in descending], ["q1", "q3", "q2"])
        self.assertEqual([question["id"] for question in ascending], ["q2", "q1", "q3"])

    def test_relevance_prefers_question_and_tag_matches(self) -> None:
        questions = [
            {
                **QUESTIONS[0],
                "id": "title-and-tag",
                "year": 2020,
            },
            {
                **QUESTIONS[1],
                "id": "passage-only",
                "year": 2024,
                "question": "阅读材料",
                "passage": "这段材料讨论康德。",
                "philosophers": [],
            },
        ]
        conditions = SearchConditions(keyword="康德")
        sorted_questions = sort_questions(
            questions, conditions, "relevance"
        )
        self.assertEqual(
            [question["id"] for question in sorted_questions],
            ["title-and-tag", "passage-only"],
        )

    def test_relevance_without_keyword_falls_back_to_newest(self) -> None:
        sorted_questions = sort_questions(
            QUESTIONS, SearchConditions(), "relevance"
        )
        self.assertEqual(
            [question["id"] for question in sorted_questions],
            ["q1", "q3", "q2"],
        )


if __name__ == "__main__":
    unittest.main()

"""题型三分类迁移规则测试。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from migrate_sections import classify_sections  # noqa: E402


def question(year: int, subject: str, section: str) -> dict[str, object]:
    return {"year": year, "subject": subject, "section": section}


class SectionMigrationTest(unittest.TestCase):
    def test_three_blocks_follow_first_appearance_order(self) -> None:
        questions = [
            question(2025, "中国哲学史", "名词解释"),
            question(2025, "中国哲学史", "名词解释"),
            question(2025, "中国哲学史", "简答"),
            question(2025, "中国哲学史", "论述"),
        ]
        counts, original = classify_sections(questions)
        self.assertEqual(
            [item["section"] for item in questions],
            ["第一类", "第一类", "第二类", "第三类"],
        )
        self.assertEqual(
            original[(2025, "中国哲学史")],
            ["名词解释", "简答", "论述"],
        )
        self.assertEqual(counts, {"第一类": 2, "第二类": 1, "第三类": 1})

    def test_two_blocks_do_not_create_a_third_category(self) -> None:
        questions = [
            question(2024, "外国哲学史", "第一大题"),
            question(2024, "外国哲学史", "第二大题"),
        ]
        classify_sections(questions)
        self.assertEqual(
            [item["section"] for item in questions],
            ["第一类", "第二类"],
        )

    def test_more_than_three_blocks_is_rejected(self) -> None:
        questions = [
            question(2023, "中国哲学史", section)
            for section in ("一", "二", "三", "四")
        ]
        with self.assertRaises(ValueError):
            classify_sections(questions)


if __name__ == "__main__":
    unittest.main()

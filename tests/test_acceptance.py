"""真实题库检索验收与网页/命令行一致性测试。"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from search import (  # noqa: E402
    SearchConditions,
    filter_questions,
    load_questions,
    load_tag_aliases,
    sort_questions,
)


class SearchAcceptanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.questions = load_questions()
        cls.aliases = load_tag_aliases()

    def results(self, **kwargs: object) -> list[dict[str, object]]:
        return filter_questions(
            self.questions,
            SearchConditions(**kwargs),
            self.aliases,
        )

    def test_all_431_questions_load_and_empty_conditions_return_all(self) -> None:
        self.assertEqual(len(self.questions), 431)
        self.assertEqual(len(self.results()), 431)

    def test_keyword_syntax_on_real_data(self) -> None:
        single = self.results(keyword="康德")
        conjunction = self.results(keyword="康德 先验")
        disjunction = self.results(keyword="康德 OR 朱熹")
        phrase = self.results(keyword='"哥白尼转向"')
        excluded = self.results(keyword="康德 -黑格尔")

        self.assertTrue(single)
        self.assertTrue(conjunction)
        self.assertTrue(disjunction)
        self.assertTrue(phrase)
        self.assertTrue(excluded)
        self.assertLessEqual(len(conjunction), len(single))
        self.assertGreaterEqual(len(disjunction), len(single))
        self.assertTrue(
            all("黑格尔" not in json.dumps(q, ensure_ascii=False) for q in excluded)
        )

    def test_tag_alias_same_category_or_and_cross_category_and(self) -> None:
        alias_results = self.results(tags={"philosophers": ("安瑟伦",)})
        canonical_results = self.results(tags={"philosophers": ("安瑟尔谟",)})
        same_category = self.results(
            tags={"philosophers": ("康德", "朱熹")}
        )
        cross_category = self.results(
            tags={"philosophers": ("孔子",), "schools": ("早期儒学",)}
        )

        self.assertTrue(alias_results)
        self.assertEqual(
            [q["id"] for q in alias_results],
            [q["id"] for q in canonical_results],
        )
        self.assertTrue(same_category)
        self.assertTrue(cross_category)
        self.assertTrue(
            all(
                {"康德", "朱熹"} & set(q["philosophers"])
                for q in same_category
            )
        )
        self.assertTrue(
            all(
                "孔子" in q["philosophers"] and "早期儒学" in q["schools"]
                for q in cross_category
            )
        )

    def test_year_subject_section_combination_and_no_result(self) -> None:
        combined = self.results(
            years=(2026,),
            subjects=("中国哲学史",),
            sections=("第一类",),
        )
        self.assertTrue(combined)
        self.assertTrue(
            all(
                q["year"] == 2026
                and q["subject"] == "中国哲学史"
                and q["section"] == "第一类"
                for q in combined
            )
        )
        self.assertEqual(self.results(keyword="绝对不存在的自动测试词"), [])

    def test_web_engine_and_cli_return_identical_ids(self) -> None:
        node = shutil.which("node")
        self.assertIsNotNone(node)
        cases = [
            {
                "keyword": "康德",
                "years": [],
                "subjects": [],
                "sections": [],
                "tags": {},
                "sortMode": "relevance",
            },
            {
                "keyword": "康德 OR 朱熹 -黑格尔",
                "years": [],
                "subjects": [],
                "sections": [],
                "tags": {},
                "sortMode": "year_desc",
            },
            {
                "keyword": "",
                "years": [2003],
                "subjects": ["中国哲学史"],
                "sections": ["第一类"],
                "tags": {"philosophers": ["孔子", "孟子"]},
                "sortMode": "year_asc",
            },
        ]
        for case in cases:
            with self.subTest(case=case):
                conditions = SearchConditions(
                    keyword=case["keyword"],
                    years=tuple(case["years"]),
                    subjects=tuple(case["subjects"]),
                    sections=tuple(case["sections"]),
                    tags={
                        field: tuple(values)
                        for field, values in case["tags"].items()
                    },
                )
                python_results = sort_questions(
                    filter_questions(self.questions, conditions, self.aliases),
                    conditions,
                    str(case["sortMode"]),
                    self.aliases,
                )
                completed = subprocess.run(
                    [node, str(PROJECT_ROOT / "tests" / "web_search_bridge.js")],
                    cwd=PROJECT_ROOT,
                    input=json.dumps(case, ensure_ascii=False),
                    text=True,
                    encoding="utf-8",
                    capture_output=True,
                    check=True,
                )
                web_ids = json.loads(completed.stdout)
                self.assertEqual(
                    web_ids,
                    [q["id"] for q in python_results],
                )
                cli_command = [
                    sys.executable,
                    str(PROJECT_ROOT / "src" / "search.py"),
                ]
                if case["keyword"]:
                    cli_command.append(str(case["keyword"]))
                for year in case["years"]:
                    cli_command.extend(["--year", str(year)])
                for subject in case["subjects"]:
                    cli_command.extend(["--subject", str(subject)])
                for section in case["sections"]:
                    cli_command.extend(["--section", str(section)])
                for philosopher in case["tags"].get("philosophers", []):
                    cli_command.extend(["--philosopher", str(philosopher)])
                cli_command.extend(
                    ["--sort", str(case["sortMode"]), "--ids-only"]
                )
                cli = subprocess.run(
                    cli_command,
                    cwd=PROJECT_ROOT,
                    text=True,
                    encoding="utf-8",
                    capture_output=True,
                    check=True,
                )
                self.assertEqual(cli.stdout.splitlines(), web_ids)


class WindowsLauncherTest(unittest.TestCase):
    @unittest.skipUnless(sys.platform == "win32", "仅在 Windows 验证 .cmd 启动器")
    def test_launcher_cmd_starts_search_server(self) -> None:
        completed = subprocess.run(
            [
                "cmd.exe",
                "/d",
                "/c",
                str(PROJECT_ROOT / "启动检索.cmd"),
                "--no-browser",
                "--port",
                "0",
                "--smoke-test",
            ],
            cwd=PROJECT_ROOT,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=15,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("启动检索自检通过", completed.stdout)


class SiteEntryPointTest(unittest.TestCase):
    def test_root_index_redirects_to_search_and_preserves_url_state(self) -> None:
        content = (PROJECT_ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('content="0; url=web/search.html"', content)
        self.assertIn(
            'new URL("web/search.html", window.location.href)',
            content,
        )
        self.assertIn("target.search = window.location.search", content)
        self.assertIn("target.hash = window.location.hash", content)
        self.assertIn('href="web/search.html"', content)


if __name__ == "__main__":
    unittest.main()

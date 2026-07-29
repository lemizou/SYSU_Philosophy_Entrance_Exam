"""按每份试卷中的出现顺序，将题型统一为第一类、第二类和第三类。"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = PROJECT_ROOT / "data" / "questions.json"
REPORT_PATH = PROJECT_ROOT / "docs" / "section-classification.md"
SECTION_CLASSES = ("第一类", "第二类", "第三类")


def load_questions() -> list[dict[str, Any]]:
    with QUESTIONS_PATH.open("r", encoding="utf-8") as file:
        questions = json.load(file)
    if not isinstance(questions, list):
        raise ValueError("questions.json 顶层必须是数组")
    return questions


def get_section_order(
    questions: list[dict[str, Any]],
) -> dict[tuple[int, str], list[str]]:
    """返回每份试卷中各题型区块首次出现的顺序。"""
    section_order: dict[tuple[int, str], list[str]] = defaultdict(list)
    for question in questions:
        key = (question["year"], question["subject"])
        section = question["section"]
        if section not in section_order[key]:
            section_order[key].append(section)
    return dict(section_order)


def classify_sections(
    questions: list[dict[str, Any]],
) -> tuple[dict[str, int], dict[tuple[int, str], list[str]]]:
    """原地更新题型，并返回分类计数及原始区块顺序。"""
    section_order = get_section_order(questions)
    too_many = {
        key: sections
        for key, sections in section_order.items()
        if len(sections) > len(SECTION_CLASSES)
    }
    if too_many:
        details = "; ".join(
            f"{year} {subject}: {sections}"
            for (year, subject), sections in sorted(too_many.items())
        )
        raise ValueError(f"发现超过三类题型的试卷：{details}")

    section_indexes = {
        key: {section: index for index, section in enumerate(sections)}
        for key, sections in section_order.items()
    }
    counts = {name: 0 for name in SECTION_CLASSES}
    for question in questions:
        key = (question["year"], question["subject"])
        section_class = SECTION_CLASSES[section_indexes[key][question["section"]]]
        question["section"] = section_class
        counts[section_class] += 1
    return counts, section_order


def write_report(section_order: dict[tuple[int, str], list[str]]) -> None:
    lines = [
        "# 题型三分类映射",
        "",
        "题型按每份试卷中题型区块的首次出现顺序统一：第一块为“第一类”，"
        "第二块为“第二类”，第三块为“第三类”。原卷只有一块或两块时，不补造不存在的类别。",
        "",
        "| 年份 | 科目 | 原题型顺序与统一分类 |",
        "| --- | --- | --- |",
    ]
    for (year, subject), sections in sorted(
        section_order.items(), key=lambda item: (-item[0][0], item[0][1])
    ):
        mappings = "；".join(
            f"{section} → {SECTION_CLASSES[index]}"
            for index, section in enumerate(sections)
        )
        lines.append(f"| {year} | {subject} | {mappings} |")
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    questions = load_questions()
    current_sections = {question["section"] for question in questions}
    if current_sections <= set(SECTION_CLASSES):
        print("题型已经统一为第一类、第二类和第三类，无需重复迁移")
        return
    counts, section_order = classify_sections(questions)
    write_report(section_order)
    QUESTIONS_PATH.write_text(
        json.dumps(questions, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    summary = "，".join(f"{name} {counts[name]} 题" for name in SECTION_CLASSES)
    print(f"已统一 {len(questions)} 道题：{summary}")
    print(f"原题型映射已写入 {REPORT_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()

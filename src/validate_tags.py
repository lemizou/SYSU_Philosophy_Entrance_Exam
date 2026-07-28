"""校验题库分类标签与中央标签表的一致性。"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = PROJECT_ROOT / "data" / "questions.json"
TAXONOMY_PATH = PROJECT_ROOT / "data" / "tag_taxonomy.json"

FIELD_BY_TYPE = {
    "philosopher": "philosophers",
    "school": "schools",
    "period": "periods",
    "topic": "topics",
    "work": "works",
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def validate() -> list[str]:
    errors: list[str] = []
    questions = load_json(QUESTIONS_PATH)
    taxonomy = load_json(TAXONOMY_PATH)
    tags = taxonomy.get("tags", [])

    if not isinstance(questions, list):
        return ["questions.json 顶层必须是数组"]
    if not isinstance(tags, list):
        return ["tag_taxonomy.json 的 tags 必须是数组"]

    names = [tag.get("name") for tag in tags]
    duplicate_names = [name for name, count in Counter(names).items() if count > 1]
    if duplicate_names:
        errors.append(f"中央标签表存在重复名称：{duplicate_names}")

    taxonomy_by_name = {tag.get("name"): tag for tag in tags}
    aliases: dict[str, str] = {}
    for tag in tags:
        name = tag.get("name")
        kind = tag.get("type")
        if kind not in FIELD_BY_TYPE:
            errors.append(f"标签 {name!r} 使用未知类型：{kind!r}")
        for alias in tag.get("aliases", []):
            if alias in aliases:
                errors.append(f"别名 {alias!r} 同时指向多个标签")
            if alias in taxonomy_by_name:
                errors.append(f"别名 {alias!r} 同时也是规范标签")
            aliases[alias] = name

    ids = [question.get("id") for question in questions]
    for question_id, count in Counter(ids).items():
        if not question_id:
            errors.append("存在缺少 id 的题目")
        elif count > 1:
            errors.append(f"题目 id 重复：{question_id}")

    for question in questions:
        question_id = question.get("id", "<无 id>")
        seen: set[str] = set()
        for kind, field in FIELD_BY_TYPE.items():
            values = question.get(field)
            if not isinstance(values, list):
                errors.append(f"{question_id}: {field} 必须是数组")
                continue
            if len(values) != len(set(values)):
                errors.append(f"{question_id}: {field} 中存在重复标签")
            for name in values:
                if name in seen:
                    errors.append(f"{question_id}: 标签 {name!r} 跨分类重复")
                seen.add(name)
                if name in aliases:
                    errors.append(
                        f"{question_id}: 使用别名 {name!r}，应改为 {aliases[name]!r}"
                    )
                tag = taxonomy_by_name.get(name)
                if tag is None:
                    errors.append(f"{question_id}: 未登记标签 {name!r}")
                elif tag.get("type") != kind:
                    errors.append(
                        f"{question_id}: {name!r} 应属于 {tag.get('type')}，"
                        f"却出现在 {field}"
                    )
        if not seen:
            errors.append(f"{question_id}: 没有任何分类标签")

    return errors


def main() -> int:
    try:
        errors = validate()
    except (OSError, json.JSONDecodeError) as error:
        print(f"标签校验无法运行：{error}", file=sys.stderr)
        return 2

    if errors:
        print(f"标签校验失败，共 {len(errors)} 个问题：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    questions = load_json(QUESTIONS_PATH)
    taxonomy = load_json(TAXONOMY_PATH)
    print(
        f"标签校验通过：{len(questions)} 道题，"
        f"{len(taxonomy['tags'])} 个规范标签。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

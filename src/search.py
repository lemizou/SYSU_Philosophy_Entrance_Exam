"""中山大学哲学考研真题的命令行检索入口。"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


QUESTIONS_PATH = Path(__file__).resolve().parents[1] / "data" / "questions.json"
TAXONOMY_PATH = Path(__file__).resolve().parents[1] / "data" / "tag_taxonomy.json"
TAG_FIELDS = ("philosophers", "schools", "periods", "topics", "works")
TAG_MODES = ("any", "all")
SORT_MODES = ("relevance", "year_desc", "year_asc")


@dataclass(frozen=True, slots=True)
class KeywordQuery:
    """已解析的关键词表达式。

    positive_groups 是 OR 连接的组，每组内部使用 AND；excluded_terms
    对全部正向组生效。
    """

    positive_groups: tuple[tuple[str, ...], ...] = ()
    excluded_terms: tuple[str, ...] = ()


@dataclass(slots=True)
class SearchConditions:
    """所有检索入口共享的结构化条件。

    不同字段之间始终使用 AND；同一普通筛选字段内使用 OR；每一类标签可用
    ``tag_modes`` 单独选择 any（任一）或 all（全部）。
    """

    keyword: str | None = None
    tags: dict[str, tuple[str, ...]] = field(default_factory=dict)
    tag_modes: dict[str, str] = field(default_factory=dict)
    years: tuple[int, ...] = ()
    subjects: tuple[str, ...] = ()
    sections: tuple[str, ...] = ()
    verification: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        unknown_fields = set(self.tags) - set(TAG_FIELDS)
        if unknown_fields:
            raise ValueError(f"未知标签字段：{sorted(unknown_fields)}")
        unknown_mode_fields = set(self.tag_modes) - set(TAG_FIELDS)
        if unknown_mode_fields:
            raise ValueError(f"未知标签模式字段：{sorted(unknown_mode_fields)}")
        invalid_modes = {
            field_name: mode
            for field_name, mode in self.tag_modes.items()
            if mode not in TAG_MODES
        }
        if invalid_modes:
            raise ValueError(f"标签模式只能是 any 或 all：{invalid_modes}")

    def mode_for(self, field_name: str) -> str:
        return self.tag_modes.get(field_name, "any")

    def is_empty(self) -> bool:
        return not any(
            (
                self.keyword,
                any(self.tags.values()),
                self.years,
                self.subjects,
                self.sections,
                self.verification,
            )
        )


def load_questions(path: Path = QUESTIONS_PATH) -> list[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError as error:
        raise RuntimeError(f"找不到真题数据文件：{path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"真题数据不是有效的 JSON：第 {error.lineno} 行，第 {error.colno} 列"
        ) from error

    if not isinstance(data, list):
        raise RuntimeError("真题数据的顶层结构必须是数组。")
    return data


def normalize(value: object) -> str:
    return "".join(str(value or "").casefold().split())


def normalize_subject(subject: str | None) -> str | None:
    if subject == "西方哲学史":
        return "外国哲学史"
    return subject


def load_tag_aliases(path: Path = TAXONOMY_PATH) -> dict[str, str]:
    try:
        with path.open("r", encoding="utf-8") as file:
            taxonomy = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise RuntimeError(f"无法读取标签表：{path}") from error

    aliases: dict[str, str] = {}
    for tag in taxonomy.get("tags", []):
        canonical = str(tag.get("name", ""))
        for alias in tag.get("aliases", []):
            aliases[normalize(alias)] = canonical
    return aliases


def canonicalize(value: str, aliases: dict[str, str] | None = None) -> str:
    normalized = normalize(value)
    return normalize((aliases or {}).get(normalized, value))


def term_needles(value: str, aliases: dict[str, str] | None = None) -> set[str]:
    return {needle for needle in (normalize(value), canonicalize(value, aliases)) if needle}


def value_contains_term(
    value: object,
    term: str,
    aliases: dict[str, str] | None = None,
) -> bool:
    normalized_value = normalize(value)
    return any(needle in normalized_value for needle in term_needles(term, aliases))


def parse_keyword_query(value: str | None) -> KeywordQuery:
    """解析空格 AND、OR、引号短语和前置减号排除语法。"""

    text = str(value or "")
    tokens: list[tuple[str, bool, bool]] = []
    index = 0
    while index < len(text):
        while index < len(text) and text[index].isspace():
            index += 1
        if index >= len(text):
            break

        excluded = text[index] == "-"
        if excluded:
            index += 1
            if index >= len(text) or text[index].isspace():
                raise ValueError("减号后必须紧跟要排除的关键词")

        quoted = text[index] == '"'
        if quoted:
            index += 1
            end = text.find('"', index)
            if end == -1:
                raise ValueError("引号没有闭合")
            term = text[index:end]
            index = end + 1
            if index < len(text) and not text[index].isspace():
                raise ValueError("引号短语后需要空格")
        else:
            end = index
            while end < len(text) and not text[end].isspace():
                end += 1
            term = text[index:end]
            index = end

        if not term:
            raise ValueError("关键词不能为空")
        tokens.append((term, excluded, quoted))

    groups: list[list[str]] = [[]]
    excluded_terms: list[str] = []
    saw_or = False
    for term, excluded, quoted in tokens:
        if not excluded and not quoted and term.casefold() == "or":
            if not groups[-1]:
                raise ValueError("OR 两侧都必须有正向关键词")
            groups.append([])
            saw_or = True
        elif excluded:
            if term not in excluded_terms:
                excluded_terms.append(term)
        elif term not in groups[-1]:
            groups[-1].append(term)

    if saw_or and not groups[-1]:
        raise ValueError("OR 两侧都必须有正向关键词")
    positive_groups = tuple(tuple(group) for group in groups if group)
    return KeywordQuery(positive_groups, tuple(excluded_terms))


def iter_tags(question: dict[str, Any]) -> list[str]:
    return [
        str(tag)
        for field in TAG_FIELDS
        for tag in question.get(field, [])
    ]


def matches_philosopher(
    question: dict[str, Any],
    names: list[str],
    aliases: dict[str, str] | None = None,
) -> bool:
    return matches_tag_filter(
        question,
        "philosophers",
        tuple(names),
        "all",
        aliases,
    )


def matches_keyword(
    question: dict[str, Any],
    keyword: str | KeywordQuery,
    aliases: dict[str, str] | None = None,
) -> bool:
    searchable = [
        question.get("question", ""),
        question.get("passage", ""),
        *iter_tags(question),
    ]
    haystack = [normalize(value) for value in searchable]
    query = (
        keyword
        if isinstance(keyword, KeywordQuery)
        else parse_keyword_query(keyword)
    )

    def contains(term: str) -> bool:
        return any(
            needle in value
            for needle in term_needles(term, aliases)
            for value in haystack
        )

    if any(contains(term) for term in query.excluded_terms):
        return False
    if not query.positive_groups:
        return True
    return any(
        all(contains(term) for term in group)
        for group in query.positive_groups
    )


def matches_tag_filter(
    question: dict[str, Any],
    field_name: str,
    requested: tuple[str, ...],
    mode: str,
    aliases: dict[str, str] | None = None,
) -> bool:
    if not requested:
        return True
    available = {normalize(value) for value in question.get(field_name, [])}
    selected = {canonicalize(value, aliases) for value in requested}
    if mode == "all":
        return selected <= available
    return bool(selected & available)


def matches_conditions(
    question: dict[str, Any],
    conditions: SearchConditions,
    aliases: dict[str, str] | None = None,
    keyword_query: KeywordQuery | None = None,
) -> bool:
    """按统一规则判断一道题是否满足全部检索条件。"""

    if conditions.keyword and not matches_keyword(
        question,
        keyword_query or conditions.keyword,
        aliases,
    ):
        return False
    if conditions.years and question.get("year") not in conditions.years:
        return False
    if conditions.subjects:
        requested_subjects = {
            normalize_subject(subject) for subject in conditions.subjects
        }
        if normalize_subject(question.get("subject")) not in requested_subjects:
            return False
    if conditions.sections and question.get("section") not in conditions.sections:
        return False
    if (
        conditions.verification
        and question.get("verification") not in conditions.verification
    ):
        return False
    return all(
        matches_tag_filter(
            question,
            field_name,
            requested,
            conditions.mode_for(field_name),
            aliases,
        )
        for field_name, requested in conditions.tags.items()
    )


def filter_questions(
    questions: list[dict[str, Any]],
    conditions: SearchConditions,
    aliases: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    keyword_query = (
        parse_keyword_query(conditions.keyword)
        if conditions.keyword
        else None
    )
    return [
        question
        for question in questions
        if matches_conditions(question, conditions, aliases, keyword_query)
    ]


def relevance_score(
    question: dict[str, Any],
    conditions: SearchConditions,
    aliases: dict[str, str] | None = None,
) -> int:
    query = parse_keyword_query(conditions.keyword)
    terms = {
        term
        for group in query.positive_groups
        for term in group
    }
    score = 0
    for term in terms:
        if value_contains_term(question.get("question"), term, aliases):
            score += 8
        if any(value_contains_term(tag, term, aliases) for tag in iter_tags(question)):
            score += 5
        if value_contains_term(question.get("passage"), term, aliases):
            score += 2
    return score


def sort_questions(
    questions: list[dict[str, Any]],
    conditions: SearchConditions,
    mode: str,
    aliases: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    if mode not in SORT_MODES:
        raise ValueError(f"未知排序方式：{mode}")
    has_positive_terms = bool(
        parse_keyword_query(conditions.keyword).positive_groups
    )
    effective_mode = (
        "year_desc"
        if mode == "relevance" and not has_positive_terms
        else mode
    )
    if effective_mode == "year_asc":
        return sorted(
            questions,
            key=lambda question: (
                question.get("year", 0),
                str(question.get("id", "")),
            ),
        )
    if effective_mode == "year_desc":
        return sorted(
            questions,
            key=lambda question: (
                -int(question.get("year", 0)),
                str(question.get("id", "")),
            ),
        )
    return sorted(
        questions,
        key=lambda question: (
            -relevance_score(question, conditions, aliases),
            -int(question.get("year", 0)),
        ),
    )


def search_questions(
    questions: list[dict[str, Any]],
    *,
    conditions: SearchConditions | None = None,
    keyword: str | None = None,
    philosophers: list[str] | None = None,
    year: int | None = None,
    subject: str | None = None,
    sort_mode: str | None = None,
    aliases: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """检索题目；旧参数保留为兼容入口，新代码应传入 conditions。"""

    if conditions is not None and any((keyword, philosophers, year, subject)):
        raise ValueError("conditions 不能与旧式检索参数同时使用")
    if conditions is None:
        conditions = SearchConditions(
            keyword=keyword,
            tags={"philosophers": tuple(philosophers or ())},
            tag_modes={"philosophers": "all"},
            years=(year,) if year is not None else (),
            subjects=(subject,) if subject else (),
        )
    results = filter_questions(questions, conditions, aliases)
    return (
        sort_questions(results, conditions, sort_mode, aliases)
        if sort_mode
        else results
    )


def print_question(question: dict[str, Any]) -> None:
    tags = "、".join(iter_tags(question)) or "未标注"
    print(
        f"[{question.get('year', '?')}] {question.get('subject', '未知科目')}｜"
        f"{question.get('section', '未知题型')}｜{tags}"
    )
    print(f"{question.get('id', '无编号')}  {question.get('question', '')}")
    print()


def print_philosopher_index(questions: list[dict[str, Any]]) -> None:
    counts = Counter(
        philosopher
        for question in questions
        for philosopher in question.get("philosophers", [])
    )
    for philosopher, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"{philosopher}\t{count}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="检索中山大学哲学考研真题")
    parser.add_argument(
        "keyword",
        nargs="?",
        help="关键词表达式：空格 AND、OR 任选、引号短语、-词排除",
    )
    parser.add_argument(
        "-p",
        "--philosopher",
        action="append",
        default=[],
        help="按哲学家筛选；可重复使用以要求同时匹配多位哲学家",
    )
    parser.add_argument("-y", "--year", type=int, help="按年份筛选")
    parser.add_argument("--year-from", type=int, help="筛选起始年份（含）")
    parser.add_argument("--year-to", type=int, help="筛选终止年份（含）")
    parser.add_argument(
        "-s",
        "--subject",
        choices=("中国哲学史", "外国哲学史", "西方哲学史"),
        help="按科目筛选",
    )
    parser.add_argument(
        "--section",
        action="append",
        default=[],
        help="按题型筛选；可重复使用以匹配任一题型",
    )
    parser.add_argument(
        "--verification",
        action="append",
        choices=("cross_checked", "single_source"),
        default=[],
        help="按校对状态筛选；可重复使用",
    )
    parser.add_argument(
        "--sort",
        choices=SORT_MODES,
        default="relevance",
        help="排序：相关度、年份降序或年份升序",
    )
    parser.add_argument(
        "--list-philosophers",
        action="store_true",
        help="列出哲学家索引及对应题目数",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        questions = load_questions()
        aliases = load_tag_aliases()
    except RuntimeError as error:
        print(f"错误：{error}", file=sys.stderr)
        return 2

    if args.list_philosophers:
        print_philosopher_index(questions)
        return 0

    if args.year is not None and (
        args.year_from is not None or args.year_to is not None
    ):
        print("错误：--year 不能与 --year-from/--year-to 同时使用。", file=sys.stderr)
        return 2
    if (
        args.year_from is not None
        and args.year_to is not None
        and args.year_from > args.year_to
    ):
        print("错误：起始年份不能晚于终止年份。", file=sys.stderr)
        return 2
    if args.year is not None:
        years = (args.year,)
    else:
        years = tuple(
            sorted(
                {
                    question.get("year")
                    for question in questions
                    if question.get("year") is not None
                    and (
                        args.year_from is None
                        or question.get("year") >= args.year_from
                    )
                    and (
                        args.year_to is None
                        or question.get("year") <= args.year_to
                    )
                }
            )
        ) if args.year_from is not None or args.year_to is not None else ()

    conditions = SearchConditions(
        keyword=args.keyword,
        tags={"philosophers": tuple(args.philosopher)},
        tag_modes={"philosophers": "all"},
        years=years,
        subjects=(args.subject,) if args.subject else (),
        sections=tuple(args.section),
        verification=tuple(args.verification),
    )
    if conditions.is_empty():
        build_parser().print_help()
        return 0

    try:
        results = search_questions(
            questions,
            conditions=conditions,
            sort_mode=args.sort,
            aliases=aliases,
        )
    except ValueError as error:
        print(f"检索语法错误：{error}", file=sys.stderr)
        return 2
    if not results:
        print("没有找到符合条件的真题。")
        return 1

    for question in results:
        print_question(question)
    print(f"共找到 {len(results)} 道题。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

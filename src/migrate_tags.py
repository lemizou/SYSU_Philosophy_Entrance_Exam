"""将旧的 philosophers 混合标签迁移为分类标签。

默认只预览迁移结果；传入 ``--write`` 后才会改写 questions.json，并生成
tag_taxonomy.json。脚本可重复运行，已迁移的数据不会被再次改写。
"""

from __future__ import annotations

import argparse
import json
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

PHILOSOPHERS = {
    "阿奎纳",
    "阿那克萨戈拉",
    "安瑟尔谟",
    "奥古斯丁",
    "奥卡姆",
    "巴门尼德",
    "柏拉图",
    "贝克莱",
    "毕达哥拉斯",
    "成玄英",
    "程颢",
    "程颐",
    "戴震",
    "德谟克里特",
    "笛卡尔",
    "董仲舒",
    "二程",
    "费希特",
    "冯耀明",
    "葛洪",
    "公孙龙",
    "郭象",
    "韩愈",
    "赫拉克利特",
    "黑格尔",
    "胡塞尔",
    "黄宗羲",
    "霍布斯",
    "嵇康",
    "康德",
    "孔子",
    "莱布尼茨",
    "老子",
    "卢梭",
    "陆九渊",
    "洛克",
    "孟德斯鸠",
    "孟子",
    "墨子",
    "尼采",
    "培根",
    "皮浪",
    "普罗泰戈拉",
    "普罗提诺",
    "邵雍",
    "叔本华",
    "司各脱",
    "斯宾诺莎",
    "苏格拉底",
    "王弼",
    "王充",
    "王夫之",
    "王阳明",
    "休谟",
    "荀子",
    "亚里士多德",
    "严复",
    "张载",
    "芝诺",
    "周敦颐",
    "朱熹",
    "庄子",
}

SCHOOLS = {
    "道家",
    "法家",
    "佛教",
    "黄老之学",
    "稷下道家",
    "经验论",
    "儒家",
    "名家",
    "墨家",
    "宋明理学",
    "唯理论",
    "魏晋玄学",
    "先验哲学",
    "阴阳家",
    "早期儒学",
    "智者",
}

PERIODS = {
    "近代哲学",
    "启蒙运动",
    "前苏格拉底哲学",
    "中世纪哲学",
}

TOPICS = {
    "道德哲学",
    "个人同一性",
    "共相问题",
    "怀疑论",
    "认识论",
    "上帝存在证明",
    "身心问题",
    "唯名论",
    "唯名论与唯实论",
    "西方哲学史综合",
    "信仰与理性",
    "性命说",
    "自由意志",
}

WORKS = {
    "《巴门尼德篇》",
    "《白虎通义》",
    "《补大学格物致知传》",
    "《纯粹理性批判》",
    "《春秋繁露》",
    "《传习录》",
    "《大学》",
    "《大乘起信论》",
    "《单子论》",
    "《道德经》",
    "《道德形而上学》",
    "《道德原则研究》",
    "《第一哲学沉思集》",
    "《读四书大全说》",
    "《二程遗书》",
    "《范畴篇》",
    "《焚书》",
    "《公孙龙子》",
    "《韩非子》",
    "《河南程氏粹言》",
    "《淮南子》",
    "《静安文集》",
    "《俱分进化论》",
    "《孔子改制考》",
    "《老子指略》",
    "《老子注》",
    "《利维坦》",
    "《理想国》",
    "《鲁斋遗书》",
    "《论衡》",
    "《论语》",
    "《美诺篇》",
    "《孟子》",
    "《孟子字义疏证》",
    "《明儒学案》",
    "《墨子》",
    "《偶像的黄昏》",
    "《全部知识学的基础》",
    "《人类理解论》",
    "《人类理智研究》",
    "《人类知识原理》",
    "《尚书》",
    "《上帝之城》",
    "《坛经》",
    "《天演论》",
    "《通书》",
    "《文史通义》",
    "《西铭》",
    "《象山语录》",
    "《新工具》",
    "《新学伪经考》",
    "《形而上学》",
    "《荀子》",
    "《易传》",
    "《原性》",
    "《哲学史讲演录》",
    "《正蒙》",
    "《知性改进论》",
    "《中庸》",
    "《中国哲学的方法论问题》",
    "《肇论》",
    "《周易略例》",
    "《周易外传》",
    "《庄子》",
    "《庄子注》",
    "《朱子语类》",
    "《精神现象学》",
    "《作为意志和表象的世界》",
}

NON_WORK_NAMES = PHILOSOPHERS | SCHOOLS | PERIODS | TOPICS
WORK_ALIASES = {
    name[1:-1]: name for name in WORKS if name[1:-1] not in NON_WORK_NAMES
}
WORK_TITLE_ALIASES = {
    "《导言：论哲学的目的》": "《知性改进论》",
    "《订顽》": "《西铭》",
    "《河南程氏粹言·人物篇》": "《河南程氏粹言》",
    "《淮南子·泰族训》": "《淮南子》",
    "《肩水金关汉简〈论语〉》": "《论语》",
    "《论语·颜渊》": "《论语》",
    "《论语·雍也》": "《论语》",
    "《孟子·公孙丑上》": "《孟子》",
    "《孟子·离娄下》": "《孟子》",
    "《墨子·大取》": "《墨子》",
    "《小取》": "《墨子》",
    "《书》": "《尚书》",
    "《荀子·子道》": "《荀子》",
    "《庄子·齐物论》": "《庄子》",
    "《庄子·秋水》": "《庄子》",
}

ALIASES = {
    "安瑟伦": "安瑟尔谟",
    "奥康": "奥卡姆",
    "佛学": "佛教",
    "黄老道家": "黄老之学",
    "宋明理学-其他": "宋明理学",
    "西方哲学史-综合": "西方哲学史综合",
    **WORK_ALIASES,
    **WORK_TITLE_ALIASES,
}

TYPE_SETS = {
    "philosopher": PHILOSOPHERS,
    "school": SCHOOLS,
    "period": PERIODS,
    "topic": TOPICS,
    "work": WORKS,
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def canonical_name(name: str) -> str:
    return ALIASES.get(name, name)


def tag_type(name: str) -> str:
    matches = [kind for kind, values in TYPE_SETS.items() if name in values]
    if len(matches) != 1:
        raise ValueError(f"标签必须且只能属于一个类型：{name!r}，当前匹配 {matches}")
    return matches[0]


def collect_legacy_tags(question: dict[str, Any]) -> list[str]:
    classified_fields = set(FIELD_BY_TYPE.values()) - {"philosophers"}
    if any(field in question for field in classified_fields):
        return [
            str(value)
            for field in FIELD_BY_TYPE.values()
            for value in question.get(field, [])
        ]
    return [str(value) for value in question.get("philosophers", [])]


def migrate_question(question: dict[str, Any]) -> dict[str, Any]:
    grouped = {field: [] for field in FIELD_BY_TYPE.values()}
    for legacy_name in collect_legacy_tags(question):
        name = canonical_name(legacy_name)
        field = FIELD_BY_TYPE[tag_type(name)]
        if name not in grouped[field]:
            grouped[field].append(name)

    migrated: dict[str, Any] = {}
    inserted = False
    tag_fields = set(FIELD_BY_TYPE.values())
    for key, value in question.items():
        if key in tag_fields:
            if not inserted:
                migrated.update(grouped)
                inserted = True
            continue
        migrated[key] = value
    if not inserted:
        migrated.update(grouped)
    return migrated


def build_taxonomy() -> dict[str, Any]:
    aliases_by_name: dict[str, list[str]] = {}
    for alias, canonical in ALIASES.items():
        aliases_by_name.setdefault(canonical, []).append(alias)

    tags = []
    for kind, names in TYPE_SETS.items():
        for name in sorted(names):
            tags.append(
                {
                    "name": name,
                    "type": kind,
                    "aliases": sorted(aliases_by_name.get(name, [])),
                }
            )
    return {
        "version": 1,
        "types": {
            "philosopher": "哲学家或人物组合",
            "school": "流派或思想传统",
            "period": "历史时期或思想运动",
            "topic": "问题或研究主题",
            "work": "著作",
        },
        "tags": tags,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="预览或执行题库标签分类迁移")
    parser.add_argument("--write", action="store_true", help="实际写入迁移结果")
    args = parser.parse_args()

    questions = load_json(QUESTIONS_PATH)
    if not isinstance(questions, list):
        raise ValueError("questions.json 顶层必须是数组")

    legacy_counts = Counter(
        tag for question in questions for tag in collect_legacy_tags(question)
    )
    known_legacy = set().union(*TYPE_SETS.values(), ALIASES)
    unknown = sorted(set(legacy_counts) - known_legacy)
    if unknown:
        raise ValueError(f"存在尚未分类的标签：{unknown}")

    migrated = [migrate_question(question) for question in questions]
    field_counts = {
        field: sum(len(question[field]) for question in migrated)
        for field in FIELD_BY_TYPE.values()
    }
    print(f"题目：{len(questions)}")
    print(f"旧标签种类：{len(legacy_counts)}")
    print(f"规范标签种类：{sum(len(values) for values in TYPE_SETS.values())}")
    for field, count in field_counts.items():
        print(f"{field}: {count}")
    print(f"别名归并：{len(ALIASES)}")

    if not args.write:
        print("预览完成；未写入文件。传入 --write 执行迁移。")
        return 0

    QUESTIONS_PATH.write_text(
        json.dumps(migrated, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    TAXONOMY_PATH.write_text(
        json.dumps(build_taxonomy(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"已更新：{QUESTIONS_PATH}")
    print(f"已生成：{TAXONOMY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

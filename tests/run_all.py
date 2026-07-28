"""运行项目的全部数据和检索测试。"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = PROJECT_ROOT / "tests"


def run(label: str, command: list[str]) -> bool:
    print(f"\n== {label} ==", flush=True)
    completed = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    if completed.returncode:
        print(f"{label}失败（退出码 {completed.returncode}）", file=sys.stderr)
        return False
    return True


def main() -> int:
    node = shutil.which("node")
    if node is None:
        print("找不到 Node.js，无法运行浏览器检索逻辑测试。", file=sys.stderr)
        return 2

    checks = [
        (
            "题库与标签校验",
            [sys.executable, str(PROJECT_ROOT / "src" / "validate_tags.py")],
        ),
        (
            "Python 测试",
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                str(TESTS_DIR),
                "-p",
                "test_*.py",
            ],
        ),
    ]
    checks.extend(
        (f"JavaScript 测试：{test.name}", [node, str(test)])
        for test in sorted(TESTS_DIR.glob("*_test.js"))
    )

    failed = [label for label, command in checks if not run(label, command)]
    if failed:
        print("\n失败项目：", file=sys.stderr)
        for label in failed:
            print(f"- {label}", file=sys.stderr)
        return 1

    print(f"\n全部检查通过，共 {len(checks)} 组。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

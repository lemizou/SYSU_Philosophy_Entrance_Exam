"""在本机启动真题检索窗口。"""

from __future__ import annotations

import argparse
import os
import subprocess
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass


def open_in_browser(url: str) -> None:
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", ""))
        / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", ""))
        / "Google/Chrome/Application/chrome.exe",
    ]
    for chrome in candidates:
        if chrome.is_file():
            subprocess.Popen([str(chrome), url])
            return
    webbrowser.open(url)


def main() -> None:
    parser = argparse.ArgumentParser(description="启动中大哲学真题检索窗口")
    parser.add_argument("--port", type=int, default=8765, help="本地端口")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    os.chdir(PROJECT_ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), QuietHandler)
    actual_port = server.server_address[1]
    url = f"http://127.0.0.1:{actual_port}/web/search.html"
    if args.smoke_test:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with urlopen(url, timeout=5) as response:
                page = response.read().decode("utf-8")
            with urlopen(
                f"http://127.0.0.1:{actual_port}/data/questions.json",
                timeout=5,
            ) as response:
                questions = response.read()
            if "中大哲学 · 历年真题" not in page or not questions:
                raise RuntimeError("启动后未能读取检索页面或题库")
            print(f"启动检索自检通过：{url}")
            return
        finally:
            server.shutdown()
            server.server_close()
    print(f"真题检索窗口：{url}")
    print("按 Ctrl+C 关闭。")
    if not args.no_browser:
        threading.Timer(0.35, open_in_browser, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n检索窗口已关闭。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

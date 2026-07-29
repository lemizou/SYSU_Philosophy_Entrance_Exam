"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.once("error", reject);
    request.setTimeout(3000, () => request.destroy(new Error("HTTP 请求超时")));
  });
}

function chromePath() {
  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe")
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
      ];
  const direct = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (direct) return direct;
  const locator = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    process.platform === "win32"
      ? ["chrome.exe"]
      : ["google-chrome"],
    { encoding: "utf8" }
  );
  return locator.status === 0 ? locator.stdout.trim().split(/\r?\n/)[0] : "";
}

async function waitUntil(operation, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("等待浏览器状态超时");
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    opened,
    onEvent(listener) {
      listeners.push(listener);
    },
    async call(method, params = {}) {
      await opened;
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    }
  };
}

function stopProcess(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

async function main() {
  const chrome = chromePath();
  assert.ok(chrome, "找不到 Google Chrome/Chromium");
  const [webPort, debugPort] = await Promise.all([freePort(), freePort()]);
  const python = process.platform === "win32" ? "python" : "python3";
  const server = spawn(
    python,
    ["src/search_web.py", "--no-browser", "--port", String(webPort)],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  );
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sysu-search-chrome-"));
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank"
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  try {
    await waitUntil(async () =>
      (await httpGet(
        `http://127.0.0.1:${webPort}/`
      )).status === 200);
    const target = await waitUntil(async () => {
      const response = await httpGet(
        `http://127.0.0.1:${debugPort}/json/list`
      );
      const targets = JSON.parse(response.body);
      return targets.find((item) => item.type === "page");
    });
    const cdp = connectCdp(target.webSocketDebuggerUrl);
    const errors = [];
    cdp.onEvent((message) => {
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.text);
      }
      if (
        message.method === "Runtime.consoleAPICalled"
        && message.params.type === "error"
      ) {
        errors.push("console.error");
      }
      if (
        message.method === "Log.entryAdded"
        && message.params.entry.level === "error"
      ) {
        errors.push(message.params.entry.text);
      }
    });
    await Promise.all([
      cdp.call("Runtime.enable"),
      cdp.call("Log.enable"),
      cdp.call("Page.enable")
    ]);
    const query = new URLSearchParams({
      q: "康德",
      subject: "外国哲学史",
      from: "2020",
      to: "2025",
      section: "第一类",
      person: "康德"
    });
    await cdp.call("Page.navigate", {
      url: `http://127.0.0.1:${webPort}/?${query}#entrypoint-test`
    });

    async function evaluate(expression) {
      const result = await cdp.call("Runtime.evaluate", {
        expression,
        returnByValue: true
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }

    const restored = await waitUntil(async () => {
      const value = await evaluate(`(() => {
        const api = window.__searchAppTestApi;
        if (!api || api.loadedCount !== 431) return null;
        return {
          loadedCount: api.loadedCount,
          resultCount: api.resultIds.length,
          state: api.state,
          total: document.getElementById("total").textContent,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash
        };
      })()`);
      return value;
    });
    assert.equal(restored.loadedCount, 431);
    assert.equal(restored.total, "431 道题");
    assert.ok(restored.resultCount > 0);
    assert.equal(restored.state.keyword, "康德");
    assert.equal(restored.state.subject, "外国哲学史");
    assert.equal(restored.state.yearFrom, "2020");
    assert.equal(restored.state.yearTo, "2025");
    assert.equal(restored.state.section, "第一类");
    assert.deepEqual(restored.state.tags.philosophers, ["康德"]);
    assert.equal(restored.pathname, "/web/search.html");
    assert.equal(restored.search, `?${query}`);
    assert.equal(restored.hash, "#entrypoint-test");

    const resized = await evaluate(`(() => {
      const separator = document.getElementById("paneResizer");
      const before = Number(separator.getAttribute("aria-valuenow"));
      separator.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true
      }));
      return {
        before,
        after: Number(separator.getAttribute("aria-valuenow"))
      };
    })()`);
    assert.deepEqual(resized, { before: 52, after: 54 });

    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    const mobile = await waitUntil(async () => {
      const value = await evaluate(`(() => {
        const switcher = document.querySelector(".mobile-pane-switch");
        if (getComputedStyle(switcher).display === "none") return null;
        document.querySelector(".result-summary")?.click();
        return {
          switcherDisplay: getComputedStyle(switcher).display,
          activePane: document.querySelector(".workspace").dataset.mobilePane
        };
      })()`);
      return value?.activePane === "detail" ? value : null;
    });
    assert.equal(mobile.switcherDisplay, "grid");
    assert.equal(mobile.activePane, "detail");
    await cdp.call("Emulation.clearDeviceMetricsOverride");

    await evaluate(`(() => {
      document.getElementById("keyword").value = "朱熹";
      document.getElementById("search").click();
      return true;
    })()`);
    await waitUntil(async () =>
      (await evaluate("window.__searchAppTestApi.state.keyword")) === "朱熹");
    await cdp.call("Page.getNavigationHistory").then((history) =>
      cdp.call("Page.navigateToHistoryEntry", {
        entryId: history.entries[history.currentIndex - 1].id
      })
    );
    await waitUntil(async () =>
      (await evaluate("window.__searchAppTestApi.state.keyword")) === "康德");

    assert.deepEqual(errors, [], `浏览器控制台错误：${errors.join("; ")}`);
    await cdp.call("Browser.close");
    cdp.close();
  } finally {
    await Promise.all([stopProcess(browser), stopProcess(server)]);
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  }
}

main()
  .then(() => console.log("BROWSER_E2E_TESTS_OK"))
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });

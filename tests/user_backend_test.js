"use strict";

const assert = require("node:assert/strict");
const { createUserBackend, normalizeConfig } = require("../web/user_backend.js");

const config = { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" };

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return data == null ? "" : JSON.stringify(data); }
  };
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

async function main() {
  assert.throws(() => normalizeConfig({ url: config.url, publishableKey: "sb_publishable_your_key" }), /尚未配置/);

  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/auth/v1/otp")) return response(200, {});
    if (url.includes("/auth/v1/verify")) return response(200, {
      access_token: "access",
      refresh_token: "refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com" }
    });
    if (url.includes("/rest/v1/notes?on_conflict")) return response(201, [{ question_id: "sysu-chinese-2003-term-01", content: "保存成功" }]);
    if (url.includes("/rest/v1/notes?") && options.method === "DELETE") return response(204, null);
    throw new Error(`unexpected request: ${url}`);
  };
  const backend = createUserBackend(config, { fetch: fakeFetch, storage: storage() });
  await backend.requestOtp(" TEST@EXAMPLE.COM ", "https://example.com/web/user.html");
  assert.match(calls[0].url, /redirect_to=/);
  assert.equal(JSON.parse(calls[0].options.body).email, "test@example.com");
  await backend.verifyOtp("test@example.com", " 123 456 ");
  assert.equal(backend.getSession().user.email, "test@example.com");

  const saved = await backend.saveNote("sysu-chinese-2003-term-01", "保存成功");
  assert.equal(saved.content, "保存成功");
  assert.equal(calls.at(-1).options.headers.Prefer, "resolution=merge-duplicates,return=representation");
  assert.equal(calls.at(-1).options.headers.Authorization, "Bearer access");
  await backend.saveNote("sysu-chinese-2003-term-01", "   ");
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.match(calls.at(-1).url, /user_id=eq\.00000000/);
  console.log("USER_BACKEND_TESTS_OK");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

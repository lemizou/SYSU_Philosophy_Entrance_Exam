(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UserBackend = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const SESSION_KEY = "sysu-philosophy-supabase-session-v1";

  class BackendError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = "BackendError";
      this.status = status;
      this.details = details;
    }
  }

  function normalizeConfig(config = {}) {
    const url = String(config.url || "").replace(/\/$/, "");
    const publishableKey = String(config.publishableKey || "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
      throw new BackendError("Supabase URL 未配置或格式不正确");
    }
    if (!publishableKey || publishableKey === "sb_publishable_your_key") {
      throw new BackendError("Supabase publishable key 尚未配置");
    }
    return { url, publishableKey };
  }

  function createUserBackend(config, dependencies = {}) {
    const { url, publishableKey } = normalizeConfig(config);
    const request = dependencies.fetch || globalThis.fetch;
    const storage = dependencies.storage || globalThis.localStorage;
    if (typeof request !== "function") throw new BackendError("当前浏览器不支持网络请求");

    let session = null;
    try {
      session = JSON.parse(storage?.getItem(SESSION_KEY) || "null");
    } catch (_) {
      storage?.removeItem(SESSION_KEY);
    }

    function persist(next) {
      session = next?.access_token ? next : null;
      if (session) storage?.setItem(SESSION_KEY, JSON.stringify(session));
      else storage?.removeItem(SESSION_KEY);
      return session;
    }

    async function call(path, options = {}) {
      const headers = {
        apikey: publishableKey,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.auth === false || !session?.access_token
          ? {}
          : { Authorization: `Bearer ${session.access_token}` }),
        ...(options.headers || {})
      };
      const response = await request(`${url}${path}`, { ...options, headers });
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (_) { data = text; }
      }
      if (!response.ok) {
        const message = data?.msg || data?.message || data?.error_description
          || data?.hint || `后端请求失败（${response.status}）`;
        throw new BackendError(message, response.status, data);
      }
      return data;
    }

    async function refreshIfNeeded() {
      if (!session?.refresh_token) return session;
      const expiresAt = Number(session.expires_at || 0);
      if (expiresAt && expiresAt * 1000 > Date.now() + 60000) return session;
      const next = await call("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      return persist(next);
    }

    async function requireSession() {
      await refreshIfNeeded();
      if (!session?.access_token || !session?.user?.id) {
        throw new BackendError("请先登录", 401);
      }
      return session;
    }

    return {
      getSession: () => session,
      async requestOtp(email, redirectTo) {
        const normalized = String(email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
          throw new BackendError("请输入有效的邮箱地址");
        }
        const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
        await call(`/auth/v1/otp${query}`, {
          method: "POST",
          auth: false,
          body: JSON.stringify({ email: normalized, create_user: true })
        });
        return normalized;
      },
      async verifyOtp(email, token) {
        const next = await call("/auth/v1/verify", {
          method: "POST",
          auth: false,
          body: JSON.stringify({
            email: String(email || "").trim().toLowerCase(),
            token: String(token || "").replace(/\s/g, ""),
            type: "email"
          })
        });
        return persist(next);
      },
      acceptRedirect(hash) {
        const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
        if (!params.get("access_token")) return null;
        return persist({
          access_token: params.get("access_token"),
          refresh_token: params.get("refresh_token"),
          expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
          token_type: params.get("token_type") || "bearer",
          user: null
        });
      },
      async hydrateUser() {
        if (!session?.access_token) return null;
        const user = await call("/auth/v1/user");
        persist({ ...session, user });
        return user;
      },
      async signOut() {
        try {
          if (session?.access_token) await call("/auth/v1/logout", { method: "POST" });
        } finally {
          persist(null);
        }
      },
      async loadMyData() {
        await requireSession();
        const [favorites, notes, stats, activity] = await Promise.all([
          call("/rest/v1/favorites?select=question_id,created_at&order=created_at.desc"),
          call("/rest/v1/notes?select=question_id,content,created_at,updated_at&order=updated_at.desc"),
          call("/rest/v1/rpc/get_my_stats", { method: "POST", body: "{}" }),
          call("/rest/v1/daily_user_activity?select=activity_date,last_seen_at&order=activity_date.desc&limit=28")
        ]);
        return { favorites, notes, stats: stats?.[0] || null, activity };
      },
      async recordActivity() {
        await requireSession();
        return call("/rest/v1/rpc/record_activity", { method: "POST", body: "{}" });
      },
      async saveNote(questionId, content) {
        const active = await requireSession();
        const value = String(content || "");
        if (value.length > 50000) throw new BackendError("单篇笔记不能超过 50,000 字");
        if (!value.trim()) {
          await call(`/rest/v1/notes?user_id=eq.${active.user.id}&question_id=eq.${encodeURIComponent(questionId)}`, {
            method: "DELETE"
          });
          return null;
        }
        const rows = await call("/rest/v1/notes?on_conflict=user_id,question_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify([{ user_id: active.user.id, question_id: questionId, content: value }])
        });
        return rows?.[0] || null;
      }
    };
  }

  return { BackendError, SESSION_KEY, createUserBackend, normalizeConfig };
});

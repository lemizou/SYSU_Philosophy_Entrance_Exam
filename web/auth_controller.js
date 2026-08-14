(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AuthController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const PENDING_ACTION_KEY = "sysu-pending-action-v1";
  const PENDING_ACTION_TTL_MS = 30 * 60 * 1000;
  const ACTION_TYPES = new Set(["favorite", "open-note", "save-note"]);

  function createAuthController(options = {}) {
    const backend = options.backend;
    const storage = options.storage || globalThis.localStorage;
    const location = options.location || globalThis.location;
    const history = options.history || globalThis.history;
    const now = options.now || (() => Date.now());
    const ttlMs = Number(options.ttlMs || PENDING_ACTION_TTL_MS);
    if (!backend) throw new Error("缺少用户后端");

    function safeRemovePendingAction() {
      storage?.removeItem(PENDING_ACTION_KEY);
    }

    function normalizeReturnUrl(value) {
      const fallback = `${location?.pathname || ""}${location?.search || ""}`;
      if (!value || !location?.href) return fallback;
      try {
        const target = new URL(value, location.href);
        const current = new URL(location.href);
        if (target.origin !== current.origin) return fallback;
        return `${target.pathname}${target.search}${target.hash}`;
      } catch (_) {
        return fallback;
      }
    }

    function normalizePendingAction(action) {
      if (!action || !ACTION_TYPES.has(action.type)) return null;
      const questionId = String(action.questionId || "").trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(questionId)) return null;
      return {
        version: 1,
        type: action.type,
        questionId,
        returnUrl: normalizeReturnUrl(action.returnUrl),
        createdAt: Number(action.createdAt || now())
      };
    }

    function getPendingAction() {
      let action = null;
      try {
        action = normalizePendingAction(JSON.parse(storage?.getItem(PENDING_ACTION_KEY) || "null"));
      } catch (_) {
        action = null;
      }
      if (!action || now() - action.createdAt > ttlMs || action.createdAt > now() + 60000) {
        safeRemovePendingAction();
        return null;
      }
      return action;
    }

    return {
      getSession: () => backend.getSession(),
      getPendingAction,
      setPendingAction(action) {
        const normalized = normalizePendingAction(action);
        if (!normalized) throw new Error("待续接动作格式不正确");
        storage?.setItem(PENDING_ACTION_KEY, JSON.stringify(normalized));
        return normalized;
      },
      consumePendingAction() {
        const action = getPendingAction();
        safeRemovePendingAction();
        return action;
      },
      async runPendingAction(handlers = {}) {
        const action = getPendingAction();
        if (!action || !backend.getSession()?.user) return null;
        const handler = handlers[action.type];
        if (typeof handler !== "function") return action;
        await handler(action);
        safeRemovePendingAction();
        return action;
      },
      clearPendingAction: safeRemovePendingAction,
      requireUser(action) {
        const user = backend.getSession()?.user || null;
        if (user) return user;
        if (action) this.setPendingAction(action);
        return null;
      },
      async initialize() {
        if (String(location?.hash || "").includes("access_token=")) {
          backend.acceptRedirect(location.hash);
          history?.replaceState(null, "", `${location.pathname}${location.search}`);
        }
        const session = backend.getSession();
        if (!session?.access_token) return null;
        try {
          return await backend.hydrateUser();
        } catch (_) {
          // Never present a cached user as signed in when Supabase can no
          // longer validate the session used to load private data.
          await backend.signOut();
          return null;
        }
      },
      requestOtp(email) {
        return backend.requestOtp(email);
      },
      verifyOtp: (email, token) => backend.verifyOtp(email, token),
      async signOut() {
        safeRemovePendingAction();
        await backend.signOut();
      }
    };
  }

  function bindAuthDialog(options = {}) {
    const controller = options.controller;
    const root = options.root || document;
    const dialog = root.getElementById("authDialog");
    if (!controller || !dialog) throw new Error("登录窗口初始化失败");
    const byId = (id) => root.getElementById(id);
    const openButton = byId("openAuthDialog");
    const closeButton = byId("closeAuthDialog");
    const message = byId("authMessage");
    const emailForm = byId("emailLoginForm");
    const otpForm = byId("otpForm");
    const emailInput = byId("loginEmail");
    const otpInput = byId("loginOtp");
    const sessionRow = byId("sessionRow");
    const sessionEmail = byId("sessionEmail");
    const signOutButton = byId("signOut");
    let pendingEmail = "";
    let otpRequestPromise = null;
    let otpReady = false;
    let returnFocus = null;

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle("error-message", isError);
    }

    function setSignedIn(user) {
      emailForm.hidden = true;
      otpForm.hidden = true;
      sessionRow.hidden = false;
      sessionEmail.textContent = user.email || "已登录";
      if (openButton) openButton.querySelector("span")?.replaceChildren("账户");
      setMessage("已连接私人后端，数据会跨设备保存。", false);
    }

    function setSignedOut() {
      if (openButton) openButton.querySelector("span")?.replaceChildren("登录");
    }

    function open() {
      if (!dialog.open) {
        returnFocus = root.activeElement;
        dialog.showModal();
        (controller.getSession()?.user ? signOutButton : emailInput).focus();
      }
    }

    openButton?.addEventListener("click", open);
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      const target = returnFocus;
      returnFocus = null;
      setTimeout(() => {
        if (target?.isConnected) target.focus();
      }, 0);
    });

    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      const idleLabel = button.textContent;
      button.disabled = true;
      button.textContent = "发送中…";
      pendingEmail = String(emailInput.value || "").trim().toLowerCase();
      otpReady = false;
      otpInput.disabled = false;
      otpInput.placeholder = "6 位验证码";
      otpForm.querySelector("button").disabled = false;
      setMessage("正在发送验证码，可先在这里等待并填写。", false);
      otpInput.focus();
      otpRequestPromise = controller.requestOtp(emailInput.value);
      try {
        pendingEmail = await otpRequestPromise;
        otpReady = true;
        setMessage(`六位验证码已发送至 ${pendingEmail}，请在当前窗口输入验证码登录。`);
      } catch (error) {
        otpInput.disabled = true;
        otpForm.querySelector("button").disabled = true;
        setMessage(error.message || "验证码发送失败", true);
      } finally {
        otpRequestPromise = null;
        button.disabled = false;
        button.textContent = idleLabel;
      }
    });

    otpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      try {
        if (otpRequestPromise) await otpRequestPromise;
        const session = await controller.verifyOtp(pendingEmail || emailInput.value, otpInput.value);
        setSignedIn(session.user);
        await options.onSignedIn?.(session.user, { source: "otp" });
        dialog.close();
      } catch (error) {
        setMessage(error.message || "登录失败", true);
      } finally {
        button.disabled = !otpReady;
      }
    });

    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      try {
        await controller.signOut();
        await options.onSignedOut?.();
      } catch (error) {
        setMessage(error.message || "退出失败", true);
        signOutButton.disabled = false;
      }
    });

    return {
      open,
      setMessage,
      async initialize() {
        let user = null;
        try {
          user = await controller.initialize();
        } catch (error) {
          if (openButton) openButton.querySelector("span")?.replaceChildren("不可用");
          setMessage(error.message || "后端初始化失败", true);
          emailForm.querySelectorAll("input, button").forEach((element) => {
            element.disabled = true;
          });
          options.onError?.(error);
          return null;
        }
        if (!user) {
          setSignedOut();
          return null;
        }
        setSignedIn(user);
        try {
          await options.onSignedIn?.(user, { source: "session" });
        } catch (error) {
          setMessage(error.message || "已登录，但档案数据加载失败", true);
          options.onError?.(error);
        }
        return user;
      }
    };
  }

  return {
    ACTION_TYPES,
    PENDING_ACTION_KEY,
    PENDING_ACTION_TTL_MS,
    bindAuthDialog,
    createAuthController
  };
});

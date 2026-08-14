(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NoteEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const DRAFT_PREFIX = "sysu-note-draft-v1:";
  const SAVE_DELAY_MS = 800;

  function draftKey(questionId, userId) {
    return `${DRAFT_PREFIX}${userId}:${questionId}`;
  }

  function readDraft(storage, questionId, userId) {
    try {
      const value = JSON.parse(storage?.getItem(draftKey(questionId, userId)) || "null");
      return value && typeof value.content === "string" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function createNoteEditor(options = {}) {
    const backend = options.backend;
    const authController = options.authController;
    const authUi = options.authUi;
    const root = options.root || document;
    const storage = options.storage || globalThis.localStorage;
    const location = options.location || globalThis.location;
    const confirmDelete = options.confirm || globalThis.confirm;
    const schedule = options.setTimeout || globalThis.setTimeout;
    const cancel = options.clearTimeout || globalThis.clearTimeout;
    if (!backend || !authController || !authUi) throw new Error("笔记编辑器初始化失败");

    let state = null;
    let timer = null;

    function userId() { return authController.getSession()?.user?.id || null; }
    function element() {
      const node = root.querySelector("[data-question-note]");
      return node?.dataset.questionId === state?.questionId ? node : null;
    }
    function parts() {
      const node = element();
      return node ? {
        node,
        input: node.querySelector("[data-note-content]"),
        status: node.querySelector("[data-note-status]"),
        sync: node.querySelector("[data-note-sync]"),
        remove: node.querySelector("[data-note-delete]"),
        conflict: node.querySelector("[data-note-conflict]"),
        count: node.querySelector("[data-note-count]")
      } : null;
    }
    function persistLocal(content, owner = userId()) {
      if (!state) return false;
      try {
        storage?.setItem(draftKey(state.questionId, owner), JSON.stringify({
          content, updatedAt: Date.now(), dirty: true
        }));
        return true;
      } catch (_) {
        return false;
      }
    }
    function setStatus(message, error = false) {
      if (!state) return;
      state.message = message;
      state.error = error;
      render();
    }
    function resizeInput(input) {
      if (!input?.style) return;
      input.style.height = "auto";
      if (Number(input.scrollHeight) > 0) input.style.height = `${input.scrollHeight}px`;
    }
    function render() {
      const view = parts();
      if (!view || !state) return;
      view.node.hidden = !state.open;
      if (view.input.value !== state.content) view.input.value = state.content;
      resizeInput(view.input);
      view.status.textContent = state.message;
      view.status.classList.toggle("error", state.error);
      view.sync.textContent = "立即保存";
      view.sync.disabled = !userId() || state.saving || !state.content.trim();
      view.remove.hidden = !state.cloudExists;
      view.remove.disabled = state.saving;
      view.conflict.hidden = !state.conflict;
      view.count.textContent = `${state.content.length.toLocaleString("zh-CN")} / 50,000`;
      view.input.setAttribute("aria-invalid", String(state.content.length > 50000));
      root.querySelector("[data-note-action]")?.setAttribute?.("aria-expanded", String(state.open));
    }
    function activate(questionId, config = {}) {
      if (timer) cancel(timer);
      const owner = userId();
      const local = owner ? readDraft(storage, questionId, owner) : null;
      state = {
        questionId,
        content: local?.content || "",
        dirty: Boolean(local?.dirty),
        cloudContent: "",
        cloudExists: false,
        conflict: false,
        saving: false,
        open: Boolean(config.open && owner),
        message: local ? "本地草稿" : "",
        error: false
      };
      render();
      if (config.open && !owner) {
        authController.requireUser({
          type: "open-note", questionId, returnUrl: location.href
        });
        authUi.open();
      }
      if (state.open) parts()?.input.focus();
      return { ...state };
    }
    function deactivate() {
      if (timer) cancel(timer);
      timer = null;
      state = null;
    }
    function open(questionId) {
      if (!state || state.questionId !== questionId) activate(questionId, { open: true });
      if (!userId()) {
        authController.requireUser({
          type: "open-note", questionId, returnUrl: location.href
        });
        authUi.open();
        return;
      }
      state.open = true;
      render();
      parts()?.input.focus();
    }
    function close() {
      if (!state) return;
      state.open = false;
      render();
      root.querySelector("[data-note-action]")?.focus?.();
      options.onClose?.(state.questionId);
    }
    function applyCloudNote(questionId, note) {
      if (!state || state.questionId !== questionId || !userId()) return;
      const local = readDraft(storage, questionId, userId());
      const cloud = note?.content || "";
      state.cloudContent = cloud;
      state.cloudExists = Boolean(note);
      if (local?.dirty && local.content !== cloud) {
        state.content = local.content;
        state.dirty = true;
        state.conflict = Boolean(note);
        state.message = note ? "发现本地草稿与云端版本不同" : "等待保存";
      } else {
        state.content = local?.content ?? cloud;
        state.dirty = Boolean(local?.dirty);
        state.message = state.dirty ? "等待保存" : (note ? "已载入云端笔记" : "");
      }
      render();
      if (state.dirty && state.content.trim() && !state.conflict) queueSave();
    }
    function queueSave() {
      if (timer) cancel(timer);
      if (!userId() || !state?.content.trim() || state.conflict) return;
      timer = schedule(() => { timer = null; save(); }, SAVE_DELAY_MS);
    }
    function input(content) {
      if (!state || !userId()) return;
      state.content = String(content ?? "");
      state.dirty = true;
      state.conflict = false;
      const stored = persistLocal(state.content);
      state.message = stored
        ? (state.content.trim() ? "等待保存" : "请使用删除按钮移除云端笔记")
        : "无法写入本地草稿，请复制内容后重试";
      state.error = !stored;
      render();
      queueSave();
    }
    async function save() {
      if (!state || state.saving || !state.content.trim()) return null;
      if (state.content.length > 50000) {
        setStatus("笔记超过 50,000 字，请删减后保存", true);
        return null;
      }
      if (!authController.requireUser({
        type: "open-note", questionId: state.questionId, returnUrl: location.href
      })) {
        authUi.open();
        return null;
      }
      state.saving = true;
      setStatus("保存中");
      const questionId = state.questionId;
      const content = state.content;
      try {
        const [saved] = await Promise.all([
          backend.saveNote(questionId, content),
          backend.addFavorite(questionId)
        ]);
        if (state?.questionId !== questionId) return saved;
        state.cloudContent = content;
        state.cloudExists = true;
        state.dirty = false;
        state.conflict = false;
        try { storage?.removeItem(draftKey(questionId, userId())); } catch (_) {}
        setStatus("已保存");
        options.onSaved?.({ questionId, note: saved, favorited: true });
        backend.recordActivity?.().catch(() => {});
        return saved;
      } catch (error) {
        if (state?.questionId === questionId) setStatus(error.message || "保存失败，点击重试", true);
        throw error;
      } finally {
        if (state?.questionId === questionId) { state.saving = false; render(); }
      }
    }
    async function remove() {
      if (!state?.cloudExists || !authController.getSession()?.user) return null;
      if (confirmDelete && !confirmDelete("确定删除这篇云端笔记？")) return null;
      state.saving = true;
      setStatus("删除中");
      try {
        await backend.deleteNote(state.questionId);
        state.cloudExists = false;
        state.cloudContent = "";
        setStatus(state.content.trim() ? "云端笔记已删除，本地内容尚未保存" : "云端笔记已删除");
      } catch (error) {
        setStatus(error.message || "删除失败，请重试", true);
        throw error;
      } finally { state.saving = false; render(); }
    }
    function keepLocal() { if (state) { state.conflict = false; state.message = "等待保存"; render(); queueSave(); } }
    function restoreCloud() {
      if (!state) return;
      state.content = state.cloudContent;
      state.dirty = false;
      state.conflict = false;
      try { storage?.removeItem(draftKey(state.questionId, userId())); } catch (_) {}
      setStatus("已恢复云端版本");
    }

    root.addEventListener("input", (event) => {
      if (event.target.closest?.("[data-note-content]")) input(event.target.value);
    });
    root.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-note-sync]")) save().catch(() => {});
      else if (event.target.closest?.("[data-note-close]")) close();
      else if (event.target.closest?.("[data-note-delete]")) remove().catch(() => {});
      else if (event.target.closest?.("[data-note-keep-local]")) keepLocal();
      else if (event.target.closest?.("[data-note-use-cloud]")) restoreCloud();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && event.target.closest?.("[data-question-note]")) {
        event.preventDefault();
        close();
      }
    });

    return { activate, deactivate, open, close, input, save, remove, applyCloudNote, resizeInput, getState: () => state ? { ...state } : null };
  }

  return { DRAFT_PREFIX, SAVE_DELAY_MS, draftKey, readDraft, createNoteEditor };
});

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuestionActions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  function createQuestionActions(options = {}) {
    const backend = options.backend;
    const authController = options.authController;
    const authUi = options.authUi;
    const root = options.root || document;
    const location = options.location || globalThis.location;
    if (!backend || !authController || !authUi) throw new Error("题目操作初始化失败");

    let requestVersion = 0;
    let state = null;

    function container() {
      const element = root.querySelector("[data-question-actions]");
      return element?.dataset.questionId === state?.questionId ? element : null;
    }

    function setStatus(message = "", isError = false) {
      if (!state) return;
      state.message = message;
      state.error = isError;
    }

    function render() {
      const element = container();
      if (!element || !state) return;
      const favoriteButton = element.querySelector("[data-favorite-action]");
      const favoriteIcon = element.querySelector("[data-favorite-icon]");
      const favoriteLabel = element.querySelector("[data-favorite-label]");
      const noteButton = element.querySelector("[data-note-action]");
      const status = element.querySelector("[data-question-action-status]");
      const unavailable = state.loading || state.busy;

      favoriteButton.disabled = unavailable;
      favoriteButton.setAttribute("aria-pressed", String(state.favorite));
      favoriteButton.dataset.state = state.favorite ? "saved" : "idle";
      favoriteIcon.textContent = state.favorite ? "★" : "☆";
      favoriteLabel.textContent = state.loading
        ? "读取中…"
        : "收藏";
      noteButton.disabled = state.loading;
      noteButton.textContent = state.loading
        ? "读取中…"
        : "笔记";
      if (status) {
        status.textContent = state.message;
        status.hidden = !state.message;
        status.classList.toggle("error", state.error);
      }
    }

    function noteReturnUrl(questionId) {
      try {
        const target = new URL(location.href);
        target.searchParams.set("question", questionId);
        target.searchParams.set("mode", "note");
        return target.href;
      } catch (_) {
        return location.href;
      }
    }

    async function activate(questionId) {
      const version = ++requestVersion;
      const signedIn = Boolean(authController.getSession()?.user);
      state = {
        questionId,
        favorite: false,
        note: null,
        loading: signedIn,
        busy: false,
        message: "",
        error: false
      };
      render();
      if (!signedIn) return state;
      try {
        const [loaded] = await Promise.all([
          backend.loadQuestionState(questionId),
          Promise.resolve(backend.recordRecentView?.(questionId)).catch(() => null)
        ]);
        if (version !== requestVersion || state?.questionId !== questionId) return null;
        state.favorite = loaded.favorite;
        state.note = loaded.note;
      } catch (error) {
        if (version !== requestVersion || state?.questionId !== questionId) return null;
        setStatus(error.message || "私人状态读取失败，请稍后重试", true);
      } finally {
        if (version === requestVersion && state?.questionId === questionId) {
          state.loading = false;
          render();
        }
      }
      return state;
    }

    function deactivate() {
      requestVersion += 1;
      state = null;
    }

    function markFavorite(questionId) {
      if (!state || state.questionId !== questionId) return;
      state.favorite = true;
      render();
    }

    async function handleFavorite() {
      if (!state || state.loading || state.busy) return null;
      if (!authController.requireUser({
        type: "favorite",
        questionId: state.questionId,
        returnUrl: location.href
      })) {
        authUi.open();
        return null;
      }
      const questionId = state.questionId;
      const previous = state.favorite;
      state.favorite = !previous;
      state.busy = true;
      setStatus("");
      render();
      try {
        if (state.favorite) await backend.addFavorite(questionId);
        else await backend.removeFavorite(questionId);
        setStatus(state.favorite ? "已加入复习" : "已移出复习");
        backend.recordActivity?.().catch(() => {});
      } catch (error) {
        if (state?.questionId === questionId) {
          state.favorite = previous;
          setStatus(error.message || "收藏失败，请重试", true);
        }
      } finally {
        if (state?.questionId === questionId) {
          state.busy = false;
          render();
        }
      }
      return state;
    }

    async function handleNote() {
      if (!state || state.loading) return null;
      const action = {
        type: "open-note",
        questionId: state.questionId,
        returnUrl: noteReturnUrl(state.questionId)
      };
      await options.onOpenNote?.(action, state);
      return state;
    }

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-favorite-action]")) {
        handleFavorite();
      } else if (event.target.closest("[data-note-action]")) {
        handleNote();
      }
    });

    return {
      activate,
      deactivate,
      markFavorite,
      getState: () => state ? { ...state } : null,
      handleFavorite,
      handleNote,
      render
    };
  }

  return { createQuestionActions };
});

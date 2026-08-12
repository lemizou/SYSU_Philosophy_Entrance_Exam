(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const toast = byId("toast");
  const authMessage = byId("authMessage");
  const authDialog = byId("authDialog");
  let toastTimer;
  let backend = null;
  let questions = new Map();
  let activeNote = null;
  let saveTimer = null;
  let pendingEmail = "";

  byId("openAuthDialog").addEventListener("click", () => authDialog.showModal());
  byId("closeAuthDialog").addEventListener("click", () => authDialog.close());
  authDialog.addEventListener("click", (event) => {
    if (event.target === authDialog) authDialog.close();
  });

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle("error-message", isError);
  }

  function showView(view) {
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === view;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  }

  document.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.openView)));

  function renderCalendar(activity = []) {
    const calendar = byId("activityCalendar");
    calendar.replaceChildren();
    const activeDates = new Set(activity.map((row) => row.activity_date));
    const today = new Date();
    for (let offset = 27; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - offset);
      const key = date.toISOString().slice(0, 10);
      const cell = document.createElement("span");
      cell.className = "activity-day";
      cell.dataset.level = activeDates.has(key) ? "2" : "0";
      if (offset === 0) cell.dataset.today = "true";
      cell.title = activeDates.has(key) ? `${key} 有学习活动` : `${key} 无学习记录`;
      calendar.appendChild(cell);
    }
  }

  function questionFor(id) {
    return questions.get(id) || {
      id,
      question: id,
      subject: "未知科目",
      section: "未知题型",
      year: "—"
    };
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" })
      .format(new Date(value));
  }

  function setupFilters(scope, listSelector, itemSelector, emptySelector) {
    const strip = document.querySelector(`[data-filter-scope="${scope}"]`);
    const search = document.querySelector(`[data-personal-search="${scope}"]`);
    const list = document.querySelector(listSelector);
    function apply() {
      const items = [...list.querySelectorAll(itemSelector)];
      const empty = list.querySelector(emptySelector);
      const query = search.value.trim().toLowerCase();
      const subject = strip.querySelector('[data-filter-field="subject"]').value;
      const section = strip.querySelector('[data-filter-field="section"]').value;
      const sort = strip.querySelector('[data-filter-field="sort"]').value;
      items.sort((a, b) => {
        if (sort === "year_desc") return Number(b.dataset.year) - Number(a.dataset.year);
        if (sort === "year_asc") return Number(a.dataset.year) - Number(b.dataset.year);
        return Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder);
      });
      let visible = 0;
      items.forEach((item) => {
        const matches = (!query || (item.dataset.search || "").toLowerCase().includes(query))
          && (!subject || item.dataset.subject === subject)
          && (!section || item.dataset.section === section);
        item.hidden = !matches;
        list.insertBefore(item, empty);
        if (matches) visible += 1;
      });
      empty.hidden = visible !== 0;
    }
    search.addEventListener("input", apply);
    strip.querySelectorAll("select").forEach((select) => select.addEventListener("change", apply));
    strip.querySelector(".reset-personal-filters").addEventListener("click", () => {
      search.value = "";
      strip.querySelectorAll("select").forEach((select) => { select.selectedIndex = 0; });
      apply();
    });
    return apply;
  }

  const applyFavoriteFilters = setupFilters("favorites", "#favoriteList", "article", ".filter-empty");
  const applyNoteFilters = setupFilters("notes", "#noteResults", ".note-choice", ".note-empty");

  function selectNote(note, button) {
    document.querySelectorAll(".note-choice").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeNote = note;
    const question = questionFor(note.question_id);
    byId("noteTitle").textContent = question.question;
    byId("noteMeta").textContent = `${question.subject} · ${question.year} · ${question.section}`;
    byId("noteContent").value = note.content;
    byId("noteContent").disabled = false;
    byId("saveNote").disabled = false;
    byId("saveStatus").textContent = "所有更改已保存";
  }

  function renderFavorites(rows) {
    const list = byId("favoriteList");
    const empty = list.querySelector(".filter-empty");
    list.querySelectorAll("article").forEach((item) => item.remove());
    empty.textContent = "没有符合当前条件的收藏。";
    rows.forEach((row, index) => {
      const question = questionFor(row.question_id);
      const item = document.createElement("article");
      item.dataset.originalOrder = String(index);
      item.dataset.search = `${question.question} ${question.subject} ${(question.philosophers || []).join(" ")}`;
      item.dataset.subject = question.subject;
      item.dataset.section = question.section;
      item.dataset.year = question.year;
      const mark = document.createElement("div");
      mark.className = "archive-mark";
      mark.textContent = `F.${String(rows.length - index).padStart(3, "0")}`;
      const details = document.createElement("div");
      const meta = document.createElement("p");
      meta.textContent = `${question.subject} · ${question.year} · ${question.section}`;
      const title = document.createElement("h4");
      title.textContent = question.question;
      details.append(meta, title);
      const link = document.createElement("a");
      link.href = `search.html?q=${encodeURIComponent(question.question)}`;
      link.textContent = "查看原题";
      item.append(mark, details, link);
      list.insertBefore(item, empty);
    });
    applyFavoriteFilters();
  }

  function renderNotes(rows) {
    const list = byId("noteResults");
    const empty = list.querySelector(".note-empty");
    list.querySelectorAll(".note-choice").forEach((item) => item.remove());
    empty.textContent = "没有符合当前条件的笔记。";
    activeNote = null;
    rows.forEach((note, index) => {
      const question = questionFor(note.question_id);
      const button = document.createElement("button");
      button.className = "note-choice";
      button.type = "button";
      button.dataset.originalOrder = String(index);
      button.dataset.search = `${question.question} ${question.subject} ${note.content}`;
      button.dataset.subject = question.subject;
      button.dataset.section = question.section;
      button.dataset.year = question.year;
      const date = document.createElement("span");
      date.textContent = formatDate(note.updated_at);
      const title = document.createElement("strong");
      title.textContent = question.question;
      const meta = document.createElement("small");
      meta.textContent = `${question.subject} · ${question.section}`;
      button.append(date, title, meta);
      button.addEventListener("click", () => selectNote(note, button));
      list.insertBefore(button, empty);
      if (index === 0) selectNote(note, button);
    });
    if (!rows.length) {
      byId("noteContent").value = "";
      byId("noteContent").disabled = true;
      byId("saveNote").disabled = true;
    }
    applyNoteFilters();
  }

  function setSignedIn(user) {
    byId("emailLoginForm").hidden = true;
    byId("otpForm").hidden = true;
    byId("sessionRow").hidden = false;
    byId("sessionEmail").textContent = user.email || "已登录";
    byId("openAuthDialog").querySelector("span").textContent = "账户";
    setAuthMessage("已连接私人后端，数据会跨设备保存。", false);
  }

  async function refreshData() {
    const data = await backend.loadMyData();
    const stats = data.stats || {};
    const values = {
      favoriteCount: stats.favorite_count ?? data.favorites.length,
      noteCount: stats.note_count ?? data.notes.length,
      activeDayCount: stats.active_day_count ?? data.activity.length,
      favoriteNavCount: stats.favorite_count ?? data.favorites.length,
      noteNavCount: stats.note_count ?? data.notes.length
    };
    Object.entries(values).forEach(([id, value]) => { byId(id).textContent = value; });
    renderFavorites(data.favorites);
    renderNotes(data.notes);
    renderCalendar(data.activity);
  }

  async function saveActiveNote() {
    if (!activeNote) return;
    clearTimeout(saveTimer);
    byId("saveStatus").textContent = "保存中…";
    try {
      const saved = await backend.saveNote(activeNote.question_id, byId("noteContent").value);
      if (saved) activeNote = saved;
      byId("saveStatus").textContent = "所有更改已保存";
      showToast("笔记已保存到私人后端");
    } catch (error) {
      byId("saveStatus").textContent = "保存失败";
      showToast(error.message || "保存失败", true);
      throw error;
    }
  }

  byId("noteContent").addEventListener("input", () => {
    byId("saveStatus").textContent = "等待保存…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveActiveNote().catch(() => {}), 800);
  });
  byId("saveNote").addEventListener("click", () => saveActiveNote().catch(() => {}));

  byId("emailLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      pendingEmail = await backend.requestOtp(byId("loginEmail").value, location.href.split("#")[0]);
      byId("loginOtp").disabled = false;
      byId("loginOtp").placeholder = "6 位验证码";
      byId("otpForm").querySelector("button").disabled = false;
      setAuthMessage(`验证码已发送至 ${pendingEmail}。也可以直接点击邮件中的登录链接。`);
      byId("loginOtp").focus();
    } catch (error) {
      setAuthMessage(error.message || "验证码发送失败", true);
    } finally {
      button.disabled = false;
    }
  });

  byId("otpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const session = await backend.verifyOtp(pendingEmail || byId("loginEmail").value, byId("loginOtp").value);
      setSignedIn(session.user);
      await backend.recordActivity();
      await refreshData();
      authDialog.close();
    } catch (error) {
      setAuthMessage(error.message || "登录失败", true);
    } finally {
      button.disabled = false;
    }
  });

  byId("signOut").addEventListener("click", async () => {
    await backend.signOut();
    location.reload();
  });

  window.addEventListener("pagehide", () => {
    if (activeNote && byId("saveStatus").textContent !== "所有更改已保存") {
      saveActiveNote().catch(() => {});
    }
  });

  async function initialize() {
    renderCalendar();
    try {
      const response = await fetch("../data/questions.json");
      if (!response.ok) throw new Error("题库加载失败");
      questions = new Map((await response.json()).map((item) => [item.id, item]));
      backend = window.UserBackend.createUserBackend(window.__SUPABASE_CONFIG__);
      if (location.hash.includes("access_token=")) {
        backend.acceptRedirect(location.hash);
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      }
      let session = backend.getSession();
      if (session?.access_token) {
        const user = session.user?.id ? session.user : await backend.hydrateUser();
        setSignedIn(user);
        await backend.recordActivity();
        await refreshData();
      }
    } catch (error) {
      setAuthMessage(error.message || "后端初始化失败", true);
      document.querySelectorAll("#emailLoginForm input, #emailLoginForm button")
        .forEach((element) => { element.disabled = true; });
    }
  }

  initialize();
})();

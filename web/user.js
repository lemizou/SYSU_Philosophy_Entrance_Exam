(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const toast = byId("toast");
  let toastTimer;
  let backend = null;
  let authController = null;
  let authUi = null;
  let questions = new Map();
  let activeNote = null;
  let favoriteQuestionIds = new Set();
  let saveTimer = null;
  let personalSearchAliases = window.ConceptAliases.create([]);
  let personalSearchReady = false;
  const VIEW_STORAGE_KEY = "sysu-user-active-view-v1";
  const VALID_VIEWS = new Set(["overview", "library"]);

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function showView(view, remember = true) {
    if (!VALID_VIEWS.has(view)) view = "overview";
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
    if (remember) {
      try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch (_) {}
    }
  }

  try {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
    const savedView = storedView === "favorites" || storedView === "notes" ? "library" : storedView;
    if (VALID_VIEWS.has(savedView)) showView(savedView, false);
  } catch (_) {}

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

  function renderWeeklyFocus(favorites = [], notes = []) {
    const list = document.querySelector(".focus-section ol");
    const rows = [...list.querySelectorAll("li")];
    const focus = window.UserBackend.calculateWeeklyFocus({ favorites, notes, questions });
    const queryKeys = { philosophers: "person", topics: "topic", schools: "school" };
    rows.forEach((row, index) => {
      const item = focus[index];
      row.hidden = !item;
      if (!item) return;
      const link = row.querySelector("a");
      link.href = `search.html?${queryKeys[item.field]}=${encodeURIComponent(item.tag)}`;
      link.querySelector("span").textContent = item.tag;
      link.querySelector("b").style.setProperty("--share", `${item.share}%`);
      link.querySelector("small").textContent = item.count;
      link.title = `最近 7 天的收藏与笔记共出现 ${item.count} 次`;
    });
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

  function formatDateKey(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function truncateText(value, limit) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    const characters = Array.from(normalized);
    return characters.length > limit
      ? `${characters.slice(0, limit).join("")}……`
      : normalized;
  }

  function renderResume(recentViews = [], notes = []) {
    const recent = recentViews[0];
    if (!recent) {
      byId("resumeEyebrow").textContent = "最近学习";
      byId("resumeDay").textContent = "—";
      byId("resumeMonth").textContent = "—";
      byId("resumeMeta").replaceChildren(Object.assign(document.createElement("span"), { textContent: "尚无记录" }));
      byId("resumeTitle").textContent = "从一道真题开始";
      byId("resumeSummary").textContent = "打开任意真题后，最近学习记录会自动出现在这里。";
      byId("resumeAction").href = "search.html";
      byId("resumeAction").textContent = "浏览真题";
      return;
    }
    const question = questionFor(recent.question_id);
    const viewedAt = new Date(recent.last_viewed_at);
    const validDate = Number.isFinite(viewedAt.getTime());
    byId("resumeEyebrow").textContent = validDate
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(viewedAt).toUpperCase()
      : "最近学习";
    byId("resumeDay").textContent = validDate ? String(viewedAt.getDate()).padStart(2, "0") : "—";
    byId("resumeMonth").textContent = validDate
      ? new Intl.DateTimeFormat("zh-CN", { month: "long" }).format(viewedAt)
      : "—";
    byId("resumeMeta").replaceChildren(...[question.subject, question.year, question.section].map((value) =>
      Object.assign(document.createElement("span"), { textContent: value })));
    byId("resumeTitle").textContent = truncateText(`${question.question}${question.passage || ""}`, 48);
    const note = notes.find((item) => item.question_id === recent.question_id);
    const noteText = note?.content?.trim() || "";
    byId("resumeSummary").textContent = noteText
      ? `笔记摘要：${truncateText(noteText, 84)}`
      : `已查看 ${recent.view_count || 1} 次，继续复习这道题。`;
    byId("resumeAction").href = `search.html?question=${encodeURIComponent(recent.question_id)}${note ? "&mode=note" : ""}`;
    byId("resumeAction").textContent = "继续阅读";
  }

  function setupFilters(scope, listSelector, itemSelector, emptySelector) {
    const strip = document.querySelector(`[data-filter-scope="${scope}"]`);
    const search = document.querySelector(`[data-personal-search="${scope}"]`);
    const list = document.querySelector(listSelector);
    function apply() {
      const items = [...list.querySelectorAll(itemSelector)];
      const empty = list.querySelector(emptySelector);
      const query = search.value.trim().toLowerCase();
      const searchIndex = query && personalSearchReady
        ? window.SearchIndex.createRecords(items.map((item, index) => ({
          id: item.dataset.searchId || `${scope}-${index}`,
          text: `${item.dataset.search || ""} ${item.dataset.year || ""}`
        })), personalSearchAliases)
        : null;
      const matchedIds = searchIndex ? searchIndex.search(query) : null;
      const subject = strip.querySelector('[data-filter-field="subject"]').value;
      const section = strip.querySelector('[data-filter-field="section"]').value;
      const sort = strip.querySelector('[data-filter-field="sort"]').value;
      const date = strip.querySelector('[data-filter-field="date"]')?.value || "";
      items.sort((a, b) => {
        if (sort === "year_desc") return Number(b.dataset.year) - Number(a.dataset.year);
        if (sort === "year_asc") return Number(a.dataset.year) - Number(b.dataset.year);
        return Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder);
      });
      let visible = 0;
      items.forEach((item) => {
        const searchId = item.dataset.searchId || `${scope}-${items.indexOf(item)}`;
        const matches = (!query || (matchedIds
          ? matchedIds.has(searchId)
            : `${item.dataset.search || ""} ${item.dataset.year || ""}`.toLowerCase().includes(query)))
          && (!subject || item.dataset.subject === subject)
          && (!section || item.dataset.section === section)
          && (!date || item.dataset.date === date);
        item.hidden = !matches;
        list.insertBefore(item, empty);
        if (matches) visible += 1;
      });
      if (scope === "library") {
        const editor = byId("noteEditor");
        const selected = items.find((item) => item.classList.contains("active") && !item.hidden);
        if (selected) {
          selected.after(editor);
          editor.hidden = false;
        } else {
          editor.hidden = true;
        }
      }
      if (items.length && visible === 0) {
        empty.innerHTML = "<p>没有符合当前条件的结果。</p>";
      }
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

  const applyLibraryFilters = setupFilters("library", "#noteResults", ".note-choice", ".note-empty");

  function selectNote(note, button) {
    const editor = byId("noteEditor");
    if (button.classList.contains("active")) {
      if (byId("saveStatus").textContent !== "所有更改已保存") {
        saveActiveNote().catch(() => {});
      }
      button.classList.remove("active");
      editor.hidden = true;
      activeNote = null;
      return;
    }
    document.querySelectorAll(".note-choice").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    button.after(editor);
    editor.hidden = false;
    activeNote = note;
    const question = questionFor(note.question_id);
    byId("noteTitle").textContent = [question.question, question.passage]
      .filter(Boolean)
      .join("\n\n");
    byId("noteMeta").textContent = `${question.subject} · ${question.year} · ${question.section}`;
    byId("noteContent").value = note.content;
    byId("noteContent").disabled = false;
    byId("noteContent").placeholder = "在这里写下你的理解或复习线索";
    byId("saveNote").disabled = false;
    byId("noteSourceLink").href = `search.html?question=${encodeURIComponent(note.question_id)}&mode=note`;
    byId("noteSourceLink").hidden = false;
    byId("saveStatus").textContent = "所有更改已保存";
  }

  function renderLibrary(favorites, notes) {
    const list = byId("noteResults");
    const empty = list.querySelector(".note-empty");
    byId("noteEditor").hidden = true;
    list.querySelectorAll(".note-choice").forEach((item) => item.remove());
    const notesByQuestion = new Map(notes.map((note) => [note.question_id, note]));
    const rowsByQuestion = new Map();
    favorites.forEach((favorite) => rowsByQuestion.set(favorite.question_id, {
      question_id: favorite.question_id,
      content: notesByQuestion.get(favorite.question_id)?.content || "",
      favorite_at: favorite.created_at
    }));
    notes.forEach((note) => {
      const existing = rowsByQuestion.get(note.question_id);
      rowsByQuestion.set(note.question_id, {
        ...note,
        favorite_at: existing?.favorite_at || ""
      });
    });
    const rows = [...rowsByQuestion.values()];
    const dateFilter = document.querySelector('[data-filter-scope="library"] [data-filter-field="date"]');
    const dateKeys = [...new Set(rows.map((row) => formatDateKey(row.favorite_at)).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));
    dateFilter.replaceChildren(Object.assign(document.createElement("option"), {
      value: "",
      textContent: "收藏日期"
    }), ...dateKeys.map((key) => Object.assign(document.createElement("option"), {
      value: key,
      textContent: key.replaceAll("-", "/")
    })));
    empty.innerHTML = rows.length ? "<p>没有符合当前条件的收藏或笔记。</p>" : `
      <strong>还没有收藏或私人笔记</strong>
      <p>从真题详情页收藏题目，或写下第一篇复习笔记。</p>
      <a href="search.html">去真题检索</a>`;
    activeNote = null;
    rows.forEach((note, index) => {
      const question = questionFor(note.question_id);
      const button = document.createElement("button");
      button.className = "note-choice";
      button.type = "button";
      button.dataset.originalOrder = String(index);
      button.dataset.searchId = `library-${note.question_id}`;
      button.dataset.search = `${window.SearchEngine.searchableText(question)} ${note.content}`;
      button.dataset.subject = question.subject;
      button.dataset.section = question.section;
      button.dataset.year = question.year;
      button.dataset.date = formatDateKey(note.favorite_at);
      const date = document.createElement("span");
      date.textContent = formatDate(note.favorite_at);
      const title = document.createElement("strong");
      title.textContent = question.question;
      const meta = document.createElement("small");
      meta.textContent = `${question.subject} · ${question.section}`;
      button.append(date, title, meta);
      button.addEventListener("click", () => selectNote(note, button));
      list.insertBefore(button, empty);
    });
    if (!rows.length) {
      byId("noteContent").value = "";
      byId("noteContent").disabled = true;
      byId("noteContent").placeholder = "登录并选择一篇笔记后编辑";
      byId("saveNote").disabled = true;
      byId("noteSourceLink").hidden = true;
    }
    applyLibraryFilters();
  }

  async function refreshData() {
    const data = await backend.loadMyData();
    favoriteQuestionIds = new Set(data.favorites.map((row) => row.question_id));
    const stats = data.stats || {};
    const values = {
      favoriteCount: stats.favorite_count ?? data.favorites.length,
      noteCount: stats.note_count ?? data.notes.length,
      activeDayCount: stats.active_day_count ?? data.activity.length,
      libraryNavCount: new Set([
        ...data.favorites.map((row) => row.question_id),
        ...data.notes.map((row) => row.question_id)
      ]).size
    };
    Object.entries(values).forEach(([id, value]) => { byId(id).textContent = value; });
    renderLibrary(data.favorites, data.notes);
    renderResume(data.recentViews, data.notes);
    renderCalendar(data.activity);
    renderWeeklyFocus(data.favorites, data.notes);
  }

  async function saveActiveNote() {
    if (!activeNote) return;
    const noteToSave = activeNote;
    const content = byId("noteContent").value;
    clearTimeout(saveTimer);
    byId("saveStatus").textContent = "保存中…";
    try {
      const [saved, favorite] = await Promise.all([
        backend.saveNote(noteToSave.question_id, content),
        backend.addFavorite(noteToSave.question_id)
      ]);
      const favoriteAt = noteToSave.favorite_at || favorite?.created_at || new Date().toISOString();
      Object.assign(noteToSave, saved || {}, { content, favorite_at: favoriteAt });
      if (activeNote?.question_id === noteToSave.question_id) {
        activeNote = noteToSave;
        const activeButton = document.querySelector(".note-choice.active");
        if (activeButton) {
          activeButton.dataset.date = formatDateKey(favoriteAt);
          activeButton.querySelector("span").textContent = formatDate(favoriteAt);
        }
      }
      if (!favoriteQuestionIds.has(noteToSave.question_id)) {
        favoriteQuestionIds.add(noteToSave.question_id);
        byId("favoriteCount").textContent = favoriteQuestionIds.size;
      }
      byId("saveStatus").textContent = "所有更改已保存";
      showToast("笔记已保存到私人后端");
    } catch (error) {
      byId("saveStatus").textContent = "保存失败";
      showToast(error.message || "保存失败", true);
      throw error;
    }
  }

  byId("noteContent").addEventListener("input", () => {
    if (activeNote) {
      activeNote.content = byId("noteContent").value;
      const activeButton = document.querySelector(".note-choice.active");
      if (activeButton) {
        activeButton.dataset.search = `${window.SearchEngine.searchableText(
          questionFor(activeNote.question_id)
        )} ${activeNote.content}`;
      }
    }
    byId("saveStatus").textContent = "等待保存…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveActiveNote().catch(() => {}), 800);
  });
  byId("saveNote").addEventListener("click", () => saveActiveNote().catch(() => {}));

  window.addEventListener("pagehide", () => {
    if (activeNote && byId("saveStatus").textContent !== "所有更改已保存") {
      saveActiveNote().catch(() => {});
    }
  });

  async function loadReferenceData() {
    const [questionsResponse, conceptsResponse] = await Promise.all([
      fetch("../data/questions.json"),
      fetch("../data/concept_aliases.json")
    ]);
      if (!questionsResponse.ok) throw new Error("题库加载失败");
      if (!conceptsResponse.ok) throw new Error("概念别名表加载失败");
    questions = new Map((await questionsResponse.json()).map((item) => [item.id, item]));
    personalSearchAliases = window.ConceptAliases.create(
      (await conceptsResponse.json()).groups || []
    );
    personalSearchReady = true;
    applyLibraryFilters();
  }

  async function initialize() {
    renderCalendar();
    const referenceDataReady = loadReferenceData().catch((error) => {
      showToast(error.message || "题库加载失败", true);
    });
    try {
      backend = window.UserBackend.createUserBackend(window.__SUPABASE_CONFIG__);
      authController = window.AuthController.createAuthController({ backend });
      authUi = window.AuthController.bindAuthDialog({
        controller: authController,
        async onSignedIn() {
          await referenceDataReady;
          await Promise.all([
            backend.recordActivity().catch(() => null),
            refreshData()
          ]);
        },
        onSignedOut() { location.reload(); }
      });
      await authUi.initialize();
    } catch (error) {
      byId("authMessage").textContent = error.message || "后端初始化失败";
      byId("authMessage").classList.add("error-message");
      document.querySelectorAll("#emailLoginForm input, #emailLoginForm button")
        .forEach((element) => { element.disabled = true; });
    }
  }

  window.__userSearchTestApi = {
    get ready() { return personalSearchReady; },
    applyLibraryFilters,
    renderLibrary,
    renderResume,
    truncateText
  };
  initialize();
})();

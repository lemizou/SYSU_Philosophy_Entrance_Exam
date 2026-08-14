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
  let saveTimer = null;
  let personalSearchAliases = window.ConceptAliases.create([]);
  let personalSearchReady = false;
  const VIEW_STORAGE_KEY = "sysu-user-active-view-v1";
  const VALID_VIEWS = new Set(["overview", "favorites", "notes"]);

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
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
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
          && (!section || item.dataset.section === section);
        item.hidden = !matches;
        list.insertBefore(item, empty);
        if (matches) visible += 1;
      });
      if (scope === "notes") {
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

  const applyFavoriteFilters = setupFilters("favorites", "#favoriteList", "article", ".filter-empty");
  const applyNoteFilters = setupFilters("notes", "#noteResults", ".note-choice", ".note-empty");

  function selectNote(note, button) {
    document.querySelectorAll(".note-choice").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const editor = byId("noteEditor");
    button.after(editor);
    editor.hidden = false;
    activeNote = note;
    const question = questionFor(note.question_id);
    byId("noteTitle").textContent = question.question;
    byId("noteMeta").textContent = `${question.subject} · ${question.year} · ${question.section}`;
    byId("noteContent").value = note.content;
    byId("noteContent").disabled = false;
    byId("saveNote").disabled = false;
    byId("noteSourceLink").href = `search.html?question=${encodeURIComponent(note.question_id)}&mode=note`;
    byId("noteSourceLink").hidden = false;
    byId("saveStatus").textContent = "所有更改已保存";
  }

  function renderFavorites(rows) {
    const list = byId("favoriteList");
    const empty = list.querySelector(".filter-empty");
    list.querySelectorAll("article").forEach((item) => item.remove());
    empty.innerHTML = rows.length ? "<p>没有符合当前条件的收藏。</p>" : `
      <strong>收藏夹还是空的</strong>
      <p>从任意题目详情页收藏第一道题，之后可在这里集中复习。</p>
      <a href="search.html">去真题检索</a>`;
    rows.forEach((row, index) => {
      const question = questionFor(row.question_id);
      const item = document.createElement("article");
      item.dataset.originalOrder = String(index);
      item.dataset.searchId = `favorite-${row.question_id}`;
      item.dataset.search = window.SearchEngine.searchableText(question);
      item.dataset.subject = question.subject;
      item.dataset.section = question.section;
      item.dataset.year = question.year;
      const link = document.createElement("a");
      link.className = "favorite-card-link";
      link.href = `search.html?question=${encodeURIComponent(row.question_id)}`;
      link.setAttribute("aria-label", `查看原题：${question.question}`);
      const mark = document.createElement("div");
      mark.className = "archive-mark";
      mark.textContent = `F.${String(rows.length - index).padStart(3, "0")}`;
      const details = document.createElement("div");
      const meta = document.createElement("p");
      meta.textContent = `${question.subject} · ${question.year} · ${question.section}`;
      const title = document.createElement("h4");
      title.textContent = `${question.question}${question.passage || ""}`;
      details.append(meta, title);
      link.append(mark, details);
      item.append(link);
      list.insertBefore(item, empty);
    });
    applyFavoriteFilters();
  }

  function renderNotes(rows) {
    const list = byId("noteResults");
    const empty = list.querySelector(".note-empty");
    byId("noteEditor").hidden = true;
    list.querySelectorAll(".note-choice").forEach((item) => item.remove());
    empty.innerHTML = rows.length ? "<p>没有符合当前条件的笔记。</p>" : `
      <strong>还没有私人笔记</strong>
      <p>打开一道题，在题目末尾写下第一篇理解或复习线索。</p>
      <a href="search.html">选择题目写笔记</a>`;
    activeNote = null;
    rows.forEach((note, index) => {
      const question = questionFor(note.question_id);
      const button = document.createElement("button");
      button.className = "note-choice";
      button.type = "button";
      button.dataset.originalOrder = String(index);
      button.dataset.searchId = `note-${note.question_id}`;
      button.dataset.search = `${window.SearchEngine.searchableText(question)} ${note.content}`;
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
      byId("noteSourceLink").hidden = true;
    }
    applyNoteFilters();
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
    renderResume(data.recentViews, data.notes);
    renderCalendar(data.activity);
    renderWeeklyFocus(data.favorites, data.notes);
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
    applyFavoriteFilters();
    applyNoteFilters();
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
    applyFavoriteFilters,
    applyNoteFilters,
    renderFavorites,
    renderNotes,
    renderResume,
    truncateText
  };
  initialize();
})();

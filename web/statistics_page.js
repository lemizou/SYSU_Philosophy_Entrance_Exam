(function () {
  "use strict";
  const TYPE_LABELS = { topic: "主题", philosopher: "人物", school: "流派", period: "时期", work: "著作" };
  const TYPE_PARAMS = { topic: "topic", philosopher: "person", school: "school", period: "period", work: "work" };
  const $ = (id) => document.getElementById(id);
  let questions = [];

  function searchUrl({ year, tag }) {
    const params = new URLSearchParams();
    if ($("subject").value) params.set("subject", $("subject").value);
    if ($("section").value) params.set("section", $("section").value);
    if (year) {
      params.append("year", year);
    } else {
      if ($("yearFrom").value) params.set("from", $("yearFrom").value);
      if ($("yearTo").value) params.set("to", $("yearTo").value);
    }
    if (tag) params.append(TYPE_PARAMS[$("tagType").value], tag);
    return `search.html?${params}`;
  }

  function currentFilters() {
    return {
      subject: $("subject").value,
      section: $("section").value,
      yearFrom: $("yearFrom").value,
      yearTo: $("yearTo").value
    };
  }

  function keepYearRangeValid(changedId) {
    const from = Number($("yearFrom").value);
    const to = Number($("yearTo").value);
    if (from <= to) return;
    if (changedId === "yearFrom") $("yearTo").value = $("yearFrom").value;
    else $("yearFrom").value = $("yearTo").value;
  }

  function drawYearChart(summary, label) {
    const root = $("yearChart"); const scroller = root.querySelector(".year-scroll"); const svg = root.querySelector("svg"); const tip = root.querySelector(".chart-tooltip");
    const viewportWidth = Math.floor(scroller.getBoundingClientRect().width);
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const width = Math.max(isMobile ? 680 : 320, viewportWidth); const height = isMobile ? 156 : 230;
    svg.style.width = `${width}px`;
    const margin = { top: 14, right: 10, bottom: isMobile ? 32 : 34, left: 38 }; const innerW = width - margin.left - margin.right; const innerH = height - margin.top - margin.bottom;
    const max = Math.max(5, Math.ceil(summary.maxYearCount / 5) * 5); const y = (value) => margin.top + innerH - value / max * innerH; const step = innerW / Math.max(1, summary.years.length); const barW = Math.max(5, Math.min(14, step * .56));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    let html = `<title>年度${label}相关试题数量</title><desc>当前统计条件下，每年具有${label}标签的试题数量。</desc>`;
    for (let tick = 0; tick <= max; tick += 5) { const py = y(tick); html += `<line class="grid-line" x1="${margin.left}" y1="${py}" x2="${width-margin.right}" y2="${py}"></line><text class="axis-text" x="${margin.left-8}" y="${py+3}" text-anchor="end">${tick}</text>`; }
    html += `<text class="axis-title" x="${margin.left}" y="8">题数</text>`;
    summary.years.forEach((year, index) => { const value = summary.byYear.get(year); const cx = margin.left + step * index + step / 2; html += `<rect class="year-bar" data-year="${year}" data-value="${value}" x="${cx-barW/2}" y="${y(value)}" width="${barW}" height="${y(0)-y(value)}"></rect>`; if (index % Math.max(1, Math.ceil(summary.years.length / 6)) === 0 || index === summary.years.length - 1) html += `<text class="axis-text" x="${cx}" y="${height-(isMobile ? 8 : 9)}" text-anchor="middle">${String(year).slice(2)}</text>`; });
    html += `<line class="axis-line" x1="${margin.left}" y1="${y(0)}" x2="${width-margin.right}" y2="${y(0)}"></line>`;
    svg.innerHTML = html;
    svg.querySelectorAll(".year-bar").forEach((bar) => { bar.addEventListener("click", () => location.href = searchUrl({ year: bar.dataset.year })); bar.addEventListener("mouseenter", () => { bar.classList.add("active"); const box = bar.getBoundingClientRect(); const parent = root.getBoundingClientRect(); tip.innerHTML = `<strong>${bar.dataset.year} 年</strong>${bar.dataset.value} 道具有${label}标签的试题`; tip.style.left = `${box.left-parent.left+box.width/2}px`; tip.style.top = `${box.top-parent.top-4}px`; tip.style.opacity = "1"; }); bar.addEventListener("mouseleave", () => { bar.classList.remove("active"); tip.style.opacity = "0"; }); });
  }

  function render() {
    const type = $("tagType").value; const label = TYPE_LABELS[type]; const summary = ExamStatistics.summarize(questions, type, currentFilters());
    $("yearChartTitle").textContent = `${label}相关试题分布`;
    $("yearChartDescription").textContent = `随上方统计条件更新；柱形按具有${label}标签的试题去重计数，点击查看对应年份原题`;
    $("yearCount").textContent = summary.years.length; $("questionCount").textContent = summary.filtered.length; $("tagCountLabel").textContent = `${label}考点`; $("tagCount").textContent = summary.tagCount; $("topTag").textContent = summary.ranking[0]?.name || "—"; $("rankingTitle").textContent = `高频${label}`;
    drawYearChart(summary, label);
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const top = summary.ranking.slice(0, isMobile ? 5 : 7); const maxRank = top[0]?.count || 1;
    $("ranking").innerHTML = top.length ? top.map((item) => { const percent = Math.round(item.count / maxRank * 100); return `<button class="rank-row" type="button" data-tag="${item.name}" aria-label="${item.name}，${item.count}题，相对最高频${percent}%"><span>${item.name}</span><span class="rank-track"><i class="rank-fill" style="width:${percent}%"></i></span><strong>${item.count} 题</strong></button>`; }).join("") : '<span class="empty">当前范围没有可统计的考点。</span>';
    $("ranking").querySelectorAll("[data-tag]").forEach((button) => button.addEventListener("click", () => location.href = searchUrl({ tag: button.dataset.tag })));
    const heatRows = summary.ranking; const grid = $("heatGrid"); grid.style.gridTemplateColumns = `84px repeat(${summary.years.length},minmax(36px,1fr)) 52px`;
    grid.innerHTML = `<span class="heat-corner"></span>${summary.years.map((year) => `<span class="heat-head">${String(year).slice(2)}</span>`).join("")}<span class="heat-head">合计</span>` + heatRows.map((item) => `<span class="heat-label">${item.name}</span>${summary.years.map((year) => { const value = item.years.get(year) || 0; const level = value ? Math.max(1, Math.ceil(value / Math.max(1, summary.maxCellCount) * 4)) : 0; return `<a class="heat-cell" data-level="${level}" href="${searchUrl({year,tag:item.name})}" aria-label="${item.name}，${year}年，${value}题">${value}</a>`; }).join("")}<span class="heat-total">${item.count} 题</span>`).join("");
    const heatScroll = grid.parentElement; const labelList = $("heatLabelList");
    labelList.innerHTML = heatRows.map((item) => `<span class="heat-label">${item.name}</span>`).join("");
    let lastScrollTop = -1;
    heatScroll.onscroll = () => {
      if (heatScroll.scrollTop === lastScrollTop) return;
      lastScrollTop = heatScroll.scrollTop;
      labelList.style.transform = `translate3d(0,${-lastScrollTop}px,0)`;
    };
  }

  Promise.all([fetch("../data/questions.json").then((r) => r.json())]).then(([data]) => {
    questions = data; $("totalBadge").textContent = `${questions.length} 题`;
    [...new Set(questions.map((q) => q.subject))].sort().forEach((value) => $("subject").add(new Option(value, value)));
    [...new Set(questions.map((q) => q.section))].sort().forEach((value) => $("section").add(new Option(value, value)));
    const years = [...new Set(questions.map((q) => q.year))].sort((a, b) => a - b);
    years.forEach((year) => { $("yearFrom").add(new Option(year, year)); $("yearTo").add(new Option(year, year)); });
    $("yearFrom").value = years[0]; $("yearTo").value = years.at(-1);
    $("filters").addEventListener("change", (event) => { keepYearRangeValid(event.target.id); render(); });
    $("filters").addEventListener("reset", () => setTimeout(() => { $("yearFrom").value = years[0]; $("yearTo").value = years.at(-1); render(); }));
    new ResizeObserver(() => { const type = $("tagType").value; const summary = ExamStatistics.summarize(questions, type, currentFilters()); drawYearChart(summary, TYPE_LABELS[type]); }).observe($("yearChart"));
    render();
  }).catch(() => { $("totalBadge").textContent = "载入失败"; $("ranking").innerHTML = '<span class="empty">无法读取题库数据，请通过本地服务器或公开网站访问。</span>'; });
})();

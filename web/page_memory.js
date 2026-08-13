(() => {
  "use strict";

  const PAGE_KEYS = {
    "search.html": "sysu-page-state-v1:search",
    "statistics.html": "sysu-page-state-v1:statistics",
    "user.html": "sysu-page-state-v1:user"
  };

  const pageName = (value) => value.split("/").pop() || "search.html";
  const currentPage = pageName(location.pathname);

  function rememberCurrentPage() {
    const key = PAGE_KEYS[currentPage];
    if (!key) return;
    try {
      localStorage.setItem(key, `${currentPage}${location.search}${location.hash}`);
    } catch (_) {}
  }

  function restoreNavigationTargets() {
    document.querySelectorAll(".primary-nav a[href]").forEach((link) => {
      const targetPage = pageName(link.getAttribute("href").split(/[?#]/, 1)[0]);
      const key = PAGE_KEYS[targetPage];
      if (!key || targetPage === currentPage) return;
      try {
        const savedTarget = localStorage.getItem(key);
        if (savedTarget && pageName(savedTarget.split(/[?#]/, 1)[0]) === targetPage) {
          link.setAttribute("href", savedTarget);
        }
      } catch (_) {}
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".primary-nav a[href]")) rememberCurrentPage();
  }, true);
  window.addEventListener("pagehide", rememberCurrentPage);
  restoreNavigationTargets();
})();

(function () {
  const baseFromWindow =
    typeof window !== "undefined" && window.__VITE_API_URL__
      ? String(window.__VITE_API_URL__).trim()
      : "";
  const baseFromStorage =
    typeof window !== "undefined" && window.localStorage
      ? String(window.localStorage.getItem("API_BASE_URL") || "").trim()
      : "";

  const selectedBase = baseFromWindow || baseFromStorage || "";
  const normalizedBase = selectedBase.replace(/\/+$/, "");
  window.__API_BASE_URL__ = normalizedBase;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    if (typeof input === "string" && input.startsWith("/api/") && normalizedBase) {
      return originalFetch(normalizedBase + input, init);
    }
    return originalFetch(input, init);
  };
})();

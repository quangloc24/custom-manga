(function () {
  const HEALTH_PATH = "/api/health";
  const HEALTH_TIMEOUT_MS = 5000;

  const baseFromWindow =
    typeof window !== "undefined" && window.__VITE_API_URL__
      ? String(window.__VITE_API_URL__).trim()
      : "";
  const baseFromStorage =
    typeof window !== "undefined" && window.localStorage
      ? String(window.localStorage.getItem("API_BASE_URL") || "").trim()
      : "";

  function sanitizeBaseValue(value) {
    if (!value) return "";
    if (/^%VITE_[A-Z0-9_]+%$/.test(value)) return "";
    return value;
  }

  function normalizeBase(value) {
    if (!value) return "";
    return String(value).replace(/\/+$/, "");
  }

  function pickEffectiveBase(rawBase) {
    if (!rawBase) return "";

    try {
      const current = new URL(window.location.href);
      const target = new URL(rawBase, current.origin);

      // Force same-origin proxy mode for mixed-content unsafe combos.
      if (current.protocol === "https:" && target.protocol === "http:") {
        return "";
      }

      const normalizedTarget = normalizeBase(target.href);
      const sameOriginRoot = normalizeBase(current.origin);

      // If base points to the same origin root, keep /api relative.
      if (normalizedTarget === sameOriginRoot) {
        return "";
      }

      return normalizedTarget;
    } catch {
      return "";
    }
  }

  const selectedBase = sanitizeBaseValue(baseFromWindow) || sanitizeBaseValue(baseFromStorage) || "";
  const normalizedRawBase = normalizeBase(selectedBase);
  const effectiveBase = pickEffectiveBase(normalizedRawBase);
  const originalFetch = window.fetch.bind(window);

  window.__API_BASE_URL__ = effectiveBase;
  window.__API_HEALTHY__ = false;
  window.__API_ROUTE_MODE__ = effectiveBase ? "direct" : "proxy";

  function buildApiUrl(path) {
    if (!effectiveBase) return path;
    return `${effectiveBase}${path}`;
  }

  function extractPathname(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.pathname;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    return "";
  }

  function isApiRequestInput(input) {
    const candidate = extractPathname(input);
    if (!candidate) return false;

    if (candidate.startsWith("/api/")) return true;

    if (/^https?:\/\//i.test(candidate)) {
      try {
        const parsed = new URL(candidate);
        return parsed.pathname.startsWith("/api/");
      } catch {
        return false;
      }
    }

    return false;
  }

  function resolveApiTarget(input) {
    if (!effectiveBase) return input;

    if (typeof input === "string" && input.startsWith("/api/")) {
      return `${effectiveBase}${input}`;
    }

    if (input instanceof URL && input.pathname.startsWith("/api/")) {
      return new URL(`${effectiveBase}${input.pathname}${input.search}`);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      const url = input.url || "";
      if (url.startsWith("/api/")) {
        return `${effectiveBase}${url}`;
      }

      if (/^https?:\/\//i.test(url)) {
        try {
          const parsed = new URL(url);
          if (parsed.pathname.startsWith("/api/")) {
            return `${effectiveBase}${parsed.pathname}${parsed.search}`;
          }
        } catch {
          return input;
        }
      }
    }

    return input;
  }

  function ensureOverlay() {
    let overlay = document.getElementById("api-status-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "api-status-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "24px";
    overlay.style.background = "#0b0f1c";
    overlay.style.color = "#f8fbff";
    overlay.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    overlay.style.pointerEvents = "all";

    overlay.innerHTML = `
      <div style="max-width:640px;width:100%;background:#11182c;border:1px solid #2a3558;border-radius:14px;padding:24px;box-shadow:0 20px 45px rgba(0,0,0,0.35);">
        <h1 id="api-status-title" style="margin:0 0 10px 0;font-size:24px;line-height:1.2;">Checking API status...</h1>
        <p id="api-status-message" style="margin:0 0 16px 0;color:#c8d2f2;line-height:1.5;">Please wait while the frontend verifies backend availability.</p>
        <button id="api-status-retry" style="display:none;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 14px;cursor:pointer;">Retry</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const retryBtn = document.getElementById("api-status-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = "Checking...";
        await checkApiHealth(true);
        retryBtn.disabled = false;
        retryBtn.textContent = "Retry";
      });
    }

    return overlay;
  }

  function setOverlayState({ title, message, showRetry }) {
    const overlay = ensureOverlay();
    const titleEl = overlay.querySelector("#api-status-title");
    const messageEl = overlay.querySelector("#api-status-message");
    const retryBtn = overlay.querySelector("#api-status-retry");

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (retryBtn) retryBtn.style.display = showRetry ? "inline-block" : "none";
  }

  function removeOverlay() {
    const overlay = document.getElementById("api-status-overlay");
    if (overlay) overlay.remove();
  }

  async function healthRequest() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await originalFetch(buildApiUrl(HEALTH_PATH), {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Health check failed (${response.status})`);
      }

      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkApiHealth(isManualRetry) {
    try {
      if (isManualRetry) {
        setOverlayState({
          title: "Checking API status...",
          message: "Retrying backend connection.",
          showRetry: false,
        });
      }

      await healthRequest();
      window.__API_HEALTHY__ = true;
      removeOverlay();
      return true;
    } catch (error) {
      window.__API_HEALTHY__ = false;
      setOverlayState({
        title: "API is unavailable",
        message:
          (error && error.message ? error.message : "Unable to contact backend API.") +
          " Fix API/runtime and retry.",
        showRetry: true,
      });
      return false;
    }
  }

  ensureOverlay();
  window.__API_READY_PROMISE__ = checkApiHealth(false);

  window.fetch = async function patchedFetch(input, init) {
    if (isApiRequestInput(input)) {
      await window.__API_READY_PROMISE__;
      if (!window.__API_HEALTHY__) {
        throw new Error("API unavailable");
      }
      const target = resolveApiTarget(input);
      return originalFetch(target, init);
    }

    return originalFetch(input, init);
  };
})();

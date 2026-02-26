const tableBody = document.getElementById("userListTableBody");
const emptyState = document.getElementById("userListEmptyState");
const searchInput = document.getElementById("userListSearch");
const statusFilter = document.getElementById("statusFilter");
const folderFilter = document.getElementById("folderFilter");
const listFilter = document.getElementById("listFilter");
const sortByFilter = document.getElementById("sortByFilter");
const minChapterFilter = document.getElementById("minChapterFilter");
const toggleAdvancedFiltersBtn = document.getElementById("toggleAdvancedFiltersBtn");
const advancedFiltersPanel = document.getElementById("advancedFiltersPanel");

const FOLDER_OPTIONS = [
  { value: "", label: "Unset" },
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to Read" },
  { value: "rereading", label: "Re-reading" },
];

const currentMode = document.body?.dataset?.pageMode || "list";
let rawItems = [];
let filteredItems = [];
let userPayload = null;

window.addEventListener("load", initUserLibraryPage);

async function initUserLibraryPage() {
  const storedUser = localStorage.getItem("manga_user");
  if (!storedUser) {
    window.location.href = "/login.html";
    return;
  }

  bindEvents();
  try {
    await loadData(JSON.parse(storedUser).username);
    applyFiltersAndRender();
  } catch (error) {
    console.error("[UserList] Initialization failed:", error);
    toast?.error?.(error.message || "Failed to load your list");
    emptyState.style.display = "flex";
  }
}

function bindEvents() {
  searchInput?.addEventListener("input", applyFiltersAndRender);
  statusFilter?.addEventListener("change", applyFiltersAndRender);
  folderFilter?.addEventListener("change", applyFiltersAndRender);
  listFilter?.addEventListener("change", applyFiltersAndRender);
  sortByFilter?.addEventListener("change", applyFiltersAndRender);
  minChapterFilter?.addEventListener("input", applyFiltersAndRender);
  toggleAdvancedFiltersBtn?.addEventListener("click", () => {
    const visible = advancedFiltersPanel.style.display !== "none";
    advancedFiltersPanel.style.display = visible ? "none" : "block";
  });
}

async function loadData(username) {
  const userRes = await fetch(`/api/user/${encodeURIComponent(username)}`);
  if (!userRes.ok) {
    throw new Error("Failed to load user data");
  }
  const userJson = await userRes.json();
  userPayload = userJson.user || {};

  const mangaData = userPayload.mangaData || {};
  const customLists = userPayload.customLists || {};
  const readChapters = userPayload.readChapters || {};
  const mangaIds = Object.keys(mangaData);
  const listMembershipMap = buildListMembership(customLists);
  populateListFilter(customLists);

  const idsForMode =
    currentMode === "favorites"
      ? mangaIds.filter((id) => mangaData[id]?.favorite === true)
      : mangaIds;

  const records = await Promise.all(
    idsForMode.map(async (mangaId) => {
      try {
        const mangaRes = await fetch(`/api/manga/${encodeURIComponent(mangaId)}?chapters=true`);
        if (!mangaRes.ok) return null;
        const manga = await mangaRes.json();
        if (!manga || !manga.id) return null;

        const entry = mangaData[mangaId] || {};
        const folder = normalizeFolder(entry.status);
        const releaseStatus = normalizeReleaseStatus(
          manga?.details?.status || manga?.status || "",
        );
        const rating = entry.rating ? Number(entry.rating) : null;
        const lists = listMembershipMap.get(mangaId) || [];
        const progress = buildProgress(manga, readChapters[mangaId]);
        const latestChapterNumber = parseChapterNumber(manga.latestChapter);

        return {
          mangaId,
          manga,
          title: manga.title || mangaId,
          folder,
          releaseStatus,
          rating,
          favorite: !!entry.favorite,
          lists,
          lastUpdated: entry.lastUpdated || manga.lastUpdated || null,
          latestChapterNumber: Number.isNaN(latestChapterNumber) ? 0 : latestChapterNumber,
          progress,
        };
      } catch (error) {
        console.error(`[UserList] Failed loading manga ${mangaId}:`, error);
        return null;
      }
    }),
  );

  rawItems = records.filter(Boolean);
}

function buildProgress(manga, readMap) {
  const total = Number(manga.totalChapters || manga.chapters?.length || 0);
  if (!readMap || typeof readMap !== "object") {
    return { read: 0, total };
  }

  const read = Object.keys(readMap).length;
  return { read, total };
}

function buildListMembership(customLists) {
  const map = new Map();
  Object.entries(customLists || {}).forEach(([listName, mangaIds]) => {
    if (!Array.isArray(mangaIds)) return;
    mangaIds.forEach((mangaId) => {
      const existing = map.get(mangaId) || [];
      existing.push(listName);
      map.set(mangaId, existing);
    });
  });
  return map;
}

function populateListFilter(customLists) {
  if (!listFilter) return;
  listFilter.innerHTML = '<option value="all">List: All</option>';
  Object.keys(customLists || {}).forEach((listName) => {
    const opt = document.createElement("option");
    opt.value = listName;
    opt.textContent = `List: ${listName}`;
    listFilter.appendChild(opt);
  });
}

function parseChapterNumber(value) {
  if (value === null || value === undefined) return NaN;
  const match = String(value).match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : NaN;
}

function applyFiltersAndRender() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const statusValue = String(statusFilter?.value || "all");
  const folderValue = String(folderFilter?.value || "all");
  const listValue = String(listFilter?.value || "all");
  const minChapter = Number(minChapterFilter?.value || 0);
  const sortValue = String(sortByFilter?.value || "updated_desc");

  filteredItems = rawItems.filter((item) => {
    if (query && !item.title.toLowerCase().includes(query)) return false;
    if (statusValue !== "all" && item.folder !== statusValue) return false;
    if (folderValue !== "all" && item.releaseStatus !== folderValue) return false;
    if (listValue !== "all" && !item.lists.includes(listValue)) return false;
    if (minChapter > 0 && item.latestChapterNumber < minChapter) return false;
    return true;
  });

  filteredItems.sort((a, b) => sortItems(a, b, sortValue));
  renderRows();
}

function sortItems(a, b, sortValue) {
  switch (sortValue) {
    case "title_asc":
      return a.title.localeCompare(b.title);
    case "title_desc":
      return b.title.localeCompare(a.title);
    case "progress_desc":
      return getProgressPercent(b) - getProgressPercent(a);
    case "progress_asc":
      return getProgressPercent(a) - getProgressPercent(b);
    case "updated_desc":
    default: {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bTime - aTime;
    }
  }
}

function getProgressPercent(item) {
  if (!item.progress.total) return 0;
  return Math.round((item.progress.read / item.progress.total) * 100);
}

function renderRows() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (filteredItems.length === 0) {
    emptyState.style.display = "flex";
    return;
  }

  emptyState.style.display = "none";
  filteredItems.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = buildRowHtml(item);
    tableBody.appendChild(tr);
    bindInlineEditors(tr, item);
  });
}

function buildRowHtml(item) {
  const thumbnail = buildThumbnailSrc(item.manga);
  const progressText = `${item.progress.read} / ${item.progress.total || "?"}`;
  const releaseLabel = releaseDisplayLabel(item.releaseStatus);
  const updatedText = formatTimeAgo(item.lastUpdated);
  const escapedTitle = escapeHtmlAttribute(item.title);

  return `
    <td>
      <div class="user-title-cell">
        <img class="user-title-thumb" src="${thumbnail}" alt="${escapedTitle}">
        <a href="manga.html?id=${item.mangaId}" class="user-title-link" title="${escapedTitle}">${item.title}</a>
      </div>
    </td>
    <td><span class="continue-chip">${progressText}</span></td>
    <td>
      <select class="inline-select js-rating-select" data-manga-id="${item.mangaId}">
        <option value="">-</option>
        ${Array.from({ length: 10 }, (_, i) => 10 - i)
          .map((v) => `<option value="${v}" ${item.rating === v ? "selected" : ""}>${v}</option>`)
          .join("")}
      </select>
    </td>
    <td>
      <select class="inline-select js-folder-select" data-manga-id="${item.mangaId}">
        ${FOLDER_OPTIONS.map(
          (option) =>
            `<option value="${option.value}" ${item.folder === option.value ? "selected" : ""}>${option.label}</option>`,
        ).join("")}
      </select>
    </td>
    <td><span class="folder-tag">${releaseLabel}</span></td>
    <td><span class="muted-text">${updatedText}</span></td>
  `;
}

function bindInlineEditors(row, item) {
  const folderSelect = row.querySelector(".js-folder-select");
  const ratingSelect = row.querySelector(".js-rating-select");

  if (folderSelect) {
    folderSelect.addEventListener("change", async (event) => {
      const nextValue = event.target.value;
      const success = await updateUserAction(item.mangaId, "status", nextValue || null);
      if (!success) event.target.value = item.folder;
      item.folder = nextValue;
      applyFiltersAndRender();
    });
  }

  if (ratingSelect) {
    ratingSelect.addEventListener("change", async (event) => {
      const nextValue = event.target.value ? Number(event.target.value) : null;
      const success = await updateUserAction(item.mangaId, "rating", nextValue);
      if (!success) event.target.value = item.rating || "";
      item.rating = nextValue;
    });
  }
}

async function updateUserAction(mangaId, action, value) {
  try {
    const username = userPayload?.username || auth?.currentUser?.username;
    if (!username) return false;

    const response = await fetch("/api/user/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, mangaId, action, value }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "Update failed");
    }
    return true;
  } catch (error) {
    console.error(`[UserList] Failed updating ${action}:`, error);
    toast?.error?.(error.message || "Failed to save");
    return false;
  }
}

function buildThumbnailSrc(manga) {
  const rawUrl = String(manga?.thumbnail || "").trim();
  if (!rawUrl) return getDefaultCardImage();
  const lastUpdatedMs = manga?.lastUpdated ? new Date(manga.lastUpdated).getTime() : null;
  if (!lastUpdatedMs || Number.isNaN(lastUpdatedMs)) return rawUrl;
  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}v=${lastUpdatedMs}`;
}

function getDefaultCardImage() {
  return "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect fill=%22%23333%22 width=%22200%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E";
}

function formatTimeAgo(dateValue) {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeFolder(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (FOLDER_OPTIONS.some((opt) => opt.value === v)) return v;
  return "";
}

function normalizeReleaseStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v.includes("finish") || v.includes("complete")) return "finished";
  if (v.includes("hiatus")) return "hiatus";
  if (v.includes("cancel")) return "cancelled";
  if (v.includes("releas") || v.includes("ongoing")) return "releasing";
  return "unknown";
}

function releaseDisplayLabel(value) {
  switch (value) {
    case "releasing":
      return "Releasing";
    case "finished":
      return "Finished";
    case "hiatus":
      return "Hiatus";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

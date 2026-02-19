// Manga detail page functionality

// Get manga ID from URL
const urlParams = new URLSearchParams(window.location.search);
const mangaId = urlParams.get("id");

// DOM Elements
const loadingContainer = document.getElementById("loadingContainer");
const mangaDetail = document.getElementById("mangaDetail");
const mangaTitle = document.getElementById("mangaTitle");
const altTitles = document.getElementById("altTitles");
const thumbnail = document.getElementById("mangaThumbnail");
const author = document.getElementById("author");
const mangaType = document.getElementById("mangaType");
const status = document.getElementById("status");
const language = document.getElementById("language");
const genres = document.getElementById("genres");
const themes = document.getElementById("themes");
const demographic = document.getElementById("demographic");
const synopsis = document.getElementById("synopsis");
const chaptersList = document.getElementById("chaptersList");
const chapterCount = document.getElementById("chapterCount");
const scrapeDetailsBtn = document.getElementById("scrapeDetailsBtn");
const providerFilter = document.getElementById("providerFilter");

// Read chapters tracking
let readChaptersMap = {}; // { chapterId: true }

// Load read chapters from database only
async function loadReadChapters() {
  try {
    // Only load from database if user is logged in
    const mangaUser = localStorage.getItem("manga_user");
    if (mangaUser) {
      try {
        const user = JSON.parse(mangaUser);
        const response = await fetch(
          `/api/user/read-chapters/${user.username}/${mangaId}`,
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.chapters) {
            // Use database as the sole source of truth
            readChaptersMap = result.chapters;
            console.log(
              "[Read Chapters] Loaded from database:",
              Object.keys(readChaptersMap).length,
              "chapters",
            );
          }
        }
      } catch (dbError) {
        console.warn("Failed to load read chapters from database:", dbError);
      }
    } else {
      console.log("[Read Chapters] No user logged in, read status disabled");
    }
  } catch (e) {
    console.error("Error loading read chapters:", e);
  }
}

// Mark chapter as read (database only)
async function markChapterAsRead(chapterId, chapterNumber, provider) {
  // Update in-memory map for immediate UI feedback
  readChaptersMap[chapterId] = {
    chapterNumber: chapterNumber || "?",
    provider: provider || "Unknown",
    timestamp: Date.now(),
  };

  // Sync to database if user is logged in
  const mangaUser = localStorage.getItem("manga_user");
  if (mangaUser) {
    try {
      const user = JSON.parse(mangaUser);
      const payload = {
        username: user.username,
        mangaId: mangaId,
        chapterId,
        chapterNumber,
        provider,
      };

      console.log("[DB Sync] Attempting to sync chapter:", payload);

      const response = await fetch("/api/user/read-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("[DB Sync] Server responded with error:", {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
        });
        const errorText = await response.text();
        console.error("[DB Sync] Error response body:", errorText);
      } else {
        const result = await response.json();
        console.log("[DB Sync] Successfully synced chapter:", result);
      }
    } catch (error) {
      console.error("[DB Sync] Failed to sync to database:", {
        errorType: error.constructor.name,
        errorMessage: error.message,
        errorStack: error.stack,
        payload: {
          mangaId,
          chapterId,
          chapterNumber,
          provider,
        },
      });
    }
  } else {
    console.warn("[DB Sync] No user logged in, chapter read status not saved");
  }
}

// Load manga details on page load
window.addEventListener("load", loadMangaDetails);
scrapeDetailsBtn.addEventListener("click", scrapeMangaDetails);

// Update chapter times every minute
setInterval(updateChapterTimes, 60000); // 60 seconds

// Helper function to calculate relative time
function calculateRelativeTime(uploadDate) {
  if (!uploadDate) return "";

  // Try to parse the upload date
  let uploadTime;

  // Try to parse as ISO date or timestamp
  uploadTime = new Date(uploadDate);

  // If it's a relative time string and we can't parse it as a date,
  // we just return it as-is (it won't update live until re-scraped)
  if (isNaN(uploadTime.getTime())) {
    return uploadDate;
  }

  const now = new Date();
  const diffMs = now - uploadTime;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffMs / 604800000);
  const diffMonths = Math.floor(diffMs / 2592000000);
  const diffYears = Math.floor(diffMs / 31536000000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  if (diffMonths < 12) return `${diffMonths}mo`;
  return `${diffYears}y`;
}

function updateChapterTimes() {
  // Update all chapter time displays
  const chapterTimeElements = document.querySelectorAll(".chapter-time");
  chapterTimeElements.forEach((el) => {
    const uploadDate = el.dataset.uploadDate;
    if (uploadDate) {
      el.textContent = calculateRelativeTime(uploadDate);
    }
  });
}

// Map to store download status for all chapters
// Set to store synced chapter URLs
let syncedChaptersSet = new Set();

// ... (existing code)

async function loadMangaDetails() {
  if (!mangaId) {
    alert("No manga ID provided");
    window.location.href = "/";
    return;
  }

  try {
    // 1. Fast Load: Fetch metadata only (no chapters)
    const timestamp = new Date().getTime();
    console.log("Fetching manga metadata...");
    const metaResponse = await fetch(
      `/api/manga/${mangaId}?chapters=false&_t=${timestamp}`,
    );

    let metaManga = null;
    if (metaResponse.ok) {
      metaManga = await metaResponse.json();

      // If metadata exists but hasn't been fully scraped, trigger auto-scrape
      if (!metaManga.detailsScraped) {
        console.log(
          "Manga metadata exists but not scraped. Triggering auto-scrape...",
        );
        await autoScrapeMangaDetails();
        return;
      }

      // Render basic info immediately
      displayMangaDetails(metaManga, true);
    } else if (metaResponse.status === 404) {
      console.log("Manga not found (404), scraping automatically...");
      await autoScrapeMangaDetails();
      return;
    }

    // 2. Slow Load: Fetch full data AND status in parallel
    console.log("Fetching chapters and status...");

    // Start status fetch immediately (don't await yet)
    const statusPromise = checkSyncStatus(mangaId);

    // Start manga fetch
    const response = await fetch(`/api/manga/${mangaId}?_t=${timestamp}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.log("Manga not found (404) during full load, scraping...");
        await autoScrapeMangaDetails();
        return;
      }
      throw new Error(`Failed to load chapters: ${response.statusText}`);
    }

    const manga = await response.json();

    // Check if we have details
    if (!manga.details || !manga.detailsScraped) {
      console.log(
        "Manga details not marked as scraped, triggering auto-scrape...",
      );
      await autoScrapeMangaDetails();
      return;
    }

    // RENDER IMMEDIATELY (without status)
    // This solves the "late" appearance. Buttons will show as "Download" initially.
    displayMangaDetails(manga, false);

    // Update status when ready
    await statusPromise;
    updateChapterStatuses();
    startSyncStatusPolling(); // Begin auto-polling every 30s for live sync indicator updates
  } catch (error) {
    console.error("Error loading manga:", error);
    // Only auto-scrape if we strongly suspect it's missing, NOT on network/render errors
    // If we already rendered the Lite version, DO NOT scrape on error.
    const isLiteRendered =
      document.getElementById("mangaTitle").textContent !== "Loading...";

    if (!isLiteRendered) {
      const loadingText = loadingContainer.querySelector("p");
      if (loadingText)
        loadingText.textContent = "Error loading details. Retrying...";
      setTimeout(loadMangaDetails, 3000); // Retry once after 3s
    } else {
      const chaptersList = document.getElementById("chaptersList");
      if (chaptersList) {
        chaptersList.innerHTML = `
                <div class="error-message" style="padding: 2rem; text-align: center;">
                    <p>Failed to load chapters.</p>
                    <button onclick="loadMangaDetails()">Retry</button>
                </div>
             `;
      }
    }
  }
}

function displayChapters(chapters) {
  chaptersList.innerHTML = "";
  chapterCount.textContent = chapters.length;

  if (chapters.length === 0) {
    chaptersList.innerHTML = '<div class="no-chapters">No chapters found</div>';
    return;
  }

  // Create provider filter
  createProviderFilter(chapters);

  // Filter chapters based on selected provider
  const filteredChapters =
    selectedProvider === "all"
      ? chapters
      : chapters.filter((ch) => ch.provider === selectedProvider);

  // Chapters are already sorted by scraper (descending)
  filteredChapters.forEach((chapter) => {
    const chapterEl = document.createElement("div");
    chapterEl.className = "chapter-item";
    chapterEl.dataset.provider = chapter.provider || "Unknown";

    const providerText = chapter.provider || "Unknown";
    const timeText = chapter.relativeTime || "";

    chapterEl.innerHTML = `
      <div class="chapter-left">
        <span class="chapter-number">Ch. ${chapter.number}</span>
      </div>
      <div class="chapter-right">
        <span class="chapter-provider">${providerText}</span>
        ${timeText ? `<span class="chapter-time" data-upload-date="${chapter.uploadDate || ""}">${timeText}</span>` : ""}
        <button class="download-btn" data-chapter-id="${chapter.id}" title="Download chapter">
          📥
        </button>
      </div>
    `;

    // CHECK STATUS FROM MAP (Instant, no network request)
    const buttonEl = chapterEl.querySelector(".download-btn");
    const status = downloadStatusMap[chapter.id];

    if (status && status.downloaded) {
      buttonEl.textContent = "✓";
      buttonEl.title = status.hasIssue
        ? `Issue: Only ${status.downloadedPages} pages downloaded`
        : `Downloaded ${status.downloadedPages}/${status.totalPages} pages`;
      buttonEl.classList.add("downloaded");

      if (status.hasIssue) {
        buttonEl.textContent = "⚠️";
        buttonEl.classList.remove("downloaded");
        buttonEl.classList.add("issue");
      }
    }

    // Add click handler for reading chapter
    const chapterLeft = chapterEl.querySelector(".chapter-left");
    chapterLeft.style.cursor = "pointer";
    chapterLeft.addEventListener("click", () => {
      console.log("Chapter clicked:", chapter.number, chapter.url);
      const params = new URLSearchParams();
      params.append("url", chapter.url);
      params.append("mangaId", mangaId);
      params.append("provider", chapter.provider || "Unknown");
      params.append("chapterId", chapter.id);
      params.append("chapterNumber", chapter.number);

      window.location.href = `reader.html?${params.toString()}`;
    });

    // Add click handler for download button
    const downloadBtn = chapterEl.querySelector(".download-btn");
    downloadBtn.addEventListener("click", async (e) => {
      e.stopPropagation(); // Prevent chapter click
      await downloadChapter(chapter, downloadBtn);
    });

    chaptersList.appendChild(chapterEl);
  });
}
// Remove the old checkDownloadStatus function or keep it for single updates?
// We might need it for *after* a download finishes to update just that one.
// So let's keep it but NOT call it in the loop.

async function autoScrapeMangaDetails() {
  loadingContainer.style.display = "flex";
  const loadingText = loadingContainer.querySelector("p");
  loadingText.textContent = "Scraping manga details for the first time...";

  try {
    const response = await fetch(`/api/scrape/manga/${mangaId}`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      // Reload the page to show the scraped details
      await loadMangaDetails();
    } else {
      alert(`Error scraping manga: ${result.error}`);
      window.location.href = "/";
    }
  } catch (error) {
    console.error("Auto-scrape error:", error);
    alert("Failed to load manga details. Please try again.");
    window.location.href = "/";
  }
}

async function displayMangaDetails(manga, isLiteVersion = false) {
  loadingContainer.style.display = "none";
  mangaDetail.style.display = "block";

  // Cover and title
  thumbnail.src = manga.thumbnail;
  thumbnail.alt = manga.title;
  mangaTitle.textContent = manga.title;

  // Alt titles - display all of them on separate lines
  if (manga.altTitles && manga.altTitles.length > 0) {
    altTitles.style.display = "block";
    altTitles.textContent = manga.altTitles.join(" / ");
  }

  // Metadata from details
  const details = manga.details || {};

  // Author
  const authors = details.authors || [];
  author.textContent = authors.join(", ") || "Unknown";

  // Artist
  const artists = details.artists || [];
  artist.textContent = artists.join(", ") || "Unknown";

  // Type (Manhwa, Manga, Manhua, etc.)
  const type =
    details.mangaType ||
    (details.originalLanguage === "Korean"
      ? "Manhwa"
      : details.originalLanguage === "Chinese"
        ? "Manhua"
        : details.originalLanguage === "Japanese"
          ? "Manga"
          : "Unknown");
  mangaType.textContent = type;

  // Status
  status.textContent = details.status || "Unknown";
  status.className = `meta-value status-badge status-${(details.status || "").toLowerCase().replace(/\s+/g, "-")}`;

  // Language
  language.textContent = (details.originalLanguage || "Unknown").toUpperCase();

  // Tags
  displayTags(genres, details.genres);
  displayTags(themes, details.themes || []);
  displayTags(demographic, details.demographic || []);

  // Synopsis - preserve line breaks properly
  const synopsisText =
    details.description || details.synopsis || "No synopsis available.";
  synopsis.innerHTML = synopsisText
    .replace(/\n\n+/g, "<br><br>")
    .replace(/\n/g, "<br>");

  // Add show more/less functionality
  addSynopsisToggle(synopsis, synopsisText);

  // Chapters
  if (isLiteVersion) {
    chaptersList.innerHTML = `
      <div class="loading-state-container" style="padding: 2rem;">
        <div class="spinner"></div>
        <p>Loading chapters...</p>
      </div>
    `;
    chapterCount.textContent = "...";
  } else {
    await loadReadChapters(); // Load read status from localStorage and database
    displayChapters(details.chapters || []);
    chapterCount.textContent =
      details.totalChapters || (details.chapters ? details.chapters.length : 0);

    // Start Reading Button Logic
    const startReadingBtn = document.getElementById("startReadingBtn");

    if (details.chapters && details.chapters.length > 0) {
      const chapters = details.chapters;
      const firstChapter = chapters[chapters.length - 1];

      // Check if we have a valid chapter
      if (firstChapter) {
        startReadingBtn.style.display = "flex";
        startReadingBtn.onclick = () => {
          const params = new URLSearchParams();
          params.append("url", firstChapter.url);
          params.append("mangaId", manga.mangaId || mangaId);
          params.append("provider", firstChapter.provider || "Unknown");
          params.append("chapterId", firstChapter.id);
          params.append("chapterNumber", firstChapter.number);

          window.location.href = `reader.html?${params.toString()}`;
        };
      } else {
        startReadingBtn.style.display = "none";
      }
    } else {
      startReadingBtn.style.display = "none";
    }
  }
}

function addSynopsisToggle(synopsisElement, fullText) {
  // Check if synopsis is long enough to need truncation (more than 300 characters)
  const maxLength = 300;

  if (fullText.length <= maxLength) {
    return; // Don't add toggle for short synopsis
  }

  // Create truncated version
  const truncatedText = fullText.substring(0, maxLength) + "...";

  // Create toggle button container
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = `
    margin-top: 1rem;
    text-align: center;
  `;

  // Create toggle button
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "synopsis-toggle";
  toggleBtn.innerHTML = "Show More ▼";
  toggleBtn.style.cssText = `
    background: linear-gradient(135deg, var(--accent), var(--accent-dark, #6366f1));
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 0.75rem 1.5rem;
    text-decoration: none;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  `;

  toggleBtn.onmouseover = () => {
    toggleBtn.style.transform = "translateY(-2px)";
    toggleBtn.style.boxShadow = "0 6px 16px rgba(139, 92, 246, 0.4)";
  };
  toggleBtn.onmouseout = () => {
    toggleBtn.style.transform = "translateY(0)";
    toggleBtn.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.3)";
  };

  let isExpanded = false;

  toggleBtn.onclick = () => {
    isExpanded = !isExpanded;
    if (isExpanded) {
      synopsisElement.innerHTML = fullText;
      toggleBtn.innerHTML = "Show Less ▲";
    } else {
      synopsisElement.innerHTML = truncatedText;
      toggleBtn.innerHTML = "Show More ▼";
    }
    toggleContainer.appendChild(toggleBtn);
    synopsisElement.appendChild(toggleContainer);
  };

  // Set initial state
  synopsisElement.innerHTML = truncatedText;
  toggleContainer.appendChild(toggleBtn);
  synopsisElement.appendChild(toggleContainer);
}

function displayTags(container, tags) {
  container.innerHTML = "";

  if (!tags || tags.length === 0) {
    container.innerHTML = '<span class="tag">None</span>';
    return;
  }

  tags.forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag";
    tagEl.textContent = tag;
    container.appendChild(tagEl);
  });
}

let allChapters = []; // Store all chapters for filtering
let selectedProvider = "all"; // Current filter

// --- Sorting & Filtering ---
let currentSortOrder = "desc";
let currentSearchQuery = "";

// Initialize Sort/Search Listeners
function initChapterControls() {
  const sortBtn = document.getElementById("sortChapterBtn");
  const searchInput = document.getElementById("chapterSearchInput");

  if (sortBtn && !sortBtn.dataset.bound) {
    sortBtn.addEventListener("click", () => {
      currentSortOrder = currentSortOrder === "desc" ? "asc" : "desc";
      // Update Icon
      const span = sortBtn.querySelector("span");
      if (span)
        span.textContent =
          currentSortOrder === "desc" ? "↓ Chapter" : "↑ Chapter";
      displayChapters(allChapters, false); // false to skip filter re-creation
    });
    sortBtn.dataset.bound = "true";
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      displayChapters(allChapters, false);
    });
    searchInput.dataset.bound = "true";
  }
}

function displayChapters(chapters, shouldUpdateFilters = true) {
  if (shouldUpdateFilters) {
    allChapters = chapters;
    createProviderFilter(chapters);

    // Also init controls here since DOM needs to be ready
    initChapterControls();
  }

  chaptersList.innerHTML = "";

  if (!chapters || chapters.length === 0) {
    chaptersList.innerHTML = '<p class="no-chapters">No chapters available</p>';
    return;
  }

  // Filter first (Search + Provider)
  let filtered =
    selectedProvider === "all"
      ? allChapters
      : allChapters.filter((ch) => ch.provider === selectedProvider);

  if (currentSearchQuery) {
    filtered = filtered.filter(
      (ch) =>
        `ch. ${ch.number}`.toLowerCase().includes(currentSearchQuery) ||
        ch.number.toString().includes(currentSearchQuery),
    );
  }

  // Sort
  filtered.sort((a, b) => {
    const numA = parseFloat(a.number);
    const numB = parseFloat(b.number);
    if (isNaN(numA) || isNaN(numB)) return 0;
    return currentSortOrder === "desc" ? numB - numA : numA - numB;
  });

  if (filtered.length === 0) {
    chaptersList.innerHTML =
      '<p class="no-chapters">No chapters match your search.</p>';
    return;
  }

  filtered.forEach((chapter) => {
    const chapterEl = document.createElement("div");
    chapterEl.className = "chapter-row";

    const timeText = chapter.relativeTime || "";
    const isSynced = syncedChaptersSet.has(chapter.url);
    const isRead = !!readChaptersMap[chapter.id];

    // Add read class if chapter is read
    if (isRead) {
      chapterEl.classList.add("read");
    }

    chapterEl.innerHTML = `
            <div class="col-chapter">
                ${isRead ? '<span class="read-indicator" title="Read">📖</span>' : ""}
                <span class="chapter-number">Ch. ${chapter.number}</span>
            </div>
            <div class="col-provider">
                <span class="provider-badge">${chapter.provider || "Unknown"}</span>
            </div>
            <div class="col-updated">
                ${timeText ? `<span class="chapter-time">${timeText}</span>` : ""}
            </div>
            <div class="col-download">
                <button class="download-btn-mini ${isSynced ? "downloaded" : ""}"
                        data-chapter-url="${chapter.url}"
                        title="${isSynced ? "Synced to Cloud" : "Sync to Cloud"}">
                   ${isSynced ? "✅" : "☁️↓"}
                </button>
            </div>
        `;

    // Click on row to read
    chapterEl.addEventListener("click", (e) => {
      if (e.target.closest("button")) return; // Ignore button clicks

      // Mark chapter as read
      markChapterAsRead(chapter.id, chapter.number, chapter.provider);

      const params = new URLSearchParams();
      params.append("url", chapter.url);
      params.append("mangaId", mangaId);
      params.append("provider", chapter.provider || "Unknown");
      params.append("chapterId", chapter.id);
      params.append("chapterNumber", chapter.number);
      window.location.href = `reader.html?${params.toString()}`;
    });

    // Download Button Logic
    const btn = chapterEl.querySelector("button");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (
        btn.classList.contains("downloaded") &&
        !btn.classList.contains("issue")
      )
        return;
      await syncChapter(chapter, btn);
    });

    chaptersList.appendChild(chapterEl);
  });
}

function createProviderFilter(chapters) {
  const select = document.getElementById("providerFilterSelect");
  if (!select) return;

  const providers = [
    ...new Set(chapters.map((ch) => ch.provider || "Unknown")),
  ];

  const currentVal =
    select.value && select.options.length > 1 ? select.value : "all"; // Preserve if valid

  select.innerHTML = '<option value="all">All Providers</option>';

  providers.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });

  if (providers.includes(currentVal)) {
    select.value = currentVal;
  }

  select.onchange = (e) => {
    selectedProvider = e.target.value;
    displayChapters(allChapters, false);
  };

  const dlBtn = document.getElementById("dlOptionsBtn");
  if (dlBtn) dlBtn.onclick = openDownloadModal;
}

async function syncChapter(chapter, buttonEl) {
  const originalText = buttonEl.textContent;
  buttonEl.textContent = "⏳";
  buttonEl.disabled = true;

  try {
    const response = await fetch("/api/sync/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: chapter.url }),
    });

    const result = await response.json();

    if (result.success) {
      buttonEl.textContent = "✅";
      buttonEl.title = "Synced to Cloud";
      buttonEl.classList.add("downloaded"); // Use green style

      // Update local set and UI
      syncedChaptersSet.add(chapter.url);

      toast.success(`Chapter ${chapter.number} synced!`);
    } else {
      buttonEl.textContent = "❌";
      buttonEl.title = "Sync failed";
      setTimeout(() => {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      }, 2000);
      toast.error(`Sync failed: ${result.error}`);
    }
  } catch (error) {
    console.error("Sync error:", error);
    buttonEl.textContent = "❌";
    buttonEl.title = "Network error";
    setTimeout(() => {
      buttonEl.textContent = originalText;
      buttonEl.disabled = false;
    }, 2000);
  }
}

// Helper to update statuses without re-rendering list
function updateChapterStatuses() {
  const buttons = document.querySelectorAll(".download-btn-mini");
  buttons.forEach((btn) => {
    const chapterUrl = btn.dataset.chapterUrl;
    if (syncedChaptersSet.has(chapterUrl)) {
      btn.textContent = "✅";
      btn.title = "Synced to Cloud";
      btn.classList.add("downloaded");
    }
  });
}

async function checkSyncStatus(mangaId) {
  try {
    const timestamp = new Date().getTime();
    const response = await fetch(`/api/sync/status/${mangaId}?_t=${timestamp}`);
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.syncedUrls) {
        syncedChaptersSet = new Set(result.syncedUrls);
      }
    }
  } catch (error) {
    console.error("Error checking sync status:", error);
  }
}

// Auto-poll sync status every 30 s and update the UI without a page reload
let syncPollingInterval = null;

function startSyncStatusPolling() {
  if (syncPollingInterval) return; // Already running
  syncPollingInterval = setInterval(async () => {
    await checkSyncStatus(mangaId);
    updateChapterSyncButtons();
  }, 10000); // 10 seconds — matches chapter sync cadence
}

// Update ONLY the sync-state of chapter buttons (no full re-render)
function updateChapterSyncButtons() {
  const buttons = document.querySelectorAll(".download-btn-mini");
  buttons.forEach((btn) => {
    const url = btn.dataset.chapterUrl;
    if (!url) return;
    if (syncedChaptersSet.has(url)) {
      if (btn.textContent.trim() !== "✅") {
        btn.textContent = "✅";
        btn.title = "Synced to Cloud";
        btn.classList.add("downloaded");
      }
    }
  });
}

function checkDownloadStatus() {}

// --- Batch Download Feature ---

let isDownloading = false;
let shouldStopDownload = false;
let downloadModalInitialized = false;

function initDownloadModal() {
  if (downloadModalInitialized) return;

  // Bind Events
  const closeBtn = document.getElementById("closeDownloadModal");
  const cancelBtn = document.getElementById("cancelDownloadBtn");
  const startBtn = document.getElementById("startDownloadBtn");

  if (closeBtn) closeBtn.onclick = closeDownloadModal;
  if (cancelBtn) cancelBtn.onclick = closeDownloadModal;
  if (startBtn) startBtn.onclick = startBatchSync;

  // Update stats on input change
  const providerSelect = document.getElementById("downloadProviderSelect");
  const delayInput = document.getElementById("downloadDelayInput");
  const startInput = document.getElementById("downloadStartInput");
  const endInput = document.getElementById("downloadEndInput");

  if (providerSelect) {
    providerSelect.onchange = () => {
      autoFillRange();
      updateDownloadStats();
    };
  }
  if (delayInput) delayInput.oninput = updateDownloadStats;
  if (startInput) startInput.oninput = updateDownloadStats;
  if (endInput) endInput.oninput = updateDownloadStats;

  downloadModalInitialized = true;
}

function autoFillRange() {
  const provider = document.getElementById("downloadProviderSelect").value;
  // Get all chapters for provider
  let chapters = allChapters;
  if (provider !== "all") {
    chapters = chapters.filter((ch) => (ch.provider || "Unknown") === provider);
  }

  if (chapters.length >= 0) {
    const numbers = chapters
      .map((ch) => parseFloat(ch.number))
      .filter((n) => !isNaN(n));
    if (numbers.length >= 0) {
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const startInput = document.getElementById("downloadStartInput");
      const endInput = document.getElementById("downloadEndInput");
      if (startInput) startInput.value = min;
      if (endInput) endInput.value = max;
    }
  }
}

async function openDownloadModal() {
  // Ensure the modal HTML exists in the DOM (e.g., pre-loaded or created elsewhere)
  // If not, you might need to add a check or create it here if it's not guaranteed to exist.
  // For this change, we assume the modal HTML is already present.

  initDownloadModal();

  // Populate Providers
  const select = document.getElementById("downloadProviderSelect");
  const providers = [
    ...new Set(allChapters.map((ch) => ch.provider || "Unknown")),
  ];

  select.innerHTML = "";
  // Add All option
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All Providers (Not Recommended)";
  select.appendChild(allOpt);

  // Add specific providers
  providers.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });

  // Select current filter if valid
  if (selectedProvider !== "all" && providers.includes(selectedProvider)) {
    select.value = selectedProvider;
  }

  autoFillRange(); // Auto fill based on selection

  // Show modal first with a loading indicator while we fetch fresh sync status
  document.getElementById("downloadModal").style.display = "flex";
  document.getElementById("downloadTotalCount").textContent =
    "Checking synced chapters...";
  document.getElementById("downloadEstimatedTime").textContent = "";

  // Always re-fetch sync status so the count is accurate
  await checkSyncStatus(mangaId);
  // Also update chapter icons on the main list for anything newly synced
  updateChapterSyncButtons();

  updateDownloadStats();
}

function closeDownloadModal() {
  const modal = document.getElementById("downloadModal");
  if (modal) modal.style.display = "none";
  // Clear progress poller if modal closed early (server job keeps running)
  if (window._batchPollInterval) {
    clearInterval(window._batchPollInterval);
    window._batchPollInterval = null;
  }
}

function updateDownloadStats() {
  const provider = document.getElementById("downloadProviderSelect").value;
  const delay =
    parseInt(document.getElementById("downloadDelayInput").value) || 3;

  const targets = getTargetChapters(provider);
  const count = targets.length;

  // Estimate: (Avg 5s download + delay) * count
  const estimatedSeconds = count * (5 + delay);
  const mins = Math.floor(estimatedSeconds / 60);

  document.getElementById("downloadTotalCount").textContent =
    `Chapters to sync: ${count}`;
  document.getElementById("downloadEstimatedTime").textContent =
    `Est. time: ~${mins}m`;
}

function getTargetChapters(provider) {
  // 1. Filter by provider
  let chapters = allChapters;
  if (provider !== "all") {
    chapters = chapters.filter((ch) => (ch.provider || "Unknown") === provider);
  }

  // 2. Filter by Range
  const start = parseFloat(document.getElementById("downloadStartInput").value);
  const end = parseFloat(document.getElementById("downloadEndInput").value);

  if (!isNaN(start)) {
    chapters = chapters.filter((ch) => parseFloat(ch.number) >= start);
  }
  if (!isNaN(end)) {
    chapters = chapters.filter((ch) => parseFloat(ch.number) <= end);
  }

  // 3. Filter out ALREADY synced chapters
  return chapters.filter((ch) => !syncedChaptersSet.has(ch.url));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startBatchSync() {
  if (isDownloading) return;

  const provider = document.getElementById("downloadProviderSelect").value;
  const delaySec =
    parseInt(document.getElementById("downloadDelayInput").value) || 3;

  const targets = getTargetChapters(provider);

  if (targets.length === 0) {
    toast.info("All chapters already synced! ✨");
    return;
  }

  // Sort ascending (lowest chapter first)
  targets.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

  const confirmed = await showCustomConfirm(
    `Start Cloud Sync for <strong>${targets.length}</strong> chapters?<br><br>
     Range: Ch. ${targets[0].number} ➔ Ch. ${targets[targets.length - 1].number}<br>
     <small>The server will run this in the background — safe to close the page.</small>`,
  );

  if (!confirmed) return;

  // --- Send job to server ---
  let jobId;
  try {
    const resp = await fetch("/api/sync/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapters: targets.map((ch) => ({
          url: ch.url,
          number: ch.number,
          provider: ch.provider,
        })),
        delaySec,
      }),
    });
    const data = await resp.json();
    if (!data.success)
      throw new Error(data.error || "Server rejected batch job");
    jobId = data.jobId;
  } catch (err) {
    toast.error(`Failed to start batch sync: ${err.message}`);
    return;
  }

  // --- Show progress in modal ---
  isDownloading = true;
  const btn = document.getElementById("startDownloadBtn");
  btn.textContent = "Running on server…";
  btn.disabled = true;

  const progressArea = document.getElementById("downloadProgressArea");
  const progressText = document.getElementById("downloadProgressText");
  progressArea.style.display = "block";
  progressText.innerHTML = `
    🚀 <strong>Job started on server!</strong><br>
    <small>Job ID: ${jobId}</small><br>
    Syncing ${targets.length} chapters in the background…<br>
    <small>You can close this modal — sync will continue running.</small>
  `;

  toast.success(
    `☁️ Batch sync started on server — ${targets.length} chapters queued!`,
  );

  // Poll job progress every 5s while modal is open
  const pollInterval = setInterval(async () => {
    try {
      const r = await fetch(`/api/sync/batch/status/${jobId}`);
      const data = await r.json();
      if (!data.success) {
        clearInterval(pollInterval);
        return;
      }
      const job = data.job;

      progressText.innerHTML = `
        🔄 <strong>${job.done}/${job.total}</strong> chapters processed<br>
        ${job.currentChapter ? `Currently: <em>${job.currentChapter}</em><br>` : ""}
        ✅ Success: ${job.success} &nbsp; ❌ Failed: ${job.failed}
      `;

      if (job.complete) {
        clearInterval(pollInterval);
        progressText.innerHTML = `
          ✅ <strong>Sync Complete!</strong><br>
          Success: ${job.success}<br>
          Failed: ${job.failed}
        `;
        btn.textContent = "Done";
        btn.disabled = false;
        isDownloading = false;

        if (job.failed === 0) {
          toast.success(`All ${job.success} chapters synced! 🎉`);
        } else {
          toast.warning(`Sync done. ✅${job.success} ❌${job.failed}`);
        }

        // Refresh sync ticks
        await checkSyncStatus(mangaId);
        updateChapterSyncButtons();

        setTimeout(() => {
          closeDownloadModal();
          progressArea.style.display = "none";
          btn.textContent = "Start Cloud Sync";
        }, 3000);
      }
    } catch (_) {
      /* ignore transient errors */
    }
  }, 5000);

  // Store interval so closing modal cleans it up
  window._batchPollInterval = pollInterval;
}

// Quick Sync Missing shortcut
async function startQuickSyncMissing() {
  // 1. Open modal (auto-fill will handle range)
  openDownloadModal();

  const provider = document.getElementById("downloadProviderSelect").value;
  const targets = getTargetChapters(provider);

  if (targets.length === 0) {
    toast.info("All chapters are already synced! ✨");
    closeDownloadModal();
    return;
  }

  toast.info(`Ready to sync ${targets.length} missing chapters. Click Start!`);
}

// Obsolete monitoring functions removed
// let batchMonitorInterval = null;
// refreshDownloadStatus removed

async function scrapeMangaDetails() {
  if (!confirm("This will scrape and update the manga details. Continue?")) {
    return;
  }

  scrapeDetailsBtn.disabled = true;
  scrapeDetailsBtn.textContent = "⏳ Scraping...";

  try {
    const response = await fetch(`/api/scrape/manga/${mangaId}`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      toast.success("Successfully updated manga details!");
      await loadMangaDetails();
    } else {
      toast.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Scrape error:", error);
    toast.error("Failed to scrape manga details");
  } finally {
    scrapeDetailsBtn.disabled = false;
    scrapeDetailsBtn.textContent = "📥 Update Details";
  }
}
// --- User Actions ---

const userActionsDiv = document.getElementById("userActions");
const favoriteBtn = document.getElementById("favoriteBtn");
const favIcon = document.getElementById("favIcon");
const statusSelect = document.getElementById("statusSelect");
const ratingSelect = document.getElementById("ratingSelect");
const userNote = document.getElementById("userNote");
const saveNoteBtn = document.getElementById("saveNoteBtn");
const addToListBtn = document.getElementById("addToListBtn");

// Initialize User Actions
function initUserActions() {
  if (typeof auth !== "undefined" && auth.isLoggedIn()) {
    userActionsDiv.style.display = "block";
    loadUserMangaData();
  } else {
    userActionsDiv.style.display = "none";
  }
}

// Listen for auth changes
window.addEventListener("auth:login", initUserActions);
window.addEventListener("auth:logout", initUserActions);
// Also run on load
window.addEventListener("load", initUserActions);

async function loadUserMangaData() {
  if (!auth.currentUser || !mangaId) return;

  try {
    const username = auth.currentUser.username;
    // We fetching full user profile to get data.
    // In a better API we would have /api/user/:username/manga/:mangaId
    // But we have /api/user/:username which returns everything.
    // Let's use that for now.
    const response = await fetch(`/api/user/${username}`);
    const result = await response.json();

    if (result.success && result.user && result.user.mangaData) {
      const data = result.user.mangaData[mangaId];
      if (data) {
        updateUserActionUI(data);
      }
    }
  } catch (error) {
    console.error("Error loading user data:", error);
  }
}

function updateUserActionUI(data) {
  // Favorite
  if (data.favorite) {
    favIcon.textContent = "❤️";
    favoriteBtn.classList.add("active");
  } else {
    favIcon.textContent = "🤍";
    favoriteBtn.classList.remove("active");
  }

  // Status
  if (data.status) {
    statusSelect.value = data.status;
  }

  // Rating
  if (data.rating) {
    ratingSelect.value = data.rating;
  }

  // Note
  if (data.note) {
    userNote.value = data.note;
  }
}

async function sendUserAction(action, value) {
  if (!auth.currentUser) return;

  try {
    const response = await fetch("/api/user/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: auth.currentUser.username,
        mangaId: mangaId,
        action: action,
        value: value,
      }),
    });
    const result = await response.json();
    if (result.success) {
      // UI update (optimistic was already done for some, but good to confirm)
      console.log(`Action ${action} saved`);
    } else {
      alert(`Failed to save: ${result.error}`);
    }
  } catch (error) {
    console.error("Action error:", error);
    alert("Network error saving action");
  }
}

// Event Listeners

favoriteBtn.addEventListener("click", () => {
  const isFav = favIcon.textContent === "❤️";
  const newState = !isFav;

  // Optimistic UI update
  favIcon.textContent = newState ? "❤️" : "🤍";
  if (newState) favoriteBtn.classList.add("active");
  else favoriteBtn.classList.remove("active");

  sendUserAction("favorite", newState);
});

statusSelect.addEventListener("change", (e) => {
  sendUserAction("status", e.target.value);
});

ratingSelect.addEventListener("change", (e) => {
  sendUserAction("rating", e.target.value);
});

saveNoteBtn.addEventListener("click", () => {
  sendUserAction("note", userNote.value);
  const originalText = saveNoteBtn.textContent;
  saveNoteBtn.textContent = "Saved!";
  setTimeout(() => (saveNoteBtn.textContent = originalText), 2000);
});

// Custom list functionality moved to list-modal.js

// Refresh download status when page is shown (e.g. back navigation)
// Refresh download status removed
window.addEventListener("pageshow", async () => {
  // No-op
});

// --- Helper for Custom Confirmation Modal ---
function showCustomConfirm(messageHtml) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const msgEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");

    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      // Fallback if modal missing
      resolve(
        confirm(messageHtml.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "")),
      );
      return;
    }

    msgEl.innerHTML = messageHtml;
    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

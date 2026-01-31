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

async function loadMangaDetails() {
  if (!mangaId) {
    alert("No manga ID provided");
    window.location.href = "/";
    return;
  }

  try {
    const response = await fetch(`/api/manga/${mangaId}`);

    if (!response.ok) {
      // If manga details don't exist, automatically scrape them
      console.log("Manga details not found, scraping automatically...");
      await autoScrapeMangaDetails();
      return;
    }

    const manga = await response.json();

    // Check if we have full details (e.g. chapters).
    // Homepage scrape only gives title/thumbnail.
    // MongoDB model has 'details' object.
    if (
      !manga.details ||
      !manga.details.chapters ||
      manga.details.chapters.length === 0
    ) {
      console.log(
        "Manga found but has no chapters/details, triggering auto-scrape...",
      );
      await autoScrapeMangaDetails();
      return;
    }

    displayMangaDetails(manga);
  } catch (error) {
    console.error("Error loading manga:", error);
    // Try auto-scraping as fallback
    await autoScrapeMangaDetails();
  }
}

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

function displayMangaDetails(manga) {
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
  displayChapters(details.chapters || []);
  chapterCount.textContent =
    details.totalChapters || (details.chapters ? details.chapters.length : 0);

  // Start Reading Button Logic
  const startReadingContainer = document.getElementById(
    "startReadingContainer",
  );
  const startReadingBtn = document.getElementById("startReadingBtn");

  if (details.chapters && details.chapters.length > 0) {
    // Get the first chapter (usually the last index because chapters are descending)
    // BUT scraper usually returns array. Let's sort to be safe or check logic.
    // displayChapters sorts them? No, it says "Chapters are already sorted by scraper (descending)"
    // So the LAST element is the first chapter (Chapter 1).
    const chapters = details.chapters;
    const firstChapter = chapters[chapters.length - 1];

    // Check if we have a valid chapter
    if (firstChapter) {
      startReadingContainer.style.display = "flex";
      startReadingBtn.onclick = () => {
        const params = new URLSearchParams();
        params.append("url", firstChapter.url);
        params.append("mangaId", manga.mangaId || mangaId);
        params.append("provider", firstChapter.provider || "Unknown");
        params.append("chapterId", firstChapter.id);
        params.append("chapterNumber", firstChapter.number);

        window.location.href = `reader.html?${params.toString()}`;
      };
    }
  } else {
    startReadingContainer.style.display = "none";
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

function displayChapters(chapters) {
  allChapters = chapters; // Store for filtering

  chaptersList.innerHTML = "";

  if (chapters.length === 0) {
    chaptersList.innerHTML = '<p class="no-chapters">No chapters available</p>';
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
  filteredChapters.forEach(async (chapter) => {
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

    // Check download status immediately
    checkDownloadStatus(chapter, chapterEl.querySelector(".download-btn"));

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

async function downloadChapter(chapter, buttonEl) {
  const originalText = buttonEl.textContent;
  buttonEl.textContent = "⏳";
  buttonEl.disabled = true;

  try {
    const response = await fetch("/api/download/chapter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mangaId: mangaId,
        provider: chapter.provider || "Unknown",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterUrl: chapter.url,
      }),
    });

    const result = await response.json();

    if (result.success) {
      if (result.skipped) {
        buttonEl.textContent = "✓";
        buttonEl.title = "Already downloaded";
        buttonEl.classList.add("downloaded");
      } else {
        buttonEl.textContent = "✓";
        buttonEl.title = `Downloaded ${result.downloadedPages}/${result.totalPages} pages`;
        buttonEl.classList.add("downloaded");
        if (result.hasIssue) {
          buttonEl.textContent = "⚠️";
          buttonEl.title = `Issue: Only ${result.downloadedPages} pages downloaded`;
          buttonEl.classList.remove("downloaded");
          buttonEl.classList.add("issue");
        }
      }
    } else {
      buttonEl.textContent = "❌";
      buttonEl.title = "Download failed";
      setTimeout(() => {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error("Download error:", error);
    buttonEl.textContent = "❌";
    buttonEl.title = "Download failed";
    setTimeout(() => {
      buttonEl.textContent = originalText;
      buttonEl.disabled = false;
    }, 2000);
  }
}

async function checkDownloadStatus(chapter, buttonEl) {
  try {
    const response = await fetch(
      `/api/download/status/${mangaId}/${encodeURIComponent(chapter.provider || "Unknown")}/${chapter.id}`,
    );
    const result = await response.json();

    if (result.downloaded) {
      buttonEl.textContent = "✓";
      buttonEl.title = result.hasIssue
        ? `Issue: Only ${result.downloadedPages} pages downloaded`
        : `Downloaded ${result.downloadedPages}/${result.totalPages} pages`;
      buttonEl.classList.add("downloaded");

      if (result.hasIssue) {
        buttonEl.textContent = "⚠️";
        buttonEl.classList.remove("downloaded");
        buttonEl.classList.add("issue");
      }
    }
  } catch (error) {
    console.error("Error checking download status:", error);
  }
}

function createProviderFilter(chapters) {
  // Get unique providers
  const providers = [
    ...new Set(chapters.map((ch) => ch.provider || "Unknown")),
  ];

  // Check if filter already exists
  let filterContainer = document.getElementById("providerFilter");
  if (!filterContainer) {
    filterContainer = document.createElement("div");
    filterContainer.id = "providerFilter";
    filterContainer.className = "provider-filter";

    // Insert before chapters list
    const chaptersSection = document.querySelector(".chapters-section");
    const chaptersList = document.getElementById("chaptersList");
    chaptersSection.insertBefore(filterContainer, chaptersList);
  }

  filterContainer.innerHTML = `
    <div class="filter-label">Filter by provider:</div>
    <div class="filter-buttons">
      <button class="filter-btn ${selectedProvider === "all" ? "active" : ""}" data-provider="all">
        All (${chapters.length})
      </button>
      ${providers
        .map((provider) => {
          const count = chapters.filter(
            (ch) => (ch.provider || "Unknown") === provider,
          ).length;
          return `
          <button class="filter-btn ${selectedProvider === provider ? "active" : ""}" data-provider="${provider}">
            ${provider} (${count})
          </button>
        `;
        })
        .join("")}
    </div>
  `;

  // Add click handlers to filter buttons
  filterContainer.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedProvider = btn.dataset.provider;
      displayChapters(allChapters);
    });
  });
}

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

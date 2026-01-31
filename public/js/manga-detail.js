// Manga detail page functionality

// Get manga ID from URL
const urlParams = new URLSearchParams(window.location.search);
const mangaId = urlParams.get("id");

// DOM Elements
const loadingContainer = document.getElementById("loadingContainer");
const mangaDetail = document.getElementById("mangaDetail");
const mangaCover = document.getElementById("mangaCover");
const mangaTitle = document.getElementById("mangaTitle");
const altTitles = document.getElementById("altTitles");
const author = document.getElementById("author");
const artist = document.getElementById("artist");
const status = document.getElementById("status");
const language = document.getElementById("language");
const genres = document.getElementById("genres");
const themes = document.getElementById("themes");
const demographic = document.getElementById("demographic");
const synopsis = document.getElementById("synopsis");
const chaptersList = document.getElementById("chaptersList");
const chapterCount = document.getElementById("chapterCount");
const scrapeDetailsBtn = document.getElementById("scrapeDetailsBtn");

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
  mangaCover.src = manga.thumbnail || "";
  mangaCover.alt = manga.title;
  mangaTitle.textContent = manga.title;

  // Alternative titles
  if (manga.altTitles && manga.altTitles.length > 0) {
    altTitles.textContent = manga.altTitles.slice(0, 3).join(" • ");
  }

  // Metadata
  author.textContent = manga.author?.join(", ") || "Unknown";
  artist.textContent = manga.artist?.join(", ") || "Unknown";
  status.textContent = manga.status || "Unknown";
  status.className = `meta-value status-badge status-${manga.status}`;
  language.textContent = manga.originalLanguage?.toUpperCase() || "Unknown";

  // Tags
  displayTags(genres, manga.genres);
  displayTags(themes, manga.themes);
  displayTags(demographic, manga.demographic);

  // Synopsis - normalize spacing (replace multiple newlines with single breaks)
  const synopsisText = manga.synopsis
    ? manga.synopsis
        .replace(/\n\n+/g, "<br><br>") // Multiple newlines → double break (paragraph)
        .replace(/\n/g, " ") // Single newlines → space (same paragraph)
    : "No synopsis available.";
  synopsis.innerHTML = synopsisText;

  // Add show more/less functionality if synopsis is long
  addSynopsisToggle(synopsis, synopsisText);

  // Chapters
  displayChapters(manga.chapters || []);
  chapterCount.textContent = manga.totalChapters || 0;
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
      alert("Successfully updated manga details!");
      await loadMangaDetails();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Scrape error:", error);
    alert("Failed to scrape manga details");
  } finally {
    scrapeDetailsBtn.disabled = false;
    scrapeDetailsBtn.textContent = "📥 Update Details";
  }
}

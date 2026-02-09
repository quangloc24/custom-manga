// Library page functionality

let allMangas = [];
let filteredMangas = [];
let currentPage = 1;
const itemsPerPage = 24; // Grid 4x6 looks good

// DOM Elements
const mangaGrid = document.getElementById("mangaGrid");
const loadingContainer = document.getElementById("loadingContainer");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const scrapeBtn = document.getElementById("scrapeBtn");
const mangaCount = document.getElementById("mangaCount");
const mangaUrlInput = document.getElementById("mangaUrlInput");
const addMangaBtn = document.getElementById("addMangaBtn");

// Initialize Toast
// Toast is already initialized in toast.js

// Load library on page load
window.addEventListener("load", () => {
  loadReadingHistory();
  loadLibrary();
});

// Event listeners
searchInput.addEventListener("input", handleSearch);
searchBtn.addEventListener("click", handleSearch);
scrapeBtn.addEventListener("click", scrapeHomepage);
addMangaBtn.addEventListener("click", addMangaByUrl);

async function loadLibrary() {
  showLoading();

  try {
    const response = await fetch(
      `/api/library?page=${currentPage}&limit=${itemsPerPage}`,
    );
    const data = await response.json();

    allMangas = data.mangas || [];
    filteredMangas = [...allMangas]; // Note: For client-side search, we might need a different approach if we want to search ALL items on server.
    // For now, let's assume search is client-side on the CURRENT page or implementation plan meant server-side search?
    // "Implement homepage pagination" implies server-side pagination.
    // However, the existing search was client-side on `allMangas`.
    // If we paginate, `allMangas` only contains the current page.
    // Ideally search should also be server-side. But let's stick to simple pagination first.
    // Wait, if I replace allMangas with just 20 items, client-side search breaks.
    // BUT the user just asked for "page system in homepage".
    // I will implement server-side pagination.
    // Search will only search visible items unless updated.
    // Let's keep it simple: Pagination controls what's loaded.

    if (allMangas.length === 0) {
      showEmptyState();
    } else {
      displayMangas(allMangas);
      renderPagination(data);
    }

    updateMangaCount(data.totalMangas);
  } catch (error) {
    console.error("Error loading library:", error);
    showEmptyState();
  }
}

function displayMangas(mangas) {
  hideLoading();
  hideEmptyState();

  mangaGrid.innerHTML = "";

  mangas.forEach((manga) => {
    const card = createMangaCard(manga);
    mangaGrid.appendChild(card);
  });

  mangaGrid.style.display = "grid";
}

function renderPagination(data) {
  const container = document.getElementById("paginationContainer");
  if (!container) return;

  // Only show if we have pages
  if (data.totalPages <= 1) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  container.innerHTML = "";

  // Previous Button
  const prevBtn = document.createElement("button");
  prevBtn.className = "pagination-btn";
  prevBtn.textContent = "Previous";
  prevBtn.disabled = data.currentPage === 1;
  prevBtn.onclick = () => changePage(data.currentPage - 1);
  container.appendChild(prevBtn);

  // Page Info (Simple X of Y)
  // For better UI, we can do numbers like [1] [2] ... [10]
  // Let's do simple numbers

  // Determine range
  let startPage = Math.max(1, data.currentPage - 2);
  let endPage = Math.min(data.totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.className = `pagination-btn ${i === data.currentPage ? "active" : ""}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => changePage(i);
    container.appendChild(pageBtn);
  }

  // Next Button
  const nextBtn = document.createElement("button");
  nextBtn.className = "pagination-btn";
  nextBtn.textContent = "Next";
  nextBtn.disabled = data.currentPage === data.totalPages;
  nextBtn.onclick = () => changePage(data.currentPage + 1);
  container.appendChild(nextBtn);
}

async function changePage(newPage) {
  currentPage = newPage;
  await loadLibrary();
  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createMangaCard(manga) {
  const card = document.createElement("div");
  card.className = "manga-card";
  card.onclick = () => (window.location.href = `manga.html?id=${manga.id}`);

  card.innerHTML = `
    <div class="manga-thumbnail">
      <img src="${manga.thumbnail}" alt="${manga.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect fill=%22%23333%22 width=%22200%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
      <div class="manga-overlay">
        <span class="view-btn">View Details</span>
      </div>
    </div>
    <div class="manga-info">
      <h3 class="manga-title">${manga.title}</h3>
      <p class="manga-chapter">Latest: Ch. ${manga.latestChapter || "?"}</p>
    </div>
  `;

  return card;
}

function handleSearch() {
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    filteredMangas = [...allMangas];
  } else {
    filteredMangas = allMangas.filter((manga) =>
      manga.title.toLowerCase().includes(query),
    );
  }

  displayMangas(filteredMangas);
  updateMangaCount();
}

async function scrapeHomepage() {
  if (
    !confirm("This will scrape the homepage and update your library. Continue?")
  ) {
    return;
  }

  scrapeBtn.disabled = true;
  scrapeBtn.innerHTML = "<span>⏳ Scraping...</span>";
  showLoading();

  try {
    const response = await fetch("/api/scrape/homepage", {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      toast.success(`Successfully scraped ${result.count} manga!`);
      await loadLibrary();
    } else {
      toast.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Scrape error:", error);
    toast.error("Failed to scrape homepage");
  } finally {
    scrapeBtn.disabled = false;
    scrapeBtn.innerHTML = "<span>📥 Scrape Homepage</span>";
  }
}

async function addMangaByUrl() {
  const url = mangaUrlInput.value.trim();

  if (!url) {
    toast.warning("Please enter a manga URL");
    return;
  }

  // Validate URL format
  if (!url.includes("comix.to/title/")) {
    toast.warning("Please enter a valid comix.to manga URL");
    return;
  }

  addMangaBtn.disabled = true;
  addMangaBtn.innerHTML = "<span>⏳ Adding...</span>";

  try {
    const response = await fetch("/api/add-manga", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const result = await response.json();

    if (result.success) {
      if (result.alreadyExists) {
        toast.info(`"${result.data.title}" is already in your library!`);
      } else {
        toast.success(`Successfully added: ${result.data.title}`);
      }
      mangaUrlInput.value = "";
      await loadLibrary();
    } else {
      toast.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("Add manga error:", error);
    toast.error("Failed to add manga");
  } finally {
    addMangaBtn.disabled = false;
    addMangaBtn.innerHTML = "<span>➕ Add Manga</span>";
  }
}

function showLoading() {
  loadingContainer.style.display = "block";
  mangaGrid.style.display = "none";
  emptyState.style.display = "none";
}

function hideLoading() {
  loadingContainer.style.display = "none";
}

function showEmptyState() {
  hideLoading();
  mangaGrid.style.display = "none";
  emptyState.style.display = "flex";
}

function hideEmptyState() {
  emptyState.style.display = "none";
}

function updateMangaCount(total = 0) {
  mangaCount.textContent = total || filteredMangas.length;
}

// ===== READING HISTORY =====

async function loadReadingHistory() {
  try {
    const historySection = document.getElementById("readingHistorySection");
    const historyCards = document.getElementById("historyCards");

    if (!historySection || !historyCards) return;

    // Check if user is logged in
    const mangaUser = localStorage.getItem("manga_user");
    if (!mangaUser) {
      historySection.style.display = "none";
      console.log("[Reading History] No user logged in");
      return;
    }

    const user = JSON.parse(mangaUser);

    // Fetch reading history from database
    const response = await fetch(`/api/user/reading-history/${user.username}`);
    if (!response.ok) {
      console.error("[Reading History] Failed to fetch:", response.status);
      historySection.style.display = "none";
      return;
    }

    const result = await response.json();
    if (!result.success || !result.readChapters) {
      historySection.style.display = "none";
      return;
    }

    // Transform database history into the format we need
    const readingHistory = Object.entries(result.readChapters).map(
      ([mangaId, chapters]) => {
        // Find the latest read chapter
        let latestChapter = null;
        let latestTimestamp = 0;
        let readCount = 0;

        Object.entries(chapters).forEach(([chapterId, chapterData]) => {
          readCount++;
          // Convert timestamp to number for comparison (handles both ISO strings and numbers)
          const timestamp = chapterData.timestamp
            ? typeof chapterData.timestamp === "string"
              ? new Date(chapterData.timestamp).getTime()
              : chapterData.timestamp
            : 0;

          if (timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
            latestChapter = {
              chapterId,
              chapterNumber: chapterData.chapterNumber,
              provider: chapterData.provider,
            };
          }
        });

        return {
          mangaId,
          latestChapter,
          readCount,
          timestamp: latestTimestamp,
        };
      },
    );

    if (readingHistory.length === 0) {
      historySection.style.display = "none";
      return;
    }

    // Fetch manga details for each history item
    const historyWithDetails = await Promise.all(
      readingHistory.map(async (item) => {
        try {
          const response = await fetch(`/api/manga/${item.mangaId}`);
          const data = await response.json();

          if (data && data.id) {
            return {
              ...item,
              manga: data,
              thumbnail: data.thumbnail,
              title: data.title,
              totalChapters: data.totalChapters || data.chapters?.length || 0,
            };
          }
          return null;
        } catch (e) {
          console.error(`Error fetching manga ${item.mangaId}:`, e);
          return null;
        }
      }),
    );

    // Filter out failed fetches and sort by timestamp
    const validHistory = historyWithDetails
      .filter((item) => item !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10); // Show max 10 recent items

    if (validHistory.length === 0) {
      historySection.style.display = "none";
      return;
    }

    console.log(
      "[Reading History] Loaded",
      validHistory.length,
      "items from database",
    );
    console.log("[Reading History] Sample item:", validHistory[0]);

    // Display history cards
    historyCards.innerHTML = validHistory
      .map((item) => createHistoryCard(item))
      .join("");
    historySection.style.display = "block";

    // Setup navigation buttons
    setupHistoryNavigation();
  } catch (error) {
    console.error("Error loading reading history:", error);
  }
}

function createHistoryCard(item) {
  // Find the latest chapter number from all chapters
  let latestChapterNumber = "?";
  if (item.manga && item.manga.chapters && item.manga.chapters.length > 0) {
    // Get the highest chapter number
    const chapterNumbers = item.manga.chapters
      .map((ch) => parseFloat(ch.number))
      .filter((num) => !isNaN(num));

    if (chapterNumbers.length > 0) {
      latestChapterNumber = Math.max(...chapterNumbers).toString();
    }
  }

  const progressPercent =
    latestChapterNumber !== "?" && item.readCount > 0
      ? Math.round((item.readCount / parseFloat(latestChapterNumber)) * 100)
      : 0;

  const chapterNumber = item.latestChapter
    ? item.latestChapter.chapterNumber || "?"
    : "?";

  // Build continue reading URL
  const continueUrl =
    item.manga && item.manga.chapters && item.latestChapter
      ? buildContinueReadingUrl(item)
      : `manga.html?id=${item.mangaId}`;

  return `
    <div class="history-card" onclick="window.location.href='${continueUrl}'">
      <div class="history-thumbnail">
        <img src="${item.thumbnail}" alt="${item.title}" 
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect fill=%22%23333%22 width=%22200%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
        <div class="history-overlay">
          <span class="continue-reading">Continue Reading</span>
        </div>
      </div>
      <div class="history-info">
        <div class="history-title">${item.title}</div>
        <div class="history-chapter">Ch.${chapterNumber}/${latestChapterNumber}</div>
        ${progressPercent > 0 ? `<div class="history-progress-badge">${progressPercent}%</div>` : ""}
      </div>
    </div>
  `;
}

function buildContinueReadingUrl(item) {
  // Find the chapter in manga.chapters that matches latestChapter
  const chapter = item.manga.chapters.find(
    (ch) => ch.id === item.latestChapter.chapterId,
  );

  if (!chapter) {
    return `manga.html?id=${item.mangaId}`;
  }

  // Build reader URL with all necessary parameters
  const params = new URLSearchParams();
  params.append("url", chapter.url);
  params.append("mangaId", item.mangaId);
  params.append(
    "provider",
    chapter.provider || item.latestChapter.provider || "Unknown",
  );
  params.append("chapterId", chapter.id);
  params.append("chapterNumber", chapter.number);

  return `reader.html?${params.toString()}`;
}

function setupHistoryNavigation() {
  const container = document.querySelector(".history-scroll-container");
  const prevBtn = document.getElementById("historyPrevBtn");
  const nextBtn = document.getElementById("historyNextBtn");

  if (!container || !prevBtn || !nextBtn) return;

  prevBtn.onclick = () => {
    container.scrollBy({ left: -300, behavior: "smooth" });
  };

  nextBtn.onclick = () => {
    container.scrollBy({ left: 300, behavior: "smooth" });
  };
}

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
window.addEventListener("load", loadLibrary);

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

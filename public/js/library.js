// Library page functionality

let allMangas = [];
let filteredMangas = [];

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
    const response = await fetch("/api/library");
    const data = await response.json();

    allMangas = data.mangas || [];
    filteredMangas = [...allMangas];

    if (allMangas.length === 0) {
      showEmptyState();
    } else {
      displayMangas(filteredMangas);
    }

    updateMangaCount();
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

function updateMangaCount() {
  mangaCount.textContent = filteredMangas.length;
}

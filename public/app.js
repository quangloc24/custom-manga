// State management
console.log("🚀 app.js loaded!");
let currentChapterData = null;

// DOM Elements
const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const inputSection = document.getElementById("inputSection");
const loadingContainer = document.getElementById("loadingContainer");
const errorContainer = document.getElementById("errorContainer");
const errorMessage = document.getElementById("errorMessage");
const retryBtn = document.getElementById("retryBtn");
const readerSection = document.getElementById("readerSection");
const imagesContainer = document.getElementById("imagesContainer");
const chapterTitle = document.getElementById("chapterTitle");
const topBtn = document.getElementById("topBtn");

// Navigation buttons
// Navigation buttons
const prevChapterBtn = document.getElementById("prevChapterBtn");
const nextChapterBtn = document.getElementById("nextChapterBtn");
const prevChapterBtnBottom = document.getElementById("prevChapterBtnBottom");
const nextChapterBtnBottom = document.getElementById("nextChapterBtnBottom");
const reloadBtn = document.getElementById("reloadBtn");
const chapterSelect = document.getElementById("chapterSelect");
const chapterSelectBottom = document.getElementById("chapterSelectBottom");

// ... (existing event listeners)

// Chapter select listener
const handleChapterSelect = (e) => {
  const selectedUrl = e.target.value;
  if (selectedUrl) {
    loadChapterFromNavigation(selectedUrl);
  }
};

if (chapterSelect) {
  chapterSelect.addEventListener("change", handleChapterSelect);
}
if (chapterSelectBottom) {
  chapterSelectBottom.addEventListener("change", handleChapterSelect);
}

// ... inside disableAllNavButtons ...
function disableAllNavButtons() {
  prevChapterBtn.disabled = true;
  prevChapterBtnBottom.disabled = true;
  nextChapterBtn.disabled = true;
  nextChapterBtnBottom.disabled = true;

  const disableSelect = (el) => {
    if (el) {
      el.innerHTML = "<option disabled selected>No chapters available</option>";
      el.disabled = true;
    }
  };

  disableSelect(chapterSelect);
  disableSelect(chapterSelectBottom);
}

// Event Listeners
loadBtn.addEventListener("click", loadChapter);
retryBtn.addEventListener("click", loadChapter);
topBtn.addEventListener("click", scrollToTop);
reloadBtn.addEventListener("click", reloadCurrentChapter);

// Navigation event listeners
prevChapterBtn.addEventListener("click", loadPreviousChapter);
nextChapterBtn.addEventListener("click", loadNextChapter);
prevChapterBtnBottom.addEventListener("click", loadPreviousChapter);
nextChapterBtnBottom.addEventListener("click", loadNextChapter);

// Chapter select listener
if (chapterSelect) {
  chapterSelect.addEventListener("change", (e) => {
    const selectedUrl = e.target.value;
    if (selectedUrl) {
      loadChapterFromNavigation(selectedUrl);
    }
  });
}

// Allow Enter key to load chapter
urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    loadChapter();
  }
});

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (currentChapterData && readerSection.style.display !== "none") {
    if (e.key === "ArrowLeft" && !prevChapterBtn.disabled) {
      loadPreviousChapter();
    } else if (e.key === "ArrowRight" && !nextChapterBtn.disabled) {
      loadNextChapter();
    }
  }
});

// Functions
async function loadChapter() {
  const url = urlInput.value.trim();

  if (!url) {
    showError("Please enter a valid URL");
    return;
  }

  if (!url.includes("comix.to")) {
    showError("Please enter a URL from comix.to");
    return;
  }

  await loadChapterFromUrl(url);
}

async function loadChapterFromUrl(url, metadata = {}) {
  showLoading();

  try {
    // Construct query with metadata if available
    const params = new URLSearchParams();
    params.append("url", url);
    if (metadata.mangaId) params.append("mangaId", metadata.mangaId);
    if (metadata.provider) params.append("provider", metadata.provider);
    if (metadata.chapterId) params.append("chapterId", metadata.chapterId);
    if (metadata.chapterNumber)
      params.append("chapterNumber", metadata.chapterNumber);

    const response = await fetch(`/api/chapter?${params.toString()}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to load chapter");
    }

    if (!data.images || data.images.length === 0) {
      throw new Error("No manga images found on this page");
    }

    currentChapterData = data;

    // Save metadata to localStorage for reload functionality
    if (data.metadata) {
      const metadataToSave = {
        mangaId: data.metadata.mangaId,
        provider: data.metadata.provider,
        chapterId: data.metadata.chapterId,
        chapterNumber: data.metadata.chapterNumber,
      };

      localStorage.setItem(
        "lastChapterMetadata",
        JSON.stringify(metadataToSave),
      );
    }

    displayChapter(data);
  } catch (error) {
    console.error("Error loading chapter:", error);
    showError(error.message);
  }
}

function displayChapter(data) {
  // Hide other sections
  inputSection.style.display = "none";
  loadingContainer.style.display = "none";
  errorContainer.style.display = "none";
  readerSection.style.display = "block";

  // Update title
  const titleText = (data.metadata.title || "Manga Chapter")
    .replace(/\(?\d{4}\)?/g, "")
    .trim();
  const chapterText = data.metadata.chapter || "";
  // Display ONLY the manga title, without chapter number, as requested.
  chapterTitle.textContent = titleText;

  // Update sticky title - REMOVED per user request
  // const stickyTitle = document.getElementById("stickyTitle");
  // if (stickyTitle) {
  //   stickyTitle.textContent = titleText;
  //   stickyTitle.title = titleText; // Tooltip for full title
  // }

  // Clear previous images
  imagesContainer.innerHTML = "";

  // Display images
  data.images.forEach((img, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "manga-image-wrapper";

    const imgElement = document.createElement("img");
    imgElement.className = "manga-image";
    imgElement.alt = img.alt || `Page ${index + 1}`;

    // Use proxy for external images to avoid CORS, use local URLs directly
    const isLocal = img.url.startsWith("/api/");
    const imageUrl = isLocal
      ? img.url
      : `/api/proxy-image?url=${encodeURIComponent(img.url)}`;
    imgElement.src = imageUrl;

    // Add loading indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "image-loading";
    loadingDiv.textContent = `Loading page ${index + 1}...`;
    wrapper.appendChild(loadingDiv);

    imgElement.onload = () => {
      loadingDiv.remove();
    };

    imgElement.onerror = () => {
      loadingDiv.textContent = `Failed to load page ${index + 1}`;
      loadingDiv.style.color = "var(--error)";
    };

    wrapper.appendChild(imgElement);
    imagesContainer.appendChild(wrapper);
  });

  // Setup navigation buttons

  // Show reload buttons
  reloadBtn.style.display = "block";

  // Create clean, readable URL: /reader/manga-name/provider/chapter-X
  const cleanUrl = createCleanUrl(data.metadata);
  window.history.replaceState({ chapterUrl: urlInput.value }, "", cleanUrl);

  // Save to localStorage for persistence across hard refreshes
  localStorage.setItem("lastChapterUrl", urlInput.value);
  localStorage.setItem("lastChapterPath", cleanUrl);

  // Scroll to top
  scrollToTop();

  // Update navigation buttons
  updateNavigationButtons();
}

function createCleanUrl(metadata) {
  // Extract manga name from title (remove chapter info)
  let mangaName = (metadata.title || "manga")
    .replace(/chapter\s*\d+/gi, "")
    .replace(/ch\.\s*\d+/gi, "")
    .replace(/\(?\d{4}\)?/g, "") // Remove years like 2023 or (2023)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Extract provider/scanlation team if available
  let provider = (metadata.provider || metadata.scanlator || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Extract chapter number
  const chapterMatch = (metadata.chapter || "").match(/\d+/);
  const chapterNum = chapterMatch ? chapterMatch[0] : "1";

  return `/reader/${mangaName}/${provider}/chapter-${chapterNum}`;
}

function reloadCurrentChapter() {
  // Try to get URL from history state, localStorage, or input field
  const storedMetadata = localStorage.getItem("lastChapterMetadata");
  const metadata = storedMetadata ? JSON.parse(storedMetadata) : null;

  const storedUrl =
    window.history.state?.chapterUrl || localStorage.getItem("lastChapterUrl");
  const chapterUrl = storedUrl || urlInput.value;

  if (chapterUrl) {
    loadChapterFromUrl(chapterUrl, metadata);
  } else {
    alert("No chapter URL found. Please enter a chapter URL.");
    showInputSection();
  }
}

// Fetch chapter list for navigation
async function fetchChapterList(mangaId) {
  try {
    const response = await fetch(`/api/manga/${mangaId}`);
    if (!response.ok) return null;
    const manga = await response.json();
    return manga.chapters || [];
  } catch (error) {
    console.error("Error fetching chapter list:", error);
    return null;
  }
}

// Find next/previous chapter with provider filtering
// Find next/previous chapter with provider filtering
async function updateNavigationButtons() {
  const meta = currentChapterData?.metadata;
  if (!meta) {
    disableAllNavButtons();
    return;
  }

  const { mangaId, provider, chapterNumber } = meta;

  // Update back to manga button
  const backBtn = document.getElementById("backToMangaBtn");
  const backBtnBottom = document.getElementById("backToMangaBtnBottom");

  const updateBackBtn = (btn) => {
    if (btn) {
      if (mangaId) {
        btn.href = `/manga.html?id=${mangaId}`;
        btn.style.display = "inline-flex";
      } else {
        btn.href = "/";
      }
    }
  };

  updateBackBtn(backBtn);
  updateBackBtn(backBtnBottom);

  if (!mangaId || !chapterNumber) {
    console.warn("Missing mangaId or chapterNumber for navigation");
    disableAllNavButtons();
    return;
  }

  const chapters = await fetchChapterList(mangaId);
  if (!chapters || chapters.length === 0) {
    console.warn("No chapters list found");
    disableAllNavButtons();
    return;
  }

  // 1. Try to filter by provider
  let activeList = chapters
    .filter((ch) => ch.provider === provider)
    .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

  let currentIndex = activeList.findIndex(
    (ch) => parseFloat(ch.number) === parseFloat(chapterNumber),
  );

  // 2. If not found in provider list, try ALL chapters
  if (currentIndex === -1) {
    console.log(
      "Current chapter not found in provider list, switching to ALL chapters",
    );
    activeList = chapters.sort(
      (a, b) => parseFloat(a.number) - parseFloat(b.number),
    );

    currentIndex = activeList.findIndex(
      (ch) => parseFloat(ch.number) === parseFloat(chapterNumber),
    );
  }

  console.log(
    `Navigation: Index ${currentIndex} / ${activeList.length} (Chap ${chapterNumber})`,
  );

  // Update button states
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < activeList.length - 1;

  prevChapterBtn.disabled = !hasPrev;
  prevChapterBtnBottom.disabled = !hasPrev;
  nextChapterBtn.disabled = !hasNext;
  nextChapterBtnBottom.disabled = !hasNext;

  // Populate Chapter Dropdown (Top and Bottom)
  const populateDropdown = (selectEl) => {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    activeList.forEach((ch, index) => {
      const option = document.createElement("option");
      option.value = ch.url; // We'll store URL as value
      option.textContent = `Chapter ${ch.number}`;
      option.dataset.index = index;
      option.dataset.provider = ch.provider;
      option.dataset.id = ch.id;
      option.dataset.number = ch.number;

      if (index === currentIndex) {
        option.selected = true;
      }
      selectEl.appendChild(option);
    });
  };

  populateDropdown(chapterSelect);
  populateDropdown(chapterSelectBottom);

  // Store navigation data
  currentChapterData.navigation = {
    chapters: activeList,
    currentIndex,
  };
}

function loadChapterFromNavigation(url) {
  if (!currentChapterData?.metadata) return;

  // Find the chapter object from stored navigation or create basic params
  const { mangaId } = currentChapterData.metadata;

  // We need to find the specific chapter details to pass all params
  let chapterInfo = null;
  if (currentChapterData.navigation?.chapters) {
    chapterInfo = currentChapterData.navigation.chapters.find(
      (ch) => ch.url === url,
    );
  }

  const params = new URLSearchParams();
  params.append("url", url);
  params.append("mangaId", mangaId);

  if (chapterInfo) {
    params.append("provider", chapterInfo.provider);
    params.append("chapterId", chapterInfo.id);
    params.append("chapterNumber", chapterInfo.number);
  }

  window.location.href = `reader.html?${params.toString()}`;
}

function disableAllNavButtons() {
  prevChapterBtn.disabled = true;
  prevChapterBtnBottom.disabled = true;
  nextChapterBtn.disabled = true;
  nextChapterBtnBottom.disabled = true;
  if (chapterSelect) {
    chapterSelect.innerHTML =
      "<option disabled selected>No chapters available</option>";
    chapterSelect.disabled = true;
  }
}

function loadPreviousChapter() {
  if (!currentChapterData?.navigation) return;

  const { chapters, currentIndex } = currentChapterData.navigation;
  if (currentIndex > 0) {
    const prevChapter = chapters[currentIndex - 1];
    const params = new URLSearchParams();
    params.append("url", prevChapter.url);
    params.append("mangaId", currentChapterData.metadata.mangaId);
    params.append("provider", prevChapter.provider);
    params.append("chapterId", prevChapter.id);
    params.append("chapterNumber", prevChapter.number);

    window.location.href = `reader.html?${params.toString()}`;
  }
}

function loadNextChapter() {
  if (!currentChapterData?.navigation) return;

  const { chapters, currentIndex } = currentChapterData.navigation;
  if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
    const nextChapter = chapters[currentIndex + 1];
    const params = new URLSearchParams();
    params.append("url", nextChapter.url);
    params.append("mangaId", currentChapterData.metadata.mangaId);
    params.append("provider", nextChapter.provider);
    params.append("chapterId", nextChapter.id);
    params.append("chapterNumber", nextChapter.number);

    window.location.href = `reader.html?${params.toString()}`;
  }
}

function setupNavigation(metadata) {
  // Previous chapter buttons
  if (metadata.prevChapter) {
    prevChapterBtn.style.display = "block";
    prevChapterBtnBottom.style.display = "block";
    prevChapterBtn.onclick = () => loadChapterFromUrl(metadata.prevChapter);
    prevChapterBtnBottom.onclick = () =>
      loadChapterFromUrl(metadata.prevChapter);
  } else {
    prevChapterBtn.style.display = "none";
    prevChapterBtnBottom.style.display = "none";
  }

  // Next chapter buttons
  if (metadata.nextChapter) {
    nextChapterBtn.style.display = "block";
    nextChapterBtnBottom.style.display = "block";
    nextChapterBtn.onclick = () => loadChapterFromUrl(metadata.nextChapter);
    nextChapterBtnBottom.onclick = () =>
      loadChapterFromUrl(metadata.nextChapter);
  } else {
    nextChapterBtn.style.display = "none";
    nextChapterBtnBottom.style.display = "none";
  }
}

function showLoading() {
  inputSection.style.display = "none";
  errorContainer.style.display = "none";
  readerSection.style.display = "none";
  loadingContainer.style.display = "block";
}

function showError(message) {
  inputSection.style.display = "none";
  loadingContainer.style.display = "none";
  readerSection.style.display = "none";
  errorContainer.style.display = "block";
  errorMessage.textContent = message;
}

function showInputSection() {
  inputSection.style.display = "flex";
  loadingContainer.style.display = "none";
  errorContainer.style.display = "none";
  readerSection.style.display = "none";
  urlInput.value = "";
  urlInput.focus();
  scrollToTop();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Auto-load chapter from URL parameter, history state, or pathname
window.addEventListener("load", () => {
  console.log("Page loaded, pathname:", window.location.pathname);

  // Check if URL parameter is provided
  const urlParams = new URLSearchParams(window.location.search);
  const chapterUrl = urlParams.get("url");

  if (chapterUrl) {
    console.log("Loading from URL parameter:", chapterUrl);
    // Collect all metadata from URL
    const metadata = {
      mangaId: urlParams.get("mangaId"),
      provider: urlParams.get("provider"),
      chapterId: urlParams.get("chapterId"),
      chapterNumber: urlParams.get("chapterNumber"),
    };

    // Auto-load the chapter with metadata
    urlInput.value = chapterUrl;
    loadChapterFromUrl(chapterUrl, metadata);
  } else if (window.location.pathname.startsWith("/reader/")) {
    console.log("Detected /reader/ path, calling reloadCurrentChapter()");
    // User refreshed on a /reader/ URL - reload the current chapter
    // This uses the same logic as the reload button
    reloadCurrentChapter();
  } else {
    console.log("No special path, focusing input");
    // Just focus the input
    urlInput.focus();
  }
});

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const MangaScraper = require("./scraper-cheerio"); // Using Cheerio for better compatibility
const HomepageScraper = require("./scrapers/homepage-scraper");
const TitleScraper = require("./scrapers/title-scraper");
const DataManager = require("./utils/data-manager");
const ChapterDownloadManager = require("./utils/chapter-download-manager");
const AutoUpdater = require("./utils/auto-updater");

const app = express();
const mongoose = require("mongoose");
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Initialize scrapers and managers
const scraper = new MangaScraper();
const homepageScraper = new HomepageScraper();
const titleScraper = new TitleScraper();
const dataManager = new DataManager();
const downloadManager = new ChapterDownloadManager();
// USER MANAGER
const UserManager = require("./utils/user-manager");
const userManager = new UserManager();
const autoUpdater = new AutoUpdater(titleScraper, dataManager);

// Remove file-based cache syncing as we use DB now (or implement DB migration here if preferred)
// dataManager.migrateAllManga();
// dataManager.syncDetailsToLibrary();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// API Routes

// Get chapter images
app.get("/api/chapter", async (req, res) => {
  try {
    const {
      url,
      mangaId: qMangaId,
      provider: qProvider,
      chapterId: qChapterId,
    } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL parameter is required",
      });
    }

    // Attempt cache-first if we have metadata
    if (qMangaId && qProvider && qChapterId) {
      if (
        downloadManager.isChapterDownloaded(qMangaId, qProvider, qChapterId)
      ) {
        console.log(
          `Cache hit for ${qMangaId} / ${qProvider} / ${qChapterId} (skipping scrape)`,
        );
        const info = downloadManager.getChapterInfo(
          qMangaId,
          qProvider,
          qChapterId,
        );
        if (info && info.images) {
          return res.json({
            success: true,
            images: info.images.map((img) => ({
              ...img,
              url: `/api/cached-image/${qMangaId}/${encodeURIComponent(qProvider)}/${qChapterId}/${img.page}`,
              isCached: true,
            })),
            metadata: {
              title: info.mangaId, // Use mangaId as fallback title
              chapter: `Chapter ${info.chapterNumber}`,
              provider: qProvider,
              mangaId: qMangaId,
              chapterId: qChapterId,
              chapterNumber: info.chapterNumber,
            },
            url: url,
            isCached: true,
          });
        }
      }
    }

    console.log("Fetching chapter:", url);
    const result = await scraper.scrapeChapter(url);

    if (result.success && result.metadata) {
      // Try to extract mangaId and chapterId from URL if not provided
      const urlMatch = url.match(/\/title\/([^\/]+)\/(\d+)-chapter-(\d+)/);
      const mangaId = qMangaId || (urlMatch ? urlMatch[1] : null);
      const chapterId = qChapterId || (urlMatch ? urlMatch[2] : null);
      // Note: urlMatch[3] would be chapter number if URL format is consistent

      const provider = qProvider || result.metadata.provider || "Unknown";

      // Extract chapter number
      let chapterNumber = null;
      if (result.metadata.chapter) {
        const match = result.metadata.chapter.match(/(\d+(\.\d+)?)/);
        if (match) chapterNumber = match[1];
      }

      // Fallback to URL extraction for chapter number if not found in metadata
      if (!chapterNumber && urlMatch && urlMatch[3]) {
        chapterNumber = urlMatch[3];
      } else if (!chapterNumber) {
        // Try one more regex on URL common format
        const numMatch = url.match(/-chapter-(\d+(\.\d+)?)/);
        if (numMatch) chapterNumber = numMatch[1];
      }

      // Add these to metadata for frontend to use
      result.metadata.mangaId = mangaId;
      result.metadata.chapterId = chapterId;
      result.metadata.provider = provider;
      result.metadata.chapterNumber = chapterNumber;

      if (mangaId && chapterId) {
        // Check if chapter is downloaded
        if (downloadManager.isChapterDownloaded(mangaId, provider, chapterId)) {
          console.log(`Serving cached images for chapter: ${chapterId}`);
          const info = downloadManager.getChapterInfo(
            mangaId,
            provider,
            chapterId,
          );

          if (info && info.images) {
            // Replace image URLs with local proxy URLs
            result.images = info.images.map((img) => ({
              ...img,
              url: `/api/cached-image/${mangaId}/${encodeURIComponent(
                provider,
              )}/${chapterId}/${img.page}`,
              isCached: true,
            }));
            result.isCached = true;
          }
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy images to avoid CORS issues
app.get("/api/proxy-image", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://comix.to/",
      },
    });

    const contentType = response.headers["content-type"];
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
    res.send(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: "Failed to proxy image" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get manga library
app.get("/api/library", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const library = await dataManager.loadLibrary(page, limit);
    res.json(library);
  } catch (error) {
    console.error("Library error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get manga details
app.get("/api/manga/:id", async (req, res) => {
  try {
    const includeChapters = req.query.chapters !== "false";
    const manga = await dataManager.loadMangaDetails(
      req.params.id,
      includeChapters,
    );
    if (!manga) {
      return res.status(404).json({ error: "Manga not found" });
    }
    res.json(manga);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scrape homepage and save to library
app.post("/api/scrape/homepage", async (req, res) => {
  try {
    console.log("Scraping homepage...");
    const result = await homepageScraper.scrapeHomepage();

    if (result.success && result.mangas) {
      // Save each manga to DB (safe upsert via saveLibrary)
      await dataManager.saveLibrary(result.mangas);
      res.json({
        success: true,
        count: result.mangas.length,
        message: "Homepage scraped and library updated",
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Homepage scrape error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Scrape and add manga by URL
app.post("/api/add-manga", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL is required",
      });
    }

    // Extract manga ID from URL
    const urlMatch = url.match(/\/title\/([^\/]+)/);
    if (!urlMatch) {
      return res.status(400).json({
        success: false,
        error: "Invalid manga URL format",
      });
    }

    const mangaId = urlMatch[1];

    // Check if manga already exists
    const existingDetails = await dataManager.loadMangaDetails(mangaId);

    if (existingDetails) {
      return res.json({
        success: true,
        data: existingDetails,
        mangaId,
        alreadyExists: true,
        message: "Manga already exists in library",
      });
    }

    console.log(`Adding manga: ${mangaId}`);

    // Scrape manga details
    const result = await titleScraper.scrapeMangaDetails(url);

    if (result.success) {
      // Save to details (MongoDB)
      await dataManager.saveMangaDetails(mangaId, result.data);

      res.json({ success: true, data: result.data, mangaId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Add manga error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape manga details (Refresh)
app.post("/api/scrape/manga/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://comix.to/title/${id}`;

    console.log(`Scraping manga: ${id}`);
    const result = await titleScraper.scrapeMangaDetails(url);

    if (result.success) {
      await dataManager.saveMangaDetails(id, result.data);
      res.json({ success: true, data: result.data });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Manga scrape error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Download chapter
app.post("/api/download/chapter", async (req, res) => {
  try {
    const { mangaId, provider, chapterId, chapterNumber, chapterUrl } =
      req.body;

    if (
      !mangaId ||
      !provider ||
      !chapterId ||
      chapterNumber === undefined ||
      chapterNumber === null ||
      !chapterUrl
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    // Check if already downloaded
    if (downloadManager.isChapterDownloaded(mangaId, provider, chapterId)) {
      return res.json({
        success: true,
        skipped: true,
        message: "Chapter already downloaded",
      });
    }

    // Scrape chapter to get images
    console.log(`Downloading chapter: ${chapterUrl}`);
    const chapterData = await scraper.scrapeChapter(chapterUrl);

    if (
      !chapterData.success ||
      !chapterData.images ||
      chapterData.images.length === 0
    ) {
      return res.status(500).json({
        success: false,
        error: "Failed to scrape chapter images",
      });
    }

    // Download chapter
    const result = await downloadManager.downloadChapter(
      mangaId,
      provider,
      chapterId,
      chapterNumber,
      chapterData.images,
      scraper,
    );

    res.json(result);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get chapter download status
app.get("/api/download/status/:mangaId/:provider/:chapterId", (req, res) => {
  try {
    const { mangaId, provider, chapterId } = req.params;
    const info = downloadManager.getChapterInfo(mangaId, provider, chapterId);

    if (!info) {
      return res.json({ downloaded: false });
    }

    res.json({
      downloaded: true,
      ...info,
    });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all downloaded chapters for a manga (Batch)
app.get("/api/download/status/:mangaId", (req, res) => {
  try {
    const { mangaId } = req.params;
    const downloads = downloadManager.getMangaDownloads(mangaId);
    res.json(downloads);
  } catch (error) {
    console.error("Batch status check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- User / Auth Routes ---

// Register
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const result = await userManager.register(username, password);
  res.json(result);
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const result = await userManager.login(username, password);
  res.json(result);
});

// Get User Profile (Data sync)
app.get("/api/user/:username", async (req, res) => {
  const { username } = req.params;
  const user = await userManager.getUser(username);
  if (user) {
    res.json({ success: true, user });
  } else {
    res.status(404).json({ success: false, error: "User not found" });
  }
});

// Get User Custom Lists
app.get("/api/user/:username/lists", async (req, res) => {
  const { username } = req.params;
  const user = await userManager.getUser(username);
  if (user) {
    // Convert Map to object for JSON
    const lists = {};
    if (user.customLists) {
      for (const [key, value] of user.customLists) {
        lists[key] = value;
      }
    }
    res.json({ success: true, lists });
  } else {
    res.status(404).json({ success: false, error: "User not found" });
  }
});

// Update Manga Action (Favorite, Status, Rating, Note)
app.post("/api/user/action", async (req, res) => {
  const { username, mangaId, action, value } = req.body;
  if (!username || !mangaId || !action) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  // Security note: In a real app, validate session/token here.
  // For this MVP, we trust the client provided username if strictly managed by frontend.

  const result = await userManager.updateUserAction(
    username,
    mangaId,
    action,
    value,
  );
  res.json(result);
});

// List Management
app.post("/api/user/list", async (req, res) => {
  const { username, action, listName, mangaId } = req.body;
  // action: 'create', 'delete', 'add', 'remove'

  if (!username || !action || !listName) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  let result;
  switch (action) {
    case "create":
      result = await userManager.createList(username, listName);
      break;
    case "delete":
      result = await userManager.deleteList(username, listName);
      break;
    case "add":
      if (!mangaId) return res.status(400).json({ error: "Manga ID required" });
      result = await userManager.addToList(username, listName, mangaId);
      break;
    case "remove":
      if (!mangaId) return res.status(400).json({ error: "Manga ID required" });
      result = await userManager.removeFromList(username, listName, mangaId);
      break;
    default:
      return res.status(400).json({ error: "Invalid action" });
  }

  res.json(result);
});

// Serve cached chapter images
app.get("/api/cached-image/:mangaId/:provider/:chapterId/:page", (req, res) => {
  try {
    const { mangaId, provider, chapterId, page } = req.params;
    const pageNumber = parseInt(page);

    const imagePath = downloadManager.getLocalImagePath(
      mangaId,
      provider,
      chapterId,
      pageNumber,
    );

    if (!imagePath || !require("fs").existsSync(imagePath)) {
      return res.status(404).json({ error: "Cached image not found" });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error("Cached image error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all route for client-side routing (must be last)
// This handles page refreshes on client-side routes like /reader/...
app.get("*", (req, res) => {
  // Only serve HTML for non-API routes
  if (!req.path.startsWith("/api/")) {
    // Serve reader.html for /reader/ paths, index.html for everything else
    const htmlFile = req.path.startsWith("/reader/")
      ? "reader.html"
      : "index.html";
    res.sendFile(path.join(__dirname, "public", htmlFile));
  } else {
    res.status(404).json({ error: "API endpoint not found" });
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  autoUpdater.stop();
  await scraper.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down gracefully...");
  autoUpdater.stop();
  await scraper.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Manga Reader Server running on http://localhost:${PORT}`);
  console.log(`📖 Open your browser and navigate to http://localhost:${PORT}`);

  // Start auto-updater
  autoUpdater.start();
});

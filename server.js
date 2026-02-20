require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const MangaScraper = require("./scraper-cheerio"); // Using Cheerio for better compatibility
const HomepageScraper = require("./scrapers/homepage-scraper");
const TitleScraper = require("./scrapers/title-scraper");
const DataManager = require("./utils/data-manager");

const AutoUpdater = require("./utils/auto-updater");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1"]);
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

// USER MANAGER
const UserManager = require("./utils/user-manager");
const userManager = new UserManager();
const autoUpdater = new AutoUpdater(titleScraper, dataManager, scraper);

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

    console.log("Fetching chapter:", url);
    const result = await scraper.scrapeChapter(url);

    if (result.success && result.metadata) {
      // Try to extract mangaId and chapterId from URL if not provided
      // Support formats: /title/slug/123-chapter-456, /title/slug/chapter-456, etc.
      // mangaId is segment after /title/
      // chapterId is last segment
      const urlMatch = url.match(/\/title\/([^\/]+)\/([^\/?]+)/);
      const mangaId = qMangaId || (urlMatch ? urlMatch[1] : null);
      const chapterId = qChapterId || (urlMatch ? urlMatch[2] : null);
      // Note: urlMatch[3] would be chapter number if URL format is consistent

      // Determine provider: Prefer Scraper unless generic/unknown
      // Logic: Scraper > Query Param > "Unknown"
      // Exception: If Scraper="Official" and Query="Utoon", keep "Utoon"

      const scrapedProvider = result.metadata.provider;
      let provider = qProvider || "Unknown";

      if (scrapedProvider && scrapedProvider.toLowerCase() !== "unknown") {
        provider = scrapedProvider;
        // Downgrade "Official" if we have better
        if (
          scrapedProvider.toLowerCase() === "official" &&
          qProvider &&
          qProvider.toLowerCase() !== "unknown" &&
          qProvider.toLowerCase() !== "official"
        ) {
          provider = qProvider;
        }
      }

      // Extract chapter number
      let chapterNumber = null;
      if (result.metadata.chapter) {
        const match = result.metadata.chapter.match(/(\d+(\.\d+)?)/);
        if (match) chapterNumber = match[1];
      }

      // Fallback to URL extraction for chapter number if not found in metadata
      if (!chapterNumber && chapterId) {
        const numMatch = chapterId.match(/chapter-(\d+(\.\d+)?)/);
        if (numMatch) {
          chapterNumber = numMatch[1];
        } else {
          // Try just finding the number at the end if format is like "14"
          const simpleMatch = chapterId.match(/(\d+(\.\d+)?)$/);
          if (simpleMatch) chapterNumber = simpleMatch[1];
        }
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

// Cloud Sync Chapter (Upload to ImageKit + Save to DB)
app.post("/api/sync/chapter", async (req, res) => {
  try {
    // We only need the URL because the scraper handles everything else (metadata, uploading, saving)
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Missing chapter URL",
      });
    }

    console.log(`☁️ Syncing chapter to cloud: ${url}`);
    const result = await scraper.scrapeChapter(url);

    if (result.success) {
      res.json({
        success: true,
        message: "Chapter synced to cloud successfully!",
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to sync chapter to cloud",
      });
    }
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== SERVER-SIDE BATCH SYNC (runs in background, survives page reload) =====

// In-memory job store  { jobId -> job }
const batchJobs = {};

function makeSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /api/sync/batch
// Body: { chapters: [{url, number, provider}], delaySec }
// Returns immediately with jobId — processing runs in the background.
app.post("/api/sync/batch", (req, res) => {
  const { chapters, delaySec = 5 } = req.body;

  if (!chapters || chapters.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "No chapters provided" });
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id: jobId,
    total: chapters.length,
    done: 0,
    success: 0,
    failed: 0,
    running: true,
    complete: false,
    currentChapter: null,
    startedAt: new Date().toISOString(),
  };
  batchJobs[jobId] = job;

  // Fire-and-forget background loop
  (async () => {
    console.log(
      `☁️ [BatchJob ${jobId}] Starting — ${chapters.length} chapters, ${delaySec}s delay`,
    );
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      job.currentChapter = `Ch. ${ch.number}`;
      try {
        const result = await scraper.scrapeChapter(ch.url);
        if (result.success) {
          job.success++;
          console.log(
            `☁️ [BatchJob ${jobId}] ✅ Synced Ch.${ch.number} (${i + 1}/${chapters.length})`,
          );
        } else {
          job.failed++;
          console.warn(`☁️ [BatchJob ${jobId}] ❌ Failed Ch.${ch.number}`);
        }
      } catch (e) {
        job.failed++;
        console.error(
          `☁️ [BatchJob ${jobId}] ❌ Error Ch.${ch.number}:`,
          e.message,
        );
      }
      job.done++;
      if (i < chapters.length - 1) {
        await makeSleep(delaySec * 1000);
      }
    }
    job.running = false;
    job.complete = true;
    job.currentChapter = null;
    console.log(
      `☁️ [BatchJob ${jobId}] Done — ✅${job.success} ❌${job.failed}`,
    );

    // Auto-cleanup after 10 minutes
    setTimeout(
      () => {
        delete batchJobs[jobId];
      },
      10 * 60 * 1000,
    );
  })();

  res.json({ success: true, jobId });
});

// GET /api/sync/batch/status/:jobId
app.get("/api/sync/batch/status/:jobId", (req, res) => {
  const job = batchJobs[req.params.jobId];
  if (!job) {
    return res
      .status(404)
      .json({ success: false, error: "Job not found or expired" });
  }
  res.json({ success: true, job });
});

// Mark chapter as read
app.post("/api/user/read-chapter", async (req, res) => {
  try {
    const { username, mangaId, chapterId, chapterNumber, provider } = req.body;

    if (!username || !mangaId || !chapterId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const result = await userManager.markChapterAsRead(
      username,
      mangaId,
      chapterId,
      chapterNumber,
      provider,
    );

    res.json(result);
  } catch (error) {
    console.error("Mark chapter as read error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get read chapters for a specific manga
app.get("/api/user/read-chapters/:username/:mangaId", async (req, res) => {
  try {
    const { username, mangaId } = req.params;
    const result = await userManager.getReadChapters(username, mangaId);
    res.json(result);
  } catch (error) {
    console.error("Get read chapters error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all reading history for a user
app.get("/api/user/reading-history/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const result = await userManager.getReadingHistory(username);
    res.json(result);
  } catch (error) {
    console.error("Get reading history error:", error);
    res.status(500).json({ success: false, error: error.message });
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

// Get sync status for all chapters of a manga
// IMPORTANT: Must be registered BEFORE the catch-all route below
app.get("/api/sync/status/:mangaId", async (req, res) => {
  try {
    const { mangaId } = req.params;
    const chapters = await require("./models/Chapter").find(
      { mangaId },
      "chapterId",
    );
    // Return array of synced chapter URLs (chapterId in DB stores full URL)
    const syncedUrls = chapters.map((c) => c.chapterId);
    res.json({ success: true, syncedUrls });
  } catch (error) {
    console.error("Sync status error:", error);
    res.status(500).json({ success: false, error: error.message });
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

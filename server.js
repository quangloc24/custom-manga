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
const PORT = process.env.PORT || 3000;

// Initialize scrapers and data manager
const scraper = new MangaScraper();
const homepageScraper = new HomepageScraper();
const titleScraper = new TitleScraper();
const dataManager = new DataManager();
const downloadManager = new ChapterDownloadManager();
const autoUpdater = new AutoUpdater(titleScraper, dataManager);

// Run startup migration to convert old relative times to timestamps
dataManager.migrateAllManga();

// Sync all manga details to library (fixes manually added manga)
dataManager.syncDetailsToLibrary();

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
app.get("/api/library", (req, res) => {
  try {
    const library = dataManager.loadLibrary();
    res.json(library);
  } catch (error) {
    console.error("Library error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get manga details
app.get("/api/manga/:id", (req, res) => {
  try {
    const { id } = req.params;
    const details = dataManager.loadMangaDetails(id);

    if (!details) {
      return res.status(404).json({ error: "Manga not found" });
    }

    res.json(details);
  } catch (error) {
    console.error("Manga details error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Scrape homepage and save to library
app.post("/api/scrape/homepage", async (req, res) => {
  try {
    console.log("Scraping homepage...");
    const result = await homepageScraper.scrapeHomepage();

    if (result.success) {
      dataManager.saveLibrary(result.mangas);
      res.json({ success: true, count: result.mangas.length });
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

    // Check if manga already exists in library or details
    const library = dataManager.loadLibrary();
    const existingInLibrary = library.mangas?.find((m) => m.id === mangaId);
    const existingDetails = dataManager.loadMangaDetails(mangaId);

    if (existingInLibrary || existingDetails) {
      // If in library but no details, scrape details
      if (existingInLibrary && !existingDetails) {
        console.log(`Manga in library but no details, scraping: ${mangaId}`);
        // Continue to scrape details below
      } else {
        return res.json({
          success: true,
          data: existingDetails || existingInLibrary,
          mangaId,
          alreadyExists: true,
          message: "Manga already exists in library",
        });
      }
    }

    console.log(`Adding manga: ${mangaId}`);

    // Scrape manga details
    const result = await titleScraper.scrapeMangaDetails(url);

    if (result.success) {
      // Save to details
      dataManager.saveMangaDetails(mangaId, result.data);

      // Add to library if not already there
      const library = dataManager.loadLibrary();
      const existingInLibrary = library.mangas?.find((m) => m.id === mangaId);

      if (!existingInLibrary) {
        const newManga = {
          id: mangaId,
          title: result.data.title,
          thumbnail: result.data.thumbnail,
          latestChapter:
            result.data.totalChapters || result.data.chapters?.[0]?.number,
        };

        const updatedMangas = [...(library.mangas || []), newManga];
        dataManager.saveLibrary(updatedMangas);
      }

      res.json({ success: true, data: result.data, mangaId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Add manga error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape manga details
app.post("/api/scrape/manga/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://comix.to/title/${id}`;

    console.log(`Scraping manga: ${id}`);
    const result = await titleScraper.scrapeMangaDetails(url);

    if (result.success) {
      dataManager.saveMangaDetails(id, result.data);
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

    if (!mangaId || !provider || !chapterId || !chapterNumber || !chapterUrl) {
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

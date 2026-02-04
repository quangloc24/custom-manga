const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

class ChapterDownloadManager {
  constructor() {
    this.downloadDir = path.join(__dirname, "downloads");
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Image compression settings
    this.compressionEnabled = process.env.IMAGE_COMPRESSION_ENABLED !== "false";
    this.compressionQuality = parseInt(
      process.env.IMAGE_COMPRESSION_QUALITY || "80",
      10,
    );
    this.imageFormat = process.env.IMAGE_FORMAT || "webp";
    this.maxImageWidth = parseInt(process.env.IMAGE_RESIZE_WIDTH || "0", 10);

    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }

    // Queue for batch downloads
    this.queue = [];
    this.isProcessing = false;
  }

  // --- Queue Management ---

  getQueueStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
    };
  }

  async addBatch(tasks, delay, scraper) {
    console.log(
      `Adding ${tasks.length} tasks to download queue (Delay: ${delay}s)`,
    );
    // Add tasks to queue
    tasks.forEach((task) => {
      this.queue.push({ ...task, delay, scraper });
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return {
      success: true,
      queued: tasks.length,
      totalQueue: this.queue.length,
    };
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      console.log("Queue empty. Batch processing finished.");
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift(); // FIFO

    try {
      console.log(
        `Processing queue item: Ch. ${task.chapterNumber} (${task.provider})`,
      );

      // 1. Scrape (if needed)
      let images = [];
      if (task.images && task.images.length > 0) {
        images = task.images;
      } else if (task.url && task.scraper) {
        // Need to scrape first
        console.log(`  Scraping images for ${task.url}...`);
        const scrapeResult = await task.scraper.scrapeChapter(task.url);
        if (scrapeResult.success && scrapeResult.images) {
          images = scrapeResult.images;
          console.log(`  Found ${images.length} images.`);
        } else {
          throw new Error("Failed to scrape images for batch item");
        }
      } else {
        throw new Error("No images or scraper provided for batch item");
      }

      // 2. Download
      await this.downloadChapter(
        task.mangaId,
        task.provider,
        task.chapterId,
        task.chapterNumber,
        images,
        task.scraper,
      );

      // 3. Delay
      if (this.queue.length > 0) {
        console.log(`  Waiting ${task.delay}s before next download...`);
        await new Promise((r) => setTimeout(r, task.delay * 1000));
      }
    } catch (error) {
      console.error(
        `Error processing batch item Ch. ${task.chapterNumber}:`,
        error.message,
      );
      // Continue to next item despite error
    }

    // Process next
    this.processQueue();
  }

  // Get chapter directory path
  getChapterPath(mangaId, provider, chapterId) {
    const safeMangaId = mangaId.replace(/[^a-z0-9-]/gi, "_");
    const safeProvider = provider.replace(/[^a-z0-9-]/gi, "_");
    const safeChapterId = chapterId.replace(/[^a-z0-9-]/gi, "_");

    return path.join(
      this.downloadDir,
      safeMangaId,
      safeProvider,
      safeChapterId,
    );
  }

  // Check if chapter is already downloaded
  isChapterDownloaded(mangaId, provider, chapterId) {
    const chapterPath = this.getChapterPath(mangaId, provider, chapterId);
    const metadataPath = path.join(chapterPath, "metadata.json");

    return fs.existsSync(metadataPath);
  }

  // Download and optionally compress a single image
  async downloadImage(imageUrl, savePath) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": this.userAgent,
          Referer: "https://comix.to/",
        },
        timeout: 30000,
      });

      // Compress image if enabled
      if (this.compressionEnabled) {
        // Check image dimensions first to avoid WebP limits
        const image = sharp(response.data);
        const metadata = await image.metadata();

        if (this.maxImageWidth > 0 && metadata.width > this.maxImageWidth) {
          console.log(
            `Resizing image from ${metadata.width}px to ${this.maxImageWidth}px`,
          );
          image.resize({ width: this.maxImageWidth, withoutEnlargement: true });
        }

        // WebP has a hard limit of 16383px in dimension
        if (
          (metadata.height > 16000 || metadata.width > 16000) &&
          this.imageFormat === "webp"
        ) {
          console.log(
            `Image too large for WebP (${metadata.width}x${metadata.height}), saving as JPEG`,
          );
          const jpgPath = savePath.replace(/\.[^.]+$/, ".jpg");
          await image
            .jpeg({ quality: this.compressionQuality, mozjpeg: true })
            .toFile(jpgPath);
          return jpgPath;
        }

        const compressedPath = savePath.replace(
          /\.[^.]+$/,
          `.${this.imageFormat}`,
        );

        // Convert based on format
        switch (this.imageFormat.toLowerCase()) {
          case "avif":
            await image
              .avif({ quality: this.compressionQuality, effort: 4 })
              .toFile(compressedPath);
            break;
          case "jpeg":
          case "jpg":
            await image
              .jpeg({ quality: this.compressionQuality, mozjpeg: true })
              .toFile(compressedPath);
            break;
          case "png":
            await image
              .png({ quality: this.compressionQuality, compressionLevel: 8 })
              .toFile(compressedPath);
            break;
          case "webp":
          default:
            await image
              .webp({ quality: this.compressionQuality })
              .toFile(compressedPath);
            break;
        }

        return compressedPath;
      } else {
        fs.writeFileSync(savePath, response.data);
        return savePath;
      }
    } catch (error) {
      console.error(`Failed to download image: ${imageUrl}`, error.message);
      return null;
    }
  }

  // Download entire chapter
  async downloadChapter(
    mangaId,
    provider,
    chapterId,
    chapterNumber,
    images,
    scraper,
  ) {
    const chapterPath = this.getChapterPath(mangaId, provider, chapterId);

    // Check if already downloaded
    if (this.isChapterDownloaded(mangaId, provider, chapterId)) {
      console.log(
        `✓ Chapter ${chapterNumber} by ${provider} already downloaded, skipping...`,
      );
      return { success: true, skipped: true, path: chapterPath };
    }

    console.log(`📥 Downloading Chapter ${chapterNumber} by ${provider}...`);

    // Create chapter directory
    if (!fs.existsSync(chapterPath)) {
      fs.mkdirSync(chapterPath, { recursive: true });
    }

    const downloadedImages = [];
    let successCount = 0;
    const concurrencyLimit = 5;

    // Download images in parallel with a concurrency limit
    for (let i = 0; i < images.length; i += concurrencyLimit) {
      const chunk = images.slice(i, i + concurrencyLimit);
      const downloadPromises = chunk.map(async (image, indexInChunk) => {
        const globalIndex = i + indexInChunk;
        const ext = this.compressionEnabled
          ? `.${this.imageFormat}`
          : path.extname(image.url) || ".jpg";
        const filename = `page_${String(globalIndex + 1).padStart(3, "0")}${ext}`;
        const savePath = path.join(chapterPath, filename);

        console.log(
          `  Downloading page ${globalIndex + 1}/${images.length}...`,
        );
        const resultPath = await this.downloadImage(image.url, savePath);

        if (resultPath) {
          successCount++;
          const actualFilename = path.basename(resultPath);
          downloadedImages.push({
            page: globalIndex + 1,
            filename: actualFilename,
            originalUrl: image.url,
          });
        }
      });

      await Promise.all(downloadPromises);
    }

    // Sort images by page number to ensure correct order
    downloadedImages.sort((a, b) => a.page - b.page);

    // Save metadata
    const metadata = {
      mangaId,
      provider,
      chapterId,
      chapterNumber,
      totalPages: images.length,
      downloadedPages: successCount,
      downloadDate: new Date().toISOString(),
      images: downloadedImages,
    };

    fs.writeFileSync(
      path.join(chapterPath, "metadata.json"),
      JSON.stringify(metadata, null, 2),
    );

    // Create issue file if less than 3 pages
    if (successCount < 3) {
      const issueContent = `ISSUE: Chapter ${chapterNumber} by ${provider}
Downloaded: ${successCount} pages
Expected: At least 3 pages
Date: ${new Date().toISOString()}
Status: INCOMPLETE - Too few pages downloaded

This chapter may be incomplete or failed to download properly.
`;
      fs.writeFileSync(path.join(chapterPath, "ISSUE.txt"), issueContent);
      console.log(
        `  ⚠️  Issue file created - only ${successCount} pages downloaded`,
      );
    }

    console.log(`✅ Downloaded ${successCount}/${images.length} pages`);

    return {
      success: true,
      skipped: false,
      path: chapterPath,
      totalPages: images.length,
      downloadedPages: successCount,
      hasIssue: successCount < 3,
    };
  }

  // Get downloaded chapter info
  getChapterInfo(mangaId, provider, chapterId) {
    const chapterPath = this.getChapterPath(mangaId, provider, chapterId);
    const metadataPath = path.join(chapterPath, "metadata.json");

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const hasIssue = fs.existsSync(path.join(chapterPath, "ISSUE.txt"));

    return {
      ...metadata,
      hasIssue,
      path: chapterPath,
    };
  }

  // Get local image path for serving
  getLocalImagePath(mangaId, provider, chapterId, pageNumber) {
    const chapterPath = this.getChapterPath(mangaId, provider, chapterId);
    const metadataPath = path.join(chapterPath, "metadata.json");

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const image = metadata.images.find((img) => img.page === pageNumber);

    if (!image) {
      return null;
    }

    return path.join(chapterPath, image.filename);
  }
  // Get all downloaded chapters for a manga
  getMangaDownloads(mangaId) {
    const safeMangaId = mangaId.replace(/[^a-z0-9-]/gi, "_");
    const mangaDir = path.join(this.downloadDir, safeMangaId);

    if (!fs.existsSync(mangaDir)) {
      return {};
    }

    const downloads = {};

    try {
      // Iterate providers
      const providers = fs.readdirSync(mangaDir);
      for (const provider of providers) {
        if (provider.startsWith(".")) continue; // Skip hidden files
        const providerDir = path.join(mangaDir, provider);

        if (!fs.statSync(providerDir).isDirectory()) continue;

        // Iterate chapters
        const chapters = fs.readdirSync(providerDir);
        for (const chapterId of chapters) {
          if (chapterId.startsWith(".")) continue;
          const chapterDir = path.join(providerDir, chapterId);
          const metadataPath = path.join(chapterDir, "metadata.json");

          if (fs.existsSync(metadataPath)) {
            try {
              const hasIssue = fs.existsSync(
                path.join(chapterDir, "ISSUE.txt"),
              );
              // Use un-sanitized chapter ID if possible, but we only have safe ID from folder.
              // Actually, we should probably read the metadata to get the real ID,
              // but determining presence by ID (folder name) might be faster if frontend sends safe ID?
              // The frontend sends the real ID. The folder name is the SAFE ID.
              // So we MUST read metadata to get the real ID to map it back correctly.
              // OR, we assume the frontend can hash/safen it same way?
              // No, safer to read metadata.

              const metadata = JSON.parse(
                fs.readFileSync(metadataPath, "utf8"),
              );
              // Map key = original chapter ID
              downloads[metadata.chapterId] = {
                downloaded: true,
                hasIssue: hasIssue,
                totalPages: metadata.totalPages,
                downloadedPages: metadata.downloadedPages,
              };
            } catch (e) {
              console.error(
                `Error reading metadata for ${chapterId}:`,
                e.message,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("Error scanning downloads:", error);
    }

    return downloads;
  }
}

module.exports = ChapterDownloadManager;

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

    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
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
        const compressedPath = savePath.replace(
          /\.[^.]+$/,
          `.${this.imageFormat}`,
        );

        await sharp(response.data)
          .webp({ quality: this.compressionQuality })
          .toFile(compressedPath);

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
}

module.exports = ChapterDownloadManager;

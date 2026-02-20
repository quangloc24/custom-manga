const axios = require("axios");
const cheerio = require("cheerio");
const Chapter = require("./models/Chapter");
const ImageKit = require("imagekit");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { zencf: cf } = require('zencf');
const cookieManager = require('./utils/cookie-manager');

class MangaScraperCheerio {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    if (process.env.IMAGEKIT_PRIVATE_KEY) {
      this.imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      });
    }
  }


  // Helper to extract image data from raw HTML using regex
  _extractImagesFromHtml(html) {
    const images = [];
    const metadata = {
      title: "",
      chapter: "",
      nextChapter: null,
      prevChapter: null,
      provider: "Unknown",
    };

    if (!html) return { images, metadata };

    // Regex for Next.js hydration data
    const imagesMatch = html.match(/\\"images\\":\s*(\[.*?\])/);
    if (imagesMatch && imagesMatch[1]) {
      try {
        const rawJson = imagesMatch[1].replace(/\\"/g, '"');
        const imagesData = JSON.parse(rawJson);
        imagesData.forEach((img, idx) => {
          images.push({ url: img.url, alt: `Page ${idx + 1}`, index: idx });
        });

        const numMatch = html.match(/\\"number\\":\s*([\d.]+)/);
        if (numMatch) metadata.chapter = `Chapter ${numMatch[1]}`;

        const groupMatch = html.match(
          /\\"scanlation_group\\":\{[^}]*?\\"name\\":\\"([^"]+)\\"/,
        );
        if (groupMatch) metadata.provider = groupMatch[1];
      } catch (e) {
        console.error("   ⚠️ Regex extraction parse error:", e.message);
      }
    }

    return { images, metadata };
  }

  async scrapeChapter(url) {
    try {
      // 1. Check Cache
      if (process.env.IMAGEKIT_PRIVATE_KEY) {
        const cachedChapter = await Chapter.findOne({ chapterId: url });
        if (cachedChapter && cachedChapter.images?.length > 0) {
          console.log(
            `✅ Served from Cache: ${cachedChapter.images.length} images`,
          );
          return {
            success: true,
            images: cachedChapter.images.map((img, i) => ({
              url: img,
              alt: `Page ${i + 1}`,
              index: i,
            })),
            metadata: {
              ...(cachedChapter.metadata || { title: "Cached Chapter" }),
              mangaId: cachedChapter.mangaId,
              provider: cachedChapter.provider,
              chapterId: cachedChapter.chapterId,
            },
            url,
          };
        }
      }

      console.log(`☁️ Scraping chapter: ${url}`);
      let html = "";
      let images = [];
      let metadata = {
        title: "",
        chapter: "",
        nextChapter: null,
        prevChapter: null,
        provider: "Unknown",
      };

      // Try Axios with cookies first (from manager)
      try {
        console.log("    Trying Axios with cookies first...");
        const cookieStr = await cookieManager.getCookieString();
        const response = await axios.get(url, {
          headers: {
            "User-Agent": this.userAgent,
            Cookie: cookieStr,
            Referer: "https://comix.to/",
          },
          timeout: 15000,
        });
        html = response.data;
        const extracted = this._extractImagesFromHtml(html);
        if (extracted.images.length > 0) {
          console.log(`   ✅ [Axios] Extracted ${extracted.images.length} images`);
          images = extracted.images;
          metadata = { ...metadata, ...extracted.metadata };
        } else {
          console.log("   ⚠️ [Axios] No images extracted");
        }
      } catch (e) {
        console.log(`   ⚠️ [Axios] Error: ${e.message}`);
      }

      // Fallback: if no images, try zencf.source for rendered HTML
      if (images.length === 0) {
        try {
          console.log("    Trying fallback with zencf.source...");
          const sourceResult = await cf.source(url);
          html = sourceResult.source;
          const extracted = this._extractImagesFromHtml(html);
          if (extracted.images.length > 0) {
            console.log(`   ✅ [zencf] Extracted ${extracted.images.length} images`);
            images = extracted.images;
            metadata = { ...metadata, ...extracted.metadata };
          } else {
            console.log("   ⚠️ [zencf] No images extracted");
          }
        } catch (e) {
          console.log(`   ⚠️ [zencf] Error: ${e.message}`);
        }
      }

      if (images.length === 0) {
        throw new Error(
          "Failed to extract any images (blocked by CF or data missing)",
        );
      }

      // Final metadata polish from DOM
      const $ = cheerio.load(html);
      const fullTitle = $("title").text();
      if (fullTitle && !metadata.title) {
        const parts = fullTitle.split(" - ");
        metadata.title = parts[0].trim();
      }
      if (!metadata.chapter) {
        const chEl = $(".chapter-title, h1").first();
        if (chEl.length > 0) metadata.chapter = chEl.text().trim();
      }

      // Extract next/prev links
      const prevLink = $(
        'a[href*="chapter"]:contains("Prev"), a.prev-btn',
      ).first();
      const nextLink = $(
        'a[href*="chapter"]:contains("Next"), a.next-btn',
      ).first();
      if (prevLink.length > 0)
        metadata.prevChapter = prevLink.attr("href").startsWith("http")
          ? prevLink.attr("href")
          : `https://comix.to${prevLink.attr("href")}`;
      if (nextLink.length > 0)
        metadata.nextChapter = nextLink.attr("href").startsWith("http")
          ? nextLink.attr("href")
          : `https://comix.to${nextLink.attr("href")}`;

      // --- 5. Upload to ImageKit ---
      if (process.env.IMAGEKIT_PRIVATE_KEY && images.length > 0) {
        try {
          console.log("   ☁️ Uploading images to ImageKit...");
          const uploadedUrls = [];

          // Extract manga info for folder path
          let mangaSlug = "unknown-manga";
          try {
            mangaSlug = url.split("/title/")[1].split("/")[0];
          } catch (_) {}
          const chapterSlug = url.split("/").pop();

          // Extract provider slug once
          let providerSlug = (metadata.provider || "unknown")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          // Concurrent Uploads (Batch by 30)
          const BATCH_SIZE = 30;
          const { uploadToImageKit } = require("./utils/imagekit");

          for (let i = 0; i < images.length; i += BATCH_SIZE) {
            const batchPromises = images
              .slice(i, i + BATCH_SIZE)
              .map(async (img, batchIndex) => {
                const index = i + batchIndex;
                const fileName = `page-${String(index + 1).padStart(2, "0")}.webp`;
                const folderPath = `/${mangaSlug}/${providerSlug}/${chapterSlug}/`;

                // Upload and return new URL
                const newUrl = await uploadToImageKit(
                  img.url,
                  fileName,
                  folderPath,
                );

                // Update in place immediately
                img.url = newUrl;
                return newUrl;
              });

            const batchUrls = await Promise.all(batchPromises);
            uploadedUrls.push(...batchUrls);

            console.log(
              `   ☁️ Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
                images.length / BATCH_SIZE,
              )}`,
            );
          }

          // Save to DB
          const newChapter = new Chapter({
            mangaId: mangaSlug,
            chapterId: url,
            chapterNumber: metadata.chapter,
            provider: metadata.provider,
            images: uploadedUrls,
            metadata: {
              title: metadata.title,
              chapter: metadata.chapter,
              prevChapter: metadata.prevChapter,
              nextChapter: metadata.nextChapter,
            },
          });
          await newChapter.save();
          console.log("   ✅ Saved to DB with ImageKit URLs");
        } catch (e) {
          console.log("   ⚠️ ImageKit upload/save failed:", e.message);
        }
      }

      return {
        success: images.length > 0,
        images: images,
        metadata: metadata,
        url: url,
      };
    } catch (error) {
      console.error("❌ Error scraping chapter:", error.message);
      return {
        success: false,
        error: error.message,
        images: [],
        metadata: {},
      };
    }
  }

  async close() {
    // Shared browser is managed by utils/browser.js, no need to close specifically here
    // unless we want to force close the shared instance, which utils provides closeBrowser for.
    // For now, let's leave it empty or we could import closeBrowser and call it if we want full shutdown.
  }
}

module.exports = MangaScraperCheerio;

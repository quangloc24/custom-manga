const axios = require("axios");
const cheerio = require("cheerio");

class MangaScraperCheerio {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async scrapeChapter(url) {
    try {
      console.log(`Scraping chapter from: ${url}`);

      const cookieParts = [
        process.env.CF_CLEARANCE && `cf_clearance=${process.env.CF_CLEARANCE}`,
        process.env.COMIX_SSID && `SSID=${process.env.COMIX_SSID}`,
        process.env.COMIX_XSRF_TOKEN &&
          `xsrf-token=${process.env.COMIX_XSRF_TOKEN}`,
      ].filter(Boolean);

      const response = await axios.get(url, {
        headers: {
          "User-Agent": this.userAgent,
          Referer: "https://comix.to/",
          ...(cookieParts.length && { Cookie: cookieParts.join("; ") }),
        },
        timeout: 30000,
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const images = [];
      let metadata = {
        title: "",
        chapter: "",
        nextChapter: null,
        prevChapter: null,
        provider: "Unknown",
      };

      // Extract metadata using Cheerio
      const fullTitle = $("title").text();
      if (fullTitle) {
        const chapterMatch = fullTitle.match(/Chapter\s+(\d+)/i);
        if (chapterMatch) {
          metadata.chapter = `Chapter ${chapterMatch[1]}`;
        }
        metadata.title = fullTitle.split(" - ")[1] || fullTitle.split(" - ")[0];
      }

      // Extract provider/scanlation team
      // Find the scanlator link - usually near the clock icon or specific class
      const providerLink = $(
        "a[href*='/scanlator/'], a[href*='/team/'], [class*='provider'] a, [class*='team'] a, [class*='scanlator'] a",
      ).first();

      if (providerLink.length) {
        metadata.provider = providerLink.text().trim();
      } else {
        // Fallback: look for generic text next to icons or in specific containers
        const possibleProvider = $(".__name").first(); // Common class for names
        if (possibleProvider.length) {
          metadata.provider = possibleProvider.text().trim();
        } else {
          // Final fallback to regex if DOM fails
          const teamMatch = html.match(
            /([A-Z][a-z]+\s+(?:Scans?|Comics?|Team|Alliance|Group)|ROKARI\s+COMICS|MagusManga|Official)/,
          );
          if (teamMatch) {
            metadata.provider = teamMatch[1];
          }
        }
      }

      // Navigation links
      $("a").each((i, el) => {
        const text = $(el).text().toLowerCase();
        const href = $(el).attr("href");
        if (!href) return;

        if (text.includes("next") && !metadata.nextChapter) {
          metadata.nextChapter = href.startsWith("http")
            ? href
            : `https://comix.to${href}`;
        } else if (text.includes("prev") && !metadata.prevChapter) {
          metadata.prevChapter = href.startsWith("http")
            ? href
            : `https://comix.to${href}`;
        }
      });

      // Extract images using a hybrid approach
      // First, try to extract all URLs matching image patterns from raw HTML
      // This is often more reliable on sites that use complex lazy loading or embed URLs in scripts
      const imageUrlPattern = /https?:\/\/[^\s"']+?\.(webp|jpg|jpeg|png)/gi;
      const rawMatches = html.match(imageUrlPattern) || [];

      const seenUrls = new Set();

      // Filter to get only manga page images
      rawMatches.forEach((url) => {
        // Normalize URL
        let normalizedUrl = url;
        if (normalizedUrl.startsWith("//"))
          normalizedUrl = "https:" + normalizedUrl;

        // Skip non-manga images
        if (
          normalizedUrl.includes("logo") ||
          normalizedUrl.includes("icon") ||
          normalizedUrl.includes("avatar") ||
          normalizedUrl.includes("banner") ||
          normalizedUrl.includes("favicon") ||
          normalizedUrl.includes("@100") ||
          normalizedUrl.includes("@280")
        ) {
          return;
        }

        // Only include images from CDNs or manga image paths
        if (
          normalizedUrl.includes("wowpic") ||
          normalizedUrl.includes("cdn") ||
          normalizedUrl.includes("static") ||
          normalizedUrl.match(/\d+-\d+-chapter-\d+/) // Sometimes in paths
        ) {
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            images.push({
              url: normalizedUrl,
              alt: `Page ${images.length + 1}`,
              index: images.length,
            });
          }
        }
      });

      // Fallback: If regex failed or found too few images, try DOM scraping
      if (images.length < 5) {
        $("img").each((i, el) => {
          const src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-original");
          if (!src) return;

          let fullUrl = src;
          if (fullUrl.startsWith("//")) fullUrl = "https:" + fullUrl;
          else if (fullUrl.startsWith("/"))
            fullUrl = "https://comix.to" + fullUrl;

          if (
            fullUrl.match(/\.(webp|jpg|jpeg|png)$/i) &&
            !seenUrls.has(fullUrl)
          ) {
            // Basic filtering
            if (!fullUrl.includes("logo") && !fullUrl.includes("icon")) {
              seenUrls.add(fullUrl);
              images.push({
                url: fullUrl,
                alt: `Page ${images.length + 1}`,
                index: images.length,
              });
            }
          }
        });
      }

      console.log(`✅ Found ${images.length} manga images`);

      return {
        success: images.length > 0,
        images: images,
        metadata: metadata,
        url: url,
      };
    } catch (error) {
      console.error("❌ Error:", error.message);
      return {
        success: false,
        error: error.message,
        images: [],
        metadata: {},
      };
    }
  }

  async close() {
    return Promise.resolve();
  }
}

module.exports = MangaScraperCheerio;

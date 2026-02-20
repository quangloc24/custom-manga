const axios = require("axios");
const cheerio = require("cheerio");
const { zencf } = require('zencf');
const cookieManager = require('../utils/cookie-manager');

class HomepageScraper {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async scrapeHomepage() {
    try {
      console.log("Scraping homepage: https://comix.to/home");

      let html = "";

      // Try Axios with cookies first (from manager)
      try {
        console.log("    Trying Axios with cookies first...");
        const cookieStr = await cookieManager.getCookieString();
        const response = await axios.get("https://comix.to/home", {
          headers: {
            "User-Agent": this.userAgent,
            Cookie: cookieStr,
            Referer: "https://comix.to/",
          },
          timeout: 15000,
        });
        html = response.data;
        console.log("   ✅ [Axios] Fetched homepage HTML");
      } catch (e) {
        console.log(`   ⚠️ [Axios] Error: ${e.message}`);
      }

      // Fallback: if Axios failed or returned no HTML, try zencf.source for rendered HTML
      if (!html) {
        try {
          console.log("    Trying fallback with zencf.source...");
          const sourceResult = await zencf.source("https://comix.to/home");
          html = sourceResult.source;
          console.log("   ✅ [zencf] Fetched homepage HTML");
        } catch (e) {
          console.log(`   ⚠️ [zencf] Error: ${e.message}`);
          throw new Error("Failed to fetch homepage (both Axios and zencf failed)");
        }
      }

      const $ = cheerio.load(html);
      const mangas = [];
      const seenIds = new Set();

      // Find manga cards - they have a poster link and a separate title link
      // Look for items in the comic grid
      $(".comic .item").each((i, el) => {
        // Get the poster link (has the manga ID)
        const posterLink = $(el).find("a.poster");
        const href = posterLink.attr("href");

        if (!href || !href.startsWith("/title/")) return;

        const match = href.match(/^\/title\/([^\/]+)/);
        if (!match) return;

        const fullId = match[1]; // e.g., "rm2xv-the-grand-dukes-bride-is-a-hellborn-warrior"

        // Skip if we've already seen this manga
        if (seenIds.has(fullId)) return;
        seenIds.add(fullId);

        // Get the title from the title link
        const titleLink = $(el).find("a.title");
        const title = titleLink.text().trim();

        // Get the thumbnail from the poster img
        const img = posterLink.find("img");
        const thumbnail = img.attr("src") || "";

        // Get latest chapter info from metadata
        const metadata = $(el).find(".metadata span").first().text();
        const chapterMatch = metadata.match(/Ch\.\s*(\d+)/);
        const latestChapter = chapterMatch ? parseInt(chapterMatch[1]) : 0;

        // Only add if we have at least a title
        if (title && title.length > 2) {
          mangas.push({
            id: fullId,
            title: title,
            thumbnail: thumbnail,
            latestChapter: latestChapter,
            url: `https://comix.to${href}`,
          });
        }
      });

      console.log(`✅ Found ${mangas.length} manga on homepage`);

      return {
        success: true,
        mangas: mangas,
      };
    } catch (error) {
      console.error("❌ Error scraping homepage:", error.message);
      return {
        success: false,
        error: error.message,
        mangas: [],
      };
    }
  }
}

module.exports = HomepageScraper;

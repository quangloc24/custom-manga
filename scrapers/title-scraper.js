const axios = require("axios");
const cheerio = require("cheerio");
const { zencf } = require('zencf');
const cookieManager = require('../utils/cookie-manager');

class TitleScraper {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }


  async scrapeMangaDetails(url) {
    try {
      console.log(`Scraping manga details from: ${url}`);

      let html = "";

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
        console.log("   ✅ [Axios] Fetched manga details HTML");
      } catch (e) {
        console.log(`   ⚠️ [Axios] Error: ${e.message}`);
      }

      // Fallback: if Axios failed or returned no HTML, try zencf.source for rendered HTML
      if (!html) {
        try {
          console.log("    Trying fallback with zencf.source...");
          const sourceResult = await zencf.source(url);
          html = sourceResult.source;
          console.log("   ✅ [zencf] Fetched manga details HTML");
        } catch (e) {
          console.log(`   ⚠️ [zencf] Error: ${e.message}`);
          throw new Error("Failed to fetch manga details (both Axios and zencf failed)");
        }
      }

      // Get cookies from persistent manager (for API calls)
      const cookieStr = await cookieManager.getCookieString();
      console.log(`      Using ${cookieStr.split(';').length} cookies from manager`);

      const $ = cheerio.load(html);

      // Extract manga ID from URL (full slug and short ID)
      const idMatch = url.match(/\/title\/([^\/]+)/);
      const mangaSlug = idMatch ? idMatch[1] : null;

      // Extract short manga ID for API (e.g., "rm2xv" from "rm2xv-the-grand-dukes...")
      const shortId = mangaSlug ? mangaSlug.split("-")[0] : null;

      // Initialize manga data
      let mangaData = {
        id: mangaSlug,
        title: "Unknown",
        altTitles: [],
        synopsis: "",
        thumbnail: "",
        author: [],
        artist: [],
        genres: [],
        themes: [],
        demographic: [],
        originalLanguage: "",
        status: "",
        latestChapter: 0,
        totalChapters: 0,
        chapters: [],
      };

      // Extract from the visible HTML metadata section
      const metadataList = $("#metadata");
      if (metadataList.length > 0) {
        // Extract authors
        const authorsText = metadataList
          .find('div:contains("Authors:")')
          .text();
        if (authorsText) {
          const authors = [];
          metadataList.find('div:contains("Authors:") a').each((i, el) => {
            authors.push($(el).text().trim());
          });
          mangaData.author = authors;
        }

        // Extract artists
        const artistsText = metadataList
          .find('div:contains("Artists:")')
          .text();
        if (artistsText) {
          const artists = [];
          metadataList.find('div:contains("Artists:") a').each((i, el) => {
            artists.push($(el).text().trim());
          });
          mangaData.artist = artists;
        }

        // Extract genres
        const genres = [];
        metadataList.find('div:contains("Genres:") a').each((i, el) => {
          genres.push($(el).text().trim());
        });
        mangaData.genres = genres;

        // Extract themes
        const themes = [];
        metadataList.find('div:contains("Themes:") a').each((i, el) => {
          themes.push($(el).text().trim());
        });
        mangaData.themes = themes;

        // Extract demographic
        const demographics = [];
        metadataList.find('div:contains("Demographics:") a').each((i, el) => {
          demographics.push($(el).text().trim());
        });
        mangaData.demographic = demographics;

        // Extract language
        const langText = metadataList
          .find('div:contains("Original language:")')
          .text();
        const langMatch = langText.match(/Original language:\s*(\w+)/);
        if (langMatch) {
          mangaData.originalLanguage = langMatch[1];
        }
      }

      // Extract title
      const titleEl = $("h1.title");
      if (titleEl.length > 0) {
        mangaData.title = titleEl.text().trim();
      }

      // Extract alt titles
      const subtitleEl = $("h3.subtitle");
      if (subtitleEl.length > 0) {
        const altTitlesText = subtitleEl.text().trim();
        mangaData.altTitles = altTitlesText.split(" / ").map((t) => t.trim());
      }

      // Extract synopsis
      const synopsisEl = $(".description .content");
      if (synopsisEl.length > 0) {
        mangaData.synopsis = synopsisEl
          .html()
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .trim();
      }

      // Extract thumbnail
      const posterImg = $(".poster img");
      if (posterImg.length > 0) {
        mangaData.thumbnail = posterImg.attr("src");
      }

      // Extract status
      const statusEl = $(".status");
      if (statusEl.length > 0) {
        const statusText = statusEl.text().trim();
        const statusMatch = statusText.match(
          /(RELEASING|FINISHED|ON_HIATUS|COMPLETED)/i,
        );
        if (statusMatch) {
          mangaData.status = statusMatch[1].toLowerCase();
        }
      }

      // Extract manga type directly from the type link
      const typeLink = $(
        'a[href*="types=manhwa"], a[href*="types=manga"], a[href*="types=manhua"]',
      ).first();
      if (typeLink.length > 0) {
        const typeHref = typeLink.attr("href") || "";
        if (typeHref.includes("manhwa")) mangaData.mangaType = "Manhwa";
        else if (typeHref.includes("manhua")) mangaData.mangaType = "Manhua";
        else if (typeHref.includes("manga")) mangaData.mangaType = "Manga";
      } else {
        // Fallback to inferring from language if type link not found
        mangaData.mangaType =
          mangaData.originalLanguage === "Korean"
            ? "Manhwa"
            : mangaData.originalLanguage === "Chinese"
              ? "Manhua"
              : mangaData.originalLanguage === "Japanese"
                ? "Manga"
                : "Unknown";
      }

      // Extract chapters using the API
      const chapters = await this.extractChaptersViaAPI(shortId, mangaSlug, cookieStr);

      mangaData.chapters = chapters;
      mangaData.totalChapters = chapters.length;

      // Calculate latest chapter correctly
      // API returns descending order, so chapters[0] is usually the latest.
      // But to be safe, we find the max number.
      if (chapters.length > 0) {
        mangaData.latestChapter = Math.max(...chapters.map((c) => c.number));
      } else {
        mangaData.latestChapter = 0;
      }

      console.log(`✅ Scraped: ${mangaData.title}`);
      console.log(`   Chapters: ${mangaData.totalChapters}`);
      console.log(`   Author: ${mangaData.author.join(", ") || "Unknown"}`);
      console.log(`   Genres: ${mangaData.genres.join(", ") || "None"}`);

      return {
        success: true,
        data: mangaData,
      };
    } catch (error) {
      console.error("❌ Error scraping manga details:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async extractChaptersViaAPI(shortId, fullSlug, cookieStr) {
    try {
      console.log(`   Fetching chapters via API...`);

      const allChapters = [];
      const limit = 20;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const apiUrl = `https://comix.to/api/v2/manga/${shortId}/chapters?limit=${limit}&page=${page}&order[number]=desc`;

        console.log(`   Fetching page ${page}...`);

        const headers = {
          "User-Agent": this.userAgent,
          Referer: `https://comix.to/title/${fullSlug}`,
        };
        if (cookieStr) {
          headers.Cookie = cookieStr;
        }

        const response = await axios.get(apiUrl, {
          headers: headers,
          timeout: 15000,
        });

        const data = response.data;

        if (data.status === 200 && data.result && data.result.items) {
          const items = data.result.items;

          console.log(`      Found ${items.length} chapters on page ${page}`);

          if (items.length === 0) {
            hasMore = false;
            break;
          }

          items.forEach((item) => {
            const chapter = {
              id: item.chapter_id.toString(),
              number: parseFloat(item.number),
              url: `https://comix.to/title/${fullSlug}/${item.chapter_id}-chapter-${item.number}`,
              provider: item.scanlation_group?.name || "Official",
              uploadDate: item.created_at
                ? new Date(item.created_at * 1000).toISOString()
                : null,
              relativeTime: this.getRelativeTime(item.created_at),
            };

            allChapters.push(chapter);
          });

          // Check if there are more pages
          if (items.length < limit) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      }

      console.log(
        `   ✅ Fetched ${allChapters.length} total chapters from ${page} pages`,
      );

      return allChapters;
    } catch (error) {
      console.error(`   ❌ Error fetching chapters via API: ${error.message}`);
      return [];
    }
  }

  getRelativeTime(timestamp) {
    if (!timestamp) return null;

    try {
      // Convert Unix timestamp (seconds) to JavaScript Date
      const date = new Date(timestamp * 1000);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      // Less than 1 hour
      if (diffMins < 60) return `${diffMins}m`;

      // Less than 1 day
      if (diffHours < 24) return `${diffHours}h`;

      // Less than 30 days
      if (diffDays < 30) return `${diffDays}d`;

      // 30 days or more - show months with remaining days
      const diffMonths = Math.floor(diffDays / 30);
      const remainingDays = diffDays % 30;

      // Less than 1 year
      if (diffMonths < 12) {
        if (remainingDays > 0) {
          return `${diffMonths}mo, ${remainingDays}d`;
        }
        return `${diffMonths}mo`;
      }

      // 1 year or more
      const diffYears = Math.floor(diffDays / 365);
      return `${diffYears}y`;
    } catch (e) {
      return null;
    }
  }

  async close() {
    // Placeholder for cleanup
  }
}

module.exports = TitleScraper;

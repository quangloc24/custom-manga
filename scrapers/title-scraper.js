const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

class TitleScraper {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async scrapeMangaDetails(url) {
    try {
      console.log(`Scraping manga details from: ${url}`);

      const response = await axios.get(url, {
        headers: {
          "User-Agent": this.userAgent,
          Referer: "https://comix.to/",
        },
        timeout: 30000,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract manga ID from URL
      const idMatch = url.match(/\/title\/([^\/]+)/);
      const mangaId = idMatch ? idMatch[1] : null;

      // Initialize manga data
      let mangaData = {
        id: mangaId,
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

      // Extract chapters using Puppeteer (chapters are loaded dynamically)
      const chapters = await this.extractChaptersWithPuppeteer(url, mangaId);

      mangaData.chapters = chapters;
      mangaData.totalChapters = chapters.length;
      mangaData.latestChapter =
        chapters.length > 0 ? chapters[chapters.length - 1].number : 0;

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

  async extractChaptersWithPuppeteer(url, mangaId) {
    const MAX_PAGES = 50; // Safety limit
    let browser;
    const allChapters = []; // Moved outside try block for error handler access

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setUserAgent(this.userAgent);

      console.log("   Loading page with Puppeteer...");
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      const seenChapterIds = new Set();
      let currentPage = 1;
      let hasNextPage = true;
      let consecutiveZeroPages = 0; // Track consecutive pages with 0 new chapters

      while (hasNextPage && currentPage <= MAX_PAGES) {
        console.log(`   Scraping chapter list page ${currentPage}...`);

        // Wait for chapter links to appear on the current page
        await page
          .waitForSelector(`a[href*="/title/${mangaId}/"]`, { timeout: 10000 })
          .catch(() => {});

        // Extract chapters from the current page
        const pageChapters = await this.scrapePageChapters(page, mangaId);

        // Check if we found any new chapters
        let newChaptersFound = 0;
        pageChapters.forEach((ch) => {
          if (!seenChapterIds.has(ch.id)) {
            seenChapterIds.add(ch.id);
            allChapters.push(ch);
            newChaptersFound++;
          }
        });

        console.log(
          `      Found ${newChaptersFound} new chapters on this page`,
        );

        // Track consecutive pages with 0 new chapters
        if (newChaptersFound === 0) {
          consecutiveZeroPages++;
          if (consecutiveZeroPages >= 3) {
            console.log(
              "      No new chapters for 3 consecutive pages, stopping.",
            );
            hasNextPage = false;
            break;
          }
        } else {
          consecutiveZeroPages = 0; // Reset counter when we find new chapters
        }

        // Try to navigate to the next page
        const nextSelector = await page.evaluate((currentPage) => {
          const links = Array.from(document.querySelectorAll("a, button, li")); // Added li for some paginations
          const nextVal = (currentPage + 1).toString();

          const nextLink = links.find((l) => {
            const text = l.textContent.trim();
            const lowerText = text.toLowerCase();
            const href = l.getAttribute("href") || "";
            const ariaLabel = l.getAttribute("aria-label") || "";
            const title = l.getAttribute("title") || "";

            return (
              text === nextVal ||
              lowerText.includes("next") ||
              lowerText.includes("older") ||
              href.endsWith(`#${nextVal}`) ||
              text === "›" ||
              text === "»" ||
              text === ">" ||
              ariaLabel.toLowerCase().includes("next") ||
              title.toLowerCase().includes("next")
            );
          });

          if (nextLink) {
            nextLink.setAttribute("data-next-page", "true");
            return '[data-next-page="true"]';
          }
          return null;
        }, currentPage);

        if (nextSelector) {
          try {
            const clickSuccess = await page.evaluate((selector) => {
              const el = document.querySelector(selector);
              if (el) {
                el.click();
                return true;
              }
              return false;
            }, nextSelector);

            if (!clickSuccess) {
              console.log("      No next page button found, stopping.");
              hasNextPage = false;
              break;
            }

            // Cleanup the attribute
            await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              if (el) el.removeAttribute("data-next-page");
            }, nextSelector);

            // Wait for content to load
            await new Promise((r) => setTimeout(r, 1500));
            currentPage++;
          } catch (clickError) {
            console.error(
              `      Error clicking next page: ${clickError.message}`,
            );
            hasNextPage = false;
          }
        } else {
          console.log("      No next page button found, stopping.");
          hasNextPage = false;
        }
      }

      await browser.close();

      const chapters = allChapters.sort((a, b) => {
        if (b.number !== a.number) return b.number - a.number;
        return b.id.localeCompare(a.id);
      });

      console.log(
        `   Found ${chapters.length} total chapters across ${currentPage} pages`,
      );
      return chapters;
    } catch (error) {
      if (browser) await browser.close();
      console.error(
        "   Error extracting chapters with Puppeteer:",
        error.message,
      );
      // Return what we managed to collect before the error
      return allChapters.sort((a, b) => {
        if (b.number !== a.number) return b.number - a.number;
        return b.id.localeCompare(a.id);
      });
    }
  }

  async navigateToPage(page, pageNum, mangaId, baseUrl = null) {
    try {
      if (baseUrl && pageNum > 1) {
        // Direct navigation for new pages
        await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
      }

      if (pageNum === 1) {
        return true; // Already on page 1
      }

      // Click to the target page
      for (let i = 1; i < pageNum; i++) {
        const nextSelector = await page.evaluate((currentPage) => {
          const links = Array.from(document.querySelectorAll("a, button"));
          const nextVal = (currentPage + 1).toString();
          const nextLink = links.find((l) => {
            const text = l.textContent.trim();
            const href = l.getAttribute("href") || "";
            return (
              text === nextVal ||
              text.toLowerCase() === "next" ||
              href.endsWith(`#${nextVal}`)
            );
          });

          if (nextLink) {
            nextLink.setAttribute("data-next-page", "true");
            return '[data-next-page="true"]';
          }
          return null;
        }, i);

        if (!nextSelector) {
          return false; // No next page button found
        }

        const clickSuccess = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) {
            el.click();
            return true;
          }
          return false;
        }, nextSelector);

        if (!clickSuccess) {
          return false;
        }

        // Cleanup and wait
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.removeAttribute("data-next-page");
        }, nextSelector);

        await new Promise((r) => setTimeout(r, 1500));
      }

      return true;
    } catch (error) {
      console.error(
        `      Error navigating to page ${pageNum}:`,
        error.message,
      );
      return false;
    }
  }

  async scrapePageChapters(page, mangaId) {
    return await page.evaluate((mangaId) => {
      const chapterData = [];
      const allLinks = Array.from(
        document.querySelectorAll(`a[href*="/title/${mangaId}/"]`),
      );

      const chapterLinks = allLinks.filter((link) => {
        const href = link.getAttribute("href");
        return href && href.match(/\/title\/[^\/]+\/\d+-chapter-\d+/);
      });

      chapterLinks.forEach((link) => {
        const href = link.getAttribute("href");
        const match = href.match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/);
        if (!match) return;

        const chapterId = match[1];
        const chapterNum = parseInt(match[2]);
        const parent = link.parentElement;
        const grandparent = parent?.parentElement;

        // Provider extraction
        let provider = "Unknown";
        if (grandparent) {
          const links = Array.from(grandparent.querySelectorAll("a"));
          const providerLink = links.find((l) => {
            const h = l.getAttribute("href");
            return (
              h &&
              h !== href &&
              !h.includes(`/title/${mangaId}`) &&
              !h.startsWith("#")
            );
          });
          if (providerLink) provider = providerLink.textContent.trim();
          else {
            const providerEl = grandparent.querySelector(
              '[class*="provider"], [class*="team"], [class*="scanlator"]',
            );
            if (providerEl) provider = providerEl.textContent.trim();
            else {
              // Final fallback to regex if DOM attributes fail
              const containerText = grandparent.textContent || "";
              const teamMatch = containerText.match(
                /([A-Z][a-z]+\s+(?:Scans?|Comics?|Team|Alliance|Group)|ROKARI\s+COMICS|MagusManga|Official)/,
              );
              if (teamMatch) provider = teamMatch[1];
            }
          }
        }

        // Date extraction
        let uploadDate = null;
        let relativeTime = null;
        const timeEl =
          grandparent?.querySelector('[class*="time"]') ||
          parent?.querySelector('[class*="time"]');
        if (timeEl) {
          relativeTime = timeEl.textContent.trim();
          const attrTime = timeEl.getAttribute("datetime");
          if (attrTime) uploadDate = attrTime;
          else {
            const now = new Date();
            const dMatch = relativeTime.match(/^(\d+)(m|h|d|w|mo|y)$/);
            if (dMatch) {
              const amount = parseInt(dMatch[1]);
              const unit = dMatch[2];
              const date = new Date(now);
              if (unit === "m") date.setMinutes(now.getMinutes() - amount);
              else if (unit === "h") date.setHours(now.getHours() - amount);
              else if (unit === "d") date.setDate(now.getDate() - amount);
              else if (unit === "w") date.setDate(now.getDate() - amount * 7);
              else if (unit === "mo") date.setMonth(now.getMonth() - amount);
              else if (unit === "y")
                date.setFullYear(now.getFullYear() - amount);
              uploadDate = date.toISOString();
            } else {
              uploadDate = relativeTime;
            }
          }
        }

        chapterData.push({
          id: chapterId,
          number: chapterNum,
          url: `https://comix.to${href}`,
          provider: provider,
          uploadDate: uploadDate,
          relativeTime: relativeTime,
        });
      });
      return chapterData;
    }, mangaId);
  }
}

module.exports = TitleScraper;

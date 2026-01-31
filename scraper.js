const puppeteer = require("puppeteer");

class MangaScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: "new",
        executablePath: puppeteer.executablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1920x1080",
        ],
      });
    }
  }

  async scrapeChapter(url) {
    try {
      await this.initialize();

      console.log(`Scraping chapter from: ${url}`);
      const page = await this.browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // Navigate to the page
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for images to load
      await page.waitForSelector("img", { timeout: 10000 });

      // Give extra time for lazy-loaded images
      await page.evaluate(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
      });

      // Extract all image URLs from the page
      const imageData = await page.evaluate(() => {
        const images = [];
        const imgElements = document.querySelectorAll("img");

        imgElements.forEach((img, index) => {
          const src = img.src || img.dataset.src || img.dataset.original;
          if (
            src &&
            !src.includes("logo") &&
            !src.includes("icon") &&
            !src.includes("avatar")
          ) {
            // Filter out small images (likely UI elements)
            if (img.naturalWidth > 200 || img.width > 200) {
              images.push({
                url: src,
                alt: img.alt || `Page ${index + 1}`,
                index: index,
              });
            }
          }
        });

        return images;
      });

      // Extract chapter metadata
      const metadata = await page.evaluate(() => {
        const title =
          document
            .querySelector("h1, .title, .chapter-title")
            ?.textContent?.trim() || "Unknown Title";
        const chapterNum =
          document
            .querySelector(".chapter-number, .chapter")
            ?.textContent?.trim() || "";

        // Try to find next/previous chapter links
        const nextLink =
          document.querySelector(
            'a[href*="chapter"]:has-text("next"), .next-chapter, a.next',
          )?.href || null;
        const prevLink =
          document.querySelector(
            'a[href*="chapter"]:has-text("prev"), .prev-chapter, a.prev',
          )?.href || null;

        return {
          title,
          chapter: chapterNum,
          nextChapter: nextLink,
          prevChapter: prevLink,
        };
      });

      await page.close();

      console.log(`Found ${imageData.length} images`);

      return {
        success: true,
        images: imageData,
        metadata: metadata,
        url: url,
      };
    } catch (error) {
      console.error("Scraping error:", error);
      return {
        success: false,
        error: error.message,
        images: [],
        metadata: {},
      };
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = MangaScraper;

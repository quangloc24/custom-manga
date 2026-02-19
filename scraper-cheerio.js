const cheerio = require("cheerio");
const { getBrowser } = require("./utils/browser");
const Chapter = require("./models/Chapter");
const { uploadToImageKit } = require("./utils/imagekit");

class MangaScraperCheerio {
  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async scrapeChapter(url) {
    let page = null;
    try {
      // 1. Check Cache (MongoDB + ImageKit)
      if (process.env.IMAGEKIT_PRIVATE_KEY) {
        try {
          const cachedChapter = await Chapter.findOne({ chapterId: url });
          if (
            cachedChapter &&
            cachedChapter.images &&
            cachedChapter.images.length > 0
          ) {
            console.log(
              `✅ Served from ImageKit cache: ${cachedChapter.images.length} images`,
            );
            return {
              success: true,
              images: cachedChapter.images.map((img, i) => ({
                url: img,
                alt: `Page ${i + 1}`,
                index: i,
              })),
              metadata: cachedChapter.metadata || { title: "Cached Chapter" },
              url: url,
            };
          }
        } catch (e) {
          console.log("⚠️ Cache check error:", e.message);
        }
      }

      console.log(`Scraping chapter from: ${url}`);

      const browser = await getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(this.userAgent);
      await page.setExtraHTTPHeaders({ Referer: "https://comix.to/" });

      // Wait for the page to fully load and pass CF challenge
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      // Extra wait to let any JS-rendered images appear
      await page.waitForTimeout(2000);

      const html = await page.content();
      await page.close();
      page = null;

      const $ = cheerio.load(html);
      const images = [];
      let metadata = {
        title: "",
        chapter: "",
        nextChapter: null,
        prevChapter: null,
        provider: "Unknown",
      };

      // 1. Try to extract from Next.js hydration data (High Quality / Native)
      // This gives us the direct API data that the frontend uses
      if (process.env.USE_NEXTJS_DATA !== "false") {
        try {
          console.log("   Checking for Next.js hydration data...");
          // Look through ALL scripts for the data
          const scripts = $("script");
          let foundData = false;

          scripts.each((i, el) => {
            if (foundData) return;

            const text = $(el).html();
            // We look for self.__next_f.push and the presence of "images"
            if (
              !text ||
              !text.includes("self.__next_f.push") ||
              !text.includes("images")
            )
              return;

            // Try to find the images array, handling escaped quotes
            // Look for \"images\":[{\"width\": ...
            // The Next.js data is inside a string, so quotes are escaped as \"
            const imagesMatch = text.match(/\\"images\\":\s*(\[.*?\])/);

            if (imagesMatch && imagesMatch[1]) {
              try {
                // The JSON inside is escaped, so we need to unescape it first
                const rawJson = imagesMatch[1].replace(/\\"/g, '"');
                const imagesData = JSON.parse(rawJson);

                console.log(
                  `✅ Found Next.js data with ${imagesData.length} images`,
                );
                if (imagesData.length > 0) {
                  console.log(`   First image: ${imagesData[0].url}`);
                  if (imagesData.length < 15) {
                    console.log(
                      "   ℹ️  Note: Low image count suggests long-strip format (high quality)",
                    );
                  }
                }

                imagesData.forEach((img, index) => {
                  images.push({
                    url: img.url,
                    alt: `Page ${index + 1}`,
                    index: index,
                  });
                });

                // --- Improved Metadata Extraction from full script content ---
                // We'll try to find the full JSON object structure if possible,
                // but since it's disjointed in parts, we might still need robust regex or parsing.

                // Try to find chapter number more reliably
                // Look for "chapter":{"id":...,"number":14,...} structure or flattened
                // "number":14
                const numberMatch = text.match(/\\"number\\":\s*([\d.]+)/);
                if (numberMatch) {
                  metadata.chapter = `Chapter ${numberMatch[1]}`;
                  // Also set explicit chapter number if possible?
                  // processed in server.js usually.
                }

                // Try to find provider / scanlation group
                // Structure often: "scanlation_group":{"id":...,"name":"Group Name"}
                const groupMatch = text.match(
                  /\\"scanlation_group\\":\{[^}]*?\\"name\\":\\"([^"]+)\\"/,
                );
                if (groupMatch) {
                  metadata.provider = groupMatch[1];
                } else {
                  // Fallback: look for just "name" if "scanlation_group" precedes it closely
                  // logic: "scanlation_group":{ ... "name":"X"
                  const looseGroupMatch = text.match(
                    /\\"scanlation_group\\":.*?\\"name\\":\\"([^"]+)\\"/,
                  );
                  if (looseGroupMatch) metadata.provider = looseGroupMatch[1];
                }

                foundData = true;
              } catch (parseError) {
                console.log(
                  "⚠️ Found data but failed to parse JSON:",
                  parseError.message,
                );
              }
            }
          });

          if (!foundData) {
            console.log("⚠️ No Next.js image data found in scripts");
          }
        } catch (e) {
          console.log("⚠️ Next.js extraction error:", e.message);
        }
      }

      // 2. Extract Metadata (Always run this, even if Next.js data found)
      // We extracted images above, but still need Title/Next/Prev links from DOM
      const fullTitle = $("title").text();
      if (fullTitle) {
        const chapterMatch = fullTitle.match(/Chapter\s+(\d+)/i);
        if (chapterMatch) {
          metadata.chapter = `Chapter ${chapterMatch[1]}`;
        }
        metadata.title = fullTitle.split(" - ")[1] || fullTitle.split(" - ")[0];
      }

      // Extract provider/scanlation team
      const providerLink = $(
        "a[href*='/scanlator/'], a[href*='/team/'], [class*='provider'] a, [class*='team'] a, [class*='scanlator'] a",
      ).first();

      if (providerLink.length) {
        metadata.provider = providerLink.text().trim();
      } else {
        const possibleProvider = $(".__name").first();
        if (possibleProvider.length) {
          metadata.provider = possibleProvider.text().trim();
        } else {
          const teamMatch = html.match(
            /([A-Z][a-z]+\s+(?:Scans?|Comics?|Team|Alliance|Group)|ROKARI\s+COMICS|MagusManga)/,
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

      // 3. Fallback Image Extraction: Old Regex/DOM logic if Next.js data didn't yield images
      if (images.length === 0) {
        // Extract images - regex approach on rendered HTML
        const imageUrlPattern = /https?:\/\/[^\s"']+?\.(webp|jpg|jpeg|png)/gi;
        const rawMatches = html.match(imageUrlPattern) || [];
        const seenUrls = new Set();

        rawMatches.forEach((url) => {
          let normalizedUrl = url;
          if (normalizedUrl.startsWith("//"))
            normalizedUrl = "https:" + normalizedUrl;

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

          if (
            normalizedUrl.includes("wowpic") ||
            normalizedUrl.includes("cdn") ||
            normalizedUrl.includes("static") ||
            normalizedUrl.match(/\d+-\d+-chapter-\d+/)
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

        // Fallback: DOM scraping if regex found too few
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
      }
      console.log(`✅ Found ${images.length} manga images`);

      // 4. Upload to ImageKit & Save to DB
      if (
        images.length > 0 &&
        process.env.IMAGEKIT_PRIVATE_KEY &&
        process.env.IMAGEKIT_URL_ENDPOINT
      ) {
        try {
          console.log("☁️ Uploading images to ImageKit...");
          const uploadedUrls = [];

          // Extract manga info for folder path
          // url format: .../title/slug/chapter-id
          // Default to "unknown" if parsing fails
          let mangaSlug = "unknown-manga";
          try {
            mangaSlug = url.split("/title/")[1].split("/")[0];
          } catch (_) {}
          const chapterSlug = url.split("/").pop();

          // Extract provider slug once
          let providerSlug = (metadata.provider || "unknown")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""); // Trim dashes

          // Concurrent Uploads (Batch by 10)
          const BATCH_SIZE = 15;
          for (let i = 0; i < images.length; i += BATCH_SIZE) {
            const batchPromises = images
              .slice(i, i + BATCH_SIZE)
              .map(async (img, batchIndex) => {
                const index = i + batchIndex;
                const fileName = `page-${String(index + 1).padStart(
                  2,
                  "0",
                )}.webp`;
                const folderPath = `/${mangaSlug}/${providerSlug}/${chapterSlug}/`;

                // Upload and return new URL
                const newUrl = await uploadToImageKit(
                  img.url,
                  fileName,
                  folderPath,
                );

                // Update in place immediately for user response
                img.url = newUrl;
                return newUrl;
              });

            const batchUrls = await Promise.all(batchPromises);
            uploadedUrls.push(...batchUrls);

            console.log(
              `☁️ Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
                images.length / BATCH_SIZE,
              )}`,
            );
          }

          // Save to DB
          const newChapter = new Chapter({
            mangaId: mangaSlug,
            chapterId: url, // Use full URL as unique ID
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
          console.log("✅ Saved to DB with ImageKit URLs");
        } catch (e) {
          console.log("⚠️ ImageKit upload/save failed:", e.message);
        }
      }

      return {
        success: images.length > 0,
        images: images,
        metadata: metadata,
        url: url,
      };
    } catch (error) {
      console.error("❌ Error:", error.message);
      if (page) {
        try {
          await page.close();
        } catch (_) {}
      }
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

const puppeteer = require("puppeteer");

async function testPagination() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const mangaId = "rm2xv-the-grand-dukes-bride-is-a-hellborn-warrior";
  const baseUrl = `https://comix.to/title/${mangaId}`;

  console.log("\n=== Testing Page 1 ===");
  await page.goto(`${baseUrl}#1`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 2000));

  const page1Data = await page.evaluate((mangaId) => {
    const links = Array.from(
      document.querySelectorAll(`a[href*="/title/${mangaId}/"]`),
    );
    const chapterLinks = links.filter((l) =>
      l.getAttribute("href")?.match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/),
    );
    return {
      totalLinks: links.length,
      chapterLinks: chapterLinks.length,
      sampleChapters: chapterLinks.slice(0, 5).map((l) => {
        const match = l
          .getAttribute("href")
          .match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/);
        return match ? `Ch${match[2]} (ID:${match[1]})` : "unknown";
      }),
      allChapterIds: chapterLinks
        .map((l) => {
          const match = l
            .getAttribute("href")
            .match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean),
    };
  }, mangaId);

  console.log(`  Total links: ${page1Data.totalLinks}`);
  console.log(`  Chapter links: ${page1Data.chapterLinks}`);
  console.log(`  Sample chapters: ${page1Data.sampleChapters.join(", ")}`);
  console.log(`  All chapter IDs: ${page1Data.allChapterIds.join(", ")}`);

  console.log("\n=== Testing Page 2 (via #2) ===");
  await page.goto(`${baseUrl}#2`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 2000));

  const page2Data = await page.evaluate((mangaId) => {
    const links = Array.from(
      document.querySelectorAll(`a[href*="/title/${mangaId}/"]`),
    );
    const chapterLinks = links.filter((l) =>
      l.getAttribute("href")?.match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/),
    );
    return {
      totalLinks: links.length,
      chapterLinks: chapterLinks.length,
      sampleChapters: chapterLinks.slice(0, 5).map((l) => {
        const match = l
          .getAttribute("href")
          .match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/);
        return match ? `Ch${match[2]} (ID:${match[1]})` : "unknown";
      }),
      allChapterIds: chapterLinks
        .map((l) => {
          const match = l
            .getAttribute("href")
            .match(/\/title\/[^\/]+\/(\d+)-chapter-(\d+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean),
    };
  }, mangaId);

  console.log(`  Total links: ${page2Data.totalLinks}`);
  console.log(`  Chapter links: ${page2Data.chapterLinks}`);
  console.log(`  Sample chapters: ${page2Data.sampleChapters.join(", ")}`);
  console.log(`  All chapter IDs: ${page2Data.allChapterIds.join(", ")}`);

  console.log("\n=== Comparing Pages ===");
  const sameIds =
    JSON.stringify(page1Data.allChapterIds.sort()) ===
    JSON.stringify(page2Data.allChapterIds.sort());
  console.log(
    `  Same chapter IDs: ${sameIds ? "YES (PROBLEM!)" : "NO (Good!)"}`,
  );

  if (sameIds) {
    console.log("\n❌ PAGINATION NOT WORKING - Both pages show same chapters");
  } else {
    console.log("\n✅ PAGINATION WORKING - Different chapters on each page");
  }

  await browser.close();
}

testPagination().catch(console.error);

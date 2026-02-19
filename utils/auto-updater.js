const cron = require("node-cron");

class AutoUpdater {
  constructor(titleScraper, dataManager, scraper) {
    this.titleScraper = titleScraper;
    this.dataManager = dataManager;
    this.scraper = scraper;
    this.task = null;
    this.isRunning = false;
    this.updateIntervalHours = parseInt(
      process.env.AUTO_UPDATE_INTERVAL_HOURS || "24",
      10,
    );
  }

  start() {
    // Support both hours and minutes for testing
    const updateMinutes = parseInt(
      process.env.AUTO_UPDATE_INTERVAL_MINUTES || "0",
      10,
    );

    let cronExpression;
    let intervalDescription;

    if (updateMinutes > 0) {
      // Use minutes for testing
      cronExpression = `*/${updateMinutes} * * * *`; // Every N minutes
      intervalDescription = `every ${updateMinutes} minute(s)`;
    } else {
      // Use hours for production
      cronExpression =
        this.updateIntervalHours === 24
          ? "0 0 * * *" // Daily at midnight
          : `0 */${this.updateIntervalHours} * * *`; // Every N hours
      intervalDescription = `every ${this.updateIntervalHours} hours`;
    }

    console.log(`📅 Auto-updater scheduled: ${intervalDescription}`);

    this.task = cron.schedule(cronExpression, async () => {
      await this.updateAllManga();
    });

    // Optionally run on startup (disabled by default)
    if (process.env.AUTO_UPDATE_ON_STARTUP === "true") {
      console.log("🔄 Running initial update on startup...");
      setTimeout(() => this.updateAllManga(), 5000); // Wait 5s after startup
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      console.log("📅 Auto-updater stopped");
    }
  }

  async updateAllManga() {
    if (this.isRunning) {
      console.log("⏭️  Update already in progress, skipping...");
      return;
    }

    this.isRunning = true;
    console.log("\n🔄 Starting automatic manga update...");
    const startTime = Date.now();

    try {
      // Get only manga that have been fully scraped (user clicked "Update Details")
      const allManga = await this.dataManager.getMangaForAutoUpdate();

      if (!allManga || allManga.length === 0) {
        console.log("📚 No manga to update (no fully scraped manga found)");
        return;
      }

      console.log(`📚 Found ${allManga.length} manga to update`);

      let successCount = 0;
      let errorCount = 0;
      let newChaptersTotal = 0;
      let syncedChaptersCount = 0;

      for (const manga of allManga) {
        try {
          const mangaId = manga.mangaId;
          console.log(`\n   Updating: ${mangaId}`);
          const url = `https://comix.to/title/${mangaId}`;

          // Get old chapter count
          const oldChapterCount = manga.details?.totalChapters || 0;

          // Scrape fresh data
          const result = await this.titleScraper.scrapeMangaDetails(url);

          if (result.success) {
            const newChapterCount = result.data.totalChapters;
            const newChapters = newChapterCount - oldChapterCount;

            // Save updated data
            await this.dataManager.saveMangaDetails(mangaId, result.data);

            if (newChapters > 0) {
              console.log(
                `   ✅ ${result.data.title}: +${newChapters} new chapters (${oldChapterCount} → ${newChapterCount})`,
              );
              newChaptersTotal += newChapters;

              // --- PROACTIVE AUTO-SYNC ---
              // If we have new chapters, automatically sync them to Cloud
              if (this.scraper) {
                console.log(
                  `   ☁️ Starting proactive sync for ${newChapters} chapters...`,
                );
                // Chapters are sorted newest first, so we take the top 'newChapters'
                const chaptersToSync = (result.data.chapters || []).slice(
                  0,
                  newChapters,
                );

                for (const ch of chaptersToSync) {
                  console.log(
                    `     🔄 Auto-Syncing Ch. ${ch.number} (${ch.url})...`,
                  );
                  try {
                    await this.scraper.scrapeChapter(ch.url);
                    syncedChaptersCount++;
                  } catch (syncErr) {
                    console.log(
                      `     ⚠️  Auto-Sync failed for Ch. ${ch.number}: ${syncErr.message}`,
                    );
                  }
                }
              }
            } else {
              console.log(
                `   ✅ ${result.data.title}: Up to date (${newChapterCount} chapters)`,
              );
            }

            successCount++;
          } else {
            console.log(`   ❌ Failed: ${result.error}`);
            errorCount++;
          }

          // Random delay between 1 and 3 minutes (60000ms to 180000ms)
          const minDelay = 60000;
          const maxDelay = 180000;
          const randomDelay =
            Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          const delaySeconds = (randomDelay / 1000).toFixed(0);

          console.log(`   ⏳ Waiting ${delaySeconds}s before next update...`);
          await new Promise((resolve) => setTimeout(resolve, randomDelay));
        } catch (error) {
          console.log(`   ❌ Error: ${error.message}`);
          errorCount++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ Update complete in ${duration}s`);
      console.log(`   Success: ${successCount}, Errors: ${errorCount}`);
      console.log(`   New chapters found: ${newChaptersTotal}`);
      console.log(`   Automatically synced: ${syncedChaptersCount}`);
    } catch (error) {
      console.error("❌ Auto-update error:", error.message);
    } finally {
      this.isRunning = false;
    }
  }

  // Manual trigger for testing
  async triggerUpdate() {
    console.log("🔄 Manually triggering update...");
    await this.updateAllManga();
  }
}

module.exports = AutoUpdater;

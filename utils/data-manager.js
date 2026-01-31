const fs = require("fs");
const path = require("path");

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, "..", "data");
    this.detailsDir = path.join(this.dataDir, "manga-details");
    this.libraryFile = path.join(this.dataDir, "manga-library.json");

    // Ensure directories exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.detailsDir)) {
      fs.mkdirSync(this.detailsDir, { recursive: true });
    }
  }

  // Load manga library
  loadLibrary() {
    try {
      if (fs.existsSync(this.libraryFile)) {
        const data = fs.readFileSync(this.libraryFile, "utf8");
        return JSON.parse(data);
      }
      return { mangas: [], lastUpdated: null };
    } catch (error) {
      console.error("Error loading library:", error.message);
      return { mangas: [], lastUpdated: null };
    }
  }

  // Save manga library
  saveLibrary(mangas) {
    try {
      const data = {
        mangas: mangas,
        lastUpdated: new Date().toISOString(),
        count: mangas.length,
      };
      fs.writeFileSync(this.libraryFile, JSON.stringify(data, null, 2));
      console.log(`✅ Saved ${mangas.length} manga to library`);
      return true;
    } catch (error) {
      console.error("Error saving library:", error.message);
      return false;
    }
  }

  // Load manga details
  loadMangaDetails(mangaId) {
    try {
      const filePath = path.join(this.detailsDir, `${mangaId}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf8");
        const details = JSON.parse(data);

        // Migrate old relative times if needed
        if (this.migrateMangaTimes(mangaId, details)) {
          // If migrated, save the updated version
          this.saveMangaDetails(mangaId, details);
        }

        return details;
      }
      return null;
    } catch (error) {
      console.error(`Error loading manga ${mangaId}:`, error.message);
      return null;
    }
  }

  // Migrate relative times (e.g., "17h", "1d") to absolute ISO strings
  migrateMangaTimes(mangaId, details) {
    if (!details.chapters || !details.lastUpdated) return false;

    let migrated = false;
    const refDate = new Date(details.lastUpdated);

    details.chapters.forEach((chapter) => {
      // If uploadDate is a relative string (like "17h", "1d")
      const match =
        typeof chapter.uploadDate === "string" &&
        chapter.uploadDate.match(/^(\d+)(m|h|d|w|mo|y)$/);

      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2];
        const date = new Date(refDate);

        if (unit === "m") date.setMinutes(refDate.getMinutes() - amount);
        else if (unit === "h") date.setHours(refDate.getHours() - amount);
        else if (unit === "d") date.setDate(refDate.getDate() - amount);
        else if (unit === "w") date.setDate(refDate.getDate() - amount * 7);
        else if (unit === "mo") date.setMonth(refDate.getMonth() - amount);
        else if (unit === "y") date.setFullYear(refDate.getFullYear() - amount);

        chapter.uploadDate = date.toISOString();
        migrated = true;
      }
    });

    if (migrated) {
      console.log(`🪄 Migrated relative times for ${mangaId}`);
    }

    return migrated;
  }

  // Save manga details
  saveMangaDetails(mangaId, details) {
    try {
      const filePath = path.join(this.detailsDir, `${mangaId}.json`);
      const data = {
        ...details,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Saved details for ${mangaId}`);
      return true;
    } catch (error) {
      console.error(`Error saving manga ${mangaId}:`, error.message);
      return false;
    }
  }

  // Get all manga IDs
  getAllMangaIds() {
    try {
      const files = fs.readdirSync(this.detailsDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
    } catch (error) {
      console.error("Error getting manga IDs:", error.message);
      return [];
    }
  }

  // Migrate all stored manga data
  migrateAllManga() {
    const ids = this.getAllMangaIds();
    let totalMigrated = 0;

    ids.forEach((id) => {
      const details = this.loadMangaDetails(id);
      if (details) totalMigrated++;
    });

    if (totalMigrated > 0) {
      console.log(
        `✅ Startup migration: Checked/Migrated ${totalMigrated} manga files`,
      );
    }
  }

  // Sync all manga details to library list
  syncDetailsToLibrary() {
    const library = this.loadLibrary();
    const existingIds = new Set(library.mangas?.map((m) => m.id) || []);
    const allIds = this.getAllMangaIds();

    let addedCount = 0;
    const updatedMangas = [...(library.mangas || [])];

    allIds.forEach((id) => {
      if (!existingIds.has(id)) {
        const details = this.loadMangaDetails(id);
        if (details) {
          updatedMangas.push({
            id,
            title: details.title,
            thumbnail: details.thumbnail,
            latestChapter:
              details.totalChapters || details.chapters?.[0]?.number,
          });
          addedCount++;
        }
      }
    });

    if (addedCount > 0) {
      this.saveLibrary(updatedMangas);
      console.log(`✅ Synced ${addedCount} manga to library`);
    }
  }
}

module.exports = DataManager;

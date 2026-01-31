const Manga = require("../models/Manga");

class DataManager {
  constructor() {
    // No initialization needed for Mongoose
  }

  // Load manga library (Lite version for listing)
  async loadLibrary() {
    try {
      const mangas = await Manga.find(
        {},
        "mangaId title thumbnail latestChapter lastUpdated",
      )
        .sort({ lastUpdated: -1 })
        .lean();
      return {
        mangas: mangas.map((m) => ({
          id: m.mangaId,
          ...m,
          _id: undefined, // Remove internal Mongo ID from output
        })),
        count: mangas.length,
      };
    } catch (error) {
      console.error("Error loading library:", error.message);
      return { mangas: [], count: 0 };
    }
  }

  // Save multiple mangas (e.g. from homepage scrape)
  // Safely upserts: updates shallow info, preserves existing details if present
  async saveLibrary(mangas) {
    if (!mangas || mangas.length === 0) return false;

    try {
      const operations = mangas.map((m) => ({
        updateOne: {
          filter: { mangaId: m.id },
          update: {
            $set: {
              title: m.title,
              thumbnail: m.thumbnail,
              latestChapter: m.latestChapter,
              lastUpdated: new Date(),
            },
            // Only set details if they don't exist (to avoid clearing them)
            // But wait, if we scrape homepage we don't have details.
            // So we don't touch the 'details' field at all in $set.
            // If the document is new, 'details' will be undefined/empty by default schema, which is fine.
          },
          upsert: true,
        },
      }));

      await Manga.bulkWrite(operations);
      console.log(`✅ Bulk saved/updated ${mangas.length} manga from homepage`);
      return true;
    } catch (error) {
      console.error("Error saving library:", error.message);
      return false;
    }
  }

  // Load manga details
  async loadMangaDetails(mangaId) {
    try {
      const manga = await Manga.findOne({ mangaId }).lean();
      if (manga) {
        return {
          ...manga,
          // Spread details to top level to match previous JSON structure if expected by frontend
          ...manga.details,
          id: manga.mangaId,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error loading manga ${mangaId}:`, error.message);
      return null;
    }
  }

  // Get all manga (for auto-updater)
  async getAllManga() {
    try {
      return await Manga.find({}).lean();
    } catch (error) {
      console.error("Error getting all manga:", error.message);
      return [];
    }
  }

  // Get manga that should be auto-updated (only those with full details scraped)
  async getMangaForAutoUpdate() {
    try {
      // Only return manga where user has clicked "Update Details"
      const mangas = await Manga.find({ detailsScraped: true }).lean();
      return mangas;
    } catch (error) {
      console.error("Error getting manga for auto-update:", error.message);
      return [];
    }
  }

  // Save manga details
  async saveMangaDetails(mangaId, details) {
    try {
      // Use manga type from scraper, or calculate from language as fallback
      const type =
        details.mangaType ||
        (details.originalLanguage === "Korean"
          ? "Manhwa"
          : details.originalLanguage === "Chinese"
            ? "Manhua"
            : details.originalLanguage === "Japanese"
              ? "Manga"
              : "Unknown");

      // Structure data for Mongoose model
      const updateData = {
        title: details.title,
        altTitles: details.altTitles || [],
        thumbnail: details.thumbnail,
        latestChapter: details.latestChapter,
        lastUpdated: new Date(),
        detailsScraped: true, // Mark as fully scraped for auto-updates
        details: {
          description: details.synopsis || details.description || "",
          synopsis: details.synopsis || details.description || "",
          authors: details.author || details.authors || [],
          artists: details.artist || details.artists || [],
          mangaType: type,
          genres: details.genres || [],
          themes: details.themes || [],
          demographic: details.demographic || [],
          originalLanguage: details.originalLanguage || "",
          status: details.status || "",
          totalChapters: details.totalChapters || 0,
          chapters: details.chapters || [],
        },
      };

      await Manga.findOneAndUpdate({ mangaId: mangaId }, updateData, {
        upsert: true,
        new: true,
      });

      console.log(`✅ Saved details for ${mangaId} to MongoDB`);
      return true;
    } catch (error) {
      console.error(`Error saving manga ${mangaId}:`, error.message);
      return false;
    }
  }

  // Get all manga IDs
  async getAllMangaIds() {
    try {
      const mangas = await Manga.find({}, "mangaId").lean();
      return mangas.map((m) => m.mangaId);
    } catch (error) {
      console.error("Error getting manga IDs:", error.message);
      return [];
    }
  }

  // Migration from JSON to MongoDB (One-time run)
  async migrateFromJSON() {
    // This method would read local JSON files and save to MongoDB
    // Can be implemented if user requests to keep old data.
    // For now, leaving empty to avoid complex logic dependency without explicit request.
    console.log(
      "JSON to MongoDB migration function available but not auto-run.",
    );
  }
}

module.exports = DataManager;

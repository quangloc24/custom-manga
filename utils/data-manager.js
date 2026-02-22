const prisma = require("./prisma");

class DataManager {
  // Load manga library with pagination
  async loadLibrary(page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;

      const [mangas, totalMangas] = await Promise.all([
        prisma.manga.findMany({
          select: {
            mangaId: true,
            title: true,
            thumbnail: true,
            latestChapter: true,
            lastUpdated: true,
          },
          orderBy: { lastUpdated: "desc" },
          skip,
          take: limit,
        }),
        prisma.manga.count(),
      ]);

      return {
        mangas: mangas.map((m) => ({ id: m.mangaId, ...m })),
        totalMangas,
        totalPages: Math.ceil(totalMangas / limit),
        currentPage: page,
        count: mangas.length,
      };
    } catch (error) {
      console.error("Error loading library:", error.message);
      return {
        mangas: [],
        count: 0,
        totalMangas: 0,
        totalPages: 0,
        currentPage: 1,
      };
    }
  }

  // Save multiple mangas (e.g. from homepage scrape)
  async saveLibrary(mangas) {
    if (!mangas || mangas.length === 0) return false;

    try {
      await prisma.$transaction(
        mangas.map((m) =>
          prisma.manga.upsert({
            where: { mangaId: m.id },
            create: {
              mangaId: m.id,
              title: m.title,
              thumbnail: m.thumbnail,
              latestChapter: m.latestChapter,
              lastUpdated: new Date(),
              altTitles: [],
            },
            update: {
              title: m.title,
              thumbnail: m.thumbnail,
              latestChapter: m.latestChapter,
              lastUpdated: new Date(),
            },
          }),
        ),
      );
      console.log(`Bulk saved/updated ${mangas.length} manga from homepage`);
      return true;
    } catch (error) {
      console.error("Error saving library:", error.message);
      return false;
    }
  }

  // Load manga details
  async loadMangaDetails(mangaId, includeChapters = true) {
    try {
      const manga = await prisma.manga.findUnique({
        where: { mangaId },
      });
      if (!manga) return null;

      const details = (manga.details && typeof manga.details === "object")
        ? { ...manga.details }
        : {};

      if (!includeChapters) {
        delete details.chapters;
      }

      return {
        ...manga,
        ...details,
        chapters: Array.isArray(details.chapters) ? details.chapters : [],
        id: manga.mangaId,
      };
    } catch (error) {
      console.error(`Error loading manga ${mangaId}:`, error.message);
      return null;
    }
  }

  // Get all manga (for auto-updater)
  async getAllManga() {
    try {
      return await prisma.manga.findMany();
    } catch (error) {
      console.error("Error getting all manga:", error.message);
      return [];
    }
  }

  // Get manga that should be auto-updated (explicitly enabled by refetch toggle)
  async getMangaForAutoUpdate() {
    try {
      const mangas = await prisma.manga.findMany({
        where: { refetchEnabled: true },
      });

      return mangas.filter((m) => {
        const status = m?.details?.status;
        return !/^(Finished|Completed)$/i.test(String(status || ""));
      });
    } catch (error) {
      console.error("Error getting manga for auto-update:", error.message);
      return [];
    }
  }

  // Save manga details
  async saveMangaDetails(mangaId, details) {
    try {
      const type =
        details.mangaType ||
        (details.originalLanguage === "Korean"
          ? "Manhwa"
          : details.originalLanguage === "Chinese"
            ? "Manhua"
            : details.originalLanguage === "Japanese"
              ? "Manga"
              : "Unknown");

      const payload = {
        title: details.title,
        altTitles: details.altTitles || [],
        thumbnail: details.thumbnail,
        latestChapter: details.latestChapter,
        lastUpdated: new Date(),
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

      await prisma.manga.upsert({
        where: { mangaId },
        create: {
          mangaId,
          ...payload,
          refetchEnabled: false,
        },
        update: payload,
      });

      console.log(`Saved details for ${mangaId} to Prisma`);
      return true;
    } catch (error) {
      console.error(`Error saving manga ${mangaId}:`, error.message);
      return false;
    }
  }

  // Get all manga IDs
  async getAllMangaIds() {
    try {
      const mangas = await prisma.manga.findMany({
        select: { mangaId: true },
      });
      return mangas.map((m) => m.mangaId);
    } catch (error) {
      console.error("Error getting manga IDs:", error.message);
      return [];
    }
  }

  async migrateFromJSON() {
    console.log("JSON migration helper not auto-run.");
  }
}

module.exports = DataManager;

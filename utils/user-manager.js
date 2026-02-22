const prisma = require("./prisma");
const crypto = require("crypto");

class UserManager {
  async register(username, password) {
    try {
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser) {
        return { success: false, error: "Username already exists" };
      }

      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto
        .pbkdf2Sync(password, salt, 1000, 64, "sha512")
        .toString("hex");

      const newUser = await prisma.user.create({
        data: {
          username,
          salt,
          hash,
          mangaData: {},
          customLists: {},
          readChapters: {},
        },
      });

      return {
        success: true,
        user: { username: newUser.username, joinedAt: newUser.joinedAt },
      };
    } catch (error) {
      console.error("Register error:", error);
      return { success: false, error: "Registration failed: " + error.message };
    }
  }

  async login(username, password) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const hash = crypto
        .pbkdf2Sync(password, user.salt, 1000, 64, "sha512")
        .toString("hex");

      if (hash !== user.hash) {
        return { success: false, error: "Invalid password" };
      }

      return {
        success: true,
        user: { username: user.username, joinedAt: user.joinedAt },
      };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Login failed" };
    }
  }

  async getUser(username) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return null;

      const { salt, hash, ...publicUser } = user;
      return publicUser;
    } catch (error) {
      console.error("Get user error:", error);
      return null;
    }
  }

  async updateUserAction(username, mangaId, actionType, value) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const mangaData =
        user.mangaData && typeof user.mangaData === "object"
          ? { ...user.mangaData }
          : {};
      if (!mangaData[mangaId]) {
        mangaData[mangaId] = {};
      }

      const entry = { ...mangaData[mangaId] };

      switch (actionType) {
        case "favorite":
          entry.favorite = !!value;
          break;
        case "status":
          entry.status = value;
          break;
        case "rating":
          if (value === null) {
            delete entry.rating;
          } else {
            const rating = parseInt(value, 10);
            if (rating >= 1 && rating <= 10) entry.rating = rating;
          }
          break;
        case "note":
          entry.note = value;
          break;
        default:
          return { success: false, error: "Invalid action type" };
      }

      entry.lastUpdated = new Date();
      mangaData[mangaId] = entry;

      await prisma.user.update({
        where: { username },
        data: { mangaData },
      });

      return { success: true, data: entry };
    } catch (error) {
      console.error("Update action error:", error);
      return { success: false, error: error.message };
    }
  }

  async createList(username, listName) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const customLists =
        user.customLists && typeof user.customLists === "object"
          ? { ...user.customLists }
          : {};
      if (customLists[listName]) {
        return { success: false, error: "List already exists" };
      }

      customLists[listName] = [];
      await prisma.user.update({ where: { username }, data: { customLists } });
      return { success: true, lists: customLists };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteList(username, listName) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const customLists =
        user.customLists && typeof user.customLists === "object"
          ? { ...user.customLists }
          : {};
      if (!customLists[listName]) {
        return { success: false, error: "List not found" };
      }

      delete customLists[listName];
      await prisma.user.update({ where: { username }, data: { customLists } });
      return { success: true, lists: customLists };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async addToList(username, listName, mangaId) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const customLists =
        user.customLists && typeof user.customLists === "object"
          ? { ...user.customLists }
          : {};
      if (!Array.isArray(customLists[listName])) {
        return { success: false, error: "List not found" };
      }

      const list = [...customLists[listName]];
      if (!list.includes(mangaId)) {
        list.push(mangaId);
        customLists[listName] = list;
        await prisma.user.update({ where: { username }, data: { customLists } });
      }

      return { success: true, list };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeFromList(username, listName, mangaId) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const customLists =
        user.customLists && typeof user.customLists === "object"
          ? { ...user.customLists }
          : {};
      if (!Array.isArray(customLists[listName])) {
        return { success: false, error: "List not found" };
      }

      const list = customLists[listName].filter((id) => id !== mangaId);
      customLists[listName] = list;
      await prisma.user.update({ where: { username }, data: { customLists } });
      return { success: true, list };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async markChapterAsRead(
    username,
    mangaId,
    chapterId,
    chapterNumber,
    provider,
    pageIndex = null,
    totalPages = null,
    chapterUrl = null,
  ) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return { success: false, error: "User not found" };

      const readChapters =
        user.readChapters && typeof user.readChapters === "object"
          ? { ...user.readChapters }
          : {};
      if (!readChapters[mangaId] || typeof readChapters[mangaId] !== "object") {
        readChapters[mangaId] = {};
      }

      const mangaChapters = { ...readChapters[mangaId] };
      const existingEntry = mangaChapters[chapterId] || {};
      mangaChapters[chapterId] = {
        ...existingEntry,
        chapterNumber: chapterNumber || "?",
        provider: provider || "Unknown",
        pageIndex:
          Number.isInteger(pageIndex) && pageIndex >= 0
            ? pageIndex
            : existingEntry.pageIndex,
        totalPages:
          Number.isInteger(totalPages) && totalPages > 0
            ? totalPages
            : existingEntry.totalPages,
        chapterUrl:
          typeof chapterUrl === "string" && chapterUrl.trim()
            ? chapterUrl.trim()
            : existingEntry.chapterUrl,
        timestamp: new Date(),
      };
      readChapters[mangaId] = mangaChapters;

      await prisma.user.update({ where: { username }, data: { readChapters } });
      return { success: true };
    } catch (error) {
      console.error("Mark chapter as read error:", error);
      return { success: false, error: error.message };
    }
  }

  async getReadChapters(username, mangaId) {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { readChapters: true },
      });
      if (!user) return { success: false, error: "User not found" };

      const chapters =
        user.readChapters && typeof user.readChapters === "object"
          ? user.readChapters[mangaId] || {}
          : {};
      return { success: true, chapters };
    } catch (error) {
      console.error("Get read chapters error:", error);
      return { success: false, error: error.message };
    }
  }

  async getReadingHistory(username) {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { readChapters: true },
      });
      if (!user) return { success: false, error: "User not found" };

      return { success: true, readChapters: user.readChapters || {} };
    } catch (error) {
      console.error("Get reading history error:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = UserManager;

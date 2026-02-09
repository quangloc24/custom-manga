const User = require("../models/User");
const crypto = require("crypto");

class UserManager {
  constructor() {
    // No initialization needed for Mongoose
  }

  // --- Authentication ---

  async register(username, password) {
    try {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return { success: false, error: "Username already exists" };
      }

      // Simple hashing for MVP (In production, use bcrypt/argon2)
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto
        .pbkdf2Sync(password, salt, 1000, 64, "sha512")
        .toString("hex");

      const newUser = new User({
        username,
        salt,
        hash,
      });

      await newUser.save();

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
      const user = await User.findOne({ username });
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const hash = crypto
        .pbkdf2Sync(password, user.salt, 1000, 64, "sha512")
        .toString("hex");

      if (hash === user.hash) {
        return {
          success: true,
          user: { username: user.username, joinedAt: user.joinedAt },
        };
      } else {
        return { success: false, error: "Invalid password" };
      }
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Login failed" };
    }
  }

  async getUser(username) {
    try {
      const user = await User.findOne({ username }).select("-salt -hash -__v");
      return user || null;
    } catch (error) {
      console.error("Get user error:", error);
      return null;
    }
  }

  // --- Manga Actions ---

  // Action: 'favorite', 'status', 'rating', 'note'
  async updateUserAction(username, mangaId, actionType, value) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      // Initialize map entry if not exists (Mongoose Map handling)
      if (!user.mangaData.has(mangaId)) {
        user.mangaData.set(mangaId, {});
      }

      const entry = user.mangaData.get(mangaId);

      switch (actionType) {
        case "favorite":
          entry.favorite = !!value;
          break;
        case "status":
          // Value: 'reading', 'completed', 'on_hold', 'dropped', 'plan_to_read'
          entry.status = value;
          break;
        case "rating":
          // Value: 1-10
          if (value === null) {
            entry.rating = undefined;
          } else {
            const rating = parseInt(value);
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
      // Mongoose doesn't always detect deep changes in Maps
      user.markModified("mangaData");

      await user.save();
      return { success: true, data: entry };
    } catch (error) {
      console.error("Update action error:", error);
      return { success: false, error: error.message };
    }
  }

  // --- Custom Lists ---

  async createList(username, listName) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      if (user.customLists.has(listName)) {
        return { success: false, error: "List already exists" };
      }

      user.customLists.set(listName, []);
      await user.save();

      return { success: true, lists: user.customLists };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteList(username, listName) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      if (user.customLists.has(listName)) {
        user.customLists.delete(listName);
        await user.save();
        return { success: true, lists: user.customLists };
      }
      return { success: false, error: "List not found" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async addToList(username, listName, mangaId) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      if (!user.customLists.has(listName)) {
        return { success: false, error: "List not found" };
      }

      const list = user.customLists.get(listName);
      if (!list.includes(mangaId)) {
        list.push(mangaId);
        await user.save();
        return { success: true, list: list };
      }

      return { success: true, list: list, message: "Already in list" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeFromList(username, listName, mangaId) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      if (!user.customLists.has(listName)) {
        return { success: false, error: "List not found" };
      }

      const list = user.customLists.get(listName);
      const index = list.indexOf(mangaId);
      if (index > -1) {
        list.splice(index, 1);
        await user.save();
        return { success: true, list: list };
      }

      return { success: true, list: list, message: "NotInList" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // --- Reading History ---

  async markChapterAsRead(
    username,
    mangaId,
    chapterId,
    chapterNumber,
    provider,
  ) {
    try {
      const user = await User.findOne({ username });
      if (!user) return { success: false, error: "User not found" };

      // Initialize readChapters structure if needed
      if (!user.readChapters) {
        user.readChapters = {};
      }
      if (!user.readChapters[mangaId]) {
        user.readChapters[mangaId] = {};
      }

      // Store chapter read data
      user.readChapters[mangaId][chapterId] = {
        chapterNumber: chapterNumber || "?",
        provider: provider || "Unknown",
        timestamp: new Date(),
      };

      user.markModified("readChapters");
      await user.save();

      return { success: true };
    } catch (error) {
      console.error("Mark chapter as read error:", error);
      return { success: false, error: error.message };
    }
  }

  async getReadChapters(username, mangaId) {
    try {
      const user = await User.findOne({ username }).select("readChapters");
      if (!user) return { success: false, error: "User not found" };

      const chapters = user.readChapters?.[mangaId] || {};
      return { success: true, chapters };
    } catch (error) {
      console.error("Get read chapters error:", error);
      return { success: false, error: error.message };
    }
  }

  async getReadingHistory(username) {
    try {
      const user = await User.findOne({ username }).select("readChapters");
      if (!user) return { success: false, error: "User not found" };

      return { success: true, readChapters: user.readChapters || {} };
    } catch (error) {
      console.error("Get reading history error:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = UserManager;

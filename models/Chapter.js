const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema({
  mangaId: {
    type: String,
    required: true,
    index: true,
  },
  chapterId: {
    type: String, // Unique identifier e.g. "manga-slug/chapter-12"
    required: true,
    unique: true,
    index: true,
  },
  chapterNumber: String,
  provider: String,

  // Stored ImageKit URLs
  images: [String],

  // Metadata for navigation (allows serving without re-scraping)
  metadata: {
    title: String,
    chapter: String,
    nextChapter: {
      url: String,
      title: String,
    },
    prevChapter: {
      url: String,
      title: String,
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-expire cache after 30 days if desired? No, chapters are static usually.
// But navigation links might change (new chapter added).
// Ideally we re-check "nextChapter" if it was missing.
// But for now, simple cache.

const Chapter = mongoose.model("Chapter", chapterSchema);

module.exports = Chapter;

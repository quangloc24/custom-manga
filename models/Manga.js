const mongoose = require("mongoose");

const mangaSchema = new mongoose.Schema({
  mangaId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  altTitles: [String],
  thumbnail: String,
  latestChapter: String,
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  // Flag to indicate if user has scraped full details (for auto-update filtering)
  detailsScraped: {
    type: Boolean,
    default: false,
  },
  // Full details from scraping
  details: {
    description: String,
    synopsis: String,
    authors: [String],
    artists: [String],
    mangaType: String, // Renamed from 'type' to avoid Mongoose keyword conflict
    genres: [String],
    themes: [String],
    demographic: [String],
    originalLanguage: String,
    status: String,
    totalChapters: Number,
    chapters: [
      {
        id: String,
        title: String,
        number: Number,
        url: String,
        uploadDate: String,
        provider: String,
        relativeTime: String,
      },
    ],
  },
});

const Manga = mongoose.model("Manga", mangaSchema);

module.exports = Manga;

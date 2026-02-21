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
  // Controls whether this title participates in auto updater.
  refetchEnabled: {
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


const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  salt: {
    type: String,
    required: true,
  },
  hash: {
    type: String,
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  // Manga interactions
  mangaData: {
    type: Map,
    of: new mongoose.Schema(
      {
        favorite: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ["reading", "completed", "on_hold", "dropped", "plan_to_read"],
        },
        rating: { type: Number, min: 1, max: 10 },
        note: { type: String, maxlength: 1000 },
        lastUpdated: { type: Date, default: Date.now },
      },
      { _id: false },
    ),
    default: {},
  },
  // Custom Lists: { "My List Name": ["mangaId1", "mangaId2"] }
  customLists: {
    type: Map,
    of: [String],
    default: {},
  },
});

// Update lastUpdated timestamp on manga interactions
// Update lastUpdated timestamp on manga interactions
userSchema.pre("save", async function () {
  if (this.isModified("mangaData")) {
    this.markModified("mangaData");
  }
  if (this.isModified("customLists")) {
    this.markModified("customLists");
  }
});

const User = mongoose.model("User", userSchema);

module.exports = User;

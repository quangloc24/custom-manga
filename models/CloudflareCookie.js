const mongoose = require('mongoose');

const cloudflareCookieSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'comix'
  },
  cookies: [{
    name: String,
    value: String,
    domain: String,
    path: String,
    expires: Number, // Unix timestamp in seconds (may be float)
    httpOnly: Boolean,
    secure: Boolean,
    session: Boolean,
    sameSite: String,
    priority: String,
    sameParty: Boolean,
    sourceScheme: String,
    partitionKey: String
  }],
  cookieString: String, // "name1=value1; name2=value2"
  expiresAt: Date, // earliest expiration among cookies
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

// TTL index for automatic cleanup (optional)
cloudflareCookieSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('CloudflareCookie', cloudflareCookieSchema);

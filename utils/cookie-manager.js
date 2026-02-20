const { zencf: cf } = require('zencf');
const CloudflareCookie = require('../models/CloudflareCookie');

class CookieManager {
  constructor() {
    this.cookieString = null;
    this.expiresAt = null;
    this.refreshingPromise = null;
  }

  async getCookieString(forceRefresh = false) {
    // Return from memory if fresh
    if (!forceRefresh && this.cookieString && this.expiresAt && this.expiresAt > new Date()) {
      return this.cookieString;
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshingPromise) {
      await this.refreshingPromise;
      return this.cookieString;
    }

    // Check DB for fresh cookies if not forcing refresh
    if (!forceRefresh) {
      const doc = await CloudflareCookie.findOne({ _id: 'comix' }).lean();
      if (doc && doc.expiresAt && doc.expiresAt > new Date()) {
        this.cookieString = doc.cookieString;
        this.expiresAt = doc.expiresAt;
        console.log('✅ Loaded fresh cookies from DB');
        return this.cookieString;
      }
    }

    // Need to refresh
    this.refreshingPromise = this._refreshCookies();
    try {
      await this.refreshingPromise;
      return this.cookieString;
    } finally {
      this.refreshingPromise = null;
    }
  }

  async _refreshCookies() {
    console.log('🔄 Refreshing Cloudflare cookies...');
    try {
      const session = await cf.wafSession('https://comix.to');
      const cookies = session.cookies;

      // Compute earliest expiration among cookies
      let minExpires = Infinity;
      cookies.forEach(c => {
        if (c.expires && c.expires < minExpires) {
          minExpires = c.expires;
        }
      });

      const expiresAt = minExpires !== Infinity ? new Date(minExpires * 1000) : null;
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // Update in-memory cache
      this.cookieString = cookieString;
      this.expiresAt = expiresAt;

      // Save to DB
      await CloudflareCookie.findOneAndUpdate(
        { _id: 'comix' },
        {
          _id: 'comix',
          cookies,
          cookieString,
          expiresAt,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Refreshed cookies, expire at ${expiresAt}`);
    } catch (error) {
      console.error('❌ Failed to refresh cookies:', error.message);
      throw error;
    }
  }

  async initialize() {
    try {
      // Force refresh on startup regardless of expiration
      console.log('🔄 Initializing CookieManager - forcing fresh cookie fetch...');
      await this.getCookieString(true);
    } catch (error) {
      console.error('❌ CookieManager initialization failed:', error.message);
      // Do not throw; allow startup to continue and will retry on first use
    }
  }
}

module.exports = new CookieManager();

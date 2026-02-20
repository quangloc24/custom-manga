const { getBrowser } = require('./browser');
const CloudflareCookie = require('../models/CloudflareCookie');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
    console.log('🔄 Refreshing Cloudflare cookies using browser...');

    let browser = null;
    try {
      // Get shared browser instance (reusable, properly configured)
      browser = await getBrowser();
      const page = await browser.newPage();

      // Set realistic viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(USER_AGENT);

      // Navigate to homepage and wait for full load
      console.log('   Navigating to https://comix.to/ ...');
      await page.goto('https://comix.to/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Extra wait for any delayed JS
      await page.waitForTimeout(2000);

      // Extract all cookies from browser context
      let browserCookies = [];
      try {
        const client = await page.target().createCDPSession();
        const allCookies = await client.send('Network.getAllCookies');
        browserCookies = (allCookies.cookies || []).filter((c) => {
          const domain = (c.domain || '').replace(/^\./, '');
          return domain.endsWith('comix.to');
        });
      } catch (_) {
        browserCookies = await page.cookies('https://comix.to/', 'https://comix.to/home');
      }
      console.log(`   ✅ Extracted ${browserCookies.length} cookies from browser`);

      await page.close();

      if (browserCookies.length === 0) {
        throw new Error('No cookies extracted from browser');
      }

      // Map to our format with expiration
      const finalCookies = browserCookies.map(c => ({
        name: c.name,
        value: c.value,
        expires: (typeof c.expires === 'number' && c.expires > 0) ? Math.floor(c.expires) : null
      }));

      // Compute earliest expiration
      let minExpires = Infinity;
      finalCookies.forEach(c => {
        if (typeof c.expires === 'number' && c.expires > 0 && c.expires < minExpires) {
          minExpires = c.expires;
        }
      });
      const expiresAt = minExpires !== Infinity ? new Date(minExpires * 1000) : null;
      const finalCookieString = finalCookies.map(c => `${c.name}=${c.value}`).join('; ');

      // Update memory
      this.cookieString = finalCookieString;
      this.expiresAt = expiresAt;

      // Save to DB
      await CloudflareCookie.findOneAndUpdate(
        { _id: 'comix' },
        {
          _id: 'comix',
          cookies: finalCookies,
          cookieString: finalCookieString,
          expiresAt,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Refreshed cookies (${finalCookies.length} total)${expiresAt ? ', expire at ' + expiresAt : ''}`);

    } catch (error) {
      console.error('❌ Failed to refresh cookies:', error.message);
      throw error;
    } finally {
      // Don't close the shared browser - let other scrapers use it
      // if (browser) await browser.close();
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

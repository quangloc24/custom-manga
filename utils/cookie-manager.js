const { getBrowser } = require("./browser");
const prisma = require("./prisma");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

class CookieManager {
  constructor() {
    this.cookieString = null;
    this.expiresAt = null;
    this.refreshingPromise = null;
  }

  async getCookieString(forceRefresh = false) {
    if (
      !forceRefresh &&
      this.cookieString &&
      this.expiresAt &&
      this.expiresAt > new Date()
    ) {
      return this.cookieString;
    }

    if (this.refreshingPromise) {
      await this.refreshingPromise;
      return this.cookieString;
    }

    if (!forceRefresh) {
      const doc = await prisma.cloudflareCookie.findUnique({
        where: { id: "comix" },
      });
      if (doc && doc.expiresAt && doc.expiresAt > new Date()) {
        this.cookieString = doc.cookieString;
        this.expiresAt = doc.expiresAt;
        console.log("✅ Loaded fresh cookies from DB");
        return this.cookieString;
      }
    }

    this.refreshingPromise = this._refreshCookies();
    try {
      await this.refreshingPromise;
      return this.cookieString;
    } finally {
      this.refreshingPromise = null;
    }
  }

  async _refreshCookies() {
    console.log("🔄 Refreshing Cloudflare cookies using browser...");

    try {
      const browser = await getBrowser();
      const page = await browser.newPage();

      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(USER_AGENT);

      console.log("   Navigating to https://comix.to/ ...");
      await page.goto("https://comix.to/", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      await page.waitForTimeout(2000);

      let browserCookies = [];
      try {
        const client = await page.target().createCDPSession();
        const allCookies = await client.send("Network.getAllCookies");
        browserCookies = (allCookies.cookies || []).filter((c) => {
          const domain = (c.domain || "").replace(/^\./, "");
          return domain.endsWith("comix.to");
        });
      } catch (_) {
        browserCookies = await page.cookies(
          "https://comix.to/",
          "https://comix.to/home",
        );
      }
      console.log(`   ✅ Extracted ${browserCookies.length} cookies from browser`);

      await page.close();

      if (browserCookies.length === 0) {
        throw new Error("No cookies extracted from browser");
      }

      const finalCookies = browserCookies.map((c) => ({
        name: c.name,
        value: c.value,
        expires:
          typeof c.expires === "number" && c.expires > 0
            ? Math.floor(c.expires)
            : null,
      }));

      let minExpires = Infinity;
      finalCookies.forEach((c) => {
        if (
          typeof c.expires === "number" &&
          c.expires > 0 &&
          c.expires < minExpires
        ) {
          minExpires = c.expires;
        }
      });
      const expiresAt = minExpires !== Infinity ? new Date(minExpires * 1000) : null;
      const finalCookieString = finalCookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

      this.cookieString = finalCookieString;
      this.expiresAt = expiresAt;

      await prisma.cloudflareCookie.upsert({
        where: { id: "comix" },
        create: {
          id: "comix",
          cookies: finalCookies,
          cookieString: finalCookieString,
          expiresAt,
          updatedAt: new Date(),
        },
        update: {
          cookies: finalCookies,
          cookieString: finalCookieString,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      console.log(
        `✅ Refreshed cookies (${finalCookies.length} total)${
          expiresAt ? ", expire at " + expiresAt : ""
        }`,
      );
    } catch (error) {
      console.error("❌ Failed to refresh cookies:", error.message);
      throw error;
    }
  }

  async initialize() {
    try {
      console.log("🔄 Initializing CookieManager - forcing fresh cookie fetch...");
      await this.getCookieString(true);
    } catch (error) {
      console.error("❌ CookieManager initialization failed:", error.message);
    }
  }
}

module.exports = new CookieManager();

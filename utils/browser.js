/**
 * Shared puppeteer-stealth browser instance.
 * All scrapers should use getBrowser() from this module.
 */
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteerExtra.use(StealthPlugin());

let browserInstance = null;
// Try to find Chromium/Chrome executable on the system (Linux VPS)
function findChromiumPath() {
  const candidates = [
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Linux
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[Browser] Found system Chromium at: ${p}`);
      return p;
    }
  }
  // Let puppeteer use its bundled binary
  console.log("[Browser] Using puppeteer bundled Chromium");
  return null;
}

async function getBrowser() {
  if (browserInstance) {
    try {
      // Check if still connected
      if (browserInstance.isConnected()) return browserInstance;
    } catch (_) {}
    browserInstance = null;
  }

  const executablePath = findChromiumPath();

  const launchOptions = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-extensions",
    ],
  };

  // Add proxy if PROXY_URL is set
  let proxyAuth = null;
  if (process.env.PROXY_URL) {
    try {
      const proxyUrl = new URL(process.env.PROXY_URL);
      // Construct proxy server string without credentials: e.g., http://host:port
      proxyServer = `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`;
      if (proxyUrl.username || proxyUrl.password) {
        proxyAuth = {
          username: proxyUrl.username,
          password: proxyUrl.password,
        };
      }
      console.log(`[Browser] Using proxy server: ${proxyServer}`);
      if (proxyAuth) {
        console.log(`[Browser] Proxy authentication enabled`);
      }
      launchOptions.args.push(`--proxy-server=${proxyServer}`);
      launchOptions.args.push("--ignore-certificate-errors");
    } catch (e) {
      console.error(
        "[Browser] Invalid PROXY_URL format. Expected format: http://user:pass@host:port",
      );
    }
  }

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  browserInstance = await puppeteerExtra.launch(launchOptions);
  console.log("[Browser] Launched stealth browser");

  // If proxy requires auth, apply credentials on every newly-created page.
  if (proxyAuth) {
    browserInstance.on("targetcreated", async (target) => {
      if (target.type() !== "page") return;
      try {
        const page = await target.page();
        if (!page) return;
        await page.authenticate({
          username: proxyAuth.username,
          password: proxyAuth.password,
        });
        console.log("[Browser] Proxy authentication applied to page");
      } catch (err) {
        console.warn("[Browser] Failed to apply proxy auth:", err.message);
      }
    });
  }

  browserInstance.on("disconnected", () => {
    console.log(
      "[Browser] Browser disconnected, will relaunch on next request",
    );
    browserInstance = null;
  });

  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (_) {}
    browserInstance = null;
  }
}

module.exports = { getBrowser, closeBrowser };

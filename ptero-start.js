const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config();


const PORT = Number(process.env.PORT || 3000);
const API_PROXY_TARGET = String(process.env.API_PROXY_TARGET || "").trim().replace(/\/+$/, "");
const FRONTEND_DIR = fs.existsSync(path.join(__dirname, "dist"))
  ? path.join(__dirname, "dist")
  : path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function safeFilePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalizedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const absPath = path.normalize(path.join(FRONTEND_DIR, normalizedPath));
  if (!absPath.startsWith(FRONTEND_DIR)) return null;
  return absPath;
}

function writeHtmlWithEnv(filePath, res) {
  const envApi = String(process.env.VITE_API_URL || "").trim();
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/%VITE_API_URL%/g, envApi);
  const body = Buffer.from(html, "utf8");
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
  });
  res.end(body);
}

function serveStatic(req, res) {
  const targetPath = safeFilePath(req.url);
  if (!targetPath) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let filePath = targetPath;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    const fallback = path.join(FRONTEND_DIR, "index.html");
    if (fs.existsSync(fallback)) {
      writeHtmlWithEnv(fallback, res);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    writeHtmlWithEnv(filePath, res);
    return;
  }

  const stat = fs.statSync(filePath);
  const type = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": stat.size,
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  if (!API_PROXY_TARGET) {
    sendJson(res, 500, { error: "Missing API_PROXY_TARGET env" });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, API_PROXY_TARGET);
  const upstreamClient = upstreamUrl.protocol === "https:" ? https : http;

  const headers = { ...req.headers };
  delete headers.host;

  const upstreamReq = upstreamClient.request(
    upstreamUrl,
    {
      method: req.method,
      headers,
      timeout: 15000,
    },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };
      delete responseHeaders["transfer-encoding"];

      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("timeout", () => {
    upstreamReq.destroy(new Error("Upstream timeout"));
  });

  upstreamReq.on("error", (err) => {
    sendJson(res, 502, {
      error: "Upstream request failed",
      message: err && err.message ? err.message : "Unknown error",
    });
  });

  req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  if ((req.url || "") === "/healthz") {
    sendJson(res, 200, {
      status: "ok",
      mode: "ptero-start",
      frontendDir: path.basename(FRONTEND_DIR),
      proxyEnabled: Boolean(API_PROXY_TARGET),
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ptero-start] Frontend listening on http://0.0.0.0:${PORT}`);
  console.log(`[ptero-start] Serving files from: ${FRONTEND_DIR}`);
  if (API_PROXY_TARGET) {
    console.log(`[ptero-start] Proxying /api/* -> ${API_PROXY_TARGET}`);
  } else {
    console.log("[ptero-start] API proxy disabled (API_PROXY_TARGET not set)");
  }
});

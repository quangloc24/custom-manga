const fs = require("fs");
const path = require("path");

const root = process.cwd();
const distDir = path.join(root, "dist");
const publicDir = path.join(root, "public");

const copyTargets = [
  ["js", "js"],
  ["css", "css"],
  ["app.js", "app.js"],
];

for (const [from, to] of copyTargets) {
  const src = path.join(publicDir, from);
  const dst = path.join(distDir, to);

  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
}

console.log("[build] copied static js/css files to dist");

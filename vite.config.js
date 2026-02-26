const path = require("path");
const { defineConfig, loadEnv } = require("vite");

module.exports = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    root: "public",
    envDir: ".",
    publicDir: false,
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "public/index.html"),
          manga: path.resolve(__dirname, "public/manga.html"),
          reader: path.resolve(__dirname, "public/reader.html"),
          login: path.resolve(__dirname, "public/login.html"),
          list: path.resolve(__dirname, "public/list.html"),
          favorites: path.resolve(__dirname, "public/favorites.html"),
        },
      },
    },
  };
});

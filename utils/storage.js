const { uploadToImageKit } = require("./imagekit");
const { uploadToImgBB } = require("./imgbb");

function getStorageProvider() {
  const configured = (process.env.STORAGE_PROVIDER || "").trim().toLowerCase();

  if (configured) {
    if (configured === "imagekit") {
      return process.env.IMAGEKIT_PRIVATE_KEY ? "imagekit" : null;
    }
    if (configured === "imgbb") {
      return process.env.IMGBB_API_KEY ? "imgbb" : null;
    }

    console.warn(`[Storage] Unsupported STORAGE_PROVIDER: ${configured}`);
    return null;
  }

  if (process.env.IMAGEKIT_PRIVATE_KEY) return "imagekit";
  if (process.env.IMGBB_API_KEY) return "imgbb";
  return null;
}

async function uploadToStorage(imageUrl, fileName, folderPath, provider) {
  const selectedProvider = provider || getStorageProvider();

  if (!selectedProvider) {
    return imageUrl;
  }

  if (selectedProvider === "imagekit") {
    return uploadToImageKit(imageUrl, fileName, folderPath);
  }

  if (selectedProvider === "imgbb") {
    return uploadToImgBB(imageUrl, fileName);
  }

  return imageUrl;
}

module.exports = {
  getStorageProvider,
  uploadToStorage,
};

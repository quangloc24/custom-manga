const { uploadToImageKit } = require("./storage-providers/imagekit");
const { uploadToImgBB } = require("./storage-providers/imgbb");
const { uploadToFreeImage } = require("./storage-providers/freeimage");

function getStorageProvider() {
  const configured = (process.env.STORAGE_PROVIDER || "").trim().toLowerCase();

  if (configured) {
    if (configured === "imagekit") {
      return process.env.IMAGEKIT_PRIVATE_KEY ? "imagekit" : null;
    }
    if (configured === "imgbb") {
      return process.env.IMGBB_API_KEY ? "imgbb" : null;
    }
    if (configured === "freeimage") {
      return process.env.FREEIMAGE_API_KEY ? "freeimage" : null;
    }

    console.warn(`[Storage] Unsupported STORAGE_PROVIDER: ${configured}`);
    return null;
  }

  if (process.env.IMAGEKIT_PRIVATE_KEY) return "imagekit";
  if (process.env.IMGBB_API_KEY) return "imgbb";
  if (process.env.FREEIMAGE_API_KEY) return "freeimage";
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

  if (selectedProvider === "freeimage") {
    return uploadToFreeImage(imageUrl);
  }

  return imageUrl;
}

module.exports = {
  getStorageProvider,
  uploadToStorage,
};

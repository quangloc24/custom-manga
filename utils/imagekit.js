const ImageKit = require("imagekit");
const axios = require("axios");

// Initialize ImageKit
// Credentials should be in .env
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/**
 * Downloads an image from a URL and uploads it to ImageKit
 * @param {string} imageUrl - The source URL of the image
 * @param {string} fileName - Desired file name
 * @param {string} folderPath - Folder path in ImageKit
 * @returns {Promise<string>} - The URL of the uploaded image
 */
async function uploadToImageKit(imageUrl, fileName, folderPath) {
  try {
    // 1. Download image to buffer
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Referer: "https://comix.to/",
      },
    });

    const buffer = Buffer.from(response.data, "binary");

    // 2. Upload to ImageKit
    const uploadResponse = await imagekit.upload({
      file: buffer,
      fileName: fileName,
      folder: folderPath,
      useUniqueFileName: false, // Ensure we keep our naming scheme (page-01.webp)
      tags: ["manga-chapter"],
    });

    return uploadResponse.url;
  } catch (error) {
    console.error(`[ImageKit] Upload failed for ${fileName}:`, error.message);
    // Return original URL as fallback if upload fails
    return imageUrl;
  }
}

module.exports = {
  imagekit,
  uploadToImageKit,
};

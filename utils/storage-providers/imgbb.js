const axios = require("axios");
const crypto = require("crypto");

function generateRandomId(length = 9) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, chars.length);
    id += chars[idx];
  }
  return id;
}

async function downloadImageBuffer(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Referer: "https://comix.to/",
    },
    timeout: 30000,
    maxBodyLength: Infinity,
  });

  return Buffer.from(response.data);
}

async function uploadToImgBB(imageUrl, fileName) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("IMGBB_API_KEY is missing");
  }

  try {
    const buffer = await downloadImageBuffer(imageUrl);
    const payload = new URLSearchParams();
    payload.append("image", buffer.toString("base64"));

    const baseName = (fileName || "image").replace(/\.[^/.]+$/, "");
    const useUniqueName =
      (process.env.IMGBB_USE_UNIQUE_NAME || "true").toLowerCase() !== "false";
    const uploadName = useUniqueName ? generateRandomId(9) : baseName;
    payload.append("name", uploadName);

    // Optional auto-delete (seconds): 60 to 15552000
    const expiration = Number(process.env.IMGBB_EXPIRATION || 0);
    if (Number.isFinite(expiration) && expiration >= 60 && expiration <= 15552000) {
      payload.append("expiration", String(expiration));
    }

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 45000,
        maxBodyLength: Infinity,
      },
    );

    const uploadedUrl =
      response?.data?.data?.url || response?.data?.data?.display_url;
    if (!uploadedUrl) {
      throw new Error("ImgBB response missing URL");
    }

    return uploadedUrl;
  } catch (error) {
    console.error(`[ImgBB] Upload failed for ${fileName}:`, error.message);
    return imageUrl;
  }
}

module.exports = {
  uploadToImgBB,
};

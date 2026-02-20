const axios = require("axios");

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

async function uploadToFreeImage(imageUrl) {
  const apiKey = process.env.FREEIMAGE_API_KEY;
  if (!apiKey) {
    throw new Error("FREEIMAGE_API_KEY is missing");
  }

  try {
    const buffer = await downloadImageBuffer(imageUrl);
    const payload = new URLSearchParams();
    payload.append("key", apiKey);
    payload.append("action", "upload");
    payload.append("format", "json");
    payload.append("source", buffer.toString("base64"));

    const response = await axios.post(
      "https://freeimage.host/api/1/upload",
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 45000,
        maxBodyLength: Infinity,
      },
    );

    const data = response?.data || {};
    const uploadedUrl =
      data?.image?.url ||
      data?.image?.display_url ||
      data?.url ||
      data?.data?.url;

    if (!uploadedUrl) {
      throw new Error("Freeimage response missing URL");
    }

    return uploadedUrl;
  } catch (error) {
    console.error(`[Freeimage] Upload failed:`, error.message);
    return imageUrl;
  }
}

module.exports = {
  uploadToFreeImage,
};

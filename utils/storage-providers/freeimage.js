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
    const payload = new URLSearchParams();
    payload.append("key", apiKey);
    payload.append("action", "upload");
    payload.append("format", "json");
    // Fast path: let Freeimage fetch directly from source URL.
    payload.append("source", imageUrl);

    let response = await axios.post(
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

    let data = response?.data || {};
    let uploadedUrl =
      data?.image?.url ||
      data?.image?.display_url ||
      data?.url ||
      data?.data?.url;

    // Fallback: some remote sources are rejected; retry with base64 upload.
    if (!uploadedUrl) {
      const buffer = await downloadImageBuffer(imageUrl);
      const fallbackPayload = new URLSearchParams();
      fallbackPayload.append("key", apiKey);
      fallbackPayload.append("action", "upload");
      fallbackPayload.append("format", "json");
      fallbackPayload.append("source", buffer.toString("base64"));

      response = await axios.post(
        "https://freeimage.host/api/1/upload",
        fallbackPayload.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 45000,
          maxBodyLength: Infinity,
        },
      );

      data = response?.data || {};
      uploadedUrl =
        data?.image?.url ||
        data?.image?.display_url ||
        data?.url ||
        data?.data?.url;
    }

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

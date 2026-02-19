require("dotenv").config();
const axios = require("axios");

async function testApi() {
  // Example chapter ID from previous context
  const chapterId = "1516"; // From https://comix.to/title/9dmm0.../1516-chapter-1
  const apiUrl = `https://comix.to/api/v2/chapter/${chapterId}/images`;

  console.log(`Testing URL: ${apiUrl}`);

  const cookieHeader = [
    process.env.CF_CLEARANCE && `cf_clearance=${process.env.CF_CLEARANCE}`,
    process.env.COMIX_SSID && `SSID=${process.env.COMIX_SSID}`,
    process.env.COMIX_XSRF_TOKEN &&
      `xsrf-token=${process.env.COMIX_XSRF_TOKEN}`,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://comix.to/",
        Cookie: cookieHeader,
      },
      timeout: 10000,
    });

    console.log("Response Status:", response.status);
    console.log(
      "Response Data Structure:",
      JSON.stringify(response.data, null, 2).substring(0, 500) + "...",
    );

    if (
      response.data.status === 200 &&
      response.data.result &&
      response.data.result.images
    ) {
      console.log("✅ SUCCESS! Found images array.");
      console.log("Image count:", response.data.result.images.length);
      console.log("First image URL:", response.data.result.images[0].url);
    } else {
      console.log("❌ FAILED: Unexpected data structure.");
    }
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
  }
}

testApi();

const axios = require("axios");
const cheerio = require("cheerio");

async function testTypeScraping() {
  const response = await axios.get(
    "https://comix.to/title/rm2xv-the-grand-dukes-bride-is-a-hellborn-warrior",
  );
  const $ = cheerio.load(response.data);

  // Try to find type directly from links
  const typeLink = $(
    'a[href*="types=manhwa"], a[href*="types=manga"], a[href*="types=manhua"]',
  ).first();
  console.log("Type from link text:", typeLink.text());
  console.log("Type from link href:", typeLink.attr("href"));

  // Also check if it's in metadata
  const metadataList = $("#metadata");
  console.log("\nMetadata HTML:", metadataList.html()?.substring(0, 500));
}

testTypeScraping().catch(console.error);

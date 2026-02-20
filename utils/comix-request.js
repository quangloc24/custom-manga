const { HttpsProxyAgent } = require('https-proxy-agent');

function getAxiosProxyConfig() {
  if (!process.env.PROXY_URL) return {};

  try {
    const proxyUrl = new URL(process.env.PROXY_URL);
    const normalizedProxy = `${proxyUrl.protocol}//${proxyUrl.username ? `${proxyUrl.username}:${proxyUrl.password}@` : ''}${proxyUrl.host}`;
    const agent = new HttpsProxyAgent(normalizedProxy, {
      keepAlive: true,
    });

    // Force Axios to use explicit tunneling agent instead of built-in proxy mode.
    return {
      proxy: false,
      httpAgent: agent,
      httpsAgent: agent,
    };
  } catch (error) {
    console.warn(`[HTTP] Invalid PROXY_URL, using direct Axios connection: ${error.message}`);
    return {};
  }
}

function buildComixHeaders({
  userAgent,
  cookie,
  referer = 'https://comix.to/',
  origin = 'https://comix.to',
  accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
}) {
  const headers = {
    'User-Agent': userAgent,
    Accept: accept,
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: referer,
    Origin: origin,
    Connection: 'keep-alive',
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

module.exports = {
  getAxiosProxyConfig,
  buildComixHeaders,
};

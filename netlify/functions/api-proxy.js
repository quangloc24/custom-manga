exports.handler = async (event) => {
  const targetBase = (process.env.API_PROXY_TARGET || "").trim().replace(/\/+$/, "");

  if (!targetBase) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing API_PROXY_TARGET" }),
    };
  }

  const pathPart = event.path.replace(/^\/\.netlify\/functions\/api-proxy/, "") || "/";
  const query = event.rawQuery ? `?${event.rawQuery}` : "";
  const upstreamUrl = `${targetBase}${pathPart}${query}`;

  const headers = { ...event.headers };
  delete headers.host;
  delete headers["x-forwarded-host"];
  delete headers["x-nf-request-id"];

  const requestInit = {
    method: event.httpMethod,
    headers,
  };

  if (!["GET", "HEAD"].includes(event.httpMethod)) {
    if (event.isBase64Encoded) {
      requestInit.body = Buffer.from(event.body || "", "base64");
    } else {
      requestInit.body = event.body || "";
    }
  }

  try {
    const response = await fetch(upstreamUrl, requestInit);
    const responseBuffer = Buffer.from(await response.arrayBuffer());

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      responseHeaders[key] = value;
    });

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "Upstream request failed",
        message: error && error.message ? error.message : "Unknown error",
      }),
    };
  }
};

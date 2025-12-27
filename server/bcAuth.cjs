// server/bcAuth.cjs
"use strict";

/**
 * bcAuth.cjs
 * Shared Business Central auth + fetch wrapper
 * - Token cache keyed by tenantId+clientId+scope
 * - Retry for 429/5xx with exponential backoff
 */

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // Node < 18
    fetchFn = require("node-fetch");
  } catch (_e) {
    throw new Error(
      "fetch is not available (Node < 18) and node-fetch is not installed. Run: npm i node-fetch"
    );
  }
}

const tokenCache = new Map(); // key -> { token, expiresAtMs }

function cacheKey({ tenantId, clientId, scope }) {
  return `${tenantId}::${clientId}::${
    scope || "https://api.businesscentral.dynamics.com/.default"
  }`;
}

async function getAccessToken({
  tenantId,
  clientId,
  clientSecret,
  scope = "https://api.businesscentral.dynamics.com/.default",
}) {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "bcAuth.getAccessToken: missing tenantId/clientId/clientSecret"
    );
  }

  const key = cacheKey({ tenantId, clientId, scope });
  const now = Date.now();

  const cached = tokenCache.get(key);
  if (cached?.token && cached.expiresAtMs - 30_000 > now) {
    return cached.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope,
    grant_type: "client_credentials",
  });

  const res = await fetchFn(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to get token: ${res.status} ${text}`);
  }

  const json = JSON.parse(text);
  if (!json.access_token)
    throw new Error("Token response missing access_token");

  const expiresInSec = Number(json.expires_in || 3599);
  tokenCache.set(key, {
    token: json.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  });

  return json.access_token;
}

async function fetchJsonWithRetry(
  url,
  { accessToken, preferMaxPageSize = 10000 },
  opts = {}
) {
  const { retries = 6, baseDelayMs = 500, maxDelayMs = 8000 } = opts;

  if (!accessToken)
    throw new Error("bcAuth.fetchJsonWithRetry: missing accessToken");

  let attempt = 0;
  while (true) {
    attempt++;

    const res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Prefer: `odata.maxpagesize=${preferMaxPageSize}`,
      },
    });

    const text = await res.text();

    if (res.ok) {
      return JSON.parse(text);
    }

    const retryable = [429, 500, 502, 503, 504].includes(res.status);
    if (!retryable || attempt > retries) {
      throw new Error(`OData fetch failed ${res.status}: ${text}`);
    }

    const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
    await new Promise((r) => setTimeout(r, delay));
  }
}

module.exports = {
  getAccessToken,
  fetchJsonWithRetry,
  getAccessTokenCached: getAccessToken,
};

// Deploy this file as a Cloudflare Worker when the frontend stays on GitHub Pages.
// Set ALLOWED_ORIGINS to your GitHub Pages origin(s).
const ALLOWED_ORIGINS = [
  'https://YOUR-USERNAME.github.io'
];

const ROBLOX_ENDPOINTS = [
  (assetId) => `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
  (assetId) => `https://assetdelivery.roblox.com/v1/assetId/${assetId}`,
  (assetId) => `https://assetdelivery.roblox.com/v2/assetId/${assetId}`
];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
    const cors = corsOrigin
      ? {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Accept, Content-Type',
          'Vary': 'Origin'
        }
      : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: corsOrigin ? 204 : 403, headers: cors });
    }
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405, cors);

    const match = url.pathname.match(/^\/api\/creator-store\/asset\/(\d+)\/?$/);
    if (!match) return json({ error: 'Not Found' }, 404, cors);
    if (!corsOrigin) return json({ error: 'Origin not allowed. Configure ALLOWED_ORIGINS in the Worker.' }, 403);

    const assetId = match[1];
    let lastStatus = 502;
    let lastDetail = '';

    for (const makeUrl of ROBLOX_ENDPOINTS) {
      try {
        const upstream = await fetch(makeUrl(assetId), {
          headers: {
            'Accept': 'application/octet-stream, application/xml, text/xml, */*',
            'User-Agent': 'rbxm2SL-creator-store/1.3'
          }
        });

        if (upstream.ok) {
          const headers = new Headers(cors);
          headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
          headers.set('Cache-Control', 'no-store');
          headers.set('X-Roblox-Asset-Id', assetId);
          headers.set('X-Roblox-Asset-Endpoint', makeUrl(assetId));
          return new Response(upstream.body, { status: 200, headers });
        }

        lastStatus = upstream.status;
        lastDetail = (await upstream.text().catch(() => '')).slice(0, 1000);
        if (upstream.status !== 404) break;
      } catch (error) {
        lastStatus = 502;
        lastDetail = error?.message || String(error);
      }
    }

    return json({
      error: `Roblox Asset Delivery tidak mengembalikan asset yang dapat diunduh (HTTP ${lastStatus}).`,
      detail: lastDetail,
      assetId
    }, lastStatus, cors);
  }
};

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra
    }
  });
}

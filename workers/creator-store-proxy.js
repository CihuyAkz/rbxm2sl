// Deploy this file as a Cloudflare Worker when the frontend stays on GitHub Pages.
// Set ALLOWED_ORIGINS to a comma-separated list of your GitHub Pages origins.
// Example: const ALLOWED_ORIGINS = ['https://username.github.io'];
const ALLOWED_ORIGINS = [
  'https://YOUR-USERNAME.github.io'
];

const ROBLOX_PREFIX = 'https://assetdelivery.roblox.com/v2/assetId/';

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

    if (request.method !== 'GET') {
      return json({ error: 'Method Not Allowed' }, 405, cors);
    }

    const match = url.pathname.match(/^\/api\/creator-store\/asset\/(\d+)\/?$/);
    if (!match) return json({ error: 'Not Found' }, 404, cors);
    if (!corsOrigin) return json({ error: 'Origin not allowed. Configure ALLOWED_ORIGINS in the Worker.' }, 403);

    const assetId = match[1];
    try {
      const upstream = await fetch(ROBLOX_PREFIX + assetId, {
        headers: {
          'Accept': 'application/octet-stream, application/xml, text/xml, */*',
          'User-Agent': 'rbxm2SL-creator-store/1.2'
        }
      });

      if (!upstream.ok) {
        const detail = (await upstream.text().catch(() => '')).slice(0, 1000);
        return json({ error: `Roblox returned HTTP ${upstream.status}.`, detail }, upstream.status, cors);
      }

      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Roblox-Asset-Id', assetId);
      return new Response(upstream.body, { status: 200, headers });
    } catch (error) {
      return json({
        error: 'Proxy gagal menghubungi Roblox Asset Delivery.',
        detail: error?.message || String(error)
      }, 502, cors);
    }
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

export async function onRequestGet(context) {
  const assetId = context.params.assetId;
  if (!/^\d+$/.test(assetId || '')) {
    return json({ error: 'Invalid assetId.' }, 400);
  }

  const candidates = [
    `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(assetId)}`,
    `https://assetdelivery.roblox.com/v1/assetId/${encodeURIComponent(assetId)}`,
    `https://assetdelivery.roblox.com/v2/assetId/${encodeURIComponent(assetId)}`
  ];

  let lastStatus = 502;
  let lastDetail = '';

  for (const target of candidates) {
    try {
      const upstream = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'Accept': 'application/octet-stream, application/xml, text/xml, */*',
          'User-Agent': 'rbxm2SL-creator-store/1.3'
        }
      });

      if (upstream.ok) {
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'no-store');
        headers.set('X-Roblox-Asset-Id', assetId);
        headers.set('X-Roblox-Asset-Endpoint', target);
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
    assetId,
    tried: candidates
  }, lastStatus);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet(context) {
  const assetId = context.params.assetId;
  if (!/^\d+$/.test(assetId || '')) {
    return json({ error: 'Invalid assetId.' }, 400);
  }

  const target = `https://assetdelivery.roblox.com/v2/assetId/${encodeURIComponent(assetId)}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'application/octet-stream, application/xml, text/xml, */*',
        'User-Agent': 'rbxm2SL-creator-store/1.2'
      }
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 1000);
      return json({
        error: `Roblox returned HTTP ${upstream.status}.`,
        detail
      }, upstream.status);
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Roblox-Asset-Id', assetId);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return json({
      error: 'Proxy gagal menghubungi Roblox Asset Delivery.',
      detail: error?.message || String(error)
    }, 502);
  }
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

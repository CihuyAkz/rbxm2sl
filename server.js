'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(data);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

function safeAssetId(value) {
  return /^\d+$/.test(value) ? value : null;
}

async function proxyCreatorAsset(res, assetId) {
  const id = safeAssetId(assetId);
  if (!id) {
    sendJson(res, 400, { error: 'Invalid assetId.' });
    return;
  }

  const target = `https://assetdelivery.roblox.com/v2/assetId/${encodeURIComponent(id)}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'application/octet-stream, application/xml, text/xml, */*',
        'User-Agent': 'rbxm2SL-local-proxy/1.0'
      }
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      sendJson(res, upstream.status, {
        error: `Roblox returned HTTP ${upstream.status}.`,
        detail: detail.slice(0, 1000)
      });
      return;
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_ASSET_BYTES) {
      sendJson(res, 413, { error: 'Asset terlalu besar untuk proxy lokal ini.' });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_ASSET_BYTES) {
      sendJson(res, 413, { error: 'Asset terlalu besar untuk proxy lokal ini.' });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
      'X-Roblox-Asset-Id': id
    };

    send(res, 200, buffer, headers);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Proxy gagal menghubungi Roblox Asset Delivery.',
      detail: error && error.message ? error.message : String(error)
    });
  }
}

function serveStatic(req, res, pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  try {
    requested = decodeURIComponent(requested);
  } catch {
    send(res, 400, 'Bad Request');
    return;
  }

  const filePath = path.resolve(ROOT, '.' + requested);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      send(res, 404, 'Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    stream.on('error', () => {
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.destroy();
    });
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/creator-store/asset/')) {
    const assetId = requestUrl.pathname.split('/').pop();
    await proxyCreatorAsset(res, assetId);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  if (req.method === 'HEAD') {
    const filePath = path.resolve(ROOT, requestUrl.pathname === '/' ? 'index.html' : '.' + requestUrl.pathname);
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return send(res, 404, 'Not Found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end();
    });
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`rbxm2SL running at http://${HOST}:${PORT}`);
  console.log('Creator Store imports use the local proxy endpoint /api/creator-store/asset/:assetId');
});

(function () {
  'use strict';

  var input = document.getElementById('creatorAssetInput');
  var button = document.getElementById('creatorImportBtn');
  var status = document.getElementById('creatorStoreStatus');
  if (!input || !button || !status) return;

  function creatorStatus(message, kind) {
    status.textContent = message;
    status.classList.remove('success', 'error', 'loading');
    if (kind) status.classList.add(kind);
  }

  function extractAssetId(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return raw;

    var match = raw.match(/(?:create\.roblox\.com\/store\/asset\/|www\.roblox\.com\/library\/|roblox\.com\/library\/)(\d+)/i);
    if (match) return match[1];

    match = raw.match(/rbxassetid:\/\/(\d+)/i);
    if (match) return match[1];

    match = raw.match(/(?:^|[^\d])(\d{5,})(?:[^\d]|$)/);
    return match ? match[1] : null;
  }

  function looksLikeXml(bytes) {
    if (!bytes || !bytes.length) return false;
    var i = 0;
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
    while (i < bytes.length && (bytes[i] === 0x09 || bytes[i] === 0x0A || bytes[i] === 0x0D || bytes[i] === 0x20)) i++;
    return bytes[i] === 0x3C;
  }

  function looksLikeBinaryRoblox(bytes) {
    if (!bytes || bytes.length < 8) return false;
    return new TextDecoder().decode(bytes.subarray(0, 8)) === '<roblox!';
  }

  function getProxyBase() {
    var configured = (window.RBXM2SL_CONFIG && window.RBXM2SL_CONFIG.CREATOR_STORE_PROXY_URL) || '';
    configured = String(configured).trim();
    if (configured) return configured.replace(/\/+$/, '') + '/';

    if (location.protocol === 'file:') {
      throw new Error('Project dibuka dari file://. Jalankan start.bat/start.sh atau deploy ke hosting yang menjalankan API.');
    }

    // GitHub Pages is static-only, so /api/... does not exist there.
    if (/(^|\.)github\.io$/i.test(location.hostname)) {
      throw new Error('GitHub Pages tidak menyediakan /api. Deploy workers/creator-store-proxy.js sebagai Cloudflare Worker lalu isi CREATOR_STORE_PROXY_URL di config.js.');
    }

    return '/api/creator-store/asset/';
  }

  async function fetchCreatorAsset(assetId) {
    var endpoint = getProxyBase() + encodeURIComponent(assetId);
    var response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/octet-stream, application/xml, text/xml, */*' }
    });

    if (!response.ok) {
      var detail = '';
      try {
        var json = await response.json();
        detail = json && (json.error || json.detail) ? ' ' + (json.error || json.detail) : '';
      } catch (_) {}
      if (response.status === 404 && !detail) {
        detail = ' Endpoint proxy tidak ditemukan. Pastikan URL proxy/Cloudflare Worker sudah benar.';
      }
      throw new Error('Gagal mengambil asset (HTTP ' + response.status + ').' + detail);
    }

    return response;
  }

  async function importFromCreatorStore() {
    var source = input.value.trim();
    var assetId = extractAssetId(source);

    if (!assetId) {
      creatorStatus('Asset ID / Creator Store URL tidak valid.', 'error');
      input.focus();
      return;
    }

    button.disabled = true;
    var configuredProxy = (window.RBXM2SL_CONFIG && window.RBXM2SL_CONFIG.CREATOR_STORE_PROXY_URL) || '';
    creatorStatus('Mengambil asset ' + assetId + (configuredProxy ? ' melalui Creator Store proxy...' : ' melalui API project...'), 'loading');
    setStatus('Downloading Creator Store asset ' + assetId + '...');

    try {
      var response = await fetchCreatorAsset(assetId);
      var buffer = await response.arrayBuffer();
      var bytes = new Uint8Array(buffer);
      if (!bytes.length) throw new Error('Roblox mengembalikan file kosong.');

      var contentType = (response.headers.get('content-type') || '').toLowerCase();
      var asXml = contentType.indexOf('xml') !== -1 || looksLikeXml(bytes);
      var asBinary = contentType.indexOf('x-rbxm') !== -1 || looksLikeBinaryRoblox(bytes);

      if (!asXml && !asBinary) {
        throw new Error('Asset berhasil diambil, tetapi formatnya bukan .rbxm/.rbxmx yang dapat dibaca parser ini.');
      }

      if (asXml) {
        setStatus('Creator Store asset detected as XML. Parsing...');
        parseXML(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
      } else {
        setStatus('Creator Store asset detected as binary. Parsing...');
        parseBinary(bytes);
      }

      creatorStatus('Berhasil mengimpor asset ' + assetId + ' (' + fmtSize(bytes.byteLength) + ').', 'success');
      setStatus('Successfully imported Creator Store asset ' + assetId + ' from Roblox.');

      window.LAST_CREATOR_STORE_IMPORT = {
        assetId: assetId,
        source: source || ('Asset ID ' + assetId),
        bytes: bytes.byteLength,
        importedAt: new Date().toISOString()
      };
    } catch (error) {
      var msg = error && error.message ? error.message : String(error);
      creatorStatus('Gagal mengimpor: ' + msg, 'error');
      setStatus('Creator Store import failed.');
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener('click', importFromCreatorStore);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') importFromCreatorStore();
  });
})();

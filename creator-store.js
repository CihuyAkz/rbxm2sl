(function () {
  'use strict';

  var input = document.getElementById('creatorAssetInput');
  var button = document.getElementById('creatorImportBtn');
  var status = document.getElementById('creatorStoreStatus');
  if (!input || !button || !status) return;

  var DEFAULT_URL = 'https://create.roblox.com/store/asset/80608769509945/NPC-Dialogue-System';
  input.value = '';

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
    var magic = new TextDecoder().decode(bytes.subarray(0, 8));
    return magic === '<roblox!';
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
    creatorStatus('Mengambil asset ' + assetId + ' dari Roblox Asset Delivery...', 'loading');
    setStatus('Downloading Creator Store asset ' + assetId + '...');

    try {
      var response = await fetch('https://assetdelivery.roblox.com/v2/assetId/' + encodeURIComponent(assetId), {
        method: 'GET',
        credentials: 'omit',
        redirect: 'follow',
        headers: { 'Accept': 'application/octet-stream, application/xml, text/xml, */*' }
      });

      if (!response.ok) {
        throw new Error('Roblox returned HTTP ' + response.status + '. Asset mungkin private, restricted, dihapus, atau tidak dapat diakses.');
      }

      var buffer = await response.arrayBuffer();
      var bytes = new Uint8Array(buffer);
      if (!bytes.length) throw new Error('Roblox mengembalikan file kosong.');

      var contentType = (response.headers.get('content-type') || '').toLowerCase();
      var asXml = contentType.indexOf('xml') !== -1 || looksLikeXml(bytes);
      var asBinary = contentType.indexOf('x-rbxm') !== -1 || looksLikeBinaryRoblox(bytes);

      if (!asXml && !asBinary) {
        throw new Error('Asset berhasil diambil, tetapi formatnya bukan .rbxm/.rbxmx yang bisa dibaca parser ini.');
      }

      // Reuse the existing parser instead of duplicating the large parser code.
      if (asXml) {
        setStatus('Creator Store asset detected as XML. Parsing...');
        parseXML(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
      } else {
        setStatus('Creator Store asset detected as binary. Parsing...');
        parseBinary(bytes);
      }

      var displaySource = source || ('Asset ID ' + assetId);
      creatorStatus('Berhasil mengimpor asset ' + assetId + ' (' + fmtSize(bytes.byteLength) + ').', 'success');
      setStatus('Successfully imported Creator Store asset ' + assetId + ' from Roblox.');

      // Preserve a small audit trail without storing the whole downloaded file.
      window.LAST_CREATOR_STORE_IMPORT = {
        assetId: assetId,
        source: displaySource,
        bytes: bytes.byteLength,
        importedAt: new Date().toISOString()
      };
    } catch (error) {
      var msg = error && error.message ? error.message : String(error);
      var corsHint = /failed to fetch|networkerror|cors/i.test(msg)
        ? ' Browser mungkin memblokir CORS; jalankan project melalui localhost/web server jika file dibuka langsung dari file://.'
        : '';
      creatorStatus('Gagal mengimpor: ' + msg + corsHint, 'error');
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

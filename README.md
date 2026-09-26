# rbxm2SL — split project + Creator Store import

Project dipisah menjadi HTML/CSS/JS agar `index.html` tidak membengkak. Import Creator Store menggunakan Roblox Asset Delivery melalui proxy/server-side function agar tidak terkena CORS browser.

## Opsi A — GitHub repo + Cloudflare Pages (disarankan)

Source code tetap berada di GitHub. Cloudflare Pages terhubung ke repository dan otomatis deploy saat push.

1. Push seluruh isi project ke repository GitHub.
2. Di Cloudflare dashboard pilih **Workers & Pages → Create application → Pages → Connect to Git**.
3. Pilih repository tersebut.
4. Untuk project ini tidak diperlukan build command khusus. Gunakan folder root sebagai output/static directory.
5. Deploy.

Folder `functions/` otomatis menjadi API route:

`/api/creator-store/asset/:assetId`

Frontend akan memakai route same-origin tersebut tanpa perlu mengubah `config.js`.

## Opsi B — Tetap GitHub Pages

GitHub Pages hanya menyediakan file statis; proxy server-side tidak bisa dijalankan langsung di GitHub Pages.

1. Deploy `workers/creator-store-proxy.js` sebagai Cloudflare Worker.
2. Di file `config.js`, isi:

`CREATOR_STORE_PROXY_URL: 'https://NAMA-WORKER.workers.dev/api/creator-store/asset/'`

3. Di `workers/creator-store-proxy.js`, ganti `YOUR-USERNAME` dengan origin GitHub Pages Anda, misalnya `https://username.github.io`.
4. Push perubahan ke GitHub Pages.

## Opsi C — Lokal

### Windows
Double-click `start.bat`, lalu buka `http://127.0.0.1:3000`.

### macOS/Linux
```bash
./start.sh
```

atau:

```bash
node server.js
```

## Creator Store

Bisa memasukkan:

- `80608769509945`
- `https://create.roblox.com/store/asset/80608769509945/NPC-Dialogue-System`
- `rbxassetid://80608769509945`

## Struktur

- `index.html` — markup UI
- `styles.css` — CSS
- `config.js` — konfigurasi URL proxy
- `app.js` — parser dan generator Lua
- `creator-store.js` — UI + client Creator Store
- `server.js` — server lokal + proxy
- `functions/api/creator-store/asset/[assetId].js` — Cloudflare Pages Function
- `workers/creator-store-proxy.js` — Cloudflare Worker untuk GitHub Pages
- `package.json` — script lokal
- `start.bat` / `start.sh` — launcher lokal

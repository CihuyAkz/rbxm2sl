# rbxm2SL — Split Project

Files are split so the main HTML stays small:

- `index.html` — UI markup only
- `styles.css` — all page styling
- `app.js` — existing Roblox `.rbxm/.rbxmx/.rbxl/.rbxlx` parser, tree UI, properties, and Lua generator
- `creator-store.js` — Creator Store URL/Asset ID importer

## Creator Store import

Paste a public Creator Store URL such as:

`https://create.roblox.com/store/asset/80608769509945/NPC-Dialogue-System`

The importer extracts the Asset ID, calls Roblox Asset Delivery `GET /v2/assetId/{assetId}`, receives the asset bytes, and sends them through the same binary/XML parser already used by local uploads.

For browser security, run the project through a local/static web server rather than opening `index.html` with `file://`. Access to an asset is still subject to Roblox's permissions/restrictions.

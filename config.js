// Optional deployment configuration.
// Leave CREATOR_STORE_PROXY_URL empty when the app and API are on the same origin
// (Cloudflare Pages Functions or the included local server).
// For GitHub Pages, set this to the public Worker URL that ends with:
//   /api/creator-store/asset/
// Example:
//   https://your-worker.your-subdomain.workers.dev/api/creator-store/asset/
window.RBXM2SL_CONFIG = Object.assign({
  CREATOR_STORE_PROXY_URL: ''
}, window.RBXM2SL_CONFIG || {});

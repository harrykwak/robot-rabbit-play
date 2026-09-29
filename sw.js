/* Robot Rabbit service worker.
 * tools/pwa-assets.mjs replaces the BUILD block in dist/sw.js with the exact public file inventory.
 * Only that inventory is ever written to Cache Storage, and only during install. Runtime responses
 * (invitations, SDP/query URLs, peer or identity data, anything off-list) are never stored. */
const BUILD = /* RR_BUILD_START */ {"version":"1.3.0","id":"1.3.0-4aec215f6419d6c2","files":[{"path":"THIRD_PARTY_NOTICES.md","size":1533,"sha256":"b5479d9c611cf1ab33d5d33b78cfc01eab7d5ba591b74f432033ca05fb8e3ea3"},{"path":"css/combat.css","size":1976,"sha256":"7ddb389b9127359dfe07ba9f45dccc3f0e8f59ab83fb68b9f7c1ff8bf027b4d8"},{"path":"css/extra.css","size":12328,"sha256":"45dd70c8c89fcf6f1efbc1fb21089f3a59412e350d868cbe39f303275a7e6c9a"},{"path":"css/mobile.css","size":32669,"sha256":"1ecb061beb943ff202fcbbdc2a078c205807b5508a0b96c86dc8ff2145d9c8cf"},{"path":"css/peers.css","size":2567,"sha256":"d0f1ad05461f9430bf2cbd8c5a1db2b144d24be2b955bcd8d4a0c3caedd1ea65"},{"path":"css/style.css","size":39938,"sha256":"c19215a2125c5c0b7996cbaf643f8bebe90623e6fe927ffab62b70a228c2eb03"},{"path":"icons/apple-touch-icon.png","size":3041,"sha256":"5df62bc7c1b891604d2cb83fa9ed152af67aa5cc0193058c19d4c3610ef68fb2"},{"path":"icons/icon-192.png","size":4089,"sha256":"d689bd4edc8f1de3a3d62cfa80a3a9e2a73b6556c474824f6ace34f493eda54d"},{"path":"icons/icon-512.png","size":11856,"sha256":"0f3ee8f8e2671b0e46e632f969e6d5338bd605576228030259115575f2beddcb"},{"path":"icons/icon-maskable-512.png","size":7982,"sha256":"6e56bfab0c32e431833f1f2a27a641513a1ead28d6cf49af9ba2841f50cfe974"},{"path":"icons/rabbit.svg","size":562,"sha256":"ff9b21ea20e566edd2d8a229c95f8cb4fb4ca09e6ac4761c30f31334c1475956"},{"path":"index.html","size":19053,"sha256":"cfbead207980e1af1d5ea234f91189d406c6b609e7deaa9faf404a688aafbcd5"},{"path":"js/actions.js","size":27740,"sha256":"ec87f62d296d0bfaa4ae8546a23f04912d3efa35e147f688014d4a4854000706"},{"path":"js/ai.js","size":16911,"sha256":"90f7bb187fb688f758a66085fc4844f49156423f6b653f771bdc6c19b06c81a8"},{"path":"js/arena.js","size":42597,"sha256":"668cfa9078e9271a4aac732d06e40b6638e3f51aa1674f60101a634b47e3772a"},{"path":"js/audio.js","size":37046,"sha256":"506e8a588fd23e39695ec6211226dfe8e1d34b98a3eda50f2658a233365346a9"},{"path":"js/boot.js","size":954,"sha256":"a419115caa0a5bb6b198bfb0559d91c3dd8a8052fe07f080328f9b7dd9f89201"},{"path":"js/campaign.js","size":10326,"sha256":"22da6906b5539f4d5690415ef1806c00cc65e7ae3758a615b8a1ca3337bfa3b5"},{"path":"js/control-labels.js","size":644,"sha256":"cde9179e798c9f1a781b17f6f267d08732600cfc239f492a95c437f546d24f61"},{"path":"js/data.js","size":9862,"sha256":"2abfc16716d59c2e37724e93934902ff10ce94699f72f4121e2db4a4ff177b7c"},{"path":"js/entities.js","size":41127,"sha256":"5442ca4dfc27303abb126a97094e0a7f3835ebe4a634ba597c5102bd2161a2c2"},{"path":"js/frame-budget.js","size":3871,"sha256":"ebc50a65d12327d6da38fa68b97807d7ebd52b577f316155e3e6c498deaf25fe"},{"path":"js/fx.js","size":35302,"sha256":"3920975c0f8ecc95c03be8991c08c18f2ce0cbafb36f6a713f47cf267d5438af"},{"path":"js/game.js","size":58497,"sha256":"90c0be273b967982205e9fd09a1817bde6662038dbdeb124448bcb4c3664571c"},{"path":"js/input.js","size":14621,"sha256":"6a9bb4f302d116ff0edfa0873f852104e8e3903e959ef61199fd3e95cf2b41df"},{"path":"js/install.js","size":11962,"sha256":"1c5451ac8c24eee05dc70ace438dd10bedc0a698b9a55cc00d02f196e915f4d6"},{"path":"js/main.js","size":46921,"sha256":"d3948a23c6096347eaf3fb46239ee55a9d4c252b0e7391b3c53c2547be8a1da4"},{"path":"js/model-quality.js","size":2926,"sha256":"b30de742002b39f3de4f8f911175d46f9428fa1dd98d461bfaa6afabc715c81f"},{"path":"js/models.js","size":24831,"sha256":"b388b44bda3358b83b2c421f1d6205b1d53c7b089bfe0d21ac64abc50fc3b4b1"},{"path":"js/peer-link.js","size":9942,"sha256":"206e53185a31953159766485cd3f6119195a4567373750a7c0933f3cb72cb906"},{"path":"js/peer-lobby.js","size":11559,"sha256":"5da6cdb5b111173c672e76d384ec25e902f7ace34322f00a800689c95a34d793"},{"path":"js/peer-match.js","size":12913,"sha256":"aa49eb47d9af3a7a99597e95b99b8ae8c3d776b9bef532e839665936a85f9955"},{"path":"js/peer-protocol.js","size":4623,"sha256":"3cc7f216e1b71296a9c8e93e4e667396755320f46e6b9bc8601591bfeb2dbffd"},{"path":"js/peer-session.js","size":7159,"sha256":"7e058b2bb6808e224d34b226607e4badb5eaa28bac1fd72fff41cb57356ce5d6"},{"path":"js/poses.js","size":3384,"sha256":"2465ce5325e09acfe52f71aced705e4ba93f671732a01340d3709acfcb0c7e27"},{"path":"js/preferences.js","size":1394,"sha256":"f84ff376e6ad48fa4ec0251770146856279f7b90d082a371a4ed185d2d9be371"},{"path":"js/touch.js","size":7842,"sha256":"6e1229f8e908c0eb494876b7c778f23feb409a41478855c29c4210b996563cb2"},{"path":"js/ui.js","size":14788,"sha256":"0cc491f69310a5ebd664951b3c0b6b7adf2dc8c94dcffe21d9d4b0e31876e913"},{"path":"manifest.webmanifest","size":864,"sha256":"d02c1ed3dc50afb5f07b3103f957821e172660a602843befffd188e1181bdf55"},{"path":"vendor/LICENSE","size":1081,"sha256":"8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc"},{"path":"vendor/LICENSE-Apache-2.0.txt","size":11358,"sha256":"cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"},{"path":"vendor/addons/geometries/RoundedBoxGeometry.js","size":6470,"sha256":"c5feab96123858ed8823c889b238dc8734adab7e760e3cfd21e7f3f2f3e348e3"},{"path":"vendor/addons/postprocessing/EffectComposer.js","size":8501,"sha256":"4e079a5886152d7e529a59aef644e968ab4d32c6a33ce016b36bf29b2eac26f7"},{"path":"vendor/addons/postprocessing/MaskPass.js","size":4694,"sha256":"7cd08eee9d5d6f5578beaddbdcbe9c384f6873810af27f22ab7db3ceeb127aa3"},{"path":"vendor/addons/postprocessing/OutputPass.js","size":4184,"sha256":"02e4a261af34de71338185e9e87f0cbe5cba9115608d984363e1269dec1d2272"},{"path":"vendor/addons/postprocessing/Pass.js","size":4218,"sha256":"444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5"},{"path":"vendor/addons/postprocessing/RenderPass.js","size":4280,"sha256":"817f6c3cdcd0fd41515d112359ea0532568eefb5aabd3b33903957ebca1b8a6a"},{"path":"vendor/addons/postprocessing/ShaderPass.js","size":3228,"sha256":"e2500a5913b26bbf5148ceaae644c6edcff06a18b01494ee37bf856353d2ab9d"},{"path":"vendor/addons/postprocessing/UnrealBloomPass.js","size":15397,"sha256":"ba8f2fcadfa6588384c9473498f974d81d120f02f0e63a0e59c265202a006b5a"},{"path":"vendor/addons/shaders/CopyShader.js","size":729,"sha256":"a33057d5ac91c43304c186ac0e8816e62bb2ed471d3a00ff3018dfd5c0389718"},{"path":"vendor/addons/shaders/LuminosityHighPassShader.js","size":1291,"sha256":"5044f780b6e6cf863947f64c36fe1587132f7fbe395ada863cd1e5f0388dcf1e"},{"path":"vendor/addons/shaders/OutputShader.js","size":1876,"sha256":"353479f77a8d7e2629d49ccac9fc2f5dbfdda5442e0adf867b00377a2fcb0cb2"},{"path":"vendor/three.core.js","size":1458113,"sha256":"9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6"},{"path":"vendor/three.module.js","size":662772,"sha256":"9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea"}]} /* RR_BUILD_END */;
const PREFIX = 'rr-shell-';
const CACHE = PREFIX + BUILD.id;
const SCOPE = new URL(self.registration.scope);
const ENTRY = 'index.html';
const toURL = (path) => new URL(path, SCOPE).href;
const PATHS = new Set(BUILD.files.map((file) => new URL(file.path, SCOPE).pathname));

async function sha256(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

// All-or-nothing: every file is fetched and verified before anything is stored.
async function precache() {
  if (!BUILD.files.length) return;
  await caches.delete(CACHE);
  const entries = await Promise.all(BUILD.files.map(async (file) => {
    const key = toURL(file.path);
    // Fetch the page through the scope URL: some static hosts redirect /index.html to /.
    const source = file.path === ENTRY ? SCOPE.href : key;
    const response = await fetch(new Request(source, { cache: 'reload', credentials: 'same-origin', redirect: 'error' }));
    if (!response.ok || response.type !== 'basic' || response.redirected) throw new Error('Precache failed: ' + file.path + ' (' + response.status + ')');
    const body = await response.arrayBuffer();
    if (body.byteLength !== file.size || await sha256(body) !== file.sha256) throw new Error('Precache content mismatch: ' + file.path);
    const headers = new Headers();
    const type = response.headers.get('content-type');
    if (type) headers.set('content-type', type);
    return [key, new Response(body, { status: 200, headers })];
  }));
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  // No skipWaiting here: an update waits until the page asks (outside a match) or every tab closes.
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    // An unbuilt (development) worker has nothing to serve; remove it instead of lingering.
    if (!BUILD.files.length) { await self.registration.unregister(); return; }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'RR_SKIP_WAITING') self.skipWaiting();
  else if (type === 'RR_GET_BUILD' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: BUILD.version, id: BUILD.id, files: BUILD.files.length });
  }
});

function cacheKey(request) {
  if (request.method !== 'GET' || !BUILD.files.length) return null;
  if (request.headers && request.headers.has('range')) return null;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  if (request.mode === 'navigate') {
    // Only the game page itself falls back to the cached HTML; query/hash (e.g. an invite) stay in the URL only.
    const rel = url.pathname.slice(SCOPE.pathname.length);
    return rel === '' || rel === ENTRY ? toURL(ENTRY) : null;
  }
  if (url.search || !PATHS.has(url.pathname)) return null;
  return url.origin + url.pathname;
}

self.addEventListener('fetch', (event) => {
  const key = cacheKey(event.request);
  if (!key) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(key)) || fetch(event.request);
  })());
});

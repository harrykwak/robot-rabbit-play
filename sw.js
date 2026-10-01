/* Robot Rabbit service worker.
 * tools/pwa-assets.mjs replaces the BUILD block in dist/sw.js with the exact public file inventory.
 * Only that inventory is ever written to Cache Storage, and only during install. Runtime responses
 * (invitations, SDP/query URLs, peer or identity data, anything off-list) are never stored. */
const BUILD = /* RR_BUILD_START */ {"version":"1.8.0","id":"1.8.0-ca6291e615b519ab","files":[{"path":"THIRD_PARTY_NOTICES.md","size":1533,"sha256":"b5479d9c611cf1ab33d5d33b78cfc01eab7d5ba591b74f432033ca05fb8e3ea3"},{"path":"css/combat.css","size":12771,"sha256":"f8e3da3a7a9dd0fc19be7c4af3e4fbb2ce3b039f612b78a3264058adce9ed562"},{"path":"css/extra.css","size":12328,"sha256":"45dd70c8c89fcf6f1efbc1fb21089f3a59412e350d868cbe39f303275a7e6c9a"},{"path":"css/menus.css","size":21287,"sha256":"4189a2fd216c5b4cdf4f8c824f729c9311ab2431ff0e28ef0311c43aa76623fe"},{"path":"css/mobile.css","size":51326,"sha256":"b2fb048b0dd50220ec0c9fcfccf6a69f162aa82573bfb8232110de06a8792d8a"},{"path":"css/peers.css","size":2567,"sha256":"d0f1ad05461f9430bf2cbd8c5a1db2b144d24be2b955bcd8d4a0c3caedd1ea65"},{"path":"css/style.css","size":39938,"sha256":"c19215a2125c5c0b7996cbaf643f8bebe90623e6fe927ffab62b70a228c2eb03"},{"path":"icons/apple-touch-icon.png","size":3041,"sha256":"5df62bc7c1b891604d2cb83fa9ed152af67aa5cc0193058c19d4c3610ef68fb2"},{"path":"icons/icon-192.png","size":4089,"sha256":"d689bd4edc8f1de3a3d62cfa80a3a9e2a73b6556c474824f6ace34f493eda54d"},{"path":"icons/icon-512.png","size":11856,"sha256":"0f3ee8f8e2671b0e46e632f969e6d5338bd605576228030259115575f2beddcb"},{"path":"icons/icon-maskable-512.png","size":7982,"sha256":"6e56bfab0c32e431833f1f2a27a641513a1ead28d6cf49af9ba2841f50cfe974"},{"path":"icons/rabbit.svg","size":562,"sha256":"ff9b21ea20e566edd2d8a229c95f8cb4fb4ca09e6ac4761c30f31334c1475956"},{"path":"index.html","size":20639,"sha256":"179f5e7a7b679053310a3e009997a37f84262cc381701e8e021149f3adbf919b"},{"path":"js/actions.js","size":39884,"sha256":"43277dcfcda60bbb9ac2264c0b5759193b55bf1bc8e5de0be2b31f8fabe955eb"},{"path":"js/ai.js","size":21836,"sha256":"a0f1fefaac1f8fd086b07946ec6f949eaebd49231010bd8331cfbd484b1a8329"},{"path":"js/arena.js","size":46896,"sha256":"615afe394ca3990b05f06cdfd1f8f5779984e082657956da7fe021ccf774bace"},{"path":"js/audio.js","size":37046,"sha256":"50060a9072ae935b934a7ba37a34adbb172b0c89f45987b037c3484311d39bdc"},{"path":"js/boot.js","size":954,"sha256":"a419115caa0a5bb6b198bfb0559d91c3dd8a8052fe07f080328f9b7dd9f89201"},{"path":"js/camera-framing.js","size":4661,"sha256":"0c170f1f2216041952d4198e5d678890ab3d9c51604b2922eb42610b895b23d6"},{"path":"js/campaign.js","size":10326,"sha256":"22da6906b5539f4d5690415ef1806c00cc65e7ae3758a615b8a1ca3337bfa3b5"},{"path":"js/cockpit.js","size":3639,"sha256":"885b246dfeef9f42b6fb093ff9d345f74e0aba615ebb8016d0864c33200a35ab"},{"path":"js/control-labels.js","size":760,"sha256":"4251222f469a5450eed964d8ad83df4ab00ad0c1e00644199b077bd25f77d9df"},{"path":"js/data.js","size":22495,"sha256":"5679c810e06377206b59c124fc7879896153d4d19175704811f43b01c4cc5282"},{"path":"js/entities.js","size":70035,"sha256":"eebdf6127051b8118d84e4032b26497cdefbf4c665903c4eb94accc4a9f33feb"},{"path":"js/environment-art.js","size":24186,"sha256":"fecb3d721587752f4c48e18efe921e12f14ec574b48a5f23f8739ad58f866c8f"},{"path":"js/frame-budget.js","size":7469,"sha256":"a538974e5857f3db16b294c1597dcabd15051a4e80bff6b2d3c1bce3253bcc6a"},{"path":"js/fx.js","size":37809,"sha256":"ad526c70640afc33c16248468f283cbe13303a6b6e54614f684c8d4aa25ddd95"},{"path":"js/game.js","size":79825,"sha256":"52db0bf059ff223d85853451d217354fff53fb17f7453eece13a30301b197483"},{"path":"js/input.js","size":16879,"sha256":"6990f9922063a949d11c1412c13f5bcc736870d69a91100fb582ffb1caa26c5a"},{"path":"js/install.js","size":11962,"sha256":"1c5451ac8c24eee05dc70ace438dd10bedc0a698b9a55cc00d02f196e915f4d6"},{"path":"js/juice-station-models.js","size":19801,"sha256":"4ab021a830c19ab509578d5aba07c77f3d148b5a73931b0382c7ffd10c9fedbc"},{"path":"js/juice-stations.js","size":4988,"sha256":"c4f56b07d3187223b772dd73994511971d36a66be1c9f9a3460662f1ea8f8c4a"},{"path":"js/main.js","size":57794,"sha256":"0bc9c5c0eaeed8f53d4a6bdccece978cae48724f74b7668e1c2487fa2ef1d916"},{"path":"js/model-quality.js","size":2926,"sha256":"b30de742002b39f3de4f8f911175d46f9428fa1dd98d461bfaa6afabc715c81f"},{"path":"js/models.js","size":56547,"sha256":"5131006cf502c1df6a8fd6d185ed07f4281a3fe1e12ce8d96ee99ff842e53f8f"},{"path":"js/peer-link.js","size":9942,"sha256":"206e53185a31953159766485cd3f6119195a4567373750a7c0933f3cb72cb906"},{"path":"js/peer-lobby.js","size":11559,"sha256":"5da6cdb5b111173c672e76d384ec25e902f7ace34322f00a800689c95a34d793"},{"path":"js/peer-match.js","size":15651,"sha256":"78aaf7e2b223f9b09dbae3c41cf9c4df42b22c3b4e7afa259e3b5ba2d61977a5"},{"path":"js/peer-protocol.js","size":4873,"sha256":"c4ba75fee1256fc4485c60cfcd3b7a37e0b1715e2de1d3b5709ae78a9b9e55fc"},{"path":"js/peer-session.js","size":8460,"sha256":"795a2ca2d38083f54f5aab41385fe751790bc86f3b44cab51ad9769ca874168a"},{"path":"js/poses.js","size":3384,"sha256":"2465ce5325e09acfe52f71aced705e4ba93f671732a01340d3709acfcb0c7e27"},{"path":"js/preferences.js","size":1394,"sha256":"f84ff376e6ad48fa4ec0251770146856279f7b90d082a371a4ed185d2d9be371"},{"path":"js/rabbit-portraits.js","size":2357,"sha256":"9263d43fbaf959e9b31ea970d0c727a8b3f1b56f21a4e96ab46f0bce2c8b9345"},{"path":"js/robot-systems.js","size":4832,"sha256":"3daecbb98825da9bc2d4780d239b5bf6852e9b5247f6e547e85031843511aee9"},{"path":"js/touch-icons.js","size":3904,"sha256":"2be40bfb9ebf1ebb44d9acdb9709c5f3d3f08d45ce33648a8e187415166d3963"},{"path":"js/touch.js","size":16485,"sha256":"134f4b6e09439fc5ef17c1271e0c4d650599c7ca285c32b0db398c21a6d98aff"},{"path":"js/ui.js","size":29899,"sha256":"4d3f94ade12aef391c4faf7a5fc53938830a640f63f5c8e5e2522883d55eaf83"},{"path":"manifest.webmanifest","size":864,"sha256":"51389a7a33b4967afbf5e4439e0b0bebf45fa1757e49737c161059eb2c10888f"},{"path":"vendor/LICENSE","size":1081,"sha256":"8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc"},{"path":"vendor/LICENSE-Apache-2.0.txt","size":11358,"sha256":"cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"},{"path":"vendor/addons/geometries/RoundedBoxGeometry.js","size":6470,"sha256":"c5feab96123858ed8823c889b238dc8734adab7e760e3cfd21e7f3f2f3e348e3"},{"path":"vendor/addons/postprocessing/EffectComposer.js","size":8501,"sha256":"4e079a5886152d7e529a59aef644e968ab4d32c6a33ce016b36bf29b2eac26f7"},{"path":"vendor/addons/postprocessing/MaskPass.js","size":4694,"sha256":"7cd08eee9d5d6f5578beaddbdcbe9c384f6873810af27f22ab7db3ceeb127aa3"},{"path":"vendor/addons/postprocessing/OutputPass.js","size":4184,"sha256":"02e4a261af34de71338185e9e87f0cbe5cba9115608d984363e1269dec1d2272"},{"path":"vendor/addons/postprocessing/Pass.js","size":4218,"sha256":"444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5"},{"path":"vendor/addons/postprocessing/RenderPass.js","size":4280,"sha256":"817f6c3cdcd0fd41515d112359ea0532568eefb5aabd3b33903957ebca1b8a6a"},{"path":"vendor/addons/postprocessing/ShaderPass.js","size":3228,"sha256":"e2500a5913b26bbf5148ceaae644c6edcff06a18b01494ee37bf856353d2ab9d"},{"path":"vendor/addons/postprocessing/UnrealBloomPass.js","size":15397,"sha256":"ba8f2fcadfa6588384c9473498f974d81d120f02f0e63a0e59c265202a006b5a"},{"path":"vendor/addons/shaders/CopyShader.js","size":729,"sha256":"a33057d5ac91c43304c186ac0e8816e62bb2ed471d3a00ff3018dfd5c0389718"},{"path":"vendor/addons/shaders/LuminosityHighPassShader.js","size":1291,"sha256":"5044f780b6e6cf863947f64c36fe1587132f7fbe395ada863cd1e5f0388dcf1e"},{"path":"vendor/addons/shaders/OutputShader.js","size":1876,"sha256":"353479f77a8d7e2629d49ccac9fc2f5dbfdda5442e0adf867b00377a2fcb0cb2"},{"path":"vendor/three.core.js","size":1458113,"sha256":"9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6"},{"path":"vendor/three.module.js","size":662772,"sha256":"9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea"}]} /* RR_BUILD_END */;
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

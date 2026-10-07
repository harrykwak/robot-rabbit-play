/* Robot Rabbit service worker.
 * tools/pwa-assets.mjs replaces the BUILD block in dist/sw.js with the exact public file inventory.
 * Only that inventory is ever written to Cache Storage, and only during install. Runtime responses
 * (invitations, SDP/query URLs, peer or identity data, anything off-list) are never stored. */
const BUILD = /* RR_BUILD_START */ {"version":"1.9.1","id":"1.9.1-85804178357cc01e","files":[{"path":"THIRD_PARTY_NOTICES.md","size":1561,"sha256":"13a2160ddebd6a2bc42194114740d0537327e06d5aed4be72dd442294590face"},{"path":"assets/characters/bolt-plush.glb","size":3705052,"sha256":"ceac574dffb20050634f483a330acb78dadec6ae24cf50a6276899aac9bb6981"},{"path":"assets/characters/cannon-plush.glb","size":4163000,"sha256":"96bc8ae5400dddd34d680e25c74fdc0bdfa6ebbcf2105abbf58478eae9e5b36f"},{"path":"assets/characters/hammer-plush.glb","size":4244324,"sha256":"a15f6f70af8a42498bf774759f36c353a9e07077e30cd7b5c93019c8e769a7c5"},{"path":"assets/characters/pilot-face-blink.png","size":7658,"sha256":"e3e2ef74b140a4741f3575fb1cacef629424445ea82848c1320fa915a2e48a94"},{"path":"assets/characters/rabbit-pilot.glb","size":127408,"sha256":"786b83bdcfd59a15dc0eada7c1a058f8e3be30a606307f63fbada96c4cd3dc91"},{"path":"assets/characters/titan-plush.glb","size":3697444,"sha256":"46095cb5b32911e5cf67b9887c5c45e3192b88fef361a5cf55da766a6616e794"},{"path":"css/combat.css","size":15169,"sha256":"f4cf70b44804fe7b9ef3ca005c0978374285253ffe18e6c6265ef6fba5b4303a"},{"path":"css/extra.css","size":12328,"sha256":"45dd70c8c89fcf6f1efbc1fb21089f3a59412e350d868cbe39f303275a7e6c9a"},{"path":"css/game-menu.css","size":4131,"sha256":"9313e36c122cada66194b0ebec1552295c1baefe8aaea4022a37d359e170c6c8"},{"path":"css/menus.css","size":30304,"sha256":"a3abd9f2147a0bcd43135a2092150c3fc0e5f90c22a0c17b802a15c7bc7efd8a"},{"path":"css/mobile.css","size":52487,"sha256":"b7aa878795ab45fe58bc64273f844ecaab61985e577259f2fbc551e030547d26"},{"path":"css/style.css","size":39938,"sha256":"c19215a2125c5c0b7996cbaf643f8bebe90623e6fe927ffab62b70a228c2eb03"},{"path":"icons/apple-touch-icon.png","size":3041,"sha256":"5df62bc7c1b891604d2cb83fa9ed152af67aa5cc0193058c19d4c3610ef68fb2"},{"path":"icons/icon-192.png","size":4089,"sha256":"d689bd4edc8f1de3a3d62cfa80a3a9e2a73b6556c474824f6ace34f493eda54d"},{"path":"icons/icon-512.png","size":11856,"sha256":"0f3ee8f8e2671b0e46e632f969e6d5338bd605576228030259115575f2beddcb"},{"path":"icons/icon-maskable-512.png","size":7982,"sha256":"6e56bfab0c32e431833f1f2a27a641513a1ead28d6cf49af9ba2841f50cfe974"},{"path":"icons/rabbit.svg","size":569,"sha256":"f9dce453c3f9a1b37d8d7d6d7bbc21349f019bb07d2537a6306bd59c76249cfb"},{"path":"index.html","size":19352,"sha256":"5bc8ac0b8d94145fa65e4b32f2857e88d130c85ae7ee4164656984c8faaf8c5c"},{"path":"js/actions.js","size":40399,"sha256":"5e5db7c4b4116420f3517132181cf9479fd67e8c70067ad2a4a1dca076e68b1f"},{"path":"js/ai.js","size":21499,"sha256":"61358a206605959d0d8a88f336ed305dd2beb10119e747a5fd02ef8d78fff68a"},{"path":"js/arena.js","size":51377,"sha256":"b34739631188618b0b276d945ab10b42bfba145fc0d6cbae7db2c90bd088de05"},{"path":"js/audio.js","size":37046,"sha256":"50060a9072ae935b934a7ba37a34adbb172b0c89f45987b037c3484311d39bdc"},{"path":"js/boot.js","size":954,"sha256":"a419115caa0a5bb6b198bfb0559d91c3dd8a8052fe07f080328f9b7dd9f89201"},{"path":"js/camera-framing.js","size":4661,"sha256":"0c170f1f2216041952d4198e5d678890ab3d9c51604b2922eb42610b895b23d6"},{"path":"js/campaign.js","size":10326,"sha256":"22da6906b5539f4d5690415ef1806c00cc65e7ae3758a615b8a1ca3337bfa3b5"},{"path":"js/character-assets.js","size":14434,"sha256":"6b128c2e225a18a0593c3a95bd2a2328a395b22971df6d2ed39d771cece1f5e7"},{"path":"js/close-contact.js","size":4205,"sha256":"8c851e74a6409c35c93164ff1e4f54eee0c377e27bd9b67dd48bafdfd2b92794"},{"path":"js/cockpit.js","size":12652,"sha256":"965e97464e5cfc2a0de2234178008b6e77a59ad278167e8098dd16b8f3d01a24"},{"path":"js/control-labels.js","size":760,"sha256":"4251222f469a5450eed964d8ad83df4ab00ad0c1e00644199b077bd25f77d9df"},{"path":"js/costume-motion.js","size":1343,"sha256":"0fb9f57cc40be0b277b7192f78f2464937546c72348ee2cbbd8826491f76a92d"},{"path":"js/data.js","size":22575,"sha256":"8d25723921eaca0ea4ea35c39376b641b305fbb3cef8b864166eceaf1983e7e8"},{"path":"js/enemy-visibility.js","size":16082,"sha256":"fedf20c8840627768f9b7be3dc7c9276fb7141486fd5572be22cce160041d179"},{"path":"js/entities.js","size":73514,"sha256":"c4bd8077101aea636d46ac78b6ec72749bc13e9345dc2457e9d36cc0ca48266e"},{"path":"js/environment-art.js","size":24295,"sha256":"e79918f73bfb22724cf42c0ed08e0dba1c8367fd9ba8aad88ae75d442d06bfaa"},{"path":"js/frame-budget.js","size":7469,"sha256":"a538974e5857f3db16b294c1597dcabd15051a4e80bff6b2d3c1bce3253bcc6a"},{"path":"js/fx.js","size":37809,"sha256":"ad526c70640afc33c16248468f283cbe13303a6b6e54614f684c8d4aa25ddd95"},{"path":"js/game.js","size":81598,"sha256":"0076f6a7ff56bb488e1abc1e360a60ce08ca128f9aceb808350d10790e15b1c4"},{"path":"js/ground-marker.js","size":8737,"sha256":"dc49119767adc5dd138dedb800a594fa112f22b671875e6937e99b479cc0615d"},{"path":"js/input.js","size":17207,"sha256":"6f8f07993da66a59ad80c39947a423657d06b6ccb72bc7846bac2cafe75c2823"},{"path":"js/install.js","size":11962,"sha256":"1c5451ac8c24eee05dc70ace438dd10bedc0a698b9a55cc00d02f196e915f4d6"},{"path":"js/juice-station-models.js","size":19801,"sha256":"4ab021a830c19ab509578d5aba07c77f3d148b5a73931b0382c7ffd10c9fedbc"},{"path":"js/juice-stations.js","size":4988,"sha256":"c4f56b07d3187223b772dd73994511971d36a66be1c9f9a3460662f1ea8f8c4a"},{"path":"js/local-prediction.js","size":5715,"sha256":"f770cef167787eb3bcf7d380554abf0da13e8ba78cbc5ab55ded2de4854caf29"},{"path":"js/main.js","size":61066,"sha256":"819eb58364629fd3cb64b685df8f8b16887096216789793cb73996a076baa3b0"},{"path":"js/model-quality.js","size":2926,"sha256":"b30de742002b39f3de4f8f911175d46f9428fa1dd98d461bfaa6afabc715c81f"},{"path":"js/models.js","size":58533,"sha256":"749189fd72ede80b69a46a2e52827a3b2ec73cff2a661983eae26fa2599a2b49"},{"path":"js/peer-match.js","size":22709,"sha256":"395730d2199328dbb8430cce0f6c8c00d1d3c1d53b0bf3c4472299a250a320bf"},{"path":"js/peer-protocol.js","size":4873,"sha256":"c4ba75fee1256fc4485c60cfcd3b7a37e0b1715e2de1d3b5709ae78a9b9e55fc"},{"path":"js/pilot-sculpt.js","size":3388,"sha256":"b3bea8391aa6ce3ebb823a566d3818ddaf01f477c95a3c6ac295977b93c48d59"},{"path":"js/pilot-shadows.js","size":871,"sha256":"2840047682f2d5b2234a6be3ee286cbf4d91bdd65ebb10260f689163c5302295"},{"path":"js/poses.js","size":3406,"sha256":"a437a286360dbbc672060837bdda93bdf192b3506d351c3cb4078bc43121c30e"},{"path":"js/preferences.js","size":1394,"sha256":"f84ff376e6ad48fa4ec0251770146856279f7b90d082a371a4ed185d2d9be371"},{"path":"js/rabbit-portraits.js","size":2357,"sha256":"9263d43fbaf959e9b31ea970d0c727a8b3f1b56f21a4e96ab46f0bce2c8b9345"},{"path":"js/rear-view.js","size":8979,"sha256":"116edef7ebd65319776921ee2ccb4e42c1276e19482237667a849ad8df467ee0"},{"path":"js/robot-combat.js","size":11965,"sha256":"940c5114b38e34758fe402a7192f9d67a2e14a7a8ebc3c97167adb0cf67766ee"},{"path":"js/robot-presentation.js","size":3412,"sha256":"e8319bb79e44c9963946eae6a7175b26b677a00b16b02648a8fbd9469350ae9d"},{"path":"js/robot-systems.js","size":4832,"sha256":"3daecbb98825da9bc2d4780d239b5bf6852e9b5247f6e547e85031843511aee9"},{"path":"js/room-config.js","size":282,"sha256":"7fe481761baf2c828f6612eb861141555503ecc38bd29474c5b489167e8398ca"},{"path":"js/room-links.js","size":1055,"sha256":"3719fea1ba0ec38990f256554c1776bc86d0e0d240977cecde8067015a92d184"},{"path":"js/room-lobby.js","size":25847,"sha256":"a1958857affd2e75717101dccd1cc6f08436957315679f7829c862412512f40a"},{"path":"js/room-protocol.js","size":2197,"sha256":"aedb5ef1fbf8a5c986895ea8eaa3742357c3026f8d439c95dba7880997808d41"},{"path":"js/room-session.js","size":6370,"sha256":"6c3c8681397b82327fcbcdb4e33f8865a8d2b080eb4b37b6701db88d45c878cd"},{"path":"js/touch-icons.js","size":3904,"sha256":"2be40bfb9ebf1ebb44d9acdb9709c5f3d3f08d45ce33648a8e187415166d3963"},{"path":"js/touch.js","size":19180,"sha256":"90b9a264119ae536a3f0c33828ea00a55493b35667bb0189c141856f0e641589"},{"path":"js/ui.js","size":26198,"sha256":"8e06542bb43f9f485fb0c34665ea5f7dcfa0db52ae622da7f6d599478932b8a1"},{"path":"manifest.webmanifest","size":886,"sha256":"e09d166703fad19005a93caca03ee3ee168339e8b60bdd6426ecdc2a66ea575d"},{"path":"vendor/LICENSE","size":1102,"sha256":"5d5dad8147523d59bc15cca838ae0bdaae7075230ec49132c551a1d18e7b3412"},{"path":"vendor/LICENSE-Apache-2.0.txt","size":11560,"sha256":"3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5"},{"path":"vendor/addons/geometries/RoundedBoxGeometry.js","size":6470,"sha256":"c5feab96123858ed8823c889b238dc8734adab7e760e3cfd21e7f3f2f3e348e3"},{"path":"vendor/addons/loaders/GLTFLoader.js","size":117570,"sha256":"131c0f78c01d19368ae495caa65b3adaa10487810a36a05bb5901b769a35ac16"},{"path":"vendor/addons/postprocessing/EffectComposer.js","size":8501,"sha256":"4e079a5886152d7e529a59aef644e968ab4d32c6a33ce016b36bf29b2eac26f7"},{"path":"vendor/addons/postprocessing/MaskPass.js","size":4694,"sha256":"7cd08eee9d5d6f5578beaddbdcbe9c384f6873810af27f22ab7db3ceeb127aa3"},{"path":"vendor/addons/postprocessing/OutputPass.js","size":4184,"sha256":"02e4a261af34de71338185e9e87f0cbe5cba9115608d984363e1269dec1d2272"},{"path":"vendor/addons/postprocessing/Pass.js","size":4218,"sha256":"444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5"},{"path":"vendor/addons/postprocessing/RenderPass.js","size":4280,"sha256":"817f6c3cdcd0fd41515d112359ea0532568eefb5aabd3b33903957ebca1b8a6a"},{"path":"vendor/addons/postprocessing/ShaderPass.js","size":3228,"sha256":"e2500a5913b26bbf5148ceaae644c6edcff06a18b01494ee37bf856353d2ab9d"},{"path":"vendor/addons/postprocessing/UnrealBloomPass.js","size":15397,"sha256":"ba8f2fcadfa6588384c9473498f974d81d120f02f0e63a0e59c265202a006b5a"},{"path":"vendor/addons/shaders/CopyShader.js","size":729,"sha256":"a33057d5ac91c43304c186ac0e8816e62bb2ed471d3a00ff3018dfd5c0389718"},{"path":"vendor/addons/shaders/LuminosityHighPassShader.js","size":1291,"sha256":"5044f780b6e6cf863947f64c36fe1587132f7fbe395ada863cd1e5f0388dcf1e"},{"path":"vendor/addons/shaders/OutputShader.js","size":1876,"sha256":"353479f77a8d7e2629d49ccac9fc2f5dbfdda5442e0adf867b00377a2fcb0cb2"},{"path":"vendor/addons/utils/BufferGeometryUtils.js","size":37712,"sha256":"9fb63427ce6641fa14fd0baff9cc4d1b5f9c3d85fd084bf2e90e803c44ec1797"},{"path":"vendor/addons/utils/SkeletonUtils.js","size":11535,"sha256":"b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f"},{"path":"vendor/three.core.js","size":1458113,"sha256":"9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6"},{"path":"vendor/three.module.js","size":662772,"sha256":"9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea"}]} /* RR_BUILD_END */;
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

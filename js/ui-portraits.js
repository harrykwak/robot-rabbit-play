// Character portraits pre-rendered from the in-game 3D models (tools/render-portraits.mjs).
// Paths are document-relative so the build also works under a sub-path deployment.
const BASE = 'assets/ui/portraits/';
const SIZES = { bust: { pilot: [320, 320], robot: [320, 320] }, full: { pilot: [360, 560], robot: [420, 560] } };
const clean = (id) => String(id ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');

/** URL of a portrait. kind: 'pilot' | 'robot'; id: pilot id (PILOTS[i].id) or robot type; size: 'bust' | 'full'. */
export function portraitUrl(kind, id, size = 'bust') {
  const k = kind === 'robot' ? 'robot' : 'pilot';
  return BASE + k + '-' + clean(id) + '-' + (size === 'full' ? 'full' : 'bust') + '.webp';
}

/** Intrinsic pixel size [w, h] of a portrait, for width/height attributes (prevents layout shift). */
export function portraitSize(kind, size = 'bust') {
  return SIZES[size === 'full' ? 'full' : 'bust'][kind === 'robot' ? 'robot' : 'pilot'];
}

/** Ready-to-insert <img>. Decorative by default (alt = ''); pass alt text when the image carries meaning. */
export function portraitImg(kind, id, size = 'bust', className = 'rr-portrait', alt = '') {
  const img = document.createElement('img');
  const [w, h] = portraitSize(kind, size);
  img.className = className; img.alt = alt; img.width = w; img.height = h;
  img.decoding = 'async'; img.draggable = false;
  img.src = portraitUrl(kind, id, size);
  return img;
}

/** Warm the HTTP/service-worker cache so cards and the VS intro never pop in blank. */
export function preloadPortraits(pilotIds = [], robotTypes = [], sizes = ['bust', 'full']) {
  const urls = [];
  for (const size of sizes) {
    for (const id of pilotIds) urls.push(portraitUrl('pilot', id, size));
    for (const type of robotTypes) urls.push(portraitUrl('robot', type, size));
  }
  for (const url of urls) { const img = new Image(); img.decoding = 'async'; img.src = url; }
  return urls;
}


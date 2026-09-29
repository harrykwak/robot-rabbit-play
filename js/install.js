// Install / offline / update UI for the web build. No dependencies, no network calls of its own.
//
// DOM contract (all optional; missing nodes are skipped). Put them inside one container:
//   [data-pwa="panel"]    container; gets data-state="browser|standalone|native|unsupported"
//   [data-pwa="status"]   short status text (aria-live recommended)
//   [data-pwa="install"]  <button> shown only when the browser offers a native install prompt
//   [data-pwa="ios"]      element filled with Apple home-screen / Dock instructions; hidden elsewhere
//   [data-pwa="update"]   <button> shown when a new version is waiting; disabled during a match
//   [data-pwa="offline"]  badge shown while the device is offline
// <html> also gets data-pwa-display, data-pwa-offline ("1" when offline) and data-pwa-update ("1" when waiting).
// Every change dispatches window event "rr-pwa-state" with the state object as detail.

export const PWA_SELECTORS = Object.freeze({
  panel: '[data-pwa="panel"]', status: '[data-pwa="status"]', install: '[data-pwa="install"]',
  ios: '[data-pwa="ios"]', update: '[data-pwa="update"]', offline: '[data-pwa="offline"]',
});

const TEXT = {
  native: '설치된 앱에서 실행 중이에요.',
  standalone: '홈 화면 앱으로 실행 중이에요.',
  offlineReady: '오프라인에서도 플레이할 수 있어요.',
  preparing: '오프라인 플레이를 준비하고 있어요…',
  insecure: 'HTTPS 주소로 열면 설치와 오프라인 플레이를 쓸 수 있어요.',
  unsupported: '이 브라우저는 오프라인 설치를 지원하지 않아요.',
  failed: '오프라인 준비에 실패했어요. 온라인에서 다시 열어 주세요.',
  dev: '개발 실행에서는 오프라인 캐시를 쓰지 않아요.',
  update: '새 버전이 준비됐어요.',
  updateInMatch: '새 버전이 준비됐어요. 경기가 끝나면 적용할 수 있어요.',
  offline: '오프라인',
  iosSafari: 'Safari 아래쪽(또는 위쪽)의 공유 버튼을 누르고 ‘홈 화면에 추가’를 선택하세요. 홈 화면의 로봇 래빗 아이콘으로 열면 전체 화면으로 실행돼요.',
  iosOther: '공유 버튼에서 ‘홈 화면에 추가’를 선택하세요. 메뉴에 없으면 Safari에서 이 페이지를 열어 주세요.',
  macSafari: 'Safari 메뉴 막대에서 파일 → ‘Dock에 추가’를 선택하세요.',
};

/** True inside the Android/iOS wrapper apps, which ship their own offline assets. */
export function isNativeWrapper(win = globalThis.window) {
  if (!win) return false;
  try {
    const loc = win.location || {};
    if (new URLSearchParams(loc.search || '').has('native')) return true;
    if (loc.hostname === 'appassets.androidplatform.net' || loc.protocol === 'file:' || loc.protocol === 'capacitor:') return true;
  } catch { /* treat as web */ }
  if (win.NativeGame) return true;
  try { if (win.Capacitor && win.Capacitor.isNativePlatform && win.Capacitor.isNativePlatform()) return true; } catch { /* web */ }
  return false;
}

/** 'ios' | 'mac-safari' | 'android' | 'other', plus whether an iOS page is in Safari itself. */
export function detectPlatform(nav = globalThis.navigator) {
  const ua = (nav && nav.userAgent) || '';
  const touchMac = nav && nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return { os: 'ios', safari: !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) };
  if (/Macintosh/.test(ua) && /Version\/[\d.]+.*Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return { os: 'mac-safari', safari: true };
  if (/Android/.test(ua)) return { os: 'android', safari: false };
  return { os: 'other', safari: false };
}

export function isStandalone(win = globalThis.window) {
  if (!win) return false;
  if (win.navigator && win.navigator.standalone === true) return true;
  const mq = (q) => { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch { return false; } };
  return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || mq('(display-mode: minimal-ui)');
}

/**
 * Registers ./sw.js relative to the page, so it works at any sub-path.
 * Never forces activation. Resolves { supported, reason?, registration? }.
 */
export async function registerSW({ url = 'sw.js', scope = './', win = globalThis.window, onUpdateReady, onOfflineReady } = {}) {
  if (isNativeWrapper(win)) return { supported: false, reason: 'native' };
  const nav = win && win.navigator;
  if (!nav || !nav.serviceWorker) return { supported: false, reason: 'unsupported' };
  if (win.isSecureContext === false) return { supported: false, reason: 'insecure' };
  const registration = await nav.serviceWorker.register(url, { scope, updateViaCache: 'none' });
  const hadController = !!nav.serviceWorker.controller;
  const watch = (worker) => {
    if (!worker) return;
    const check = () => {
      if (worker.state === 'installed' && nav.serviceWorker.controller && onUpdateReady) onUpdateReady(registration);
      if (worker.state === 'activated' && !hadController && onOfflineReady) onOfflineReady(registration);
    };
    worker.addEventListener('statechange', check);
    check();
  };
  if (registration.waiting && nav.serviceWorker.controller && onUpdateReady) onUpdateReady(registration);
  if (registration.active && hadController && onOfflineReady) onOfflineReady(registration);
  watch(registration.installing);
  registration.addEventListener('updatefound', () => watch(registration.installing));
  return { supported: true, registration };
}

/**
 * Wires the install panel. Options:
 *   root        element or document to search (default document)
 *   selectors   override PWA_SELECTORS entries
 *   isInMatch   () => boolean; while true the update button stays disabled
 *   register    false to skip service worker registration (default true)
 *   win         window object (tests)
 * Returns { getState(), refresh(), applyUpdate(), promptInstall(), destroy() }.
 */
export function initInstallUI({ root, selectors = {}, isInMatch = () => false, register = true, win = globalThis.window, swUrl = 'sw.js' } = {}) {
  const doc = win.document;
  const scopeRoot = root || doc;
  const sel = { ...PWA_SELECTORS, ...selectors };
  const $ = (key) => scopeRoot.querySelector(sel[key]);
  const platform = detectPlatform(win.navigator);
  const native = isNativeWrapper(win);
  const state = {
    display: native ? 'native' : isStandalone(win) ? 'standalone' : 'browser',
    platform: platform.os, iosSafari: platform.os === 'ios' && platform.safari,
    online: win.navigator.onLine !== false, sw: native ? 'native' : 'pending',
    offlineReady: false, installAvailable: false, updateReady: false, inMatch: false, version: null,
  };
  let deferredPrompt = null, registration = null, reloadOnChange = false;
  const listeners = [];
  const on = (target, type, fn) => { if (target && target.addEventListener) { target.addEventListener(type, fn); listeners.push([target, type, fn]); } };

  function statusText() {
    if (state.display === 'native') return TEXT.native;
    if (state.updateReady) return state.inMatch ? TEXT.updateInMatch : TEXT.update;
    if (state.sw === 'insecure') return TEXT.insecure;
    if (state.sw === 'unsupported') return TEXT.unsupported;
    if (state.sw === 'failed') return TEXT.failed;
    if (state.sw === 'dev') return TEXT.dev;
    if (state.offlineReady) return state.display === 'standalone' ? TEXT.standalone + ' ' + TEXT.offlineReady : TEXT.offlineReady;
    return state.display === 'standalone' ? TEXT.standalone : TEXT.preparing;
  }
  function iosText() {
    if (state.display !== 'browser') return '';
    if (state.platform === 'ios') return state.iosSafari ? TEXT.iosSafari : TEXT.iosOther;
    if (state.platform === 'mac-safari') return TEXT.macSafari;
    return '';
  }
  const show = (el, visible) => { if (el) el.hidden = !visible; };
  function render() {
    state.inMatch = !!isInMatch();
    const panel = $('panel');
    if (panel) panel.dataset.state = state.display === 'browser' && (state.sw === 'unsupported' || state.sw === 'insecure') ? 'unsupported' : state.display;
    const status = $('status'); if (status) status.textContent = statusText();
    const install = $('install'); show(install, state.installAvailable && state.display === 'browser');
    const ios = $('ios'); const iosCopy = iosText();
    if (ios) { ios.textContent = iosCopy; show(ios, !!iosCopy); }
    const update = $('update');
    if (update) { show(update, state.updateReady); update.disabled = state.inMatch; update.setAttribute('aria-disabled', String(state.inMatch)); }
    show($('offline'), !state.online);
    const html = doc.documentElement;
    if (html && html.dataset) {
      html.dataset.pwaDisplay = state.display;
      html.dataset.pwaOffline = state.online ? '0' : '1';
      html.dataset.pwaUpdate = state.updateReady ? '1' : '0';
    }
    try { win.dispatchEvent(new win.CustomEvent('rr-pwa-state', { detail: { ...state } })); } catch { /* optional */ }
  }

  // Offline is ready only when the active worker confirms a real build inventory.
  function verifyOffline(worker) {
    if (!worker || !win.MessageChannel) return;
    const channel = new win.MessageChannel();
    channel.port1.onmessage = (event) => {
      const info = event.data || {};
      state.version = info.version || null;
      state.offlineReady = info.files > 0;
      if (!state.offlineReady) state.sw = 'dev';
      render();
    };
    worker.postMessage({ type: 'RR_GET_BUILD' }, [channel.port2]);
  }

  async function applyUpdate() {
    if (!state.updateReady || isInMatch() || !registration || !registration.waiting) return false;
    reloadOnChange = true;
    registration.waiting.postMessage({ type: 'RR_SKIP_WAITING' });
    return true;
  }
  async function promptInstall() {
    if (!deferredPrompt) return null;
    const event = deferredPrompt; deferredPrompt = null; state.installAvailable = false; render();
    await event.prompt();
    const choice = event.userChoice ? await event.userChoice : null;
    return choice && choice.outcome || null;
  }

  // Apple browsers never fire beforeinstallprompt; they rely on the instructions above.
  on(win, 'beforeinstallprompt', (event) => { if (native) return; event.preventDefault(); deferredPrompt = event; state.installAvailable = true; render(); });
  on(win, 'appinstalled', () => { deferredPrompt = null; state.installAvailable = false; render(); });
  on(win, 'online', () => { state.online = true; render(); });
  on(win, 'offline', () => { state.online = false; render(); });
  on($('install'), 'click', () => { promptInstall(); });
  on($('update'), 'click', () => { applyUpdate(); });
  if (!native && win.navigator.serviceWorker) {
    on(win.navigator.serviceWorker, 'controllerchange', () => { if (reloadOnChange) { reloadOnChange = false; win.location.reload(); } });
  }
  try {
    const mq = win.matchMedia && win.matchMedia('(display-mode: standalone)');
    on(mq, 'change', () => { if (!native) { state.display = isStandalone(win) ? 'standalone' : 'browser'; render(); } });
  } catch { /* optional */ }

  if (register && !native) {
    registerSW({
      url: swUrl, win,
      onUpdateReady: (reg) => { registration = reg; state.updateReady = true; render(); },
      onOfflineReady: (reg) => { registration = reg; verifyOffline(reg.active); },
    }).then((result) => {
      if (state.sw !== 'dev') state.sw = result.supported ? 'registered' : result.reason;
      if (result.registration) registration = result.registration;
      render();
    }, (error) => { console.warn('Robot Rabbit offline setup failed:', error); state.sw = 'failed'; render(); });
  } else if (!native) state.sw = 'off';
  render();

  return {
    getState: () => ({ ...state }),
    refresh: render,
    applyUpdate,
    promptInstall,
    destroy() { for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn); },
  };
}

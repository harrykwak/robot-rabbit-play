// 키보드 + 게임패드 입력. 매 프레임 poll() 후 intents 를 읽고 endFrame() 으로 엣지 초기화
// 키 설정은 localStorage 'rr-keys' 에 저장된다. 각 동작은 [주 키, 보조 키] 두 칸.
const down = new Set();
const pressed = new Set();

export const ACTIONS = ['up', 'down', 'left', 'right', 'atk', 'hvy', 'grd', 'jump', 'dash', 'act', 'pause'];
export const ACTION_NAMES = {
  up: '위로 이동', down: '아래로 이동', left: '왼쪽 이동', right: '오른쪽 이동',
  atk: '공격', hvy: '스킬 1', grd: '스킬 2', jump: '점프', dash: '대시',
  act: '호출·탑승', pause: '일시정지',
};
const DEFAULTS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  atk: ['KeyJ', 'KeyZ'], hvy: ['KeyK', 'KeyX'], grd: ['KeyL', 'KeyC'], jump: ['Space', null], dash: ['ShiftLeft', 'ShiftRight'],
  act: ['KeyE', 'KeyV'], pause: ['Escape', 'KeyP'],
};
// 설정할 수 없는 키 (키 안내 토글, 브라우저 필수 키)
export const RESERVED = new Set(['F1', 'F5', 'F11', 'F12', 'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu']);

// ---------------- 두 번 밀기 → 대시 (순수 상태 기계, 노드 테스트 대상) ----------------
// 스틱(또는 이동 키)을 세게 밀었다가(push) 놓고(rest) 짧은 틈(gap) 안에 같은 쪽(cone)으로 다시 밀면 한 번 true.
// 첫 번째 밀기가 maxHold 보다 길면 걷기로 보고 무시한다 (걷다가 엄지를 고쳐 잡아도 대시가 새지 않게).
export const DOUBLE_PUSH = { push: 0.7, rest: 0.35, maxHold: 350, gap: 300, cone: Math.PI / 4 };
export function createDoubleTapDetector(options = {}) {
  const o = { ...DOUBLE_PUSH, ...options };
  const minDot = Math.cos(o.cone);
  let state = 'rest', dx = 0, dz = 0, t0 = 0, t1 = 0;
  const start = (x, z, m, t) => { state = 'push'; dx = x / m; dz = z / m; t0 = t; };
  function update(x, z, t) {
    if (![x, z, t].every(Number.isFinite)) return false;
    const m = Math.hypot(x, z);
    if (state === 'gap' && t - t1 > o.gap) state = 'rest';
    if (state === 'rest') { if (m >= o.push) start(x, z, m, t); return false; }
    if (state === 'push') {
      if (m <= o.rest) { if (t - t0 <= o.maxHold) { state = 'gap'; t1 = t; } else state = 'rest'; }
      return false;
    }
    if (state === 'gap') {
      if (m < o.push) return false;
      if ((x * dx + z * dz) / m >= minDot) { state = 'done'; return true; }
      start(x, z, m, t); // 다른 방향: 이번 밀기를 새 첫 번째로 센다
      return false;
    }
    if (m <= o.rest) state = 'rest'; // done: 한 번 놓아야 다음 대시
    return false;
  }
  return { update, reset() { state = 'rest'; } };
}

const BIND = {};
let GAME_KEYS = new Set();
const clone = (o) => { const r = {}; for (const a of ACTIONS) r[a] = [o[a][0] || null, o[a][1] || null]; return r; };

function load() {
  Object.assign(BIND, clone(DEFAULTS));
  try {
    const s = JSON.parse(localStorage.getItem('rr-keys') || 'null');
    if (s && typeof s === 'object') {
      const used = new Set();
      for (const a of ACTIONS) {
        if (!Array.isArray(s[a])) { for (const c of BIND[a]) if (c) used.add(c); continue; }
        BIND[a] = [0, 1].map((i) => {
          const c = s[a][i];
          if (typeof c !== 'string' || !c || RESERVED.has(c) || used.has(c)) return null;
          used.add(c);
          return c;
        });
        if (!BIND[a][0] && !BIND[a][1]) BIND[a] = [...DEFAULTS[a]];
      }
    }
  } catch { /* 저장값 무시 */ }
  refresh();
}
function refresh() { GAME_KEYS = new Set(Object.values(BIND).flat().filter(Boolean)); }
function save() {
  refresh();
  try { localStorage.setItem('rr-keys', JSON.stringify(BIND)); } catch { /* 저장 실패 무시 */ }
  dispatchEvent(new CustomEvent('rr-keys-changed', { detail: getBinds() }));
}
load();

export function getBinds() { return clone(BIND); }

// 이미 다른 칸에서 쓰는 키를 배정하면 두 칸의 키를 맞바꾼다 (충돌 없음)
// 바꾸면 다른 동작의 키가 하나도 안 남는 경우, 또는 이 동작의 마지막 키를 비우는 경우 false
export function setBind(action, slot, code) {
  if (!BIND[action] || (slot !== 0 && slot !== 1)) return false;
  if (code && RESERVED.has(code)) return false;
  code = code || null;
  const prev = BIND[action][slot];
  if (!code && !BIND[action][1 - slot]) return false;
  if (code) {
    for (const a of ACTIONS) for (const i of [0, 1]) {
      if ((a !== action || i !== slot) && BIND[a][i] === code && a !== action && !prev && !BIND[a][1 - i]) return false;
    }
    for (const a of ACTIONS) for (const i of [0, 1]) {
      if ((a !== action || i !== slot) && BIND[a][i] === code) BIND[a][i] = prev;
    }
  }
  BIND[action][slot] = code;
  // 주 키가 비면 보조 키를 앞으로 당긴다
  for (const a of ACTIONS) if (!BIND[a][0] && BIND[a][1]) BIND[a] = [BIND[a][1], null];
  save();
  return true;
}
export function resetBinds() { Object.assign(BIND, clone(DEFAULTS)); save(); }

const NAMED = {
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Backspace: 'Back', Tab: 'Tab', CapsLock: 'Caps',
  ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '\u0060', IntlBackslash: '\\',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadMultiply: 'Num*', NumpadDivide: 'Num/', NumpadDecimal: 'Num.', NumpadEnter: 'NumEnter',
  Lang1: '한/영', Lang2: '한자', HangulMode: '한/영', HanjaMode: '한자',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMED[code]) return NAMED[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return 'Num' + m[1];
  return code.replace(/(Left|Right)$/, '');
}
export function actionLabel(action) {
  const b = BIND[action];
  return b ? keyLabel(b[0] || b[1]) : '?';
}
// 이동 키 4개를 한 덩어리로: "WASD", "↑ ← ↓ →"
export function moveLabel() {
  const ls = ['up', 'left', 'down', 'right'].map(actionLabel);
  return ls.every((l) => /^[A-Z0-9]$/.test(l)) ? ls.join('') : ls.join(' ');
}
// 기술표 문자열의 {atk} 등을 현재 주 키 이름으로 바꾼다 (일반 텍스트)
export function fmtKeys(str) {
  return String(str).replace(/\{(\w+)\}/g, (all, k) => (k === 'move' ? moveLabel() : BIND[k] ? actionLabel(k) : all));
}

// 키 설정 화면: 다음 키 입력 하나를 가로챈다. cb(code), Esc 는 cb(null)
let capture = null;
export function captureNext(cb) { capture = cb; }
export function cancelCapture() { capture = null; }
export function isCapturing() { return !!capture; }

const hasDoc = typeof document !== 'undefined';
const isEl = (v, name) => typeof globalThis[name] === 'function' && v instanceof globalThis[name];

addEventListener('keydown', (e) => {
  if (capture) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat || !e.code) return;
    const cb = capture;
    if (e.code === 'Escape') { capture = null; cb(null); return; }
    if (RESERVED.has(e.code)) return;
    capture = null;
    cb(e.code);
    return;
  }
  if (isEl(e.target, 'HTMLInputElement') || isEl(e.target, 'HTMLSelectElement') || isEl(e.target, 'HTMLTextAreaElement') || e.target?.isContentEditable) return;
  // C changes mounted view. Do not also feed its walking skill-2 alias (or a
  // remapped action) into combat. Key-binding capture above still takes priority.
  if (e.code === 'KeyC' && ridePlayer?.riding) { down.delete(e.code); pressed.delete(e.code); return; }
  // A key held through reset must be released before it can drive the next match.
  if (e.repeat && !down.has(e.code)) return;
  if (GAME_KEYS.has(e.code)) {
    // 게임 조작 키는 스크롤 등 기본 동작을 막는다 (메뉴 버튼 포커스 중 Space/Enter 는 허용)
    const active = hasDoc ? document.activeElement : null;
    if (!(isEl(active, 'HTMLButtonElement') && (e.code === 'Space' || e.code === 'Enter'))) e.preventDefault();
  }
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
  if (!e.repeat) feedKeyDash(e.code);
}, true);
addEventListener('keyup', (e) => {
  down.delete(e.code);
  for (const a of HOLDABLE) if (BIND[a].includes(e.code)) releaseRearm(a);
  feedKeyDash(e.code);
});
addEventListener('blur', () => resetInputs());
if (hasDoc) document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs(); });

const any = (list, set) => list.some((k) => k && set.has(k));

// 이동 키를 같은 방향으로 두 번 톡톡 누르면 대시 (Shift 대시는 그대로)
const keyDash = createDoubleTapDetector();
let keyDashTap = false;
const MOVES = ['up', 'down', 'left', 'right'];
function feedKeyDash(code) {
  if (!MOVES.some((a) => BIND[a].includes(code))) return;
  const x = (any(BIND.right, down) ? 1 : 0) - (any(BIND.left, down) ? 1 : 0);
  const z = (any(BIND.down, down) ? 1 : 0) - (any(BIND.up, down) ? 1 : 0);
  if (keyDash.update(x, z, performance.now())) keyDashTap = true;
}

// ---------------- 터치 입력 (touch.js 가 채운다) ----------------
// down: 누르고 있는 동작, pressed: 새로 눌린 동작. poll 전에 떼도 endFrame 까지 남아 빠른 탭이 사라지지 않는다
const touch = { mx: 0, mz: 0, down: new Set(), pressed: new Set() };
const HOLDABLE = ['atk', 'hvy', 'grd', 'jump', 'dash', 'act', 'pause'];
export function setTouchMove(x, z) {
  x = Number.isFinite(x) ? x : 0; z = Number.isFinite(z) ? z : 0;
  const l = Math.hypot(x, z);
  touch.mx = l > 1 ? x / l : x;
  touch.mz = l > 1 ? z / l : z;
}
export function setTouchButton(action, isDown) {
  if (!HOLDABLE.includes(action)) return;
  if (isDown) { if (!touch.down.has(action)) touch.pressed.add(action); touch.down.add(action); }
  else { touch.down.delete(action); releaseRearm(action); }
}
export function clearTouch() { touch.mx = 0; touch.mz = 0; touch.down.clear(); touch.pressed.clear(); }
export function cancelTouchButton(action) {
  setTouchButton(action, false);
  touch.pressed.delete(action);
  const fields = actionFields([action]);
  for (const field of fields) intents[field] = false;
  for (const ctrl of ctrls) ctrl.clear(fields);
}

// ---------------- 게임패드 ----------------
const PAD = { jump: [0], atk: [2], hvy: [3], grd: [1], dash: [5, 7], act: [4, 6], pause: [9] };
let padPrev = [];
let padKey = null;
function readPad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads || []) if (p && p.connected) return p;
  return null;
}
const padId = (p) => p.index + ':' + p.id;
const padState = (p) => p.buttons.map((x) => !!(x && x.pressed));
addEventListener('gamepaddisconnected', () => resetInputs());

// ---------------- 재입력 대기 (rearm) ----------------
// 막힌 동작은 모든 입력원(키/패드/터치)에서 한 번 뗄 때까지 누름·눌림을 모두 무시한다
const blocked = new Set();
export const RIDING_REARM = ['grd', 'hvy', 'act'];
const ctrls = [];

function actionFields(actions) {
  const out = [];
  for (const a of actions) {
    if (a === 'atk') out.push('atk', 'atkD');
    else if (a === 'hvy') out.push('hvy', 'hvyD');
    else if (a === 'grd') out.push('grd', 'grdP');
    else if (a === 'act') out.push('act', 'actP');
    else if (a === 'jump' || a === 'dash') out.push(a);
  }
  return out;
}

export function rearm(actions = RIDING_REARM) {
  const list = actions.filter((a) => HOLDABLE.includes(a) && a !== 'pause');
  for (const a of list) {
    blocked.add(a);
    for (const c of BIND[a]) if (c) pressed.delete(c);
    touch.pressed.delete(a);
  }
  // 이미 계산된 이번 프레임 값과 PlayerCtrl 버퍼도 즉시 지운다 (호출 순서와 무관하게 안전)
  const fields = actionFields(list);
  for (const f of fields) intents[f] = false;
  for (const c of ctrls) c.clear(fields);
}
export function isRearming(action) { return blocked.has(action); }
function releaseRearm(action) {
  if (!blocked.has(action) || any(BIND[action], down) || touch.down.has(action)) return;
  const pad = readPad();
  if (!pad || !PAD[action].some((i) => pad.buttons[i]?.pressed)) blocked.delete(action);
}

// 탑승/하차 순간 grd/hvy/act 가 새 조작으로 새어 나가지 않게 한다. 매 프레임 poll() 뒤에 호출
// 상태가 바뀐 프레임이면 true
let ridePlayer = null, rideState = false;
export function syncRiding(player) {
  const riding = !!(player && player.riding);
  if (riding) { down.delete('KeyC'); pressed.delete('KeyC'); }
  if (player !== ridePlayer) { ridePlayer = player || null; rideState = riding; return false; }
  if (riding === rideState) return false;
  rideState = riding;
  rearm(RIDING_REARM);
  return true;
}

// atkD/hvyD: 누르고 있는 상태 (모으기 기술용, 엣지 아님)
export const intents = { mx: 0, mz: 0, jump: false, atk: false, hvy: false, atkD: false, hvyD: false, grd: false, grdP: false, dash: false, act: false, actP: false, pause: false };

export function poll() {
  let mx = 0, mz = 0;
  if (any(BIND.left, down)) mx -= 1;
  if (any(BIND.right, down)) mx += 1;
  if (any(BIND.up, down)) mz -= 1;
  if (any(BIND.down, down)) mz += 1;
  const pad = readPad();
  let b = () => false, bp = () => false;
  if (pad) {
    // 다른 패드로 바뀌면 이전 버튼 상태를 버린다
    if (padId(pad) !== padKey) { padKey = padId(pad); padPrev = []; }
    b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    bp = (i) => b(i) && !padPrev[i];
    const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
    if (Math.hypot(ax, az) > 0.25) { mx = ax; mz = az; }
    if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) mz = -1; if (b(13)) mz = 1;
  } else { padPrev = []; padKey = null; }
  // 터치 스틱을 쓰는 중이면 스틱이 이동을 정한다
  if (touch.mx || touch.mz) { mx = touch.mx; mz = touch.mz; }

  const d = {}, p = {};
  for (const a of HOLDABLE) {
    let hd = any(BIND[a], down) || touch.down.has(a) || PAD[a].some(b);
    let pr = any(BIND[a], pressed) || touch.pressed.has(a) || PAD[a].some(bp);
    if (a === 'dash' && keyDashTap) pr = true;
    if (blocked.has(a)) {
      // 누르고 있는 동안은 무시. 모든 입력원에서 떼면 해제 (뗀 뒤 같은 프레임의 새 탭은 인정)
      if (hd) { hd = false; pr = false; } else blocked.delete(a);
    }
    d[a] = hd; p[a] = pr;
  }
  if (pad) padPrev = padState(pad);
  const l = Math.hypot(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  Object.assign(intents, {
    mx, mz, jump: p.jump, atk: p.atk, hvy: p.hvy, atkD: d.atk, hvyD: d.hvy,
    grd: d.grd, grdP: p.grd, dash: p.dash, act: d.act, actP: p.act, pause: p.pause,
  });
  return intents;
}

export function endFrame() { pressed.clear(); touch.pressed.clear(); keyDashTap = false; }

// 일시정지/재개, 매치 시작·종료 등에서 모든 입력 상태와 PlayerCtrl 버퍼를 비운다
// 패드는 지금 누른 버튼을 이전 상태로 기록해 재개 직후 가짜 눌림이 생기지 않게 한다
export function resetInputs() {
  down.clear();
  pressed.clear();
  keyDash.reset(); keyDashTap = false;
  clearTouch();
  blocked.clear();
  const pad = readPad();
  padPrev = pad ? padState(pad) : [];
  padKey = pad ? padId(pad) : null;
  for (const a of HOLDABLE) if (a !== 'pause' && pad && PAD[a].some((i) => pad.buttons[i]?.pressed)) blocked.add(a);
  for (const k of Object.keys(intents)) intents[k] = typeof intents[k] === 'number' ? 0 : false;
  for (const c of ctrls) c.reset();
  try { dispatchEvent(new CustomEvent('rr-input-reset')); } catch { /* 이벤트 미지원 환경 */ }
}

// 누른 순간 입력은 소비될 때까지(최대 0.22초) 유지한다. 히트스톱 중 입력이 사라지지 않게
// atkD/hvyD 같은 누름 상태는 intents 에서 그대로 복사된다
const EDGES = ['jump', 'atk', 'hvy', 'dash', 'actP', 'grdP'];
export class PlayerCtrl {
  constructor() {
    this.in = { ...intents };
    this.lat = {};
    for (const k of EDGES) this.lat[k] = -1e9;
    // resetInputs/rearm 이 버퍼를 비울 수 있게 등록 (매치마다 새로 만들어지므로 최근 것만 유지)
    ctrls.push(this);
    if (ctrls.length > 8) ctrls.shift();
  }
  poll() {
    const now = performance.now();
    Object.assign(this.in, intents);
    for (const k of EDGES) {
      if (intents[k]) this.lat[k] = now;
      this.in[k] = now - this.lat[k] < 220;
    }
  }
  consume() { for (const k of EDGES) { if (this.in[k]) this.lat[k] = -1e9; this.in[k] = false; } }
  clear(fields) { for (const f of fields) { if (f in this.lat) this.lat[f] = -1e9; if (f in this.in) this.in[f] = false; } }
  reset() {
    for (const k of EDGES) this.lat[k] = -1e9;
    for (const k of Object.keys(this.in)) this.in[k] = typeof this.in[k] === 'number' ? 0 : false;
  }
}

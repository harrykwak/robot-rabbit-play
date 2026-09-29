import * as input from './input.js';
import { RULES } from './data.js';

// ---------------- 제스처 분류 (순수 함수, 노드 테스트 대상) ----------------
// dx/dy: 시작점에서 현재까지 이동(px, 화면 좌표: 위가 음수), ms: 경과 시간.
// 위로 튕기면 점프, 옆·아래로 빠르게 밀면 대시. 느린 끌기와 짧은 떨림은 무시한다.
export const SWIPE = { min: 34, maxMs: 360, upCone: 0.75, flickMin: 40, flickCone: 1.2 };
export function classifySwipe(dx, dy, ms, { scale = 1, upOnly = false } = {}) {
  if (![dx, dy, ms].every(Number.isFinite) || ms < 0 || ms > SWIPE.maxMs) return null;
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const dist = Math.hypot(dx, dy);
  if (dist < (upOnly ? SWIPE.flickMin : SWIPE.min) * k) return null;
  const up = dy < 0 && -dy >= Math.abs(dx) * (upOnly ? SWIPE.flickCone : SWIPE.upCone);
  if (up) return 'jump';
  return upOnly ? null : 'dash';
}

// 호출 칸의 기본 표기. game.contextAction 이 label/hint 를 주면 그걸 쓴다 (나중에 다른 필살기로 교체 가능)
const SPECIAL = {
  call: { label: '호출', hint: '준비!', aria: '호출: 로봇 부르기' },
  board: { label: '탑승', hint: '길게', aria: '탑승: 길게 누르기' },
  exit: { label: '하차', hint: '길게', aria: '하차: 길게 누르기' },
};
const FOOT_SKILLS = [{ name: '강공격' }, { name: '가드', hold: true }];

// game.contextAction 이 없을 때의 대체 계산 (전투 쪽 API 가 들어오면 그쪽을 따른다)
export function fallbackContext(player) {
  if (!player) return { kind: null, progress: 0 };
  const robot = player.riding;
  if (robot) return { kind: 'exit', progress: Math.min(1, (player.ejectHold || 0) / 0.6) };
  if (player.state === 'boarding') return { kind: 'board', progress: Math.min(1, (player.boardT || 0) / (player.boardNeed || 1)) };
  if (player.g?.boardableNear?.(player)) return { kind: 'board', progress: 0 };
  if (player.gauge >= RULES.gaugeMax && !player.robot) return { kind: 'call', progress: 0 };
  return { kind: null, progress: 0 };
}

export function createTouchControls({ onPause = () => {} } = {}) {
  const root = document.createElement('div');
  root.id = 'touch-controls'; root.className = 'touch-controls'; root.hidden = true;
  root.setAttribute('aria-label', '터치 조작');
  const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; };
  // 버튼 바깥 오른쪽 절반: 위로 튕기면 점프, 옆·아래로 밀면 대시
  const swipe = make('div', 'touch-swipe');
  swipe.setAttribute('aria-hidden', 'true');
  const stick = make('div', 'touch-stick');
  stick.setAttribute('aria-label', '이동 스틱. 손가락으로 밀어서 이동');
  const knob = make('div', 'touch-knob'); stick.append(knob);
  const group = make('div', 'touch-actions');
  const status = make('div', 'touch-status');
  const menu = make('button', 'touch-menu', '메뉴'); menu.type = 'button'; menu.setAttribute('aria-label', '일시정지 메뉴');
  const buttons = new Map();
  // 큰 공격 하나 + 작은 스킬 둘 + 필요할 때만 뜨는 특수 칸(호출/탑승/하차)
  const names = { atk: '공격', hvy: '스킬 1', grd: '스킬 2', act: '호출' };
  for (const [action, name] of Object.entries(names)) {
    const btn = make('button', 'touch-btn'); btn.type = 'button'; btn.dataset.touchAction = action;
    const label = make('span', 'touch-label', name), sub = make('span', 'touch-sub');
    btn.append(label, sub); btn.setAttribute('aria-label', name); btn.setAttribute('aria-pressed', 'false');
    group.append(btn); buttons.set(action, { btn, label, sub, ids: new Set(), cd: -1, hold: -1, ready: true, max: 0 });
  }
  const special = buttons.get('act');
  special.btn.classList.add('touch-special');
  special.btn.hidden = true; special.btn.setAttribute('aria-hidden', 'true'); special.btn.tabIndex = -1;
  let specialKind = null;
  root.append(swipe, stick, group, menu, status); document.body.append(root);

  let enabled = false, active = false, stickId = null, center = { x: 0, y: 0 }, radius = 1, scale = 1;
  const usable = () => enabled && active;
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* cancelled pointer */ } };
  const release = (el, id) => { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* detached pointer */ } };
  const pressed = (b, value) => { b.btn.classList.toggle('is-down', value); b.btn.setAttribute('aria-pressed', String(value)); };
  const tap = (action) => { input.setTouchButton(action, true); input.setTouchButton(action, false); };
  const primary = (event) => !(event.pointerType === 'mouse' && event.button !== 0);

  // ---- 스틱 ----
  function endStick() {
    const id = stickId; stickId = null;
    input.setTouchMove(0, 0); knob.style.transform = ''; stick.classList.remove('is-down');
    if (id !== null) release(stick, id);
  }
  function moveStick(event) {
    let x = (event.clientX - center.x) / radius, z = (event.clientY - center.y) / radius;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    knob.style.transform = 'translate(' + x * radius + 'px, ' + z * radius + 'px)';
    // A small resting dead zone prevents accidental boarding cancellation.
    const magnitude = Math.hypot(x, z), amount = Math.max(0, (magnitude - .14) / .86);
    input.setTouchMove(magnitude ? x / magnitude * amount : 0, magnitude ? z / magnitude * amount : 0);
  }
  stick.addEventListener('pointerdown', (event) => {
    if (!usable() || stickId !== null || !primary(event)) return;
    event.preventDefault(); stickId = event.pointerId;
    const rect = stick.getBoundingClientRect(); center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; radius = rect.width * .31;
    capture(stick, stickId); stick.classList.add('is-down'); moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => { if (event.pointerId === stickId) { event.preventDefault(); moveStick(event); } });
  for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(kind, (event) => { if (event.pointerId === stickId) endStick(); });

  // ---- 스와이프 (포인터마다 한 번만 발동) ----
  const swipes = new Map(); // pointerId -> { x, y, t, done, from }
  const now = (event) => (Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : performance.now());
  function track(event, from) { swipes.set(event.pointerId, { x: event.clientX, y: event.clientY, t: now(event), done: false, from }); }
  function judge(event) {
    const s = swipes.get(event.pointerId);
    if (!s || s.done) return null;
    const kind = classifySwipe(event.clientX - s.x, event.clientY - s.y, now(event) - s.t, { scale, upOnly: s.from === 'atk' });
    if (!kind) return null;
    s.done = true;
    if (s.from === 'atk') {
      // 공격 버튼에서 위로 튕기면 점프: 아직 쓰이지 않은 이번 공격 입력은 취소한다
      const b = buttons.get('atk');
      if (b.ids.has(event.pointerId)) { b.ids.delete(event.pointerId); if (!b.ids.size) { input.cancelTouchButton('atk'); pressed(b, false); } }
    }
    tap(kind);
    return kind;
  }
  swipe.addEventListener('pointerdown', (event) => {
    if (!usable() || !primary(event)) return;
    event.preventDefault(); track(event, 'zone'); capture(swipe, event.pointerId);
  });
  swipe.addEventListener('pointermove', (event) => { if (swipes.has(event.pointerId)) { event.preventDefault(); judge(event); } });
  swipe.addEventListener('pointerup', (event) => { judge(event); swipes.delete(event.pointerId); release(swipe, event.pointerId); });
  for (const kind of ['pointercancel', 'lostpointercapture']) swipe.addEventListener(kind, (event) => { swipes.delete(event.pointerId); release(swipe, event.pointerId); });

  // ---- 버튼 ----
  for (const [action, b] of buttons) {
    b.btn.addEventListener('pointerdown', (event) => {
      if (!usable() || !primary(event) || b.btn.hidden) return;
      event.preventDefault(); b.ids.add(event.pointerId); capture(b.btn, event.pointerId);
      input.setTouchButton(action, true); pressed(b, true);
      if (action === 'atk') track(event, 'atk');
    });
    if (action === 'atk') b.btn.addEventListener('pointermove', (event) => { if (swipes.has(event.pointerId)) judge(event); });
    const end = (event) => {
      if (action === 'atk') swipes.delete(event.pointerId);
      if (!b.ids.delete(event.pointerId)) return;
      if (!b.ids.size) {
        if (event.type === 'pointerup') input.setTouchButton(action, false);
        else input.cancelTouchButton(action);
        pressed(b, false);
      }
      release(b.btn, event.pointerId);
    };
    for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) b.btn.addEventListener(kind, end);
    // Keyboard/screen-reader activation of an on-screen button also produces one tap.
    b.btn.addEventListener('click', (event) => { if (event.detail === 0 && usable() && !b.btn.hidden) tap(action); });
    // 준비 완료 반짝임은 한 번만 재생하고 클래스를 치운다
    b.btn.addEventListener('animationend', (event) => { if (event.animationName === 'touch-ready') b.btn.classList.remove('is-ready'); });
  }
  menu.addEventListener('click', () => { if (usable()) { reset(); onPause(); } });
  root.addEventListener('contextmenu', (event) => event.preventDefault());

  function reset() {
    endStick();
    for (const id of swipes.keys()) release(swipe, id);
    swipes.clear();
    for (const b of buttons.values()) {
      const ids = [...b.ids]; b.ids.clear(); pressed(b, false);
      for (const id of ids) release(b.btn, id);
    }
    input.clearTouch();
  }
  const display = () => { root.hidden = !usable(); if (root.hidden) reset(); };
  addEventListener('rr-input-reset', reset);
  addEventListener('blur', reset);
  addEventListener('resize', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  // ---- 표시 갱신: 값이 바뀔 때만 DOM 을 건드린다 ----
  function text(el, value) { if (el.textContent !== value) el.textContent = value; }
  function attr(el, key, value) { if (el.getAttribute(key) !== value) el.setAttribute(key, value); }
  function label(b, name, hint, accessible) {
    text(b.label, name); text(b.sub, hint);
    attr(b.btn, 'aria-label', accessible || name + (hint ? ' · ' + hint : ''));
  }
  // 쿨다운 채움: 1/40 단계가 바뀔 때만 CSS 변수 하나를 쓴다
  function fill(b, key, value, prop) {
    const q = Math.round(Math.max(0, Math.min(1, value)) * 40) / 40;
    if (b[key] === q) return;
    b[key] = q; b.btn.style.setProperty(prop, String(q));
  }
  function skill(b, slot, info) {
    info = info || FOOT_SKILLS[slot - 1];
    const cd = Math.max(0, Number(info?.cd) || 0);
    if (cd <= 0) b.max = 0; else if (cd > b.max) b.max = cd;
    const max = Math.max(Number(info?.cdMax) || 0, b.max, cd);
    const ready = info?.ready ?? cd <= 0;
    // burst: 연속으로 맞는 중 스킬 2 로 브레이크 버스트 가능 (쿨다운과 무관하게 가장 눈에 띄게)
    const burst = !!info?.burst, active = !!info?.active;
    const name = info?.name || FOOT_SKILLS[slot - 1].name;
    fill(b, 'cd', ready || !max ? 0 : cd / max, '--cd');
    const secs = burst ? 'BREAK' : ready ? (info?.hold ? '길게' : '') : cd >= 1 ? Math.ceil(cd) + '초' : cd.toFixed(1) + '초';
    const state = burst ? ', 지금 누르면 브레이크 버스트' : active ? ', 발동 중' : ready ? (info?.hold ? ', 누르고 있기' : ', 사용 가능') : ', ' + Math.ceil(cd) + '초 남음';
    label(b, burst ? '탈출!' : name, secs, '스킬 ' + slot + ': ' + name + state);
    b.btn.classList.toggle('is-cooling', !ready);
    b.btn.classList.toggle('is-burst', burst);
    b.btn.classList.toggle('is-active', active);
    if (ready && !b.ready) b.btn.classList.add('is-ready');
    else if (!ready) b.btn.classList.remove('is-ready');
    b.ready = ready;
  }
  function robotSkills(robot) {
    const list = robot.stats?.skills || [];
    return [['k', 1], ['l', 2]].map(([key, i]) => ({ name: list[i]?.name || '스킬 ' + i, cd: robot.cds?.[key] || 0, cdMax: list[i]?.cd || 0, ready: !(robot.cds?.[key] > 0) }));
  }
  function setSpecial(ctx) {
    const b = special;
    // 누르고 있는 동안 잠깐 비어도 칸을 치우지 않는다 (탑승 중 깜빡임이 입력을 끊지 않게)
    const kind = ctx?.kind || (b.ids.size ? specialKind : null);
    if (kind) {
      const meta = SPECIAL[kind] || {};
      const name = ctx?.label || meta.label || '필살기';
      const hint = ctx?.hint ?? meta.hint ?? '';
      label(b, name, hint, meta.aria && hint === meta.hint && name === meta.label ? meta.aria : '');
      if (b.btn.dataset.kind !== kind) b.btn.dataset.kind = kind;
      // 내 로봇이 멀리 있으면 칸은 보이되 흐리게 (다가가라는 안내)
      b.btn.classList.toggle('is-far', !!ctx?.kind && ctx.near === false && kind === 'board');
      fill(b, 'hold', ctx?.kind ? ctx.progress || 0 : b.hold, '--hold');
    }
    if (kind === specialKind) return;
    specialKind = kind;
    b.btn.hidden = !kind;
    attr(b.btn, 'aria-hidden', String(!kind));
    b.btn.tabIndex = kind ? 0 : -1;
    if (!kind) fill(b, 'hold', 0, '--hold');
  }
  let lastPlayer = null, lastRiding = null;
  function update(player) {
    // Always synchronize role even when on-screen controls are disabled: keys/pad share this boundary.
    input.syncRiding(player);
    if (!usable() || !player) return;
    const robot = player.riding || null;
    // 사람/로봇이 바뀌면 스킬 칸의 최대 쿨다운 기억을 새로 시작한다
    if (player !== lastPlayer || robot !== lastRiding) { lastPlayer = player; lastRiding = robot; for (const b of buttons.values()) { b.ready = true; b.max = 0; } }
    if (player.out || player.dead) { reset(); setSpecial(null); text(status, player.out ? '탈락 · 경기를 관전하고 있어요' : '잠시 뒤 부활해요'); return; }
    root.classList.toggle('is-riding', !!robot);
    label(buttons.get('atk'), robot ? '콤보' : '공격', '', robot ? '로봇 콤보 공격' : '공격 · 연타 콤보 · 위로 튕기면 점프');
    let hud = null;
    // skillHud() 는 탑승 중에도 로봇 스킬 1/2 를 같은 모양으로 준다. 없으면 로봇 쿨다운을 직접 읽는다
    try { hud = typeof player.skillHud === 'function' ? player.skillHud() : null; } catch { hud = null; }
    if (!hud && robot) hud = robotSkills(robot);
    skill(buttons.get('hvy'), 1, hud?.[0]);
    skill(buttons.get('grd'), 2, hud?.[1]);
    let ctx = null;
    try { ctx = typeof player.g?.contextAction === 'function' ? player.g.contextAction(player) : fallbackContext(player); } catch { ctx = fallbackContext(player); }
    setSpecial(ctx);
    if (robot) { text(status, '로봇 탑승 · 내구도 ' + Math.max(0, Math.round(robot.armor / robot.maxArmor * 100)) + '%'); return; }
    const pct = Math.min(100, Math.floor(player.gauge / RULES.gaugeMax * 100));
    if (player.state === 'boarding') text(status, '탑승 중 ' + Math.min(100, Math.floor(player.boardT / player.boardNeed * 100)) + '% · 계속 누르세요');
    else if (hud?.[1]?.burst) text(status, '콤보에 갇혔어요! 스킬 2로 탈출!');
    else if (ctx?.kind === 'board' && ctx.near !== false) text(status, '스틱을 놓고 탑승을 길게 누르세요');
    else if (player.robot && player.robot.state !== 'dead') text(status, '내 로봇에 다가가서 탑승을 길게 누르세요');
    else if (ctx?.kind === 'call') text(status, '당근 MAX! 호출 버튼으로 로봇을 부르세요');
    else text(status, '당근 ' + pct + '% · 공격과 콤보로 게이지를 채워요');
  }
  return {
    setEnabled(value) { enabled = !!value; display(); },
    setActive(value) { active = !!value; display(); },
    reset, update,
    setHandedness(value) { root.classList.toggle('left-handed', !!value); reset(); },
    setScale(value) { scale = Number.isFinite(value) ? Math.max(.85, Math.min(1.15, value)) : 1; root.style.setProperty('--touch-scale', scale); document.documentElement.style.setProperty('--touch-scale', scale); reset(); },
  };
}

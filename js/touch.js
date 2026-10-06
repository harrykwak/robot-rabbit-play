import * as input from './input.js';
import { RULES } from './data.js';
import { ICONS, skillIcon } from './touch-icons.js';

// Large attack in the center, dash/jump beside it, skills/context in an upper arc.
// A dedicated dash keeps moving + dashing possible without a second stick gesture.

export function touchLayout(width, height, { scale = 1, leftHanded = false, safe = {} } = {}) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const k = clamp(Number.isFinite(scale) ? scale : 1, .85, 1.15);
  const inset = key => Math.max(0, Number(safe[key]) || 0);
  const edge = 12, left = inset('left') + edge, right = width - inset('right') - edge;
  const bottom = height - inset('bottom') - edge, narrow = width <= 360;
  const button = Math.max(48, (narrow ? 48 : 52) * k);
  const attack = Math.max(76, (narrow ? 80 : 92) * k);
  const stickSize = Math.max(96, (narrow ? 104 : 120) * k);
  const orbit = (attack + button) / 2 + 12;
  const cx = leftHanded ? left + orbit + button / 2 : right - orbit - button / 2;
  const cy = bottom - attack / 2;
  const box = (x, y, size) => ({ x: x - size / 2, y: y - size / 2, size });
  const buttons = {
    atk: box(cx, cy, attack), dash: box(cx - orbit, cy, button), jump: box(cx + orbit, cy, button),
    hvy: box(cx - orbit * .72, cy - orbit * .72, button),
    act: box(cx, cy - orbit, button), grd: box(cx + orbit * .72, cy - orbit * .72, button),
  };
  const stick = { x: leftHanded ? right - stickSize : left, y: bottom - stickSize, size: stickSize };
  // Include the stick's forgiving 8px hit rim. Move only the stick upward when
  // a narrow portrait, large preference or safe inset makes the controls meet.
  for (const b of Object.values(buttons).sort((a, b) => b.y - a.y)) {
    if (stick.x - 8 < b.x + b.size + 6 && stick.x + stick.size + 8 > b.x - 6
      && stick.y - 8 < b.y + b.size + 6 && stick.y + stick.size + 8 > b.y - 6) stick.y = b.y - stick.size - 14;
  }
  return { buttons, stick, zone: height - Math.min(stick.y - 8, ...Object.values(buttons).map(b => b.y)) };
}

// 호출 칸의 기본 표기. game.contextAction 이 label/hint 를 주면 그걸 쓴다 (나중에 다른 필살기로 교체 가능)
const SPECIAL = {
  supply: { label: '주스 보급', hint: '길게', aria: '주스 보급: 길게 누르기' },
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
  const stick = make('div', 'touch-stick');
  stick.setAttribute('aria-label', '이동 스틱. 밀어서 이동, 같은 방향으로 두 번 튕기면 대시');
  const knob = make('div', 'touch-knob'); stick.append(knob);
  const group = make('div', 'touch-actions');
  const status = make('div', 'touch-status');
  const menu = make('button', 'touch-menu'); menu.type = 'button'; menu.setAttribute('aria-label', '일시정지 메뉴'); menu.title = '일시정지';
  menu.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="4.5" y="3.5" width="4" height="13" rx="1.6"/><rect x="11.5" y="3.5" width="4" height="13" rx="1.6"/></svg>';
  const buttons = new Map();
  const names = { atk: '공격', dash: '대시', jump: '점프', hvy: '스킬 1', act: '호출', grd: '스킬 2' };
  for (const [action, name] of Object.entries(names)) {
    const btn = make('button', 'touch-btn'); btn.type = 'button'; btn.dataset.touchAction = action;
    btn.setAttribute('aria-label', name); btn.setAttribute('aria-pressed', 'false');
    const b = { btn, label: null, sub: make('span', 'touch-sub'), icon: null, iconKey: '', ids: new Set(), cd: -1, hold: -1, ready: true, max: 0 };
    if (action === 'dash' || action === 'jump' || action === 'hvy' || action === 'grd') {
      b.icon = make('span', 'touch-icon');
      b.icon.setAttribute('aria-hidden', 'true');
      btn.append(b.icon, b.sub);
      if (action === 'dash' || action === 'jump') { b.label = make('span', 'touch-label', name); btn.append(b.label); }
    } else {
      b.label = make('span', 'touch-label', name);
      btn.append(b.label, b.sub);
      // 공격(잉크 주먹)과 특수 칸(호출/탑승/하차)도 아이콘 + 글자. 아이콘은 CSS order 로 글자 앞에 온다
      b.glyph = make('span', 'touch-icon touch-glyph');
      b.glyph.setAttribute('aria-hidden', 'true');
      b.glyph.innerHTML = ICONS[action === 'atk' ? 'fist' : 'call'];
      btn.append(b.glyph);
    }
    group.append(btn);
    buttons.set(action, b);
  }
  const setIcon = (b, key) => { if (b.icon && b.iconKey !== key) { b.iconKey = key; b.icon.innerHTML = ICONS[key] || ''; b.btn.dataset.icon = key; } };
  setIcon(buttons.get('jump'), 'jump');
  setIcon(buttons.get('dash'), 'dash');
  buttons.get('jump').btn.classList.add('touch-jump');
  setIcon(buttons.get('hvy'), skillIcon(1, FOOT_SKILLS[0]));
  setIcon(buttons.get('grd'), skillIcon(2, FOOT_SKILLS[1]));
  const special = buttons.get('act');
  special.btn.classList.add('touch-special');
  special.btn.hidden = true; special.btn.setAttribute('aria-hidden', 'true'); special.btn.tabIndex = -1;
  let specialKind = null;
  root.append(stick, group, menu, status); document.body.append(root);

  let enabled = false, active = false, stickId = null, center = { x: 0, y: 0 }, radius = 1;
  let scale = 1, leftHanded = false;
  function layout() {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(root) : {};
    const safe = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key => [key, parseFloat(style['padding' + key[0].toUpperCase() + key.slice(1)]) || 0]));
    const rect = root.getBoundingClientRect();
    const next = touchLayout(rect.width || globalThis.innerWidth || 390, rect.height || globalThis.innerHeight || 844, { scale, leftHanded, safe });
    const place = (el, box) => { el.style.setProperty('--touch-x', box.x + 'px'); el.style.setProperty('--touch-y', box.y + 'px'); el.style.setProperty('--touch-size', box.size + 'px'); };
    place(stick, next.stick); for (const [action, b] of buttons) place(b.btn, next.buttons[action]);
    root.style.setProperty('--touch-zone', next.zone + 'px');
  }
  const usable = () => enabled && active;
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* cancelled pointer */ } };
  const release = (el, id) => { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* detached pointer */ } };
  const pressed = (b, value) => { b.btn.classList.toggle('is-down', value); b.btn.setAttribute('aria-pressed', String(value)); };
  const tap = (action) => { input.setTouchButton(action, true); input.setTouchButton(action, false); };
  const primary = (event) => !(event.pointerType === 'mouse' && event.button !== 0);

  // ---- 스틱 (두 번 튕기면 대시) ----
  const doublePush = input.createDoubleTapDetector();
  const clock = () => performance.now();
  function endStick() {
    const id = stickId; stickId = null;
    input.setTouchMove(0, 0); knob.style.transform = ''; stick.classList.remove('is-down');
    doublePush.update(0, 0, clock()); // 손을 떼면 중립으로 돌아온 것으로 센다 (튕기고 다시 누르기)
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
    if (doublePush.update(x, z, clock())) tap('dash');
  }
  stick.addEventListener('pointerdown', (event) => {
    if (!usable() || stickId !== null || !primary(event)) return;
    event.preventDefault(); stickId = event.pointerId;
    const rect = stick.getBoundingClientRect(); center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; radius = rect.width * .31;
    capture(stick, stickId); stick.classList.add('is-down'); moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => { if (event.pointerId === stickId) { event.preventDefault(); moveStick(event); } });
  for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(kind, (event) => { if (event.pointerId === stickId) endStick(); });

  // ---- 버튼 ----
  for (const [action, b] of buttons) {
    b.btn.addEventListener('pointerdown', (event) => {
      if (!usable() || !primary(event) || b.btn.hidden) return;
      event.preventDefault(); b.ids.add(event.pointerId); capture(b.btn, event.pointerId);
      input.setTouchButton(action, true); pressed(b, true);
    });
    const end = (event) => {
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
    doublePush.reset();
    for (const b of buttons.values()) {
      const ids = [...b.ids]; b.ids.clear(); pressed(b, false);
      for (const id of ids) release(b.btn, id);
    }
    input.clearTouch();
  }
  const display = () => { root.hidden = !usable(); if (root.hidden) reset(); else layout(); };
  addEventListener('rr-input-reset', reset);
  addEventListener('blur', reset);
  const resize = () => { reset(); layout(); };
  addEventListener('resize', resize);
  globalThis.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  // ---- 표시 갱신: 값이 바뀔 때만 DOM 을 건드린다 ----
  function text(el, value) { if (el.textContent !== value) el.textContent = value; }
  function attr(el, key, value) { if (el.getAttribute(key) !== value) el.setAttribute(key, value); }
  function label(b, name, hint, accessible) {
    if (b.label) text(b.label, name);
    text(b.sub, hint);
    attr(b.btn, 'aria-label', accessible || name + (hint ? ' · ' + hint : ''));
  }
  // 쿨다운 채움: 1/40 단계가 바뀔 때만 CSS 변수 하나를 쓴다
  function fill(b, key, value, prop) {
    const q = Math.round(Math.max(0, Math.min(1, value)) * 40) / 40;
    if (b[key] === q) return;
    b[key] = q; b.btn.style.setProperty(prop, String(q));
  }
  // 스킬 칸: 아이콘 + 작은 글씨(쿨다운 초 / 길게 / BREAK). 이름은 aria-label 과 title 에 둔다
  function skill(b, slot, info, kind) {
    info = info || FOOT_SKILLS[slot - 1];
    const cd = Math.max(0, Number(info?.cd) || 0);
    if (cd <= 0) b.max = 0; else if (cd > b.max) b.max = cd;
    const max = Math.max(Number(info?.cdMax) || 0, b.max, cd);
    const ready = info?.ready ?? cd <= 0;
    // burst: 연속으로 맞는 중 스킬 2 로 브레이크 버스트 가능 (쿨다운과 무관하게 가장 눈에 띄게)
    const burst = !!info?.burst, active = !!info?.active;
    // 쿨다운이 아닌 이유로 막힌 경우 (부위 파손 / 쥬스 부족): 초 대신 이유를 보여준다
    const why = ready || burst ? '' : info?.why === 'part' || info?.why === 'juice' ? info.why : '';
    const name = info?.name || FOOT_SKILLS[slot - 1].name;
    setIcon(b, skillIcon(slot, { name, kind: info?.kind || kind, icon: info?.icon }));
    fill(b, 'cd', ready || why || !max ? 0 : cd / max, '--cd');
    const secs = burst ? 'BREAK' : why === 'part' ? '파손' : why === 'juice' ? '쥬스' : ready ? (info?.hold ? '길게' : '') : cd >= 1 ? Math.ceil(cd) + '' : cd.toFixed(1);
    const state = burst ? ', 지금 누르면 브레이크 버스트' : why === 'part' ? ', 부위 파손으로 사용 불가' : why === 'juice' ? ', 당근쥬스 부족' : active ? ', 발동 중' : ready ? (info?.hold ? ', 누르고 있기' : ', 사용 가능') : ', ' + Math.ceil(cd) + '초 남음';
    label(b, name, secs, '스킬 ' + slot + ': ' + name + state);
    attr(b.btn, 'title', name);
    b.btn.classList.toggle('is-cooling', !ready);
    b.btn.classList.toggle('is-locked', !!why);
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
      if (b.glyphKey !== kind) { b.glyphKey = kind; b.glyph.innerHTML = ICONS[kind] || ICONS.call; }
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
    if (player.out || player.dead) { reset(); setSpecial(null); text(status, player.out ? '탈락 · 관전 중' : '잠시 뒤 부활해요'); return; }
    root.classList.toggle('is-riding', !!robot);
    label(buttons.get('atk'), robot ? '콤보' : '공격', '', robot ? '로봇 콤보 공격' : '공격 · 연타하면 콤보');
    let hud = null;
    // skillHud() 는 탑승 중에도 로봇 스킬 1/2 를 같은 모양으로 준다. 없으면 로봇 쿨다운을 직접 읽는다
    try { hud = typeof player.skillHud === 'function' ? player.skillHud() : null; } catch { hud = null; }
    if (!hud && robot) hud = robotSkills(robot);
    // 사람일 때는 파일럿 스킬 종류(guard/roll/barrier...)로 아이콘을 고른다
    skill(buttons.get('hvy'), 1, hud?.[0], robot ? null : player.P?.skill1?.kind);
    skill(buttons.get('grd'), 2, hud?.[1], robot ? null : player.P?.skill2?.kind);
    let ctx = null;
    try { ctx = typeof player.g?.contextAction === 'function' ? player.g.contextAction(player) : fallbackContext(player); } catch { ctx = fallbackContext(player); }
    setSpecial(ctx);
    if (robot) {
      const juice = Math.max(0, Math.round((robot.juice ?? 0) / (robot.maxJuice || 100) * 100));
      // 내구도·쥬스·파손 부위는 내 카드(왼쪽 위)가 늘 보여 준다. 여기서는 행동이 필요할 때만 한 줄
      text(status, player.supplyProgress > 0 ? '보급 중 · 계속 누르세요' : juice <= 0 ? '주스 바닥 · 판매대 구매 / 당근밭에서 갈기' : '');
      return;
    }
    if (player.state === 'boarding') text(status, '탑승 중 ' + Math.min(100, Math.floor(player.boardT / player.boardNeed * 100)) + '% · 계속 누르세요');
    else if (hud?.[1]?.burst) text(status, '콤보에 갇혔어요! 스킬 2로 탈출!');
    else if (ctx?.kind === 'board' && ctx.near !== false) text(status, '스틱을 놓고 탑승을 길게 누르세요');
    else if (player.robot && player.robot.state !== 'dead') text(status, '내 로봇에 다가가서 탑승을 길게 누르세요');
    else if (ctx?.kind === 'call') text(status, '당근 MAX! 호출로 로봇을 불러요');
    else text(status, ''); // 평소엔 비워 둔다: 당근 게이지는 내 카드에 있다
  }
  return {
    setEnabled(value) { enabled = !!value; display(); },
    setActive(value) { active = !!value; display(); },
    reset, update,
    setHandedness(value) { leftHanded = !!value; root.classList.toggle('left-handed', leftHanded); reset(); layout(); },
    setScale(value) { scale = Number.isFinite(value) ? Math.max(.85, Math.min(1.15, value)) : 1; root.style.setProperty('--touch-scale', scale); document.documentElement.style.setProperty('--touch-scale', scale); reset(); layout(); },
  };
}

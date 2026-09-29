import * as input from './input.js';
import { RULES } from './data.js';

export function createTouchControls({ onPause = () => {} } = {}) {
  const root = document.createElement('div');
  root.id = 'touch-controls'; root.className = 'touch-controls'; root.hidden = true;
  root.setAttribute('aria-label', '터치 조작');
  const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; };
  const stick = make('div', 'touch-stick');
  stick.setAttribute('aria-label', '이동 스틱. 손가락으로 밀어서 이동');
  const knob = make('div', 'touch-knob'); stick.append(knob);
  const group = make('div', 'touch-actions');
  const status = make('div', 'touch-status');
  const menu = make('button', 'touch-menu', '메뉴'); menu.type = 'button'; menu.setAttribute('aria-label', '일시정지 메뉴');
  const buttons = new Map();
  const names = { atk: '공격', hvy: '강공격', grd: '가드', jump: '점프', dash: '대시', act: '소환' };
  for (const [action, name] of Object.entries(names)) {
    const btn = make('button', 'touch-btn'); btn.type = 'button'; btn.dataset.touchAction = action;
    const label = make('span', 'touch-label', name), sub = make('span', 'touch-sub');
    btn.append(label, sub); btn.setAttribute('aria-label', name); btn.setAttribute('aria-pressed', 'false');
    group.append(btn); buttons.set(action, { btn, label, sub, ids: new Set() });
  }
  root.append(stick, group, menu, status); document.body.append(root);
  let enabled = false, active = false, stickId = null, center = { x: 0, y: 0 }, radius = 1;
  const usable = () => enabled && active;
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* cancelled pointer */ } };
  const release = (el, id) => { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* detached pointer */ } };
  const pressed = (b, value) => { b.btn.classList.toggle('is-down', value); b.btn.setAttribute('aria-pressed', String(value)); };
  function endStick() {
    const id = stickId; stickId = null;
    input.setTouchMove(0, 0); knob.style.transform = ''; stick.classList.remove('is-down');
    if (id !== null) release(stick, id);
  }
  function moveStick(event) {
    let x = (event.clientX - center.x) / radius, z = (event.clientY - center.y) / radius;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    knob.style.transform = `translate(${x * radius}px, ${z * radius}px)`;
    // A small resting dead zone prevents accidental boarding cancellation.
    const magnitude = Math.hypot(x, z), amount = Math.max(0, (magnitude - .14) / .86);
    input.setTouchMove(magnitude ? x / magnitude * amount : 0, magnitude ? z / magnitude * amount : 0);
  }
  stick.addEventListener('pointerdown', (event) => {
    if (!usable() || stickId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); stickId = event.pointerId;
    const rect = stick.getBoundingClientRect(); center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; radius = rect.width * .31;
    capture(stick, stickId); stick.classList.add('is-down'); moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => { if (event.pointerId === stickId) { event.preventDefault(); moveStick(event); } });
  for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(kind, (event) => { if (event.pointerId === stickId) endStick(); });
  for (const [action, b] of buttons) {
    b.btn.addEventListener('pointerdown', (event) => {
      if (!usable() || (event.pointerType === 'mouse' && event.button !== 0)) return;
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
    b.btn.addEventListener('click', (event) => {
      if (event.detail !== 0 || !usable()) return;
      input.setTouchButton(action, true); input.setTouchButton(action, false);
    });
  }
  menu.addEventListener('click', () => { if (usable()) { reset(); onPause(); } });
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  function reset() {
    endStick();
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
  function text(el, value) { if (el.textContent !== value) el.textContent = value; }
  function label(action, name, hint = '') {
    const b = buttons.get(action); text(b.label, name); text(b.sub, hint);
    const accessible = name + (hint ? ' · ' + hint : '');
    if (b.btn.getAttribute('aria-label') !== accessible) b.btn.setAttribute('aria-label', accessible);
  }
  function update(player) {
    // Always synchronize role even when on-screen controls are disabled: keys/pad share this boundary.
    input.syncRiding(player);
    if (!usable() || !player) return;
    if (player.out || player.dead) { reset(); text(status, player.out ? '탈락 · 경기를 관전하고 있어요' : '잠시 뒤 부활해요'); return; }
    const robot = player.riding;
    label('atk', '공격', '연타'); label('jump', '점프'); label('dash', robot ? '부스트' : '대시');
    if (robot) {
      label('hvy', '스킬 1', robot.cds.k > 0 ? robot.cds.k.toFixed(1) + '초' : '준비');
      label('grd', '스킬 2', robot.cds.l > 0 ? robot.cds.l.toFixed(1) + '초' : '준비');
      label('act', '하차', '길게');
      text(status, `로봇 탑승 · 내구도 ${Math.max(0, Math.round(robot.armor / robot.maxArmor * 100))}%`);
    } else {
      label('hvy', '강공격'); label('grd', '가드', '길게');
      const near = player.g.boardableNear(player);
      const owns = player.robot && player.robot.state !== 'dead';
      const pct = Math.min(100, Math.floor(player.gauge / RULES.gaugeMax * 100));
      label('act', near || owns ? '탑승' : '소환', near || owns ? '길게' : pct >= 100 ? '준비!' : pct + '%');
      if (player.state === 'boarding') text(status, `탑승 중 ${Math.min(100, Math.floor(player.boardT / player.boardNeed * 100))}% · 계속 누르세요`);
      else if (near) text(status, '스틱을 놓고 탑승을 길게 누르세요');
      else if (owns) text(status, '내 로봇에 다가가서 탑승을 길게 누르세요');
      else text(status, pct >= 100 ? '당근 MAX! 소환 버튼으로 로봇을 부르세요' : `당근 ${pct}% · 공격과 콤보로 게이지를 채워요`);
    }
  }
  return {
    setEnabled(value) { enabled = !!value; display(); },
    setActive(value) { active = !!value; display(); },
    reset, update,
    setHandedness(value) { root.classList.toggle('left-handed', !!value); reset(); },
    setScale(value) { const scale = Number.isFinite(value) ? Math.max(.85, Math.min(1.15, value)) : 1; root.style.setProperty('--touch-scale', scale); document.documentElement.style.setProperty('--touch-scale', scale); reset(); },
  };
}

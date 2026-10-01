// HUD, 이름표, 데미지 숫자, 배너
import * as THREE from 'three';
import { RULES, ROBOT_STATS } from './data.js';
import { controlLabel, formatControls } from './control-labels.js';
import { PARTS, PART_BIT, PART_NAME, skillJuice } from './robot-systems.js';

const keyOf = controlLabel;
const partNames = (mask) => { const s = PARTS.filter((k) => mask & PART_BIT[k]).map((k) => PART_NAME[k]).join(', '); return s ? '파괴: ' + s : ''; };
// 작은 SVG 조각: 목숨 하트, 로봇 부위 도식(부서진 부위가 빨갛게), 메뉴(일시정지) 아이콘
const HEART = '<svg viewBox="0 0 10 9" aria-hidden="true"><path d="M5 8.4 1.3 4.9A2.25 2.25 0 1 1 5 2.1a2.25 2.25 0 1 1 3.7 2.8z"/></svg>';
const BOT = '<svg class="bot" viewBox="0 -4 20 26" aria-hidden="true">' +
  '<rect class="p p-head" x="6.5" y="-3.5" width="2.6" height="5" rx="1.3"/><rect class="p p-head" x="10.9" y="-3.5" width="2.6" height="5" rx="1.3"/>' +
  '<rect class="p p-head" x="5.5" y="1" width="9" height="6" rx="2"/>' +
  '<rect class="p-core" x="5.5" y="8" width="9" height="7" rx="2"/>' +
  '<rect class="p p-armL" x="1" y="8" width="3.6" height="8" rx="1.8"/><rect class="p p-armR" x="15.4" y="8" width="3.6" height="8" rx="1.8"/>' +
  '<rect class="p p-legs" x="5.5" y="16" width="3.7" height="5.5" rx="1.6"/><rect class="p p-legs" x="10.8" y="16" width="3.7" height="5.5" rx="1.6"/></svg>';
const PAUSE = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="4.5" y="3.5" width="4" height="13" rx="1.6"/><rect x="11.5" y="3.5" width="4" height="13" rx="1.6"/></svg>';
// 목숨: 남은 수만큼 채운 하트, 잃은 만큼 빈 하트
function renderLives(el, left, max) {
  if (el.childElementCount !== max) el.innerHTML = ('<i>' + HEART + '</i>').repeat(max);
  for (let i = 0; i < max; i++) el.children[i].classList.toggle('lost', i >= left);
  el.setAttribute('aria-label', '목숨 ' + Math.max(0, left));
}

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const tV = new THREE.Vector3();
// DOM writes are the most expensive part of the HUD on phones: every write below is
// cached and only issued when the rounded value changes.
const FLOAT_MAX = 10;      // 떠다니는 글자 전체 상한 (화면이 어지럽지 않게)
const GROUP_MAX = { dmg: 7, call: 3 }; // 종류별 동시 표시 상한: 넘치면 가장 오래된 것을 치운다
const STACK = { dmg: [38, 20], call: [130, 25] }; // 겹침 판정 상자(px). 겹치면 한 칸씩 위로 쌓는다
const DMG_RANK = { '': 0, mid: 1, robot: 2, big: 3 };
const MERGE_T = 0.32;      // 같은 자리 연타 피해는 한 숫자로 합친다
const MERGE_D2 = 1.6 * 1.6;
const NAME_NEAR2 = 11 * 11; // 이 거리 안(또는 최근 교전)의 상대만 이름을 보여 준다
const TAG_GAP = [70, 19];   // 이름표끼리 겹치면 위로 민다
function setShown(el, cache, on) { if (cache.shown !== on) { cache.shown = on; el.style.display = on ? '' : 'none'; } }
function setClass(el, cache, key, cls, on) { if (cache[key] !== on) { cache[key] = on; el.classList.toggle(cls, on); } }
function place(el, cache, x, y, suffix = '') {
  const px = Math.round(x), py = Math.round(y);
  if (cache.x === px && cache.y === py) return;
  cache.x = px; cache.y = py;
  el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)' + suffix;
}
// 막대: 채움 너비 + 스크린리더 값. lag(흰 잔상)는 줄어들 때만 늦게 따라온다
function meterTo(el, fill, lag, v) {
  v = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  fill.style.width = v + '%';
  if (lag) lag.style.width = v + '%';
  el.setAttribute('aria-valuenow', v);
}

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.world = $('#world-ui');
    this.cardsEl = $('#cards');
    this.skillsEl = $('#skills');
    this.comboEl = $('#combo');
    this.bannerEl = $('#banner');
    this.toastEl = $('#toast');
    this.timerEl = $('#timer');
    this.flashEl = $('#flash');
    this.arrow = $('#robot-arrow');
    this.feed = document.createElement('div');
    this.feed.className = 'killfeed';
    $('#hud').appendChild(this.feed);
    this.oppsEl = null;
    const menuBtn = $('#game-menu-btn');
    if (menuBtn) menuBtn.innerHTML = PAUSE;
    this.tagList = [];
    this.cards = new Map();
    this.tags = new Map();
    this.floats = [];
    this.flashV = 0;
    this.toastT = 0;
    this.bannerT = 0;
    this.skillKey = '';
    this.robotInfo = {};
    this.hud = $('#hud');
    this.supplyPanel = document.createElement('div');
    this.supplyPanel.className = 'supply-panel';
    this.supplyPanel.innerHTML = '<b class="ap-balance"></b><span class="supply-route"></span><span class="supply-help"></span><div class="supply-meter"><i></i></div>';
    this.hud.appendChild(this.supplyPanel);
    this.reticle = document.createElement('div');
    this.reticle.className = 'cockpit-reticle';
    this.reticle.innerHTML = '<i></i><span>RABBIT VISION</span>';
    this.hud.appendChild(this.reticle);
    this.comboEndT = 0;
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'ctx-hint';
    this.hintEl.setAttribute('aria-live', 'polite');
    this.hud.appendChild(this.hintEl);
    this.hintT = 0;
    this.hintSeen = new Set();
    this.dom = { arrowOn: false, arrowX: null, arrowY: null, arrowR: null, timerLow: null, flash: '0' };
    // CSS 애니메이션 재시작 대기열. offsetWidth 로 강제 레이아웃을 하지 않고 한 렌더 뒤에 클래스를 다시 붙인다.
    this.restarts = new Map();
    addEventListener('rr-keys-changed', () => { this.skillKey = '#'; });
  }

  restart(el, cls) {
    el.classList.remove(cls);
    this.restarts.set(el, { cls, armed: false });
  }
  flushRestarts() {
    for (const [el, r] of this.restarts) {
      if (!r.armed) { r.armed = true; continue; } // 이번 렌더에서 클래스가 빠진 상태로 스타일이 계산된다
      el.classList.add(r.cls);
      this.restarts.delete(el);
    }
  }

  reset() {
    this.cardsEl.innerHTML = '';
    this.oppsEl = null;
    this.skillsEl.innerHTML = '';
    this.skillsEl.classList.remove('show');
    this.skillKey = '';
    for (const t of this.tags.values()) t.el.remove();
    for (const f of this.floats) f.el.remove();
    this.feed.innerHTML = '';
    this.cards.clear(); this.tags.clear(); this.floats = [];
    this.comboEl.classList.remove('show', 'ended', 'pop');
    this.comboEl.replaceChildren();
    this.comboParts = null;
    this.restarts.clear();
    this.comboEndT = this.toastT = this.bannerT = this.hintT = 0;
    this.flashV = 0;
    this.flashEl.style.opacity = '0';
    this.dom = { arrowOn: false, arrowX: null, arrowY: null, arrowR: null, timerLow: null, flash: '0' };
    this.hud.classList.remove('riding');
    this.supplyPanel.classList.remove('show'); this.reticle.classList.remove('show');
    this.hintEl.classList.remove('show');
    this.hintEl.textContent = '';
    this.hintSeen.clear();
    this.bannerEl.className = 'banner';
    this.bannerEl.textContent = '';
    this.toastEl.classList.remove('show');
    this.toastEl.textContent = '';
    this.arrow.classList.remove('show');
  }

  addFighter(h) {
    const me = !!h.isPlayer;
    const c = document.createElement('div');
    c.className = me ? 'hud-me' : 'hud-chip';
    c.style.setProperty('--c', hex(h.color));
    c.setAttribute('role', 'group');
    const meter = (cls, label) => '<div class="hbar ' + cls + '" role="meter" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100"><i class="lag"></i><i class="fill"></i></div>';
    if (me) {
      // 내 카드: 아바타(탑승 중이면 로봇 부위 도식) | 이름·로봇·목숨 / 체력(또는 로봇 내구도) / 당근 게이지(또는 쥬스)
      c.innerHTML = '<div class="me-avatar"><span class="me-initial" aria-hidden="true"></span><span class="me-bot" role="img">' + BOT + '</span></div>' +
        '<div class="me-body"><div class="me-row"><span class="me-name"></span><span class="me-robot"></span><span class="lives" role="img"></span></div>' +
        meter('hp', '체력') + meter('armor', '로봇 내구도') +
        '<div class="me-sub">' + meter('gauge', '당근 게이지') + meter('juice', '당근쥬스') + '<span class="jnum" aria-hidden="true"></span><span class="gmax" aria-hidden="true">MAX</span></div></div>' +
        '<div class="me-state" aria-live="polite"></div>';
      c.querySelector('.me-initial').textContent = [...h.name][0] || '?';
      c.querySelector('.me-name').textContent = h.name;
      this.cardsEl.prepend(c);
    } else {
      c.innerHTML = '<div class="chip-row"><span class="chip-dot" aria-hidden="true"></span><span class="chip-name"></span><span class="lives" role="img"></span><span class="chip-state"></span></div>' + meter('hp', '체력');
      c.querySelector('.chip-name').textContent = h.name;
      if (!this.oppsEl) { this.oppsEl = document.createElement('div'); this.oppsEl.className = 'hud-opps'; this.cardsEl.appendChild(this.oppsEl); }
      this.oppsEl.appendChild(c);
    }
    c.setAttribute('aria-label', (me ? '나: ' : h.remote ? '친구: ' : 'CPU: ') + h.name);
    const q = (s) => c.querySelector(s);
    this.cards.set(h, {
      el: c, me, maxStock: Math.max(1, h.stock | 0), lives: q('.lives'),
      hp: q('.hp'), fill: q('.hp .fill'), lag: q('.hp .lag'), state: q(me ? '.me-state' : '.chip-state'),
      armor: q('.armor'), afill: q('.armor .fill'), gauge: q('.gauge'), gfill: q('.gauge .fill'),
      juice: q('.juice'), jfill: q('.juice .fill'), jnum: q('.jnum'), bot: q('.me-bot'), rname: q('.me-robot'), last: {},
    });
    const tag = document.createElement('div');
    tag.className = 'ntag' + (me ? ' me' : '');
    tag.style.setProperty('--c', hex(h.color));
    tag.innerHTML = '<span class="ntag-name"></span><div class="ntag-hp"><i></i></div><div class="board"><i></i><span></span></div>';
    tag.querySelector('.ntag-name').textContent = me ? '나' : h.name;
    this.world.appendChild(tag);
    // 이름표 체력바는 width 대신 scaleX 로 줄인다 (레이아웃 없이 합성만)
    const thp = tag.querySelector('.ntag-hp > i');
    this.tags.set(h, { el: tag, hp: thp, board: tag.querySelector('.board'), bfill: tag.querySelector('.board > i'), blabel: tag.querySelector('.board > span'), c: { shown: true, x: null, y: null, bf: -1, far: null, bot: null } });
  }

  addRobot() {}
  removeRobot() {}
  onBoard() {}
  onEject() {}

  set(el, cache, key, val, fn) {
    if (cache[key] === val) return;
    cache[key] = val;
    fn(val);
  }

  update(g, dt) {
    this.flushRestarts();
    // 플래시
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - dt * 5); this.writeFlash(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    // 타이머
    const tl = Math.ceil(g.timeLeft || 0);
    if (this.timerV !== tl) {
      this.timerV = tl;
      this.timerEl.textContent = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    }
    setClass(this.timerEl, this.dom, 'timerLow', 'low', tl <= 30);
    const W = innerWidth, H = innerHeight;
    const me = g.player, meAt = me ? (me.riding || me).pos : null;
    const riding = !!me?.riding && !me.dead && !me.out && g.phase !== 'end';
    this.reticle.classList.toggle('show', riding);
    this.reticle.classList.toggle('damaged', riding && !!(me.riding.broken & PART_BIT.head));
    this.supplyPanel.classList.toggle('show', !!me && !me.dead && !me.out);
    if (me) {
      this.supplyPanel.querySelector('.ap-balance').textContent = Math.floor(me.attackPoints || 0) + ' AP';
      const supply = g.juiceStations?.context(me);
      const route = this.supplyPanel.querySelector('.supply-route');
      const help = this.supplyPanel.querySelector('.supply-help');
      this.supplyPanel.classList.toggle('working', me.supplyProgress > 0);
      this.supplyPanel.querySelector('.supply-meter i').style.transform = 'scaleX(' + (me.supplyProgress || 0) + ')';
      if (supply) {
        route.textContent = supply.label + ' · ' + supply.hint;
        help.textContent = me.supplyProgress > 0 ? Math.round(me.supplyProgress * 100) + '% · 계속 누르세요' : !supply.ready ? '보급 불가 · 하차 버튼 사용 가능' : document.documentElement.classList.contains('touch-mode') ? '멈춰서 주스 보급 버튼을 길게' : controlLabel('act') + ' · 멈춰서 길게';
      } else if (riding) {
        route.textContent = (g.juiceStations?.stations || []).map(s => {
          const dx = s.pos.x - meAt.x, dz = s.pos.z - meAt.z;
          const angle = Math.atan2(dx, dz) - me.riding.facing;
          const arrow = Math.cos(angle) < -.6 ? '뒤' : Math.sin(angle) > .2 ? '←' : Math.sin(angle) < -.2 ? '→' : '↑';
          return (s.kind === 'shop' ? '판매대 ' : '당근밭 ') + arrow + ' ' + Math.round(Math.hypot(dx, dz)) + 'm';
        }).join(' · ');
        help.textContent = '좌우 회전 · 앞뒤 이동';
      } else { route.textContent = '어택 포인트 · 공격 적중으로 획득'; help.textContent = '탑승 후 판매대 20 AP / 당근밭 무료'; }
    }
    const tagsOn = this.tagList; tagsOn.length = 0;
    for (const [h, c] of this.cards) {
      const L = c.last;
      this.set(null, L, 'stock', h.stock, (v) => { if (v > c.maxStock) c.maxStock = v; renderLives(c.lives, v, c.maxStock); });
      const r = h.riding || null;
      const hp = Math.max(0, h.hp) / (h.maxHp || RULES.humanHp) * 100;
      const armor = r ? Math.max(0, r.armor) / r.maxArmor * 100 : 0;
      this.set(null, L, 'ride', !!r, (v) => c.el.classList.toggle('riding', v));
      // 상대 칩은 한 줄짜리: 탑승 중이면 로봇 내구도를 보여 준다 (청록)
      this.set(null, L, 'hp', Math.round(c.me || !r ? hp : armor), (v) => meterTo(c.hp, c.fill, c.lag, v));
      if (c.me) {
        const gv = h.robot ? 0 : h.gauge / RULES.gaugeMax * 100;
        this.set(null, L, 'g', Math.round(gv), (v) => meterTo(c.gauge, c.gfill, null, v));
        this.set(null, L, 'gf', gv >= 100, (v) => c.el.classList.toggle('gauge-full', v));
        if (r) {
          this.set(null, L, 'rn', r.type, () => { c.rname.textContent = this.robotInfo[r.type] ? this.robotInfo[r.type].name : r.type; });
          this.set(null, L, 'ra', Math.round(armor), (v) => meterTo(c.armor, c.afill, null, v));
          const jv = Math.round(Math.max(0, r.juice || 0) / (r.maxJuice || 100) * 100);
          this.set(null, L, 'jv', jv, (v) => {
            meterTo(c.juice, c.jfill, null, v); c.jnum.textContent = v;
            c.el.classList.toggle('juice-low', v < RULES.juiceLow); c.el.classList.toggle('juice-empty', v <= 0);
          });
          this.set(null, L, 'jb', r.broken || 0, (v) => {
            for (const k of PARTS) for (const p of c.bot.querySelectorAll('.p-' + k)) p.classList.toggle('broken', !!(v & PART_BIT[k]));
            c.bot.setAttribute('aria-label', '로봇 부위: ' + (partNames(v) || '모두 정상'));
            c.bot.title = partNames(v);
            c.el.classList.toggle('damaged', v > 0);
          });
        }
      }
      let st = '';
      if (h.out) st = '탈락';
      else if (h.dead) st = c.me ? '부활 대기' : '부활';
      else if (c.me) {
        if (h.state === 'boarding') st = '탑승 중…';
        else if (h.shieldT > 0) st = '배리어';
        else if (!r && h.robot && h.robot.state === 'idle') st = '로봇 대기';
        else if (h.gauge >= RULES.gaugeMax && !h.robot) st = '호출 가능';
      }
      this.set(null, L, 'st', st, (v) => { c.state.textContent = v; });
      this.set(null, L, 'out', !!h.out, (v) => c.el.classList.toggle('out', v));
      this.set(null, L, 'dead', !!h.dead && !h.out, (v) => c.el.classList.toggle('dead', v));
      this.set(null, L, 'sh', h.shieldT > 0, (v) => c.el.classList.toggle('shielded', v));
      // 이름표: 위치만 계산해 두고, 겹침을 푼 다음 한꺼번에 붙인다
      const tag = this.tags.get(h), tc = tag.c;
      const e = r || h;
      if (!h.dead && !h.out) {
        // 렌더 보간된 루트 위치를 따라가야 이름표가 몸과 따로 흔들리지 않는다
        const at = e.rig && e.rig.root.parent ? e.rig.root.position : e.pos;
        tV.set(at.x, at.y + e.height + (r ? 0.6 : 0.4), at.z).project(this.camera);
        const x = (tV.x + 1) / 2 * W, y = (1 - tV.y) / 2 * H;
        const vis = !(riding && h === me) && tV.z >= -1 && tV.z < 1 && x > -60 && x < W + 60 && y > -60 && y < H + 60;
        const boarding = h.state === 'boarding' && h.boardTarget;
        if (vis) {
          // 가까운 상대 · 방금 주고받은 상대 · 탑승 시도 중만 이름을 보여 주고, 나머지는 얇은 체력선만
          let near = !!h.isPlayer || !!boarding || !me;
          if (!near) {
            const dx = e.pos.x - meAt.x, dz = e.pos.z - meAt.z;
            near = dx * dx + dz * dz < NAME_NEAR2 ||
              (h.lastHitBy === me && g.time - h.lastHitT < 3) || (me.lastHitBy === h && g.time - me.lastHitT < 3);
          }
          setClass(tag.el, tc, 'far', 'far', !near);
          tagsOn.push({ tag, x, y, w: boarding ? 100 : h.isPlayer ? 34 : near ? TAG_GAP[0] : 36, h: boarding ? 39 : near || h.isPlayer ? TAG_GAP[1] : 7 });
        } else setShown(tag.el, tc, false);
        this.set(null, L, 'thp', Math.round(r ? armor : hp), (v) => { tag.hp.style.transform = 'scaleX(' + v / 100 + ')'; });
        setClass(tag.el, tc, 'bot', 'bot', !!r);
        this.set(null, L, 'bd', !!boarding, (v) => tag.board.classList.toggle('show', v));
        if (boarding) {
          const enemy = !h.isPlayer;
          this.set(null, L, 'be', enemy, (v) => { tag.board.classList.toggle('enemy', v); tag.blabel.textContent = v ? '탑승 중… 막아요!' : '탑승 중…'; });
          const bf = Math.round(Math.min(100, h.boardT / h.boardNeed * 100));
          if (tc.bf !== bf) { tc.bf = bf; tag.bfill.style.width = bf + '%'; }
        }
      } else setShown(tag.el, tc, false);
    }
    // 이름표 겹침 풀기: 화면 아래(카메라에 가까운) 것부터 자리를 잡고, 겹치는 위쪽 것을 더 위로 민다
    tagsOn.sort((p, q) => q.y - p.y);
    for (let i = 0; i < tagsOn.length; i++) {
      const p = tagsOn[i];
      p.x = Math.max(p.w / 2 + 4, Math.min(W - p.w / 2 - 4, p.x));
      for (let pass = 0; pass < tagsOn.length; pass++) {
        let hit = false;
        for (let j = 0; j < i; j++) {
          const q = tagsOn[j];
          if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && p.y > q.y - q.h && p.y - p.h < q.y) { p.y = q.y - q.h - 2; hit = true; }
        }
        if (!hit) break;
      }
      setShown(p.tag.el, p.tag.c, p.y > p.h + 4);
      place(p.tag.el, p.tag.c, p.x, p.y, ' translateY(-100%)');
    }
    // 스킬 패널
    const pl = g.player;
    const r = pl && pl.riding;
    const key = r ? r.type : '';
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.skillsEl.innerHTML = '';
      this.skillsEl.classList.toggle('show', !!r);
      this.hud.classList.toggle('riding', !!r);
      if (r) this.hint('cancel');
      if (r) {
        this.skillEls = r.stats.skills.map((s) => {
          const d = document.createElement('div');
          d.className = 'skill ready';
          d.innerHTML = '<span class="key"></span><span class="name"></span><span class="jcost"></span><div class="cd"></div>';
          d.querySelector('.key').textContent = keyOf({ J: 'atk', K: 'hvy', L: 'grd' }[s.key] || 'atk');
          d.querySelector('.name').textContent = s.name;
          if (s.juice) d.querySelector('.jcost').textContent = '🥕' + s.juice;
          this.skillsEl.appendChild(d);
          return { d, cd: d.querySelector('.cd'), name: d.querySelector('.name'), jcost: d.querySelector('.jcost'), last: -1, why: null, cost: s.juice || 0 };
        });
        // 당근쥬스는 내 카드(왼쪽 위)에 한 번만 보여 준다
        const ej = document.createElement('div');
        ej.className = 'skill ready';
        ej.innerHTML = '<span class="key"></span><span class="name">길게: 하차</span><div class="cd"></div>';
        ej.querySelector('.key').textContent = keyOf('act');
        this.skillsEl.appendChild(ej);
      }
    }
    if (r && this.skillEls) {
      const cds = [0, r.cds.k, r.cds.l];
      r.stats.skills.forEach((s, i) => {
        const pct = s.cd ? Math.round(cds[i] / s.cd * 100) : 0;
        const se = this.skillEls[i];
        // 스킬 1/2 는 쥬스와 부위 상태도 본다. 기본 콤보(0)는 쥬스가 없어도 쓸 수 있다
        const why = i === 0 ? '' : r.skillBlock(i);
        if (se.last !== pct || se.why !== why) {
          se.last = pct; se.cd.style.height = pct + '%';
          se.d.classList.toggle('ready', why === '');
          se.d.classList.toggle('locked', why === 'part' || why === 'juice');
          se.d.classList.toggle('broken', why === 'part');
        }
        if (se.why !== why) { se.why = why; se.d.title = why === 'part' ? '부위 파손으로 사용 불가' : why === 'juice' ? '당근쥬스 부족' : ''; }
        if (i > 0 && s.juice) {
          const cost = Math.round(skillJuice(r.type, i, r.broken));
          if (se.cost !== cost) { se.cost = cost; se.jcost.textContent = '🥕' + cost; }
        }
      });
    }
    // 내 로봇 방향 화살표
    let target = null;
    if (pl && !pl.riding && !pl.dead) {
      const mr = pl.robot;
      if (mr && mr.state === 'idle') target = mr;
    }
    if (target) {
      tV.copy(target.pos).setY(target.height * 0.5).project(this.camera);
      let x = (tV.x + 1) / 2 * W, y = (1 - tV.y) / 2 * H;
      const behind = tV.z > 1;
      const m = 56;
      const off = behind || x < m || x > W - m || y < m || y > H - m;
      const d = this.dom;
      if (off) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const s = Math.min((W / 2 - m) / Math.abs(dx || 1), (H / 2 - m) / Math.abs(dy || 1));
        const ax = Math.round(W / 2 + dx * s), ay = Math.round(H / 2 + dy * s);
        const rot = Math.round(Math.atan2(dy, dx) * 180 / Math.PI + 90);
        if (d.arrowX !== ax) { d.arrowX = ax; this.arrow.style.left = ax + 'px'; }
        if (d.arrowY !== ay) { d.arrowY = ay; this.arrow.style.top = ay + 'px'; }
        if (d.arrowR !== rot) { d.arrowR = rot; this.arrow.style.setProperty('--rot', rot + 'deg'); }
      }
      setClass(this.arrow, d, 'arrowOn', 'show', off);
    } else setClass(this.arrow, this.dom, 'arrowOn', 'show', false);
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.classList.remove('show'); }
    if (this.comboEndT > 0) { this.comboEndT -= dt; if (this.comboEndT <= 0) this.comboEl.classList.remove('show', 'ended'); }
    // 떠다니는 글자: 먼저 뜬 것이 자리를 지키고, 새로 뜬 것이 겹치면 위로 한 칸 올라간다 (한 번 올라가면 내려오지 않아 흔들리지 않는다)
    const placed = this.placedF || (this.placedF = []); placed.length = 0;
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > f.life) { f.el.remove(); this.floats.splice(i--, 1); continue; }
      tV.copy(f.pos).project(this.camera);
      const vis = tV.z < 1;
      setShown(f.el, f, vis);
      if (!vis) continue;
      let x = (tV.x + 1) / 2 * W + f.ox;
      const y = (1 - tV.y) / 2 * H;
      const [bw, bh] = STACK[f.group];
      // Damage sits beside a nearby nameplate, keeping the face and HP line legible.
      if (f.group === 'dmg') for (const q of tagsOn) {
        if (Math.abs(x - q.x) < (bw + q.w) / 2 && y > q.y - q.h - bh && y < q.y + bh) x = q.x + (bw + q.w) / 2 + 4;
      }
      x = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, x));
      let oy = f.oy;
      for (let pass = 0; pass < 4; pass++) {
        let hit = false;
        for (const q of placed) {
          const qw = STACK[q.group][0];
          if (Math.abs(x - q.x) < (bw + qw) / 2 && Math.abs((y - oy) - q.y) < bh) { oy = y - q.y + bh; hit = true; }
        }
        if (!hit) break;
      }
      f.oy = Math.min(oy, 3 * bh);
      placed.push({ x, y: y - f.oy, group: f.group });
      place(f.el, f, x, y - f.oy);
    }
  }

  float(pos, text, cls, life, rise, n = 0) {
    const group = n ? 'dmg' : 'call';
    // 종류별 상한과 전체 상한: 넘치면 같은 종류에서 가장 오래된 것부터 치운다
    let same = 0;
    for (const f of this.floats) if (f.group === group) same++;
    while (same >= GROUP_MAX[group] || this.floats.length >= FLOAT_MAX) {
      const i = this.floats.findIndex((f) => f.group === group);
      const [f] = this.floats.splice(i < 0 ? 0 : i, 1);
      f.el.remove();
      if (f.group === group) same--;
    }
    const el = document.createElement('div');
    el.className = cls;
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(s);
    const f = { el, span: s, cls, n, group, pos: pos.clone().setY(pos.y + rise), t: 0, life, ox: n ? Math.round((Math.random() - 0.5) * 16) : 0, oy: 0, shown: true, x: null, y: null };
    // 첫 위치를 붙이기 전에 정해 두어야 (0,0)에서 한 프레임 번쩍이지 않는다
    tV.copy(f.pos).project(this.camera);
    place(el, f, (tV.x + 1) / 2 * innerWidth + f.ox, (1 - tV.y) / 2 * innerHeight);
    this.world.appendChild(el);
    this.floats.push(f);
    return f;
  }

  damage(pos, n, kind) {
    if (n <= 0) return;
    const k = kind === 'robot' ? 'robot' : kind === 'big' ? 'big' : kind === 'mid' ? 'mid' : '';
    const cls = 'dmg' + (k === 'robot' ? ' robot' : k === 'big' ? ' big crit' : k === 'mid' ? ' big' : '');
    // 같은 자리에 연달아 들어온 피해는 새 숫자를 띄우지 않고 합계를 올린다
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (!f.n || f.t > MERGE_T) continue;
      const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z;
      if (dx * dx + dz * dz > MERGE_D2) continue;
      f.n += n;
      f.span.textContent = String(f.n);
      // 더 센 등급으로만 바꾼다 (애니메이션은 다시 시작하지 않는다)
      if (DMG_RANK[k] > (f.rank || 0)) { f.rank = DMG_RANK[k]; f.cls = cls; f.el.className = cls; }
      f.life = Math.max(f.life, f.t + 0.5);
      return;
    }
    this.float(pos, String(n), cls, 0.75, 0.3, n).rank = DMG_RANK[k];
  }

  callout(pos, text, kind = '', h = 2.6) {
    // 같은 문구가 겹쳐 뜨지 않게 한다
    for (const f of this.floats) if (!f.n && f.text === text && f.t < 0.6) return;
    this.float(pos, text, 'callout ' + kind, 1.1, h).text = text;
  }

  banner(text, kind) {
    const b = this.bannerEl;
    b.className = 'banner';
    void b.offsetWidth;
    b.textContent = text;
    b.className = 'banner show ' + (kind || '');
    this.bannerT = kind === 'ready' ? 0.75 : 1.4;
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.restart(this.toastEl, 'show');
    this.toastT = 2.6;
  }

  // 콤보 카운터: 타수, 누적 피해, 등급
  combo(n, dmg = 0, rating = '') {
    const c = this.comboEl;
    if (n < 2) { if (!c.classList.contains('ended')) c.classList.remove('show'); return; }
    this.comboEndT = 0;
    c.classList.remove('ended');
    if (!this.comboParts || !c.contains(this.comboParts.n)) {
      c.innerHTML = '<span class="n"></span><span class="t"></span><span class="cd-dmg"></span><span class="rate"></span>';
      this.comboParts = { n: c.querySelector('.n'), t: c.querySelector('.t'), dmg: c.querySelector('.cd-dmg'), rate: c.querySelector('.rate'), v: {} };
    }
    const P = this.comboParts, V = P.v;
    const dt = dmg ? dmg + ' DMG' : '';
    if (V.n !== n) { V.n = n; P.n.textContent = n; }
    if (V.t !== 'HIT') { V.t = 'HIT'; P.t.textContent = 'HIT'; }
    if (V.dmg !== dt) { V.dmg = dt; P.dmg.textContent = dt; }
    if (V.rate !== rating) {
      V.rate = rating;
      P.rate.textContent = rating;
      P.rate.dataset.lv = rating ? String(['GOOD', 'NICE!', 'GREAT!', 'AMAZING!', 'CARROT CRAZY!!'].indexOf(rating)) : '';
    }
    c.classList.add('show');
    this.restart(c, 'pop');
  }

  // 콤보가 끝나면 결과를 잠깐 보여준다
  comboEnd(n, dmg, rating) {
    const c = this.comboEl;
    if (n < 2) { c.classList.remove('show'); return; }
    this.combo(n, dmg, rating);
    this.comboParts.t.textContent = 'HIT COMBO'; this.comboParts.v.t = 'HIT COMBO';
    c.classList.add('ended');
    this.comboEndT = 1.3;
  }

  // 상황별 조작 힌트 (한 판에 종류별로 한 번)
  hint(kind) {
    if (this.hintSeen.has(kind)) return;
    const f = formatControls;
    const msg = {
      jump: '띄웠다! {jump} 로 추격 점프 → 공중에서 {atk} 연타',
      cancel: '로봇 콤보가 맞은 뒤 {hvy} / {grd} 로 스킬 캔슬',
      shield: '배리어 중! 로봇에 다가가 {act} 길게 눌러 탑승',
    }[kind];
    if (!msg) return;
    this.hintSeen.add(kind);
    this.hintEl.textContent = f(msg);
    this.restart(this.hintEl, 'show');
    this.hintT = 3.2;
  }

  // 화면 전체 번쩍임은 눈이 피로하므로 약하게, 짧게
  flash(v) { this.flashV = this.reducedMotion ? 0 : Math.max(this.flashV, v * 0.6); this.writeFlash(); }
  writeFlash() {
    const o = this.flashV.toFixed(2);
    if (this.dom.flash !== o) { this.dom.flash = o; this.flashEl.style.opacity = o; }
  }

  killFeed(msg, color) {
    const d = document.createElement('div');
    d.className = 'kf';
    d.style.setProperty('--c', hex(color));
    d.textContent = msg;
    this.feed.prepend(d);
    while (this.feed.children.length > 4) this.feed.lastChild.remove();
    setTimeout(() => d.remove(), 4500);
  }
}

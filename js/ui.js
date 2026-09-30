// HUD, 이름표, 데미지 숫자, 배너
import * as THREE from 'three';
import { RULES, ROBOT_STATS } from './data.js';
import { controlLabel, formatControls } from './control-labels.js';
import { PARTS, PART_BIT, PART_NAME, skillJuice } from './robot-systems.js';

const keyOf = controlLabel;
// 부서진 부위 표시 (카드 쥬스 줄 오른쪽)
const PART_ICON = { armL: '🦾L', armR: '🦾R', head: '👂', legs: '🦿' };
const partIcons = (mask) => PARTS.filter((k) => mask & PART_BIT[k]).map((k) => PART_ICON[k]).join(' ');
const partNames = (mask) => { const s = PARTS.filter((k) => mask & PART_BIT[k]).map((k) => PART_NAME[k]).join(', '); return s ? '파괴: ' + s : ''; };

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const tV = new THREE.Vector3();
// DOM writes are the most expensive part of the HUD on phones: every write below is
// cached and only issued when the rounded value changes.
const FLOAT_MAX = 14;      // 떠다니는 숫자 상한 (화면이 어지럽지 않게)
const MERGE_T = 0.32;      // 같은 자리 연타 피해는 한 숫자로 합친다
const MERGE_D2 = 1.6 * 1.6;
function setShown(el, cache, on) { if (cache.shown !== on) { cache.shown = on; el.style.display = on ? '' : 'none'; } }
function setClass(el, cache, key, cls, on) { if (cache[key] !== on) { cache[key] = on; el.classList.toggle(cls, on); } }
function place(el, cache, x, y, suffix = '') {
  const px = Math.round(x), py = Math.round(y);
  if (cache.x === px && cache.y === py) return;
  cache.x = px; cache.y = py;
  el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)' + suffix;
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
    this.cards = new Map();
    this.tags = new Map();
    this.floats = [];
    this.flashV = 0;
    this.toastT = 0;
    this.bannerT = 0;
    this.skillKey = '';
    this.robotInfo = {};
    this.hud = $('#hud');
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
    const c = document.createElement('div');
    c.className = 'card' + (h.isPlayer ? ' me' : '');
    c.style.setProperty('--c', hex(h.color));
    c.innerHTML = '<div class="card-top"><span class="card-name"></span><span class="card-stock"></span></div>' +
      '<div class="card-hp"><div class="bar"><div class="lag"></div><div class="fill"></div></div></div>' +
      '<div class="card-gauge"><div class="gfill"></div></div>' +
      '<div class="card-robot"><span class="rlabel"></span><div class="bar rbar"><div class="fill"></div></div></div>' +
      '<div class="card-juice" role="meter" aria-label="당근쥬스" aria-valuemin="0" aria-valuemax="100"><span class="jlabel">🥕</span><div class="bar jbar"><div class="fill"></div></div><span class="jparts"></span></div>' +
      '<div class="card-state"></div><div class="card-shield"></div>';
    c.querySelector('.card-name').textContent = document.documentElement.classList.contains('touch-mode') ? h.name : (h.isPlayer ? '나 ' : h.remote ? '친구 ' : 'CPU ') + h.name;
    this.cardsEl.appendChild(c);
    const q = (s) => c.querySelector(s);
    this.cards.set(h, { el: c, stock: q('.card-stock'), lag: q('.card-hp .lag'), fill: q('.card-hp .fill'), gauge: q('.card-gauge'), gfill: q('.gfill'), robot: q('.card-robot'), rlabel: q('.rlabel'), rfill: q('.rbar .fill'), juice: q('.card-juice'), jfill: q('.jbar .fill'), jparts: q('.jparts'), state: q('.card-state'), shield: q('.card-shield'), last: {} });
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.style.setProperty('--c', hex(h.color));
    tag.innerHTML = '<span class="tag-name"></span><div class="tag-hp"><i></i></div><div class="board"><i></i><span></span></div>';
    tag.querySelector('.tag-name').textContent = h.isPlayer ? '▼ 1P' : h.name;
    this.world.appendChild(tag);
    const thp = tag.querySelector('.tag-hp > i');
    // 이름표 체력바는 width 대신 scaleX 로 줄인다 (레이아웃 없이 합성만)
    thp.style.transformOrigin = '0 50%';
    thp.style.transition = 'transform .1s linear';
    this.tags.set(h, { el: tag, hp: thp, board: tag.querySelector('.board'), bfill: tag.querySelector('.board > i'), blabel: tag.querySelector('.board > span'), c: { shown: true, x: null, y: null, bf: -1 } });
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
    for (const [h, c] of this.cards) {
      const L = c.last;
      this.set(null, L, 'stock', h.stock, (v) => { c.stock.textContent = '♥'.repeat(Math.max(0, v)); });
      const hp = Math.max(0, h.hp) / (h.maxHp || RULES.humanHp) * 100;
      this.set(null, L, 'hp', Math.round(hp), (v) => { c.fill.style.width = v + '%'; c.lag.style.width = v + '%'; });
      const gv = h.robot ? 0 : h.gauge / RULES.gaugeMax * 100;
      this.set(null, L, 'g', Math.round(gv), (v) => { c.gfill.style.width = v + '%'; });
      this.set(null, L, 'gf', gv >= 100, (v) => c.gauge.classList.toggle('full', v));
      const r = h.riding || (h.robot && h.robot.state !== 'dead' ? h.robot : null);
      this.set(null, L, 'rs', !!r, (v) => c.robot.classList.toggle('show', v));
      this.set(null, L, 'js', !!r, (v) => c.juice.classList.toggle('show', v));
      if (r) {
        this.set(null, L, 'rn', r.type + (h.riding ? '1' : '0'), () => { c.rlabel.textContent = (this.robotInfo[r.type] ? this.robotInfo[r.type].name : r.type) + (h.riding ? '' : ' (빈 로봇)'); });
        this.set(null, L, 'ra', Math.round(Math.max(0, r.armor) / r.maxArmor * 100), (v) => { c.rfill.style.width = v + '%'; });
        const jv = Math.round(Math.max(0, r.juice || 0) / (r.maxJuice || 100) * 100);
        this.set(null, L, 'jv', jv, (v) => { c.jfill.style.width = v + '%'; c.juice.setAttribute('aria-valuenow', v); c.juice.classList.toggle('low', v < RULES.juiceLow); c.juice.classList.toggle('empty', v <= 0); });
        this.set(null, L, 'jb', r.broken || 0, (v) => { c.jparts.textContent = partIcons(v); c.jparts.title = partNames(v); });
      }
      let st = '';
      if (h.out) st = '탈락';
      else if (h.dead) st = '부활 대기';
      else if (h.riding) st = '탑승 중';
      else if (h.state === 'boarding') st = '탑승 시도!';
      else if (h.shieldT > 0) st = '🛡 배리어';
      else if (h.gauge >= RULES.gaugeMax && !h.robot) st = '호출 가능';
      this.set(null, L, 'st', st, (v) => { c.state.textContent = v; });
      this.set(null, L, 'out', h.out, (v) => c.el.classList.toggle('out', v));
      const sh = h.shieldT > 0 ? Math.min(100, Math.round(h.shieldT / RULES.shieldTime * 100)) : 0;
      this.set(null, L, 'sh', sh, (v) => { c.shield.style.width = v + '%'; c.el.classList.toggle('shielded', v > 0); });
      // 이름표
      const tag = this.tags.get(h), tc = tag.c;
      const e = h.riding || h;
      const show = !h.dead && !h.out;
      if (show) {
        // 렌더 보간된 루트 위치를 따라가야 이름표가 몸과 따로 흔들리지 않는다
        const at = e.rig && e.rig.root.parent ? e.rig.root.position : e.pos;
        tV.set(at.x, at.y + (h.riding ? e.height + 0.9 : e.height + 0.55), at.z).project(this.camera);
        const x = (tV.x + 1) / 2 * W, y = (1 - tV.y) / 2 * H;
        const vis = tV.z < 1 && x > -60 && x < W + 60 && y > -60 && y < H + 60;
        setShown(tag.el, tc, vis);
        if (vis) place(tag.el, tc, x, y, ' translateY(-100%)');
        this.set(null, L, 'thp', h.riding ? Math.round(Math.max(0, h.riding.armor) / h.riding.maxArmor * 100) : Math.round(hp), (v) => { tag.hp.style.transform = 'scaleX(' + v / 100 + ')'; });
        const boarding = h.state === 'boarding' && h.boardTarget;
        this.set(null, L, 'bd', !!boarding, (v) => tag.board.classList.toggle('show', v));
        if (boarding) {
          const enemy = !h.isPlayer;
          this.set(null, L, 'be', enemy, (v) => { tag.board.classList.toggle('enemy', v); tag.blabel.textContent = v ? '탑승 중… 방해하세요!' : '탑승 중…'; });
          const bf = Math.round(Math.min(100, h.boardT / h.boardNeed * 100));
          if (tc.bf !== bf) { tc.bf = bf; tag.bfill.style.width = bf + '%'; }
        }
      } else setShown(tag.el, tc, false);
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
        const jm = document.createElement('div');
        jm.className = 'skill-juice';
        jm.setAttribute('role', 'meter'); jm.setAttribute('aria-label', '당근쥬스'); jm.setAttribute('aria-valuemin', '0'); jm.setAttribute('aria-valuemax', '100');
        jm.innerHTML = '<span class="jlabel">🥕 쥬스</span><div class="bar jbar"><div class="fill"></div></div><span class="jnum"></span>';
        this.skillsEl.appendChild(jm);
        this.juiceEl = { el: jm, fill: jm.querySelector('.fill'), num: jm.querySelector('.jnum'), last: -1 };
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
      const je = this.juiceEl, jv = Math.round(Math.max(0, r.juice) / r.maxJuice * 100);
      if (je && je.last !== jv) {
        je.last = jv; je.fill.style.width = jv + '%'; je.num.textContent = jv;
        je.el.setAttribute('aria-valuenow', jv);
        je.el.classList.toggle('low', jv < RULES.juiceLow); je.el.classList.toggle('empty', jv <= 0);
      }
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
    // 떠다니는 숫자
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > f.life) { f.el.remove(); this.floats.splice(i, 1); continue; }
      tV.copy(f.pos).project(this.camera);
      const vis = tV.z < 1;
      setShown(f.el, f, vis);
      if (vis) place(f.el, f, (tV.x + 1) / 2 * W + f.ox, (1 - tV.y) / 2 * H);
    }
  }

  float(pos, text, cls, life, rise, n = 0) {
    if (this.floats.length >= FLOAT_MAX) { const f = this.floats.shift(); f.el.remove(); }
    const el = document.createElement('div');
    el.className = cls;
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(s);
    const f = { el, span: s, cls, n, pos: pos.clone().setY(pos.y + rise), t: 0, life, ox: Math.round((Math.random() - 0.5) * 24), shown: true, x: null, y: null };
    // 첫 위치를 붙이기 전에 정해 두어야 (0,0)에서 한 프레임 번쩍이지 않는다
    tV.copy(f.pos).project(this.camera);
    place(el, f, (tV.x + 1) / 2 * innerWidth + f.ox, (1 - tV.y) / 2 * innerHeight);
    this.world.appendChild(el);
    this.floats.push(f);
    return f;
  }

  damage(pos, n, kind) {
    if (n <= 0) return;
    const cls = 'dmg' + (kind === 'robot' ? ' robot' : kind === 'big' ? ' big crit' : kind === 'mid' ? ' big' : '');
    // 같은 자리에 연달아 들어온 피해는 새 숫자를 띄우지 않고 합계를 올린다
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (!f.n || f.t > MERGE_T) continue;
      const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z;
      if (dx * dx + dz * dz > MERGE_D2) continue;
      f.n += n;
      f.span.textContent = String(f.n);
      // 더 센 등급으로만 바꾼다 (애니메이션은 다시 시작하지 않는다)
      if (cls.length > f.cls.length) { f.cls = cls; f.el.className = cls; }
      return;
    }
    this.float(pos, String(n), cls, 0.9, 0.3, n);
  }

  callout(pos, text, kind = '', h = 2.6) {
    // 같은 문구가 겹쳐 뜨지 않게 한다
    for (const f of this.floats) if (!f.n && f.text === text && f.t < 0.5) return;
    this.float(pos, text, 'callout ' + kind, 1.4, h).text = text;
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

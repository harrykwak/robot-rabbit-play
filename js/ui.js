// HUD, 이름표, 데미지 숫자, 배너
import * as THREE from 'three';
import { RULES, ROBOT_STATS } from './data.js';
import { controlLabel, formatControls } from './control-labels.js';

const keyOf = controlLabel;

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const tV = new THREE.Vector3();

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
    addEventListener('rr-keys-changed', () => { this.skillKey = '#'; });
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
    this.comboEndT = this.toastT = this.bannerT = this.hintT = 0;
    this.flashV = 0;
    this.flashEl.style.opacity = '0';
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
      '<div class="card-state"></div><div class="card-shield"></div>';
    c.querySelector('.card-name').textContent = document.documentElement.classList.contains('touch-mode') ? h.name : (h.isPlayer ? '나 ' : h.remote ? '친구 ' : 'CPU ') + h.name;
    this.cardsEl.appendChild(c);
    const q = (s) => c.querySelector(s);
    this.cards.set(h, { el: c, stock: q('.card-stock'), lag: q('.card-hp .lag'), fill: q('.card-hp .fill'), gauge: q('.card-gauge'), gfill: q('.gfill'), robot: q('.card-robot'), rlabel: q('.rlabel'), rfill: q('.rbar .fill'), state: q('.card-state'), shield: q('.card-shield'), last: {} });
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.style.setProperty('--c', hex(h.color));
    tag.innerHTML = '<span class="tag-name"></span><div class="tag-hp"><i></i></div><div class="board"><i></i><span></span></div>';
    tag.querySelector('.tag-name').textContent = h.isPlayer ? '▼ 1P' : h.name;
    this.world.appendChild(tag);
    this.tags.set(h, { el: tag, hp: tag.querySelector('.tag-hp > i'), board: tag.querySelector('.board'), bfill: tag.querySelector('.board > i'), blabel: tag.querySelector('.board > span') });
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
    // 플래시
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - dt * 3.5); this.flashEl.style.opacity = this.flashV.toFixed(3); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    // 타이머
    const tl = Math.ceil(g.timeLeft || 0);
    const ts = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    if (this.timerEl.textContent !== ts) this.timerEl.textContent = ts;
    this.timerEl.classList.toggle('low', tl <= 30);
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
      if (r) {
        this.set(null, L, 'rn', r.type + (h.riding ? '1' : '0'), () => { c.rlabel.textContent = (this.robotInfo[r.type] ? this.robotInfo[r.type].name : r.type) + (h.riding ? '' : ' (빈 로봇)'); });
        this.set(null, L, 'ra', Math.round(Math.max(0, r.armor) / r.maxArmor * 100), (v) => { c.rfill.style.width = v + '%'; });
      }
      let st = '';
      if (h.out) st = '탈락';
      else if (h.dead) st = '부활 대기';
      else if (h.riding) st = '탑승 중';
      else if (h.state === 'boarding') st = '탑승 시도!';
      else if (h.shieldT > 0) st = '🛡 배리어';
      else if (h.gauge >= RULES.gaugeMax && !h.robot) st = '소환 가능';
      this.set(null, L, 'st', st, (v) => { c.state.textContent = v; });
      this.set(null, L, 'out', h.out, (v) => c.el.classList.toggle('out', v));
      const sh = h.shieldT > 0 ? Math.min(100, Math.round(h.shieldT / RULES.shieldTime * 100)) : 0;
      this.set(null, L, 'sh', sh, (v) => { c.shield.style.width = v + '%'; c.el.classList.toggle('shielded', v > 0); });
      // 이름표
      const tag = this.tags.get(h);
      const e = h.riding || h;
      const show = !h.dead && !h.out;
      if (show) {
        tV.set(e.pos.x, e.pos.y + (h.riding ? e.height + 0.9 : e.height + 0.55), e.pos.z).project(this.camera);
        const x = (tV.x + 1) / 2 * W, y = (1 - tV.y) / 2 * H;
        const vis = tV.z < 1 && x > -60 && x < W + 60 && y > -60 && y < H + 60;
        tag.el.style.display = vis ? '' : 'none';
        if (vis) tag.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translateY(-100%)';
        this.set(null, L, 'thp', h.riding ? Math.round(Math.max(0, h.riding.armor) / h.riding.maxArmor * 100) : Math.round(hp), (v) => { tag.hp.style.width = v + '%'; });
        const boarding = h.state === 'boarding' && h.boardTarget;
        this.set(null, L, 'bd', !!boarding, (v) => tag.board.classList.toggle('show', v));
        if (boarding) {
          const enemy = !h.isPlayer && (h.boardTarget.owner === g.player || true);
          this.set(null, L, 'be', enemy, (v) => { tag.board.classList.toggle('enemy', v); tag.blabel.textContent = v ? '탑승 중… 방해하세요!' : '탑승 중…'; });
          tag.bfill.style.width = Math.min(100, h.boardT / h.boardNeed * 100).toFixed(1) + '%';
        }
      } else tag.el.style.display = 'none';
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
          d.innerHTML = '<span class="key"></span><span class="name"></span><div class="cd"></div>';
          d.querySelector('.key').textContent = keyOf({ J: 'atk', K: 'hvy', L: 'grd' }[s.key] || 'atk');
          d.querySelector('.name').textContent = s.name;
          this.skillsEl.appendChild(d);
          return { d, cd: d.querySelector('.cd'), last: -1 };
        });
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
        if (se.last !== pct) { se.last = pct; se.cd.style.height = pct + '%'; se.d.classList.toggle('ready', pct === 0); }
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
      if (off) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const s = Math.min((W / 2 - m) / Math.abs(dx || 1), (H / 2 - m) / Math.abs(dy || 1));
        x = W / 2 + dx * s; y = H / 2 + dy * s;
        this.arrow.style.left = x + 'px'; this.arrow.style.top = y + 'px';
        this.arrow.style.setProperty('--rot', (Math.atan2(dy, dx) * 180 / Math.PI + 90).toFixed(0) + 'deg');
      }
      this.arrow.classList.toggle('show', off);
    } else this.arrow.classList.remove('show');
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.classList.remove('show'); }
    if (this.comboEndT > 0) { this.comboEndT -= dt; if (this.comboEndT <= 0) this.comboEl.classList.remove('show', 'ended'); }
    // 떠다니는 숫자
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > f.life) { f.el.remove(); this.floats.splice(i, 1); continue; }
      tV.copy(f.pos).project(this.camera);
      const x = (tV.x + 1) / 2 * W + f.ox, y = (1 - tV.y) / 2 * H;
      f.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      f.el.style.display = tV.z < 1 ? '' : 'none';
    }
  }

  float(pos, text, cls, life, rise) {
    if (this.floats.length > 40) { const f = this.floats.shift(); f.el.remove(); }
    const el = document.createElement('div');
    el.className = cls;
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(s);
    this.world.appendChild(el);
    this.floats.push({ el, pos: pos.clone().setY(pos.y + rise), t: 0, life, ox: (Math.random() - 0.5) * 30 });
  }

  damage(pos, n, kind) {
    if (n <= 0) return;
    const cls = 'dmg' + (kind === 'robot' ? ' robot' : kind === 'big' ? ' big crit' : kind === 'mid' ? ' big' : '');
    this.float(pos, String(n), cls, 0.9, 0.3);
  }

  callout(pos, text, kind = '', h = 2.6) {
    this.float(pos, text, 'callout ' + kind, 1.4, h);
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
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    this.toastT = 2.6;
  }

  // 콤보 카운터: 타수, 누적 피해, 등급
  combo(n, dmg = 0, rating = '') {
    const c = this.comboEl;
    if (n < 2) { if (!c.classList.contains('ended')) c.classList.remove('show'); return; }
    this.comboEndT = 0;
    c.classList.remove('ended');
    if (!c.firstChild || !c.querySelector('.n')) c.innerHTML = '<span class="n"></span><span class="t"></span><span class="cd-dmg"></span><span class="rate"></span>';
    c.querySelector('.n').textContent = n;
    c.querySelector('.t').textContent = 'HIT';
    c.querySelector('.cd-dmg').textContent = dmg ? dmg + ' DMG' : '';
    const re = c.querySelector('.rate');
    re.textContent = rating;
    re.dataset.lv = rating ? String(['GOOD', 'NICE!', 'GREAT!', 'AMAZING!', 'CARROT CRAZY!!'].indexOf(rating)) : '';
    c.classList.add('show');
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
  }

  // 콤보가 끝나면 결과를 잠깐 보여준다
  comboEnd(n, dmg, rating) {
    const c = this.comboEl;
    if (n < 2) { c.classList.remove('show'); return; }
    this.combo(n, dmg, rating);
    c.querySelector('.t').textContent = 'HIT COMBO';
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
    this.hintEl.classList.remove('show');
    void this.hintEl.offsetWidth;
    this.hintEl.classList.add('show');
    this.hintT = 3.2;
  }

  flash(v) { this.flashV = this.reducedMotion ? 0 : Math.max(this.flashV, v); this.flashEl.style.opacity = this.flashV.toFixed(3); }

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

// HUD, 이름표, 데미지 숫자, 배너
import * as THREE from 'three';
import { visibleEnemyAnchor, createEnemyVisibilityFrame } from './enemy-visibility.js';
import { RULES } from './data.js';
import { controlLabel, formatControls } from './control-labels.js';
import { PARTS, PART_BIT, PART_NAME, skillJuice } from './robot-systems.js';
import { portraitUrl } from './ui-portraits.js';
import { showMatchIntro, hideMatchIntro } from './ui-intro.js';

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
const STACK = { dmg: [96, 42], call: [180, 34] }; // Outlined crit digits and skill tags need their full painted bounds.
const DMG_RANK = { '': 0, mid: 1, robot: 2, big: 3 };
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
// 막대: 채움 너비 + 스크린리더 값. lag(흰 잔상)는 줄어들 때만 늦게 따라온다
function meterTo(el, fill, lag, v) {
  v = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  fill.style.transform = 'scaleX(' + v / 100 + ')';
  if (lag) lag.style.transform = 'scaleX(' + v / 100 + ')';
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
    this.supplyPanel.innerHTML = '<span class="supply-progress-label"></span><div class="supply-meter"><i></i></div>';
    this.hud.appendChild(this.supplyPanel);
    this.reticle = document.createElement('div');
    this.reticle.className = 'cockpit-reticle';
    this.reticle.innerHTML = '<i></i><b class="hit-marker" aria-hidden="true"></b>';
    this.hud.appendChild(this.reticle);
    this.comboEndT = 0;
    this.hintEl = document.createElement('div');
    this.hintEl.id = 'context-hint';
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
    hideMatchIntro();
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
    this.hintKind = null;
    this.introHintShown = false;
    this.bannerEl.className = 'banner';
    this.bannerEl.textContent = '';
    this.toastEl.classList.remove('show');
    this.toastEl.textContent = '';
    this.arrow.classList.remove('show');
  }

  addFighter(h) {
    const me=!!h.isPlayer;
    if(me){
      const c=document.createElement('div');c.className='hud-me';c.setAttribute('role','group');c.setAttribute('aria-label','내 체력과 로봇 상태');
      const meter=(cls,label)=>'<div class="hbar '+cls+'" role="meter" aria-label="'+label+'" aria-valuemin="0" aria-valuemax="100"><i class="lag"></i><i class="fill"></i></div>';
      c.style.setProperty('--fighter',hex(h.color));
      c.innerHTML='<div class="me-avatar"><img class="fighter-bust" alt="" width="80" height="80"><span class="me-you">나</span><span class="me-bot" role="img">'+BOT+'</span></div>'+
        '<div class="me-body"><div class="me-row"><span class="me-name"></span><span class="lives" role="img"></span></div><span class="me-health-label">체력</span>'+meter('hp','내 체력')+meter('armor','로봇 내구도')+
        '<div class="me-sub"><span class="me-resource-label">호출</span>'+meter('gauge','호출 게이지')+meter('juice','당근 주스')+'<span class="gnum" aria-hidden="true"></span><span class="jnum" aria-hidden="true"></span></div></div><div class="me-state" aria-live="polite"></div>';
      this.cardsEl.prepend(c);const q=sel=>c.querySelector(sel);
      q('.me-name').textContent=h.name;
      this.cards.set(h,{el:c,me:true,maxStock:Math.max(1,h.stock|0),lives:q('.lives'),hp:q('.hp'),fill:q('.hp .fill'),lag:q('.hp .lag'),state:q('.me-state'),armor:q('.armor'),afill:q('.armor .fill'),gauge:q('.gauge'),gfill:q('.gauge .fill'),juice:q('.juice'),jfill:q('.juice .fill'),jnum:q('.jnum'),gnum:q('.gnum'),healthLabel:q('.me-health-label'),resourceLabel:q('.me-resource-label'),bot:q('.me-bot'),last:{}});
    } else {
      if(!this.oppsEl){this.oppsEl=document.createElement('div');this.oppsEl.className='hud-opps';this.cardsEl.append(this.oppsEl);}
      const c=document.createElement('div');c.className='hud-chip';c.style.setProperty('--fighter',hex(h.color));c.setAttribute('aria-label',h.name);
      c.innerHTML='<div class="chip-avatar"><img class="fighter-bust" alt="" width="48" height="48"><span class="chip-ko">K.O.</span></div><div class="chip-body"><span class="chip-name"></span><div class="hbar hp" role="meter" aria-label="체력" aria-valuemin="0" aria-valuemax="100"><i class="fill"></i></div><span class="lives" role="img"></span><span class="chip-state"></span></div>';
      this.oppsEl.append(c);const q=s=>c.querySelector(s);q('.chip-name').textContent=h.name;
      this.cards.set(h,{el:c,me:false,maxStock:Math.max(1,h.stock|0),lives:q('.lives'),hp:q('.hp'),fill:q('.fill'),lag:null,state:q('.chip-state'),last:{}});
    }
    const card=this.cards.get(h);card.portrait=card.el.querySelector('.fighter-bust');card.portrait.src=portraitUrl('pilot',h.P.id);
    const tag=document.createElement('div');tag.className='ntag'+(me?' me':'');tag.style.display='none';tag.dataset.actor=String(h.id);
    if(!me)tag.dataset.enemyHealth='true';
    tag.innerHTML='<div class="ntag-hp" role="meter" aria-label="적 체력" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="board"><i></i><span></span></div>';
    tag.style.setProperty('--fighter',hex(h.color));
    if(!me){const name=document.createElement('span');name.className='ntag-name';name.textContent=h.name;tag.prepend(name);}
    if(me)tag.querySelector('.ntag-hp').style.display='none';
    this.world.appendChild(tag);
    this.tags.set(h,{el:tag,hp:tag.querySelector('.ntag-hp > i'),board:tag.querySelector('.board'),bfill:tag.querySelector('.board > i'),blabel:tag.querySelector('.board > span'),c:{shown:false,x:null,y:null,bf:-1,bot:null}});
  }

  addRobot() {}
  intro(game, cfg) { showMatchIntro(game, cfg); }
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
    // The controls publish their occupied height inline. Reading that string does
    // not query layout; copy it only on resize/settings changes.
    this.touchRoot ||= document.getElementById('touch-controls');
    const zone=this.touchRoot?.style.getPropertyValue('--touch-zone');
    if(zone)this.set(null,this.dom,'touchZone',zone,v=>this.hud.style.setProperty('--hud-touch-zone',v));
    // 플래시
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - dt * 5); this.writeFlash(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    // 타이머
    const tl = Math.ceil(g.timeLeft || 0);
    if (this.timerV !== tl) {
      this.timerV = tl;
      this.timerEl.textContent = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
      if(tl<=10)this.restart(this.timerEl,'tick');
    }
    setClass(this.timerEl, this.dom, 'timerLow', 'low', tl <= 30);
    const W = innerWidth, H = innerHeight;
    const me = g.player;
    const riding = !!me?.riding && !me.dead && !me.out && g.phase !== 'end';
    setClass(this.reticle,this.dom,'reticle','show',riding);
    setClass(this.reticle,this.dom,'reticleHit','hit',riding && g.cockpitCamera.hitTime > 0);
    setClass(this.reticle,this.dom,'reticleDamage','damaged',riding && !!(me.riding.broken & PART_BIT.head));
    const supplying=!!me&&!me.dead&&!me.out&&me.supplyProgress>0;
    setClass(this.supplyPanel,this.dom,'supply','show',supplying);
    if(supplying)this.set(null,this.dom,'supplyPct',Math.round(me.supplyProgress*100),v=>{this.supplyPanel.querySelector('.supply-progress-label').textContent='주스 충전 '+v+'%';this.supplyPanel.querySelector('.supply-meter i').style.transform='scaleX('+v/100+')'});
    const tagsOn = this.tagList; tagsOn.length = 0;
    for (const [h, c] of this.cards) {
      const L = c.last;
      this.set(null, L, 'stock', h.stock, (v) => { if (v > c.maxStock) c.maxStock = v; renderLives(c.lives, v, c.maxStock); });
      const r = h.riding || null;
      const hp = Math.max(0, h.hp) / (h.maxHp || RULES.humanHp) * 100;
      const armor = r ? Math.max(0, r.armor) / r.maxArmor * 100 : 0;
      this.set(null, L, 'ride', !!r, (v) => {
        c.el.classList.toggle('riding', v);
        if(c.me){c.healthLabel.textContent = v ? '내구도' : '체력';c.resourceLabel.textContent = v ? '주스' : '호출';}
      });
      this.set(null,L,'portrait',r ? r.type : h.P.id,v=>{c.portrait.src=portraitUrl(r?'robot':'pilot',v);});
      // 상대 칩은 한 줄짜리: 탑승 중이면 로봇 내구도를 보여 준다 (청록)
      this.set(null, L, 'hp', Math.round(c.me || !r ? hp : armor), (v) => meterTo(c.hp, c.fill, c.lag, v));
      if (c.me) {
        const gv = h.robot ? 0 : h.gauge / RULES.gaugeMax * 100;
        this.set(null, L, 'g', Math.round(gv), (v) => meterTo(c.gauge, c.gfill, null, v));
        this.set(null, L, 'gf', gv >= 100, (v) => c.el.classList.toggle('gauge-full', v));
        // An existing robot locks the summon meter; zero must not imply lost progress.
        const summon = h.robot ? '대기' : gv >= 100 ? '준비!' : Math.round(gv) + '%';
        this.set(null, L, 'summon', summon, (v) => {
          c.gnum.textContent = v;
          c.gauge.setAttribute('aria-valuetext', h.robot ? '내 로봇이 있어 호출 대기 중' : gv >= 100 ? '로봇 호출 준비 완료' : v);
        });
        if (r) {
          this.set(null, L, 'ra', Math.round(armor), (v) => meterTo(c.armor, c.afill, null, v));
          const jv = Math.round(Math.max(0, r.juice || 0) / (r.maxJuice || 100) * 100);
          this.set(null, L, 'jv', jv, (v) => {
            meterTo(c.juice, c.jfill, null, v); c.jnum.textContent = v + '%';
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
      }
      this.set(null, L, 'st', st, (v) => { c.state.textContent = v; });
      this.set(null, L, 'out', !!h.out, (v) => c.el.classList.toggle('out', v));
      this.set(null, L, 'dead', !!h.dead && !h.out, (v) => c.el.classList.toggle('dead', v));
      this.set(null, L, 'sh', h.shieldT > 0, (v) => c.el.classList.toggle('shielded', v));
      // 이름표: 위치만 계산해 두고, 겹침을 푼 다음 한꺼번에 붙인다
    }
    const visibilityFrame=createEnemyVisibilityFrame({fastBodies:true});
    // Visibility is a 15 Hz query; projection still follows the interpolated
    // actor/camera every display frame. A health bar never stalls combat.
    const now = g.time;
    const refreshVisibility = !this.nextVisibility || now >= this.nextVisibility || now < this.lastVisibility || this.visibilityMode !== g.cockpitCamera?.mode;
    if (refreshVisibility) { this.nextVisibility = now + 1/15; this.lastVisibility = now; this.visibilityMode = g.cockpitCamera?.mode; }
    for(const[h,tag]of this.tags){
      const tc=tag.c,own=h===me,boarding=own&&!h.dead&&!h.out&&h.state==='boarding'&&h.boardTarget;
      let anchor=null;
      if(boarding){const at=h.rig?.root?.position||h.pos;tV.set(at.x,at.y+h.height+.3,at.z).project(this.camera);if(tV.z>=-1&&tV.z<1&&Math.abs(tV.x)<1&&Math.abs(tV.y)<1)anchor={x:(tV.x+1)*W/2,y:(1-tV.y)*H/2,ratio:1}}
      else if(!own && !h.dead && !h.out && h.respawnT <= 0){
        if(refreshVisibility || tag.entity !== (h.riding || h)) {
          tag.anchor=visibleEnemyAnchor(g,this.camera,h,{frame:visibilityFrame,viewport:{width:W,height:H},acceptPoint:({x,y})=>{
        const barY=y-8;
        if(x<24||x>W-24||barY<66||barY>H-8)return false;
        if(tagsOn.some(q=>Math.abs(q.x-x)<(q.w+40)/2&&Math.abs(q.y-barY)<10))return false;
        return !Object.values(g.rearView?.rects||{}).some(b=>!g.rearView.panel.hidden&&b.height&&x+20>b.left&&x-20<b.left+b.width&&barY>b.top&&barY-8<b.top+b.height);
          }});
          tag.entity=h.riding||h;
          if(tag.anchor)tag.localAnchor=tag.entity.rig.root.worldToLocal(tag.anchor.world.clone());
        }
        if(tag.anchor){
          const e=tag.entity;e.rig.root.updateWorldMatrix(true,false);
          tV.copy(tag.localAnchor).applyMatrix4(e.rig.root.matrixWorld).project(this.camera);
          if(tV.z>=-1&&tV.z<1&&Math.abs(tV.x)<1&&Math.abs(tV.y)<1)anchor={x:(tV.x+1)*W/2,y:(1-tV.y)*H/2,ratio:(e.armor??e.hp)/(e.maxArmor??e.maxHp)};
        }
      }
      setClass(tag.el,tc,'bot','bot',!!h.riding);
      setClass(tag.board,tc,'boarding','show',!!boarding);
      if(boarding){const progress=Math.round(Math.min(100,h.boardT/h.boardNeed*100));this.set(null,tc,'bf',progress,v=>{tag.blabel.textContent='탑승 '+v+'%';tag.bfill.style.transform='scaleX('+v/100+')'});}
      if(!anchor){setShown(tag.el,tc,false);continue}
      const w=boarding?80:64,hp=Math.round(anchor.ratio*100),x=anchor.x,y=anchor.y-8;
      if(tc.hp!==hp){tc.hp=hp;tag.hp.style.transform='scaleX('+hp/100+')';tag.hp.parentElement.setAttribute('aria-valuenow',String(hp))}
      const paneOverlap=Object.values(g.rearView?.rects||{}).some(b=>!g.rearView.panel.hidden&&x+w/2>b.left&&x-w/2<b.left+b.width&&y>b.top&&y-8<b.top+b.height);
      const overlaps=tagsOn.some(q=>Math.abs(q.x-x)<(q.w+w)/2&&Math.abs(q.y-y)<10);
      if(paneOverlap||overlaps||x<w/2+4||x>W-w/2-4||y<66||y>H-8){setShown(tag.el,tc,false);continue}
      tagsOn.push({tag,x,y,w,h:8});setShown(tag.el,tc,true);place(tag.el,tc,x,y,' translateY(-100%)');
    }
    const pl = g.player;
    const r = pl && pl.riding;
    if (!this.introHintShown && g.phase === 'fight' && pl && !pl.dead && !pl.out) {
      this.introHintShown = true;
      if (!r && this.hintT <= 0) this.hint('start');
    }
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
          se.last = pct; se.cd.style.transform = 'scaleY(' + pct / 100 + ')';
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
        place(this.arrow,d,ax,ay);
        if (d.arrowR !== rot) { d.arrowR = rot; this.arrow.style.setProperty('--rot', rot + 'deg'); }
      }
      setClass(this.arrow, d, 'arrowOn', 'show', off);
    } else setClass(this.arrow, this.dom, 'arrowOn', 'show', false);
    this.updateHint(g, dt, supplying);
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
    if(kind==='go')hideMatchIntro();
    const b = this.bannerEl;
    b.className = 'banner';
    b.textContent = text;
    b.className = 'banner ' + (kind || '');
    this.restart(b,'show');
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
  updateHint(g, dt, supplying = false) {
    if (this.hintT <= 0) return;
    const player = g.player;
    // Give urgent messages the shared message lane without spending reading time.
    const invalid = !player || player.dead || player.out || g.phase === 'end'
      || (this.hintKind === 'cancel' && !player.riding)
      || (this.hintKind === 'shield' && player.riding);
    if (invalid) this.hintT = 0;
    else if (this.toastT <= 0 && this.bannerT <= 0 && !supplying) this.hintT -= dt;
    if (this.hintT <= 0) {
      // A deferred restart must not resurrect the tip after death or dismount.
      this.restarts.delete(this.hintEl);
      this.hintEl.classList.remove('show');
    }
  }

  hint(kind) {
    if (this.hintSeen.has(kind)) return;
    // The compact key legend starts collapsed; only an explicit opt-out disables tips.
    try { if (JSON.parse(localStorage.getItem('rr-hint') || 'null')?.on === false) return; } catch { /* Storage can be unavailable. */ }
    const touch = document.documentElement.classList.contains('touch-mode');
    const f = formatControls;
    const msg = {
      start: touch ? '스틱으로 이동 · 공격해서 호출 게이지를 채우세요' : '{atk}로 공격해 게이지를 채우면 {act}로 로봇을 호출해요',
      jump: touch ? '적을 띄웠어요! 점프 → 공중에서 공격 연타' : '적을 띄웠어요! {jump} 점프 → 공중에서 {atk} 연타',
      cancel: touch ? '콤보가 맞으면 스킬 1 · 2로 이어 공격하세요' : '콤보가 맞으면 {hvy} · {grd}로 스킬을 이어 쓰세요',
      shield: touch ? '배리어 중! 로봇 가까이에서 탑승 버튼을 길게 누르세요' : '배리어 중! 로봇 가까이에서 {act}를 길게 눌러 탑승',
    }[kind];
    if (!msg) return;
    this.hintSeen.add(kind);
    this.hintKind = kind;
    this.hintEl.textContent = f(msg);
    this.restart(this.hintEl, 'show');
    this.hintT = 4.5;
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
    // Resolve portraits only from fighters actually named in this real event.
    const actors=[...this.cards.keys()].filter(h=>msg.includes(h.name)).sort((a,b)=>msg.indexOf(a.name)-msg.indexOf(b.name));
    if(actors[0]){const im=document.createElement('img');im.src=portraitUrl('pilot',actors[0].P.id);im.alt='';d.append(im);}
    const label=document.createElement('span');label.textContent=msg;d.append(label);
    if(actors[1]){const im=document.createElement('img');im.src=portraitUrl('pilot',actors[1].P.id);im.alt='';d.append(im);}
    this.feed.prepend(d);
    while (this.feed.children.length > 4) this.feed.lastChild.remove();
    setTimeout(() => d.remove(), 4500);
  }
}

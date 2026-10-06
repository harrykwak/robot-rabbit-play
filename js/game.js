// 난투 진행: 전투 판정, 호출, 탑승, 로봇 스킬, 발사체, 카메라, 규칙
import * as THREE from 'three';
import { Human, Robot, EJECT_HOLD } from './entities.js';
import { createCarrot } from './models.js';
import { ROBOT_STATS, RULES, PILOTS, ROBOT_ORDER, DIFFICULTY } from './data.js';
import { localHit, pickPart, damagePart, comboDamageMul, COMBO_MOVES } from './robot-systems.js';
import { AICtrl } from './ai.js';
import * as audio from './audio.js';
import * as input from './input.js';
import { CAMERA_PITCH, cameraViewport, cameraSubject, fitSubject, frameCombat, cameraAim } from './camera-framing.js';
import { CockpitCamera, prepareMountedInput } from './cockpit.js';
import { JuiceStations, JUICE_SERVICE } from './juice-stations.js';
import { contactAgainstTarget } from './robot-combat.js';

const keyName = (a) => document.documentElement.classList.contains('touch-mode') && a === 'act' ? '호출 버튼' : input.actionLabel(a);

const V = () => new THREE.Vector3();
const tA = V(), tB = V(), tC = V(), tD = V(), tDir = V(), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const tLocal = { side: 0, h: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 히트스톱/흔들림: 작은 타격은 가볍게, 큰 타격만 묵직하게
const HS = [0.04, 0.07, 0.115, 0.18];
const SHAKE = [0.04, 0.12, 0.3, 0.56];
// 인트로 카운트다운 한 칸 길이 (초)
export const INTRO_STEP = 0.55;

// CPU 파일럿 고르기: 혼자 할 때는 무작위, 친구 대전은 두 기기가 같은 결과를 내도록 설정값으로 정한다
export function pickOpponents(cfg, count, rand = Math.random) {
  if(cfg.roster){
    const taken=cfg.roster.map(p=>p.pilot), pool=PILOTS.map((p,i)=>i).filter(i=>!taken.includes(i));
    return [...taken,...pool].slice(0,count);
  }
  const taken = [cfg.pilot];
  if (cfg.peer) taken.push(cfg.peer.pilot);
  const pool = PILOTS.map((p, i) => i).filter((i) => !taken.includes(i));
  let seed = 0;
  if (cfg.peer) {
    const key = [cfg.pilot, cfg.peer.pilot, cfg.stage, cfg.robot, cfg.peer.robot, cfg.playerName, cfg.peer.name].join('|');
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return [...taken, ...pool].slice(0, count);
}
const STUN = new Set(['hurt', 'launched', 'down']);
// 콤보 등급: 타수 기준
const RATINGS = [[25, 'CARROT CRAZY!!'], [15, 'AMAZING!'], [10, 'GREAT!'], [6, 'NICE!'], [3, 'GOOD']];
export function comboRating(n) { for (const [k, s] of RATINGS) if (n >= k) return s; return ''; }

// 배리어 셰이더: 가장자리가 밝은 반투명 구체 + 흐르는 줄무늬
function shieldMaterial(color) {
  // 색별로 재사용한다. 새 ShaderMaterial 은 프로그램 조회 비용이 크다
  const free = shieldPool.get(color);
  if (free && free.length) { const m = free.pop(); m.uniforms.alpha.value = 1; m.uniforms.time.value = 0; return m; }
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, alpha: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float time; uniform float alpha; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); float band = smoothstep(0.82, 1.0, sin(vP.y * 14.0 - time * 7.0)); float hex = smoothstep(0.9, 1.0, abs(sin(atan(vP.z, vP.x) * 9.0)) ) * 0.25; float a = (0.06 + f * 0.85 + band * 0.18 + hex * f) * alpha; gl_FragColor = vec4(color * (1.3 + f * 1.8), a); }',
  });
  m.userData.poolColor = color;
  return m;
}
const shieldPool = new Map();
function releaseShieldMaterial(m) {
  const c = m.userData.poolColor;
  if (c === undefined) { m.dispose(); return; }
  if (!shieldPool.has(c)) shieldPool.set(c, []);
  const list = shieldPool.get(c);
  if (list.length < 3) list.push(m); else m.dispose();
}

export class Game {
  constructor({ scene, camera, fx, ui, arena }) {
    this.scene = scene;
    this.camera = camera;
    this.fx = fx;
    this.ui = ui;
    this.arena = arena;
    this.humans = [];
    this.robots = [];
    this.projectiles = [];
    this.carrots = [];
    this.timers = [];
    this.robotSeq = 0;
    this.time = 0;
    this.phase = 'idle';
    this.timeScale = 1;
    this.slowT = 0;
    this.trauma = 0;
    this.camPos = new THREE.Vector3(0, 20, 26);
    this.camLook = new THREE.Vector3();
    this.camLead = new THREE.Vector3();
    this.camDist = 20;
    this.zoomPunch = 0;
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    this.shotGeo = new THREE.SphereGeometry(0.42, 12, 8);
    this.shotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 2.6), toneMapped: false });
    this.shieldGeo = new THREE.IcosahedronGeometry(1, 3);
    this.shields = [];
    this.traps = [];
    // 루나 끈끈이 덫: 공유 지오메트리/재질 (덫마다 새로 만들지 않는다)
    this.trapGeo = new THREE.TorusGeometry(0.85, 0.16, 6, 20);
    this.trapMat = new THREE.MeshBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.85, toneMapped: false });
    this.carrotT = 6;
    this.stockCount = 3;
    this.player = null;
    this.outSeq = 0;
    this.cockpitCamera = new CockpitCamera();
  }

  // ---------------- 매치 ----------------
  start(cfg) {
    this.clear();
    this.peerMatch = !!cfg.peer || !!cfg.roster;
    this.stockCount = cfg.stock;
    this.diff = cfg.diff;
    const order = pickOpponents(cfg, 4);
    const types = [cfg.robot, ...ROBOT_ORDER.filter((t) => t !== cfg.robot)];
    for (let n = 0; n < 4; n++) {
      const h = new Human(this, n, PILOTS[order[n]], n === 0, cfg.diff);
      h.attackPoints = 0; h.supplyId = -1; h.supplyProgress = 0; h.supplyHeld = false;
      if (n === 0 && cfg.playerName) h.name = cfg.playerName;
      if (n === 1 && cfg.peer) { h.remote = true; h.name = cfg.peer.name; }
      if(cfg.roster?.[n]) {h.remote=n!==0;h.name=cfg.roster[n].name;}
      if (n === 0 && cfg.autoplay) { h.ctrl = new AICtrl(this, h, DIFFICULTY[2]); h.autoplay = true; }
      h.robotType = n === 0 ? cfg.robot : n === 1 && cfg.peer ? cfg.peer.robot : types[n % types.length];
      if(cfg.roster?.[n])h.robotType=cfg.roster[n].robot;
      const sp = this.arena.spawnPoints[n];
      h.pos.set(sp.x, sp.y || 0, sp.z);
      h.gh = sp.y || 0;
      h.facing = Math.atan2(-sp.x, -sp.z);
      this.humans.push(h);
      this.ui.addFighter(h);
    }
    this.player = this.humans[0];
    this.juiceStations = new JuiceStations(this);
    this.time = 0;
    this.timeLeft = RULES.matchTime;
    this.phase = 'intro';
    this.introT = 0;
    this.introStep = -1;
    this.carrotT = 7;
    this.camPos.set(0, 40, 60);
    this.camDist = 20;
    this.camLead.set(0, 0, 0);
    this.camLook.set(0, 0, 0);
    this.zoomPunch = 0;
    this._cameraReady = false;
    this._camKind = null;
    audio.startMusic('battle');
  }

  clear() {
    this.cockpitCamera?.reset(this.camera);
    this.juiceStations?.dispose(); this.juiceStations = null;
    for (const h of this.humans) { this.scene.remove(h.rig.root); h.rig.dispose(); }
    for (const r of this.robots) r.dispose();
    for (const p of this.projectiles) this.removeProj(p);
    for (const c of this.carrots) this.releaseCarrot(c.mesh);
    for (const s of this.shields) { this.scene.remove(s.mesh); releaseShieldMaterial(s.mesh.material); }
    this.shields = [];
    for (const t of this.traps) this.scene.remove(t.mesh);
    this.traps = [];
    this.humans = []; this.robots = []; this.projectiles = []; this.carrots = []; this.timers = [];
    this.fx.clear();
    this.ui.reset();
    this.timeScale = 1; this.slowT = 0; this.trauma = 0;
    this.phase = 'idle';
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  createPeerRobot(type, owner, x, z) { return new Robot(this, type, owner, x, z); }

  // ---------------- 루프 ----------------
  update(realDt, present = true) {
    realDt = Math.min(realDt, 1 / 20);
    if (this.slowT > 0) { this.slowT -= realDt; if (this.slowT <= 0) this.timeScale = 1; }
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.updatePhase(realDt);
    if (this.phase === 'fight') this.updateComeback();
    for (const h of this.humans) {
      if (h.isPlayer && !h.autoplay) h.ctrl.poll();
      else if (!h.dead && !h.out) h.ctrl.think(dt);
      this.juiceStations?.update(h, dt);
      if (h.riding && !h.autoplay && (h.isPlayer || h.remote)) h.ctrl.in = prepareMountedInput(h.riding, h.ctrl.in, dt);
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    for (const r of [...this.robots]) r.update(dt, realDt);
    for (const h of this.humans) h.update(dt, realDt);
    for (const h of this.humans) {
      // 히트스톱으로 이번 프레임을 처리하지 못했다면 입력을 남겨 둔다
      const actor = h.riding || h;
      if (((h.isPlayer && !h.autoplay) || h.remote) && actor.frozen) continue;
      if (h.ctrl.consume) h.ctrl.consume();
    }
    this.separate();
    if (this.juiceStations) for (const actor of [...this.humans, ...this.robots]) this.juiceStations.collide(actor);
    this.updateShields(dt);
    this.updateCombos(realDt);
    this.updateProjectiles(dt);
    this.updateTraps(dt);
    this.updateCarrots(dt);
    this.fx.update(dt, realDt);
    this.arena.update(dt, this.time);
    this.juiceStations?.present(this.time);
    this.updateCamera(realDt);
    if (present) this.ui.update(this, realDt);
  }

  updatePhase(realDt) {
    if (this.phase === 'intro') {
      this.introT += realDt;
      const step = Math.floor(this.introT / INTRO_STEP);
      if (step !== this.introStep && step <= 3) {
        this.introStep = step;
        if (step < 3) { this.ui.banner(['3', '2', '1'][step], 'ready'); audio.sfx('countdown'); }
        else { this.ui.banner('FIGHT!', 'go'); audio.sfx('go'); this.phase = 'fight'; }
      }
    } else if (this.phase === 'fight') {
      this.timeLeft -= realDt * this.timeScale;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch('time'); }
    } else if (this.phase === 'end') {
      this.endT += realDt;
      if (this.endT > 3 && !this.resultShown) { this.resultShown = true; this.onEnd && this.onEnd(this.results()); }
    }
  }

  // ---------------- 판정 ----------------
  targets(att) {
    const out = [];
    for (const h of this.humans) {
      if (h.dead || h.out || h.riding || h === att) continue;
      if (att && att.kind === 'robot' && att.pilot === h) continue;
      out.push(h);
    }
    for (const r of this.robots) {
      if (r === att || r.state === 'falling' || r.state === 'dead') continue;
      if (att && att.kind === 'human' && att.riding === r) continue;
      out.push(r);
    }
    return out;
  }

  meleeSweep(att, h, idx, act, contactSegments) {
    if (h.contact && !contactSegments?.length) return;
    const f = att.fwd(tA);
    // 파일럿 특성: 리치, 모으기 배율, 패리 후 강화
    let hd = h;
    if (att.kind === 'human') {
      const reach = att.P.reach || 1;
      const mult = (act.mult || 1) * (att.parryBuff > 0 ? 1.5 : 1);
      if (reach !== 1 || mult !== 1) hd = { ...h, r: h.r * reach, fwd: h.fwd * (0.5 + reach * 0.5), dmg: Math.round(h.dmg * mult), kb: h.kb * (1 + (mult - 1) * 0.5), power: mult >= 1.9 ? Math.max(h.power || 0, 3) : h.power };
    }
    const cx = att.pos.x + f.x * hd.fwd, cz = att.pos.z + f.z * hd.fwd, cy = att.pos.y + hd.up;
    for (const t of this.targets(att)) {
      if (h.contact && att.act !== act) break;
      const contactPoint = h.contact ? contactAgainstTarget(contactSegments, t) : null;
      if (h.contact) { if (!contactPoint) continue; }
      else {
        const dx = t.pos.x - cx, dz = t.pos.z - cz;
        const rr = hd.r + t.radius;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (cy < t.pos.y - hd.r || cy > t.pos.y + t.height + hd.r) continue;
      }
      const key = idx * 1000 + t.id;
      const last = act.hits.get(key);
      if (last !== undefined && (!hd.every || act.t - last < hd.every)) continue;
      act.hits.set(key, act.t);
      tDir.set(t.pos.x - att.pos.x, 0, t.pos.z - att.pos.z);
      const l = tDir.length();
      if (l > 0.001) tDir.divideScalar(l); else tDir.copy(f);
      const rad = hd.radial !== undefined ? hd.radial : 0.25;
      tDir.set(f.x * (1 - rad) + tDir.x * rad, 0, f.z * (1 - rad) + tDir.z * rad).normalize();
      if (contactPoint) tB.copy(contactPoint);
      else tB.set((cx + t.pos.x) * 0.5, clamp(cy, t.pos.y + 0.3, t.pos.y + t.height * 0.85), (cz + t.pos.z) * 0.5);
      const ok = this.applyHit(att, t, hd, tDir, tB);
      if (h.contact && att.act !== act) { att.syncRoot?.(); break; }
      if (ok && att.kind === 'human' && att.parryBuff > 0) att.parryBuff = 0;
      if (hd.bounce && att.kind === 'human') { att.vel.y = 9; att.vel.x *= -0.3; att.vel.z *= -0.3; att.act = null; att.setState('normal'); }
    }
  }

  credit(att) { return att.kind === 'human' ? att : att.pilot; }

  facingHit(t, dir) {
    const tf = t.fwd(tC);
    return tf.x * -dir.x + tf.z * -dir.z > 0.1;
  }

  // 배리어/패리/반격으로 막힌 공격: 공격자를 튕겨낸다. 로봇은 약점이 드러난다
  repelAttacker(att, t, dir, at, kind) {
    const byRobot = att && att.kind === 'robot';
    if (att) att.hs = Math.max(att.hs, 0.08);
    t.hs = Math.max(t.hs, 0.06);
    if (att && !byRobot && att.kind === 'human' && !att.riding) {
      att.cancelAct();
      att.setState('hurt');
      att.stun = kind === 'parry' ? 0.75 : 0.35;
      att.vel.x = dir.x * 7; att.vel.z = dir.z * 7;
    } else if (byRobot && (kind === 'parry' || kind === 'counter')) {
      att.stagger = Math.max(att.stagger, 0.6);
      this.exposeRobot(att, 2.2);
      if (att.act && att.act.name !== 'laser') { att.act = null; if (att.beam) { att.beam.stop(); att.beam = null; } }
    }
  }

  // 로봇 약점 노출: 사람 공격이 더 아프게 들어간다
  exposeRobot(r, time) {
    if (!r || r.kind !== 'robot' || r.state !== 'active') return;
    r.exposedT = Math.max(r.exposedT || 0, time);
    this.ui.callout(r.pos, '약점 노출!', r.pilot && r.pilot.isPlayer ? 'bad' : 'sk', r.height + 0.6);
  }

  // 연속 피격 감쇠: 쉬지 않고 맞을수록 경직과 체공이 짧아진다 (1 → juggleMin)
  hitDecay(n) {
    if (n <= RULES.juggleFrom) return 1;
    return Math.max(RULES.juggleMin, 1 - (n - RULES.juggleFrom) * RULES.juggleStep);
  }

  // 모든 공격이 최종적으로 이곳을 거친다
  applyHit(att, t, h, dir, at, opt = {}) {
    const src = att ? this.credit(att) : null;
    const healthBefore = t.kind === 'human' ? t.hp : t.armor;
    let dmg = h.dmg;
    let power = h.power || 0;
    const byRobot = att && att.kind === 'robot';
    // 로봇 공격자: 쥬스가 바닥났거나 콤보에 쓰는 부위가 부서졌으면 약해진다
    if (byRobot && att.mods) {
      const k = att.mods.dmg * (att.act && COMBO_MOVES.has(att.act.name) ? comboDamageMul(att.type, att.broken) : 1);
      if (k !== 1) dmg = Math.max(1, Math.round(dmg * k));
    }
    const playerInvolved = (src && src.isPlayer) || t === this.player || (t.kind === 'robot' && t.pilot === this.player);
    let color = src ? src.color : 0xffffff;
    // 콤보 보정: 같은 상대를 오래 때릴수록 피해 감소
    if (src && src.combo) {
      const cmb = src.combo;
      const n = cmb.t > 0 && cmb.target === t ? cmb.n + 1 : 1;
      if (n >= RULES.comboScaleFrom) dmg = Math.max(1, Math.round(dmg * Math.max(RULES.comboScaleMin, 1 - (n - RULES.comboScaleFrom + 1) * RULES.comboScaleStep)));
    }
    if (t.kind === 'human') {
      if (t.invuln > 0) return false;
      // 호출 배리어 / 도리 당근 배리어: 모든 공격을 막는다
      if (t.shieldT > 0 || t.bubbleT > 0) {
        this.fx.guard(at, dir);
        this.fx.ring(tC.copy(t.pos).setY(t.pos.y + 1), null, 1.4, 3.2, 0.3, t.color, 0.9);
        this.sound('block', at, 1, 1.25);
        this.repelAttacker(att, t, dir, at, 'shield');
        this.shieldHitFx(t);
        return false;
      }
      // 타로 버티기 반격: 자세 중에 맞으면 피해 없이 되받아친다
      const ca = t.act && t.act.def.counter;
      if (ca && t.act.t >= ca[0] && t.act.t <= ca[1]) { this.counterStrike(t, att, dir, at); return false; }
      if (byRobot) dmg = Math.round(dmg * 0.85);
      dmg = Math.max(1, Math.round(dmg * (t.P.dmgTaken || 1)));
      // 받는 피해 배율 뒤에 상한을 둔다: 어떤 파일럿도 로봇 한 방에 cap 이상 잃지 않는다
      if (byRobot) dmg = Math.min(RULES.robotHitCap, dmg);
      const facing = this.facingHit(t, dir);
      // 저스트 가드 (준): 가드 시작 직후라면 어떤 공격이든 튕겨낸다
      if (t.state === 'guard' && facing && t.P.parry && this.time - t.guardStart < 0.22) {
        this.fx.hit(at, dir, 2, 0x9ff3ff);
        this.fx.ring(at, null, 0.6, 3, 0.25, 0x9ff3ff, 1);
        this.sound('block', at, 1.2, 1.6);
        this.sound('gaugeFull', at, 0.5, 2);
        this.repelAttacker(att, t, dir, at, 'parry');
        t.parryBuff = 2;
        t.invuln = 0.25;
        t.addGauge(8);
        this.ui.callout(t.pos, 'PARRY!', 'sk', 2.4);
        if (playerInvolved) { this.slow(0.25, 0.2); this.ui.flash(0.08); }
        return false;
      }
      if (t.state === 'guard' && facing && !h.guardBreak) {
        const sk = t.P.skill2 || {};
        const mult = byRobot ? (sk.robotGuard !== undefined ? sk.robotGuard : 0.5) : 0.12;
        dmg = Math.round(dmg * mult);
        t.hp -= dmg;
        t.vel.x = dir.x * (byRobot ? h.kb * 0.5 : 5); t.vel.z = dir.z * (byRobot ? h.kb * 0.5 : 5);
        if (att) att.hs = 0.06;
        t.hs = 0.06;
        this.fx.guard(at, dir);
        this.sound('block', at, 1);
        this.shake(0.05, at);
        if (!byRobot) { if (t.hp <= 0) t.hp = 1; this.awardAP(src, healthBefore - t.hp); return true; }
        t.addGauge(dmg * RULES.gaugeTake);
        if (t.hp > 0) { this.awardAP(src, healthBefore - t.hp); return true; }
      } else {
        t.hp -= dmg;
      }
      if (t.state === 'boarding') {
        t.cancelBoard('탑승 방해!');
        this.sound('boardCancel', t.pos, 1);
        if (src && src.isPlayer) this.ui.toast('탑승을 막았다!');
      }
      t.addGauge(dmg * RULES.gaugeTake);
      // 슈퍼 아머 (리코/도리/타로 일부 기술): 약한 사람 공격에는 끊기지 않는다
      const armored = t.act && t.act.def.armor && !byRobot && power <= 1 && t.hp > 0 && !h.guardBreak;
      const scale = 1 + clamp((100 - t.hp) / 100, 0, 1) * 0.55;
      const air = !t.onGround && t.pos.y - t.gh > 0.6;
      if (armored) {
        this.awardAP(src, healthBefore - t.hp);
        t.flash = 1;
        this.fx.hit(at, dir, 0, 0xffe070);
        this.sound('block', at, 0.6, 0.8);
        this.ui.damage(at, dmg, '');
        if (att) att.hs = Math.max(att.hs, 0.05);
        this.comboHit(src, t, dmg);
        return true;
      }
      if (t.act) t.cancelAct();
      // 연속 피격 수: 많이 맞을수록 경직/체공이 짧아지고, 일정 수를 넘으면 브레이크 버스트로 빠져나올 수 있다
      t.hitsTaken++;
      t.freeT = 0;
      const decay = this.hitDecay(t.hitsTaken);
      const capped = t.juggleCapped();
      // 한계를 넘으면 거의 띄우지 못한다: 곧 떨어져 다운 → 기상 무적
      const liftK = capped ? 0.3 : 0.6 + 0.4 * decay;
      if (t.hp <= 0) {
        t.hp = 0;
        t.setState('launched');
        t.onGround = false;
        t.vel.set(dir.x * Math.max(h.kb, 14) * 1.25, Math.max(h.lift, 10) + 5, dir.z * Math.max(h.kb, 14) * 1.25);
        t.koT = 0.85;
        power = Math.max(power, 2);
        this.slow(0.22, 0.45);
        if (playerInvolved) { this.fx.impactFrame(2.5); this.ui.banner('K.O.!', 'ko'); }
        this.sound('ko', at, 1.2);
      } else if (h.grab) {
        // 잡기: 공격자 뒤쪽으로 넘겨 던진다
        t.setState('launched');
        t.onGround = false;
        t.vel.set(-dir.x * h.kb, h.lift * liftK, -dir.z * h.kb);
        t.pos.y = Math.max(t.pos.y, t.gh + 0.3);
        t.juggleT = capped ? 0 : 0.35 * decay;
        this.fx.dust(t.pos, 8, 1);
      } else if (h.spike) {
        // 내리꽂기: 공중이면 바닥에 튕겨 오르게, 지상이면 띄운다
        t.setState('launched');
        t.onGround = false;
        if (air) { t.vel.set(dir.x * h.kb * 0.5, -24, dir.z * h.kb * 0.5); t.spiked = true; }
        else { t.vel.set(dir.x * h.kb, 9 * liftK, dir.z * h.kb); t.pos.y = Math.max(t.pos.y, t.gh + 0.05); }
        power = Math.max(power, 2);
      } else if (h.air) {
        // 공중 콤보 타격: 위로 살짝 띄워 계속 이어지게. 오래 이어질수록 덜 뜬다
        t.setState('launched');
        t.onGround = false;
        t.vel.set(dir.x * h.kb, h.lift * liftK, dir.z * h.kb);
        t.juggleT = capped ? 0 : 0.45 * decay;
      } else if (h.launch) {
        t.setState('launched');
        t.onGround = false;
        t.vel.set(dir.x * h.kb * scale, h.lift * (0.85 + scale * 0.15) * liftK, dir.z * h.kb * scale);
        t.pos.y = Math.max(t.pos.y, t.gh + 0.05);
        if (h.chase) t.juggleT = capped ? 0 : 0.35 * decay;
      } else {
        t.setState('hurt');
        t.stun = (h.stun || 0.35) * decay;
        t.vel.x = dir.x * h.kb; t.vel.z = dir.z * h.kb;
        if (!t.onGround || h.lift > 3) t.vel.y = Math.max(t.vel.y, h.lift * liftK);
        if (air) t.juggleT = capped ? 0 : 0.3 * decay;
      }
      t.facing = Math.atan2(-dir.x, -dir.z);
      t.lastHitBy = src; t.lastHitT = this.time;
      // 띄우기 성공: 점프나 공격 버튼으로 추격 가능
      if (h.chase && att && att.kind === 'human' && t.state === 'launched' && t.hp > 0 && !capped) {
        att.chaseT = 0.6; att.chaseTarget = t;
        if (att.isPlayer) this.ui.hint && this.ui.hint('jump');
      }
      if (t.isPlayer && t.hitsTaken === RULES.burstHits && t.cd2 <= 0) this.ui.callout(t.pos, '스킬 2 로 탈출!', 'sk', 2.6);
    } else {
      // 로봇 피격
      if (t.state === 'active' && t.pilot && t.pilot.invuln > 0 && t.stateT < 1) return false;
      if (byRobot) {
        t.armor -= dmg;
        const k = power >= 3 ? 0.55 : 0.3;
        t.vel.x += dir.x * h.kb * k; t.vel.z += dir.z * h.kb * k;
        if (h.launch) t.vel.y = Math.max(t.vel.y, h.lift * 0.35);
        if (power >= 2) { t.stagger = power >= 3 ? 0.45 : 0.22; if (t.act && power >= 3 && t.act.name !== 'laser') { t.act = null; if (t.beam) { t.beam.stop(); t.beam = null; } } }
      } else {
        // 사람의 반격: 뒤에서 치거나 약점이 드러났을 때 더 아프다. 누적되면 로봇이 휘청인다
        const tf = t.fwd(tC);
        const back = tf.x * dir.x + tf.z * dir.z > 0.35;
        const exposed = t.exposedT > 0;
        let mult = RULES.humanVsRobot * (back ? RULES.backstab : 1) * (exposed ? RULES.exposedMul : 1);
        dmg = Math.max(1, Math.round(dmg * mult));
        t.armor -= dmg;
        t.humanDmg = (t.humanDmg || 0) + dmg;
        t.vel.x += dir.x * 0.6; t.vel.z += dir.z * 0.6;
        power = Math.min(power, exposed || back ? 2 : 1);
        if (back && src && src.isPlayer && this.time - (t.backCallT || -9) > 1.2) { t.backCallT = this.time; this.ui.callout(t.pos, 'BACK ATTACK!', 'sk', t.height + 0.4); }
        if (t.humanDmg >= RULES.robotBreak && t.state === 'active') {
          t.humanDmg = 0;
          t.stagger = Math.max(t.stagger, 0.7);
          if (t.act && t.act.name !== 'laser') { t.act = null; if (t.beam) { t.beam.stop(); t.beam = null; } }
          this.ui.callout(t.pos, '휘청!', 'sk', t.height + 1);
          this.sound('boardCancel', t.pos, 0.8, 0.7);
        }
      }
      if (t.pilot) { t.pilot.lastHitBy = src; t.pilot.lastHitT = this.time; }
      this.hitPart(t, at, dmg * (byRobot ? 1 : RULES.partHumanMul));
      color = 0xbfe8ff;
    }
    // 공통 연출: 작은 타격은 짧고 가볍게, 큰 타격만 묵직하게
    t.flash = 1;
    const hs = HS[clamp(power, 0, 3)];
    t.hs = Math.max(t.hs, hs * (t.hp <= 0 ? 1.8 : 1));
    if (att) att.hs = Math.max(att.hs, hs * (power >= 2 ? 0.85 : 0.6));
    this.fx.hit(at, dir, power, color);
    if (opt.noSnd !== true) this.sound(h.snd || 'punch', at, 1 + power * 0.1, 0.95 + Math.random() * 0.1);
    if (t.kind === 'robot' && !byRobot) this.sound('block', at, 0.5, 1.3);
    this.shake(SHAKE[clamp(power, 0, 3)] * (playerInvolved ? 1 : 0.5), at);
    if (playerInvolved && (power >= 2 || (power >= 1 && t.hp <= 0))) {
      const s = this.toScreen(at);
      this.fx.speedLines(power - 1, s.x, s.y);
    }
    if (power >= 3 && playerInvolved) { this.fx.impactFrame(1); this.ui.flash(0.12); this.slow(0.15, 0.22); }
    else if (power >= 2 && playerInvolved) this.ui.flash(0.04);
    this.ui.damage(at, dmg, t.kind === 'robot' ? 'robot' : power >= 2 ? 'big' : power >= 1 ? 'mid' : '');
    if (src) {
      src.dmgDealt += dmg;
      this.awardAP(src, Math.min(dmg, healthBefore));
      if (!src.riding) src.addGauge(dmg * RULES.gaugeDeal);
      this.comboHit(src, t, dmg);
    }
    // Hits earn AP; only deliberate service actions refill the tank.
    if (t.kind === 'robot' && t.armor <= 0) this.destroyRobot(t, 'armor', src);
    return true;
  }

  awardAP(pilot, damage) {
    if (pilot && damage > 0) pilot.attackPoints = Math.min(JUICE_SERVICE.maxAP, (pilot.attackPoints || 0) + damage * .5);
  }

  // 부위 피해: 타격 지점의 높이/좌우로 부위를 고르고, 내구도가 0 이 되면 떨어져 나간다
  hitPart(r, at, amount) {
    if (!r.parts || !at || r.state === 'dead' || r.armor <= 0) return null;
    localHit(r.pos.x, r.pos.y, r.pos.z, r.facing, r.height, at.x, at.y, at.z, tLocal);
    const part = pickPart(tLocal.side, tLocal.h, r.radius);
    if (damagePart(r.parts, part, amount)) r.breakPart(part);
    return part;
  }

  // 타로 버티기 반격: 가까운 공격자에게 되받아치기. 로봇이면 약점 노출
  counterStrike(t, att, dir, at) {
    this.fx.hit(at, dir, 2, 0xffe070);
    this.fx.ring(tC.copy(t.pos).setY(t.pos.y + 1), null, 0.6, 3, 0.25, 0xffe070, 1);
    this.sound('block', at, 1.2, 0.9);
    this.ui.callout(t.pos, 'COUNTER!', 'sk', 2.4);
    t.cancelAct();
    t.doAct('taroCounter');
    t.invuln = Math.max(t.invuln, 0.3);
    if (!att) return;
    const d = this.dist2D(att.pos, t.pos);
    if (att.kind === 'robot') {
      this.repelAttacker(att, t, dir, at, 'counter');
      if (d < att.radius + 4) this.applyHit(t, att, { dmg: 14, kb: 4, lift: 0, power: 2, snd: 'heavy' }, tD.set(-dir.x, 0, -dir.z), at);
    } else if (!att.riding && d < 4) {
      t.facing = Math.atan2(att.pos.x - t.pos.x, att.pos.z - t.pos.z);
      this.applyHit(t, att, { dmg: 12, kb: 9, lift: 13, launch: true, chase: true, grab: true, guardBreak: true, power: 2, snd: 'heavy' }, tD.set(-dir.x, 0, -dir.z), at);
    }
    if (t.isPlayer) this.slow(0.3, 0.18);
  }

  // ---------------- 콤보 ----------------
  comboHit(src, t, dmg) {
    if (!src || !src.combo) return;
    const c = src.combo;
    if (c.t > 0 && c.target === t) { c.n++; c.dmg += dmg; }
    else { if (c.n >= 2) this.comboEnd(src); c.n = 1; c.dmg = dmg; c.target = t; }
    c.t = RULES.comboWindow;
    if (src.isPlayer && c.n >= 2) this.ui.combo(c.n, c.dmg, comboRating(c.n));
    // 등급이 오를 때 보너스
    const r = comboRating(c.n);
    if (r && r !== c.rating) {
      c.rating = r;
      if (c.n >= 6) this.ui.callout(src.riding ? src.riding.pos : src.pos, r, 'sk', src.riding ? 6.5 : 2.6);
      if (src.isPlayer && c.n >= 10) this.sound('gaugeFull', src.pos, 0.4, 1.8);
    }
  }

  comboEnd(src) {
    const c = src.combo;
    if (c.n >= 3 && !src.riding) src.addGauge(c.n * RULES.comboGauge);
    if (c.n > c.best) c.best = c.n;
    if (src.isPlayer) this.ui.comboEnd(c.n, c.dmg, comboRating(c.n));
    c.n = 0; c.dmg = 0; c.t = 0; c.target = null; c.rating = '';
  }

  updateCombos(realDt) {
    for (const h of this.humans) {
      const c = h.combo;
      if (!c || c.t <= 0) continue;
      // 상대가 경직/공중에 떠 있는 동안에는 콤보가 끊기지 않는다
      const t = c.target;
      const held = t && t.kind === 'human' && !t.dead && (t.state === 'hurt' || (t.state === 'launched' && t.hp > 0));
      const heldR = t && t.kind === 'robot' && t.stagger > 0;
      if (held || heldR) c.t = Math.max(c.t, 0.25);
      c.t -= realDt;
      if (c.t <= 0 || (t && (t.dead || t.state === 'dead'))) this.comboEnd(h);
    }
  }

  // ---------------- 지형 반응 ----------------
  wallBounce(e) {
    this.fx.dust(e.pos, 8, 1);
    this.fx.hit(tA.copy(e.pos).setY(e.pos.y + 1), UP, 1, 0xffffff);
    this.sound('land', e.pos, 1, 0.7);
    this.shake(0.2, e.pos);
    if (e.kind === 'human') { e.juggleT = 0.45; e.vel.y = Math.max(e.vel.y, 6); }
    const by = e.lastHitBy;
    if (by && by.isPlayer) this.ui.callout(e.pos, 'WALL BOUNCE!', 'sk', 2.4);
  }

  // 점프 버섯: 목표가 있으면 그 지점에 떨어지도록 수평 속도를 맞추고, 비행 중에는 공중 조작을 줄인다
  jumpPad(e, v, to) {
    e.vel.y = v; e.onGround = false;
    if (to) {
      const gr = e.kind === 'robot' ? 44 : 34;
      const dy = to.y - e.pos.y;
      const disc = v * v - 2 * gr * dy;
      const tf = disc > 0 ? (v + Math.sqrt(disc)) / gr : (2 * v) / gr;
      e.vel.x = (to.x - e.pos.x) / tf; e.vel.z = (to.z - e.pos.z) / tf;
      e.padT = tf;
      e.facing = Math.atan2(e.vel.x, e.vel.z);
    }
    if (e.kind === 'human' && e.act && !e.act.def.air) { e.cancelAct(); e.setState('normal'); }
    if (e.kind === 'human') { e.airJumpsLeft = e.P.airJumps || 0; }
    this.fx.shockwave(e.pos, 2.4, 0x9ff3ff, 0.3);
    this.fx.sparkle(tA.copy(e.pos).setY(e.pos.y + 0.3), 0x9ff3ff);
    this.sound('jump', e.pos, 1, 0.65);
  }

  pilotLand(h, kind) {
    const p = tB.copy(h.pos).setY(h.pos.y + 0.2);
    const big = kind === 'stampLand' || kind === 'pressLand';
    this.fx.shockwave(p, big ? 3.6 : 3, big ? 0xffe070 : h.color, 0.35);
    this.fx.dust(p, 14, 1.3);
    this.sound('shockwave', p, 0.7, 1.4);
    this.shake(0.16, p);
    if (kind === 'pressLand') this.areaHit(h, p, 3, { dmg: 10, kb: 10, lift: 12, launch: true, power: 2, snd: 'heavy', radial: 1 });
    else if (kind === 'doriLand') this.areaHit(h, p, 2.8, { dmg: 8, kb: 13, lift: 8, launch: true, power: 2, snd: 'heavy', radial: 1 });
    else this.areaHit(h, p, big ? 3.2 : 2.6, { dmg: big ? 9 : 8, kb: big ? 8 : 11, lift: big ? 13 : 9, launch: true, power: 2, snd: 'heavy', radial: 1 });
  }

  // ---------------- 파일럿 스킬 보조 ----------------
  // 하루 새총: 가까운 적을 자동 조준. 발사체는 'shot' 형식으로 보내 친구 대전 스냅샷과 호환된다
  throwSling(h, ev) {
    h.rig.handL.getWorldPosition(tB);
    const f = h.fwd(tA);
    const shots = ev === 'slingFan' ? [-0.28, 0, 0.28] : [0];
    let aim = null;
    const tg = this.nearestEnemy(h, h.pos, 18, f, 0.3);
    if (tg) { h.facing = Math.atan2(tg.pos.x - h.pos.x, tg.pos.z - h.pos.z); h.fwd(f); }
    for (const off of shots) {
      const c = Math.cos(off), s = Math.sin(off);
      const dx = f.x * c + f.z * s, dz = -f.x * s + f.z * c;
      if (tg && off === 0) aim = tC.set(tg.pos.x - tB.x, tg.pos.y + tg.height * 0.45 - tB.y, tg.pos.z - tB.z).normalize();
      else aim = tC.set(dx, ev === 'slingDown' ? -0.55 : 0, dz).normalize();
      if (ev === 'slingDown' && !tg) aim.y = -0.55;
      const mesh = this.takeCarrot(0.8);
      mesh.position.copy(tB);
      this.scene.add(mesh);
      this.projectiles.push({ type: 'shot', kind: 'sling', mesh, pos: tB.clone(), vel: aim.clone().multiplyScalar(30), owner: h, life: 0.6, r: 0.55 });
    }
    this.sound('whiff', tB, 0.7, 1.7);
  }

  // 루나 끈끈이 덫: 최대 2개. 밟으면 사람은 경직, 로봇은 멈추고 약점 노출
  placeTrap(h, drop) {
    const f = h.fwd(tA);
    const x = drop ? h.pos.x : h.pos.x + f.x * 2.2, z = drop ? h.pos.z : h.pos.z + f.z * 2.2;
    const gy = this.groundY(x, z, h.pos.y + 1);
    if (gy === null) { this.fx.sparkle(tB.set(x, h.pos.y, z), h.color); return; }
    const mine = this.traps.filter((t) => t.owner === h);
    if (mine.length >= 2) this.removeTrap(mine[0]);
    const mesh = new THREE.Mesh(this.trapGeo, this.trapMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, gy + 0.08, z);
    this.scene.add(mesh);
    this.traps.push({ owner: h, mesh, x, z, y: gy, t: 0, arm: 0.35, life: 9 });
    this.fx.ring(tB.set(x, gy + 0.1, z), UP, 0.3, 1.4, 0.3, h.color, 0.9);
    this.sound('grab', tB, 0.6, 1.5);
  }

  removeTrap(tr) {
    const i = this.traps.indexOf(tr);
    if (i >= 0) this.traps.splice(i, 1);
    this.scene.remove(tr.mesh);
  }

  updateTraps(dt) {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      tr.t += dt;
      tr.mesh.rotation.z = tr.t * 1.5;
      tr.mesh.scale.setScalar(1 + Math.sin(tr.t * 6) * 0.05);
      if (tr.t > tr.life || tr.owner.dead || tr.owner.out) { this.removeTrap(tr); continue; }
      if (tr.t < tr.arm) continue;
      for (const t of this.targets(tr.owner)) {
        if (t.kind === 'robot' && t.state !== 'active') continue;
        if (t.kind === 'human' && (!t.onGround || t.invuln > 0)) continue;
        if (Math.hypot(t.pos.x - tr.x, t.pos.z - tr.z) > 0.9 + t.radius * 0.8 || Math.abs(t.pos.y - tr.y) > 1.2) continue;
        tB.set(tr.x, tr.y + 0.6, tr.z);
        if (t.kind === 'human') {
          if (t.state === 'boarding') t.cancelBoard('덫에 걸렸다!');
          const ok = this.applyHit(tr.owner, t, { dmg: 5, kb: 0, lift: 0, stun: 1.0, power: 1, snd: 'grab' }, tDir.set(0, 0, 1), tB);
          if (ok) { t.vel.set(0, 0, 0); t.stun = Math.max(t.stun, 1.0); }
        } else {
          this.applyHit(tr.owner, t, { dmg: 6, kb: 0, lift: 0, power: 1, snd: 'grab' }, tDir.set(0, 0, 1), tB);
          t.stagger = Math.max(t.stagger, 0.9);
          t.vel.x = 0; t.vel.z = 0;
          this.exposeRobot(t, 2.5);
        }
        this.fx.ring(tB, UP, 0.4, 2.2, 0.35, 0xc58cff, 1);
        this.ui.callout(t.pos, '끈끈이!', 'sk', (t.height || 2) + 0.3);
        this.removeTrap(tr);
        break;
      }
    }
  }

  // 하루 연막: 가까이 붙은 사람은 잠깐 멈추고 로봇은 조준을 놓친다
  smokeBurst(h) {
    const p = tB.copy(h.pos).setY(h.pos.y + 0.8);
    this.fx.dust(p, 16, 1.4);
    this.fx.ring(tC.copy(h.pos).setY(h.pos.y + 0.1), UP, 0.4, 2.8, 0.3, 0xdddddd, 0.8);
    this.sound('dash', p, 0.8, 0.8);
    for (const t of this.targets(h)) {
      const d = this.dist2D(t.pos, h.pos);
      if (d > 2.8 + t.radius) continue;
      if (t.kind === 'human' && t.invuln <= 0 && !(t.shieldT > 0) && !(t.bubbleT > 0)) {
        if (t.act) t.cancelAct();
        if (t.state === 'boarding') t.cancelBoard('');
        t.setState('hurt'); t.stun = 0.45;
        t.vel.x *= 0.2; t.vel.z *= 0.2;
      } else if (t.kind === 'robot' && t.state === 'active') t.stagger = Math.max(t.stagger, 0.35);
    }
  }

  // 도리 당근 배리어: 짧은 시간 모든 방향 공격을 막는 방어막 (공격하면 해제)
  startBubble(h) {
    const sk = h.P.skill2;
    h.bubbleT = sk.time || 1.5;
    const mesh = new THREE.Mesh(this.shieldGeo, shieldMaterial(0xffa6d8));
    mesh.renderOrder = 5;
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.shields.push({ h, mesh, t: 0, bubble: true });
    this.fx.ring(tB.copy(h.pos).setY(h.pos.y + 0.08), UP, 0.5, sk.radius || 2.8, 0.3, h.color, 1);
    this.sound('charge', h.pos, 0.7, 1.8);
    // 붙어 있던 적을 밀어낸다 (피해 없음)
    for (const o of this.humans) {
      if (o === h || o.dead || o.out || o.riding) continue;
      const dx = o.pos.x - h.pos.x, dz = o.pos.z - h.pos.z, d = Math.hypot(dx, dz);
      if (d > (sk.radius || 2.8) || Math.abs(o.pos.y - h.pos.y) > 2.5 || o.invuln > 0) continue;
      if (o.state === 'boarding') o.cancelBoard('');
      o.cancelAct();
      o.setState('hurt'); o.stun = 0.3;
      o.vel.x = (dx / (d || 1)) * 11; o.vel.z = (dz / (d || 1)) * 11;
    }
  }

  endBubble(h) {
    h.bubbleT = 0;
    const s = this.shields.find((x) => x.h === h && x.bubble && x.fade === undefined);
    if (s) s.fade = 0.2;
  }

  // 브레이크 버스트: 콤보에 갇힌 사람이 스킬 2 를 소모해 빠져나온다
  breakBurst(h) {
    h.cancelAct();
    h.cd2 = h.cd2Max = RULES.burstCd;
    h.hitsTaken = 0; h.stunChain = 0;
    h.stun = 0;
    h.juggleT = 0;
    h.chaseT = 0;
    h.invuln = Math.max(h.invuln, RULES.burstInvuln);
    h.vel.x *= 0.2; h.vel.z *= 0.2;
    if (!h.onGround) h.vel.y = Math.max(h.vel.y, 6);
    h.setState('normal');
    h.doAct('burst');
    const p = tA.copy(h.pos).setY(h.pos.y + 1);
    this.fx.shockwave(tB.copy(h.pos).setY(h.pos.y + 0.2), RULES.burstRadius, 0xffffff, 0.35);
    this.fx.hit(p, UP, 2, h.color);
    this.sound('block', p, 1.1, 0.7);
    this.shake(0.2, h.pos);
    this.ui.callout(h.pos, 'BREAK!', h.isPlayer ? 'sk' : 'warn', 2.6);
    for (const o of this.humans) {
      if (o === h || o.dead || o.out || o.riding) continue;
      const dx = o.pos.x - h.pos.x, dz = o.pos.z - h.pos.z, d = Math.hypot(dx, dz);
      if (d > RULES.burstRadius || Math.abs(o.pos.y - h.pos.y) > 3) continue;
      if (o.state === 'boarding') o.cancelBoard('');
      o.cancelAct();
      o.setState('launched'); o.onGround = false;
      o.vel.set((dx / (d || 1)) * 10, 6, (dz / (d || 1)) * 10);
      if (o.combo && o.combo.n) this.comboEnd(o);
    }
    for (const r of this.robots) {
      if (r.state !== 'active' || r.pilot === h) continue;
      if (this.dist2D(r.pos, h.pos) < RULES.burstRadius + r.radius) { r.stagger = Math.max(r.stagger, 0.45); r.vel.x += (r.pos.x - h.pos.x) * 2; r.vel.z += (r.pos.z - h.pos.z) * 2; }
    }
    if (h.isPlayer) { this.ui.flash(0.08); this.slow(0.4, 0.15); }
  }

  // 역전 도움: 목숨과 체력으로 점수를 매겨 뒤처진 사람의 게이지가 빨리 찬다
  updateComeback() {
    let best = -Infinity;
    for (const h of this.humans) if (!h.out) { h._score = h.stock + h.hp / (h.maxHp || 100); if (h._score > best) best = h._score; }
    for (const h of this.humans) h.comeback = h.out ? 1 : Math.min(RULES.comebackMax, 1 + Math.max(0, best - h._score) * RULES.comebackPer);
  }

  // 호출 슬롯 계약 (UI 가 매 틱 읽음): { kind: 'call'|'board'|'exit'|null, progress 0..1, label, hint, near }
  //   call: 게이지 MAX 이고 내 로봇이 없을 때. board: 탈 수 있는 로봇 옆 / 내 빈 로봇이 있을 때 (near: 지금 붙어 있음)
  //   exit: 탑승 중 (progress 는 길게 누르기 진행도)
  contextAction(h) {
    const c = h._ctx || (h._ctx = { kind: null, progress: 0, label: '', hint: '', near: false });
    c.kind = null; c.progress = 0; c.label = ''; c.hint = ''; c.near = false;
    if (!h || h.dead || h.out) return c;
    const supply = this.juiceStations?.context(h);
    if (supply && (supply.ready || h.supplyHeld)) {
      c.kind = supply.kind; c.label = supply.label; c.hint = supply.hint;
      c.near = true; c.progress = supply.progress; return c;
    }
    if (h.riding) {
      c.kind = 'exit'; c.label = '하차'; c.hint = '길게';
      c.progress = clamp(h.ejectHold / EJECT_HOLD, 0, 1);
      return c;
    }
    if (h.state === 'boarding' && h.boardTarget) {
      c.kind = 'board'; c.label = '탑승'; c.hint = '길게'; c.near = true;
      c.progress = clamp(h.boardT / (h.boardNeed || 1), 0, 1);
      return c;
    }
    const near = this.boardableNear(h);
    const own = h.robot;
    if (near || (own && own.state === 'idle')) {
      c.kind = 'board'; c.label = '탑승'; c.near = !!near; c.hint = near ? '길게' : '가까이';
      return c;
    }
    if (!own && h.gauge >= RULES.gaugeMax) {
      c.kind = 'call'; c.label = '호출'; c.hint = '준비!'; c.progress = 1;
    }
    return c;
  }

  throwBoomerang(h) {
    h.rig.handR.getWorldPosition(tB);
    const f = h.fwd(tA);
    const mesh = this.takeCarrot(1.25);
    this.scene.add(mesh);
    this.projectiles.push({ type: 'boomer', mesh, pos: tB.clone(), vel: new THREE.Vector3(f.x * 21, 0, f.z * 21), owner: h, life: 1.8, r: 0.7, age: 0, hitSet: new Set(), back: false });
    this.sound('spin', tB, 0.5, 1.6);
  }

  onSkillCancel(r) {
    if (r.pilot && r.pilot.isPlayer) { this.ui.callout(r.pos, 'CANCEL!', 'sk', r.height + 0.4); this.zoomPunch = 0.6; }
    r.flash = 0.4;
    this.sound('charge', r.pos, 0.6, 1.4);
  }

  enemyRiding(h) {
    for (const o of this.humans) if (o !== h && o.riding) return true;
    return false;
  }

  // 반경 공격 (충격파/폭발)
  areaHit(att, center, radius, h, exclude) {
    for (const t of this.targets(att)) {
      if (exclude && exclude.includes(t)) continue;
      const dx = t.pos.x - center.x, dz = t.pos.z - center.z;
      const d = Math.hypot(dx, dz);
      if (d > radius + t.radius) continue;
      if (Math.abs(t.pos.y + t.height * 0.4 - center.y) > radius * 0.6 + t.height) continue;
      const k = clamp(1 - d / (radius + t.radius), 0.35, 1);
      tDir.set(dx, 0, dz);
      if (d < 0.01) tDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      tDir.normalize();
      tD.set(t.pos.x - tDir.x * t.radius * 0.6, t.pos.y + t.height * 0.4, t.pos.z - tDir.z * t.radius * 0.6);
      this.applyHit(att, t, { ...h, dmg: Math.round(h.dmg * k), kb: h.kb * (0.6 + k * 0.4) }, tDir, tD);
    }
  }

  // ---------------- 게이지/호출/탑승 ----------------
  gaugeFull(h) {
    if (h.isPlayer) {
      const touch = typeof document !== 'undefined' && document.documentElement.classList.contains('touch-mode');
      this.ui.toast(touch ? '🥕 게이지 MAX! 호출 버튼이 나타났어요 (맞는 중에도 가능)' : '🥕 게이지 MAX! ' + keyName('act') + ' → 로봇 호출 (맞는 중에도 가능)');
      this.sound('gaugeFull', h.pos, 1);
    }
    else this.ui.callout(h.pos, '🥕 MAX', 'warn');
  }

  // ---------------- 호출 배리어 ----------------
  // 리모컨을 누르는 순간 배리어가 펼쳐져 주변 적을 밀어내고, 로봇이 착지해 올라탈 때까지 호출자를 지킨다.
  // 호출자가 공격하면 배리어는 사라진다. 배리어가 있는 동안 호출자의 로봇은 다른 사람이 탈 수 없다.
  startShield(h) {
    if (h.shieldT > 0) return;
    h.shieldT = RULES.shieldTime;
    const mesh = new THREE.Mesh(this.shieldGeo, shieldMaterial(h.color));
    mesh.renderOrder = 5;
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.shields.push({ h, mesh, t: 0 });
    const c = tA.copy(h.pos).setY(h.pos.y + 1);
    this.fx.ring(tB.copy(h.pos).setY(h.pos.y + 0.08), UP, 0.5, RULES.shieldRadius, 0.35, h.color, 1);
    this.fx.sparkle(c, h.color);
    this.sound('charge', h.pos, 0.8, 1.5);
    // 발동 순간 주변 적을 밀어낸다 (피해 없음)
    for (const o of this.humans) {
      if (o === h || o.dead || o.out || o.riding) continue;
      const dx = o.pos.x - h.pos.x, dz = o.pos.z - h.pos.z, d = Math.hypot(dx, dz);
      if (d > RULES.shieldRadius || Math.abs(o.pos.y - h.pos.y) > 3) continue;
      const k = 1 - d / RULES.shieldRadius;
      if (o.state === 'boarding') o.cancelBoard('');
      o.cancelAct();
      o.setState('launched'); o.onGround = false;
      o.vel.set((dx / (d || 1)) * (9 + k * 7), 6 + k * 3, (dz / (d || 1)) * (9 + k * 7));
    }
    if (h.isPlayer) this.ui.toast('🛡 배리어! 로봇에 탈 때까지 공격을 막아줍니다 (공격하면 해제)');
  }

  // 긴급 호출: 맞는 중에 리모컨. 경직을 풀고 배리어를 터뜨린다
  emergencySummon(h) {
    h.cancelAct();
    h.setState('normal');
    h.stun = 0;
    h.hitsTaken = 0; h.stunChain = 0;
    h.vel.x *= 0.1; h.vel.z *= 0.1;
    if (!h.onGround) h.vel.y = Math.max(h.vel.y, 5);
    this.fx.shockwave(tA.copy(h.pos).setY(h.pos.y + 0.2), RULES.shieldRadius, h.color, 0.4);
    this.fx.hit(tA.copy(h.pos).setY(h.pos.y + 1), UP, 2, h.color);
    this.shake(0.3, h.pos);
    this.ui.callout(h.pos, '긴급 호출!', h.isPlayer ? 'sk' : 'warn', 2.6);
    if (h.isPlayer) { this.ui.flash(0.12); this.slow(0.35, 0.25); }
  }

  endShield(h, broke) {
    if (!(h.shieldT > 0)) return;
    h.shieldT = 0;
    const s = this.shields.find((x) => x.h === h && !x.bubble && x.fade === undefined);
    if (s) s.fade = 0.25;
    if (broke) {
      this.sound('boardCancel', h.pos, 0.5, 1.4);
      this.fx.ring(tA.copy(h.pos).setY(h.pos.y + 1), null, 1.4, 2.6, 0.25, h.color, 0.8);
    }
  }

  shieldHitFx(h) {
    const s = this.shields.find((x) => x.h === h && x.fade === undefined);
    if (s) s.hitT = 0.2;
  }

  updateShields(dt) {
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      const h = s.h;
      s.t += dt;
      if (s.bubble) { if (!(h.bubbleT > 0) && s.fade === undefined) s.fade = 0.2; }
      else if (h.shieldT > 0) {
        // 로봇이 아직 떨어지는 중이면 배리어가 먼저 꺼지지 않는다
        const r = h.robot;
        if (r && r.state === 'falling') h.shieldT = Math.max(h.shieldT, 0.6);
        h.shieldT -= dt;
        if (h.dead || h.riding) h.shieldT = 0;
        if (h.shieldT <= 0) { h.shieldT = 0; s.fade = 0.3; }
      }
      if (s.fade !== undefined) {
        s.fade -= dt;
        if (s.fade <= 0) { this.scene.remove(s.mesh); releaseShieldMaterial(s.mesh.material); this.shields.splice(i, 1); continue; }
      }
      const e = h.riding || h;
      const grow = Math.min(1, s.t / 0.18);
      s.hitT = Math.max(0, (s.hitT || 0) - dt);
      const pulse = 1 + Math.sin(s.t * 9) * 0.03 + s.hitT * 0.6;
      s.mesh.scale.setScalar((s.bubble ? 1.35 : 1.55) * grow * pulse);
      s.mesh.position.set(e.pos.x, e.pos.y + 1.0, e.pos.z);
      s.mesh.rotation.y += dt * 0.8;
      let al = 1;
      if (s.fade !== undefined) al = Math.max(0, s.fade / 0.3);
      else if (!s.bubble && h.shieldT < 1.2) al = 0.45 + 0.55 * (Math.floor(h.shieldT * 8) % 2);
      else if (s.bubble && h.bubbleT < 0.5) al = 0.45 + 0.55 * (Math.floor(h.bubbleT * 10) % 2);
      s.mesh.material.uniforms.alpha.value = al * (1 + s.hitT * 3);
      s.mesh.material.uniforms.time.value = s.t;
      if (s.fade !== undefined || !(s.bubble ? h.bubbleT > 0 : h.shieldT > 0)) continue;
      // 가까이 붙은 적은 계속 밀어낸다: 호출자를 둘러싸고 때리는 걸 막는다
      for (const o of this.humans) {
        if (o === h || o.dead || o.out || o.riding) continue;
        const dx = o.pos.x - h.pos.x, dz = o.pos.z - h.pos.z, d = Math.hypot(dx, dz);
        const m = 1.75;
        if (d >= m || Math.abs(o.pos.y - h.pos.y) > 2.2) continue;
        const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
        o.pos.x = h.pos.x + nx * m; o.pos.z = h.pos.z + nz * m;
        const vn = o.vel.x * nx + o.vel.z * nz;
        if (vn < 6) { o.vel.x += nx * (6 - vn); o.vel.z += nz * (6 - vn); }
        s.hitT = Math.max(s.hitT, 0.08);
      }
    }
  }

  summonRobot(h) {
    if (h.robot || h.gauge < RULES.gaugeMax) return;
    h.gauge = 0;
    const f = h.fwd(tA);
    let px = h.pos.x + f.x * 5, pz = h.pos.z + f.z * 5, py = 0;
    const ar = this.arena;
    if (ar.safePoint) {
      const sp = ar.safePoint(px, pz, 2.4);
      if (sp) { px = sp.x; pz = sp.z; py = sp.y || 0; }
    } else {
      const p = tB.set(px, 0, pz);
      const R = ar.radius - 4;
      const d = Math.hypot(p.x, p.z);
      if (d > R) p.multiplyScalar(R / d);
      for (let k = 0; k < 6; k++) {
        let moved = false;
        for (const o of ar.obstacles) {
          const dx = p.x - o.x, dz = p.z - o.z, dd = Math.hypot(dx, dz);
          if (dd < o.r + 2.2) { p.x = o.x + (dx / (dd || 1)) * (o.r + 2.3); p.z = o.z + (dz / (dd || 1)) * (o.r + 2.3); moved = true; }
        }
        const d2 = Math.hypot(p.x, p.z);
        if (d2 > R) p.multiplyScalar(R / d2);
        if (!moved) break;
      }
      px = p.x; pz = p.z;
    }
    const r = new Robot(this, h.robotType, h, px, pz);
    r.landY = py;
    r.pos.y = py + 52 * 1.35;
    // 파일럿 특성: 로봇 내구도
    const am = (h.P.robot && h.P.robot.armor) || 1;
    r.maxArmor = Math.round(r.maxArmor * am); r.armor = r.maxArmor;
    r.resetParts();
    this.robots.push(r);
    const mark = tC.set(px, py, pz);
    this.fx.pillar(mark, h.color, 1.5);
    this.fx.targetMarker(tC.set(px, py + 0.05, pz), 3.6, 1.35);
    this.sound('incoming', mark, 1.1);
    const nm = ROBOT_STATS[h.robotType] ? this.robotName(h.robotType) : '';
    if (h.isPlayer) this.ui.banner('ROBOT CALL!', 'summon');
    this.ui.callout(h.pos, nm + ' 호출!', 'warn');
    this.ui.addRobot(r);
  }

  robotName(type) { return (this.robotInfo && this.robotInfo[type] && this.robotInfo[type].name) || type; }

  robotLanded(r) {
    this.fx.shockwave(r.pos, 7, 0xffd27a, 0.6);
    this.fx.dust(r.pos, 26, 2.6);
    this.fx.hit(tA.copy(r.pos).setY(0.6), UP, 3, 0xffc070);
    this.sound('robotLand', r.pos, 1.3);
    this.shake(0.75, r.pos);
    if (this.dist2D(r.pos, this.player.pos) < 18) { this.fx.impactFrame(1.2); this.ui.flash(0.15); }
    this.areaHit(r, tA.copy(r.pos).setY(r.pos.y + 0.5), 3.8, { dmg: 18, kb: 18, lift: 14, launch: true, power: 2, snd: 'heavy' }, [r.owner]);
    // 착지 후에도 호출자가 걸어가 탈 시간만큼 배리어 유지
    const o = r.owner;
    if (o && o.shieldT > 0) {
      const walk = this.dist2D(o.pos, r.pos) / ((o.P && o.P.speed) || 7.4);
      o.shieldT = RULES.shieldAfterLand + walk;
    }
  }

  boardableNear(h) {
    let best = null, bd = Infinity;
    for (const r of this.robots) {
      if (r.state !== 'idle') continue;
      // 배리어가 켜진 동안에는 주인만 탈 수 있다
      if (r.owner && r.owner !== h && r.owner.shieldT > 0) continue;
      if (Math.abs(h.pos.y - r.pos.y) > 1.6) continue;
      const d = this.dist2D(h.pos, r.pos);
      if (d <= r.radius + RULES.boardRange && d < bd) { bd = d; best = r; }
    }
    return best;
  }

  onBoardStart(h, r) {
    this.sound('grab', h.pos, 0.8);
    if (r.owner && r.owner !== h) {
      this.ui.callout(r.pos, h.name + ' 강탈 시도!', 'bad');
      if (r.owner.isPlayer) this.ui.toast('⚠ ' + h.name + '(이)가 내 로봇을 빼앗으려 한다! 때려서 막아요');
    }
  }

  board(h, r) {
    const stolen = r.owner !== h;
    const prev = r.owner;
    h.boardTarget = null;
    h.cancelAct();
    this.endShield(h, false);
    if (h.combo && h.combo.n) this.comboEnd(h);
    h.state = 'riding';
    h.riding = r;
    h.invuln = 0;
    h.needRelease = true;
    h.ejectHold = 0;
    r.pilot = h;
    r.owner = h;
    r.state = 'active';
    r.stateT = 0;
    r.facing = h.facing;
    r.cds.k = 0.5; r.cds.l = 2;
    r.rig.root.remove(r.ring);
    this.scene.remove(h.rig.root);
    r.rig.cockpit.add(h.rig.root);
    h.rig.root.scale.setScalar(0.55);
    h.rig.root.position.set(0, 0, 0);
    h.rig.root.rotation.set(0, 0, 0);
    h.rig.root.visible = true;
    // 탑승 순간: 변신 충격파
    this.fx.shockwave(r.pos, 8, h.color, 0.55);
    this.fx.pillar(r.pos, h.color, 0.7);
    this.fx.hit(tA.copy(r.pos).setY(r.height * 0.6), UP, 3, h.color);
    this.fx.dust(r.pos, 20, 2.2);
    this.sound('boardDone', r.pos, 1.3);
    this.shake(0.5, r.pos);
    for (const o of this.humans) {
      if (o === h || o.dead || o.riding) continue;
      const d = this.dist2D(o.pos, r.pos);
      if (d < 7) {
        tDir.set(o.pos.x - r.pos.x, 0, o.pos.z - r.pos.z).normalize();
        o.cancelBoard && o.state === 'boarding' && o.cancelBoard('');
        o.setState('launched'); o.onGround = false;
        o.vel.set(tDir.x * 14, 9, tDir.z * 14);
      }
    }
    if (h.isPlayer) {
      this.ui.banner(stolen ? 'STEAL!' : 'RIDE ON!', 'summon');
      this.fx.impactFrame(1);
      this.ui.flash(0.22);
      this.zoomPunch = 1;
      audio.startMusic('robot');
    } else {
      this.ui.callout(r.pos, stolen ? h.name + ' 강탈!' : h.name + ' 탑승!', stolen ? 'bad' : 'warn');
      if (stolen && prev && prev.isPlayer) this.ui.toast('내 로봇을 빼앗겼다!');
    }
    this.ui.onBoard(h, r);
  }

  eject(h, forced) {
    const r = h.riding;
    if (!r) return;
    h.riding = null;
    r.pilot = null;
    r.rig.cockpit.remove(h.rig.root);
    h.rig.root.scale.setScalar(1);
    this.scene.add(h.rig.root);
    h.pos.set(r.pos.x, r.pos.y + r.height * 0.75, r.pos.z);
    const f = r.fwd(tA);
    h.vel.set(-f.x * 6, 13, -f.z * 6);
    h.setState('launched');
    h.onGround = false;
    h.gh = r.gh;
    h.invuln = forced ? 0.6 : 1.2;
    h.facing = r.facing;
    this.sound('eject', h.pos, 1);
    this.fx.hit(tB.copy(h.pos), UP, 1, 0xffffff);
    if (!forced) {
      r.state = 'idle'; r.stateT = 0.6; r.idleT = 14; r.act = null; r.owner = h;
      if (r.beam) { r.beam.stop(); r.beam = null; }
    }
    if (h.isPlayer) audio.startMusic('battle');
    this.ui.onEject(h);
  }

  destroyRobot(r, reason, by) {
    if (r.state === 'dead') return;
    const pilot = r.pilot;
    const idx = this.robots.indexOf(r);
    if (idx >= 0) this.robots.splice(idx, 1);
    if (pilot) this.eject(pilot, true);
    r.state = 'dead';
    const c = tA.copy(r.pos).setY(Math.max(r.pos.y, -8) + r.height * 0.5);
    if (reason === 'timeout') {
      this.fx.explosion(c, 0.7);
      this.sound('explosion', c, 0.6, 1.3);
    } else {
      this.fx.explosion(c, 1.6);
      this.fx.shockwave(tB.copy(r.pos).setY(0), 7, 0xff7040, 0.5);
      this.sound('explosion', c, 1.4);
      this.shake(0.8, c);
      if (reason === 'armor') this.areaHit(null, c, 4.5, { dmg: 10, kb: 14, lift: 12, launch: true, power: 2, snd: 'heavy' }, pilot ? [pilot] : []);
      if (pilot) {
        pilot.hp = Math.max(1, pilot.hp - 15);
        const dx = pilot.pos.x - r.pos.x || 0.1;
        pilot.vel.set(dx * 0, 15, 0);
        tDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        pilot.vel.x = tDir.x * 7; pilot.vel.z = tDir.z * 7;
        if (pilot.isPlayer) { this.ui.banner('BREAK!', 'danger'); this.fx.impactFrame(1.5); this.ui.flash(0.2); }
      }
      if (by && by.isPlayer) this.ui.toast('로봇 격파!');
    }
    this.ui.callout(r.pos, reason === 'timeout' ? '로봇 회수' : '로봇 대파!', 'bad');
    r.dispose();
    this.ui.removeRobot(r);
  }

  // An expired/left network guest forfeits only their own slot. Do not award a
  // kill, create a CPU replacement or end everybody else's current round.
  removeRemotePlayer(h) {
    if (!this.peerMatch || !h || h.isPlayer || h.out) return false;
    if (h.riding) this.eject(h, false);
    this.endShield(h, false); h.cancelAct(); h.boardTarget = null; h.boardT = 0;
    if (h.combo.n) this.comboEnd(h);
    for (const other of this.humans) if (other.combo.target === h && other.combo.n) this.comboEnd(other);
    for (const robot of this.robots) if (robot.owner === h) robot.owner = null;
    h.stock = 0; h.hp = 0; h.dead = true; h.out = true; h.state = 'dead';
    h.respawnT = 0; h.outOrder = ++this.outSeq; h.vel.set(0, 0, 0);
    h.rig.root.visible = false; if (h.mark) h.mark.visible = false;
    this.ui.toast(h.name + '님이 퇴장했습니다. 경기는 계속됩니다.');
    return true;
  }

  kill(h, reason) {
    if (h.dead) return;
    if (h.riding) return;
    h.dead = true;
    h.state = 'dead';
    h.cancelAct();
    h.boardTarget = null;
    h.stock--;
    h.falls++;
    h.gauge = Math.min(h.gauge, RULES.gaugeMax * 0.6);
    const killer = h.lastHitBy && this.time - h.lastHitT < 8 && h.lastHitBy !== h ? h.lastHitBy : null;
    if (killer) killer.kos++;
    h.rig.root.visible = false;
    if (reason === 'ko') {
      this.fx.explosion(tA.copy(h.pos).setY(h.pos.y + 0.8), 0.9);
      this.fx.hit(tA, UP, 3, h.color);
    } else {
      this.sound('fall', h.pos, 1);
      // 장외: 가장자리에 작은 폭발 표시
      const d = Math.hypot(h.pos.x, h.pos.z) || 1, R = Math.min(d, this.arena.radius);
      tA.set(h.pos.x / d * R, 0.5, h.pos.z / d * R);
      this.fx.explosion(tA, 0.6);
      this.fx.sparkle(tA, h.color);
    }
    const msg = killer ? killer.name + ' ▶ ' + h.name : h.name + ' 낙하!';
    this.ui.killFeed(msg, killer ? killer.color : 0xffffff);
    this.endShield(h, false);
    if (h.combo.n) this.comboEnd(h);
    for (const o of this.humans) if (o.combo && o.combo.target === h && o.combo.n) this.comboEnd(o);
    if (h.stock <= 0) {
      h.out = true;
      h.outOrder = ++this.outSeq;
      this.ui.callout(h.pos, h.name + ' 탈락', 'bad');
      const r = h.robot;
      if (r && r.state === 'idle') r.owner = null;
      const alive = this.humans.filter((x) => !x.out);
      if (alive.length <= 1 || (h.isPlayer && !this.peerMatch)) this.later(1.2, () => this.endMatch(h.isPlayer ? 'lose' : 'last'));
    } else {
      h.respawnT = 2.2;
    }
  }

  respawn(h) {
    let best = null, bs = -1;
    for (const sp of this.arena.spawnPoints) {
      let md = Infinity;
      for (const o of this.humans) if (o !== h && !o.dead && !o.out) md = Math.min(md, this.dist2D(o.pos, sp));
      for (const r of this.robots) md = Math.min(md, this.dist2D(r.pos, sp) * 0.8);
      if (md > bs) { bs = md; best = sp; }
    }
    h.dead = false;
    h.hp = h.maxHp;
    h.pos.set(best.x, (best.y || 0) + 9, best.z);
    h.gh = best.y || 0;
    h.shieldT = 0; h.chaseT = 0; h.floatT = 0; h.juggleT = 0;
    h.hitsTaken = 0; h.stunChain = 0; h.cd1 = 0; h.cd2 = 0; h.bubbleT = 0;
    h.vel.set(0, 0, 0);
    h.onGround = false;
    h.setState('normal');
    h.invuln = 2.2;
    h.gauge = Math.max(h.gauge, 25);
    h.koT = 0;
    h.facing = Math.atan2(-best.x, -best.z);
    h.rig.root.visible = true;
    this.fx.pillar(tA.set(best.x, best.y || 0, best.z), h.color, 0.9);
    this.sound('respawn', h.pos, 0.9);
  }

  endMatch(reason) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.endT = 0;
    this.resultShown = false;
    const res = this.results();
    const win = res[0].h === this.player;
    this.ui.banner(reason === 'time' ? 'TIME UP!' : win ? 'VICTORY!' : 'GAME SET', win ? 'win' : 'ko');
    audio.stopMusic();
    audio.sfx(win ? 'victory' : 'defeat');
    this.slow(0.3, 1.2);
  }

  results() {
    const list = this.humans.map((h) => ({ h, name: h.name, color: h.color, stock: h.stock, hp: h.hp, kos: h.kos, falls: h.falls, dmg: Math.round(h.dmgDealt), outOrder: h.outOrder }));
    list.sort((a, b) => {
      const ao = a.stock > 0 ? 1e6 : a.outOrder, bo = b.stock > 0 ? 1e6 : b.outOrder;
      if (ao !== bo) return bo - ao;
      if (a.stock !== b.stock) return b.stock - a.stock;
      if (a.kos !== b.kos) return b.kos - a.kos;
      return b.hp - a.hp;
    });
    return list;
  }

  // ---------------- 로봇 스킬 ----------------
  onRobotSkill(r, name) {
    const st = r.stats.skills;
    const map = { [r.moves.k]: st[1].name, [r.moves.l]: st[2].name };
    if (map[name] && r.pilot) this.ui.callout(r.pos, map[name], r.pilot.isPlayer ? 'sk' : 'warn', r.height + 1);
  }

  robotEvent(r, ev, act) {
    const f = r.fwd(tA);
    switch (ev) {
      case 'ultimate':
        this.sound('ultimate', r.pos, 1);
        if (r.pilot && r.pilot.isPlayer) { this.zoomPunch = 1; const s = this.toScreen(r.pos); this.fx.speedLines(2, s.x, s.y); }
        r.flash = 0.6;
        break;
      case 'charge':
        this.sound('charge', r.pos, 1);
        r.rig.chestCore && r.rig.chestCore.getWorldPosition(tB);
        this.fx.sparkle(tB, 0x9ff3ff);
        break;
      case 'spin': this.sound('spin', r.pos, 1); break;
      case 'dashFx': this.fx.dust(r.pos, 10, 1.6); this.sound('dash', r.pos, 1.2, 0.6); break;
      case 'rocketFist': {
        r.rig.handR.getWorldPosition(tB);
        const aim = this.autoAim(r, tB, f, 0.85, 30);
        const mesh = r.rig.makeFist();
        mesh.scale.multiplyScalar(1.15);
        this.scene.add(mesh);
        if (r.rig.fistR) { r.rig.fistR.visible = false; this.later(1.3, () => { if (r.rig.fistR) r.rig.fistR.visible = true; }); }
        this.projectiles.push({ type: 'fist', mesh, pos: tB.clone(), vel: aim.multiplyScalar(34), owner: r, life: 0.95, r: 1.8, hitSet: new Set() });
        this.sound('rocket', tB, 1.2);
        this.fx.explosion(tB, 0.35);
        this.shake(0.2, tB);
        break;
      }
      case 'shotL':
      case 'shotR': {
        (ev === 'shotR' ? r.rig.handR : r.rig.handL).getWorldPosition(tB);
        const aim = this.autoAim(r, tB, f, 0.8, 26);
        const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
        mesh.position.copy(tB);
        this.scene.add(mesh);
        this.projectiles.push({ type: 'shot', mesh, pos: tB.clone(), vel: aim.multiplyScalar(44), owner: r, life: 0.8, r: 0.9 });
        this.sound('laser', tB, 0.35, 2.2);
        this.fx.hit(tB, aim.clone().normalize(), 0, 0xff88ee);
        break;
      }
      case 'missile': {
        const ms = r.rig.muzzles.filter((m) => m !== r.rig.laserOrigin);
        const m = ms.length ? ms[r.missileIdx++ % ms.length] : r.rig.head;
        m.getWorldPosition(tB);
        const mesh = this.takeCarrot(1.3);
        this.scene.add(mesh);
        const side = r.missileIdx % 2 ? 1 : -1;
        const rx = Math.cos(r.facing) * side, rz = -Math.sin(r.facing) * side;
        const vel = new THREE.Vector3(rx * 6 - f.x * 3, 14, rz * 6 - f.z * 3);
        const tgt = this.nearestEnemy(r, r.pos, 40);
        this.projectiles.push({ type: 'missile', mesh, pos: tB.clone(), vel, owner: r, life: 3.2, r: 1.0, target: tgt, age: 0 });
        this.sound('missile', tB, 0.9);
        break;
      }
      case 'laserOn': {
        const o = r.rig.laserOrigin || r.rig.head;
        o.getWorldPosition(tB);
        r.beam = this.fx.beam(tB, tC.copy(tB).addScaledVector(f, 20), 1.1, 0xff5fd0, 1.8);
        r.beamTick = 0;
        this.sound('laser', r.pos, 1.4, 0.8);
        this.shake(0.3, r.pos);
        break;
      }
      case 'laserOff':
        if (r.beam) { r.beam.stop(); r.beam = null; }
        break;
      case 'stompJump':
        act.flags.jumped = true;
        r.vel.y = 25; r.onGround = false;
        {
          const tg = this.nearestEnemy(r, r.pos, 16);
          if (tg) { r.facing = Math.atan2(tg.pos.x - r.pos.x, tg.pos.z - r.pos.z); const d = this.dist2D(tg.pos, r.pos); const ff = r.fwd(tA); r.vel.x = ff.x * Math.min(d * 1.1, 16); r.vel.z = ff.z * Math.min(d * 1.1, 16); }
          else { r.vel.x = f.x * 6; r.vel.z = f.z * 6; }
        }
        this.fx.dust(r.pos, 18, 2.2);
        this.sound('rocket', r.pos, 1, 0.7);
        break;
      case 'smash': {
        const p = tB.set(r.pos.x + f.x * 4.4, r.pos.y + 0.1, r.pos.z + f.z * 4.4);
        this.fx.shockwave(p, 4.5, 0xffe070, 0.4);
        this.fx.dust(p, 14, 2);
        this.sound('shockwave', p, 1);
        this.shake(0.5, p);
        break;
      }
      case 'megaSlam': {
        this.sound('robotHeavy', r.pos, 1.4, 0.7);
        this.shake(0.9, r.pos);
        const ox = r.pos.x, oz = r.pos.z, oy = r.pos.y, fx0 = f.x, fz0 = f.z;
        for (let n = 0; n < 6; n++) {
          this.later(n * 0.075, () => {
            const dd = 3.8 + n * 2.6;
            const p = new THREE.Vector3(ox + fx0 * dd, oy + 0.2, oz + fz0 * dd);
            const gy = this.groundY(p.x, p.z, oy + 2);
            if (gy === null) return;
            p.y = gy + 0.2;
            this.fx.shockwave(p, 3.6, 0xffc050, 0.45);
            this.fx.explosion(p, 0.55 + n * 0.05);
            this.fx.dust(p, 10, 2);
            this.sound('shockwave', p, 0.8, 1 - n * 0.05);
            this.shake(0.35, p);
            this.areaHit(r, p, 3.4, { dmg: 17, kb: 12, lift: 21, launch: true, power: 3, snd: 'robotHeavy', radial: 1 });
          });
        }
        if (r.pilot && r.pilot.isPlayer) { this.fx.impactFrame(1.2); this.ui.flash(0.1); }
        break;
      }
    }
  }

  robotStep(r, foot) {
    foot.getWorldPosition(tB);
    tB.y = 0.05;
    this.fx.dust(tB, 3, 1.1);
    this.sound('robotStep', tB, 0.7, 0.9 + Math.random() * 0.2);
    if (r.pilot && r.pilot.isPlayer) this.shake(0.035); else this.shake(0.03, tB);
  }

  stompSlam(r) {
    const p = tB.set(r.pos.x, r.pos.y + 0.3, r.pos.z);
    this.fx.shockwave(p, 10, 0xffc860, 0.7);
    this.fx.explosion(p, 1.1);
    this.fx.dust(p, 30, 3);
    this.sound('shockwave', p, 1.4);
    this.sound('robotHeavy', p, 1.2, 0.8);
    this.shake(1, p);
    if (r.pilot && r.pilot.isPlayer) { this.fx.impactFrame(1.5); this.ui.flash(0.12); }
    this.areaHit(r, p, 9, { dmg: 26, kb: 22, lift: 17, launch: true, power: 3, snd: 'robotHeavy', radial: 1 });
  }

  updateLaser(r, dt, act) {
    if (!r.beam) return;
    const o = r.rig.laserOrigin || r.rig.head;
    o.getWorldPosition(tB);
    const f = r.fwd(tA);
    // 앞쪽 아래로 기울여 지면을 긁는 레이저
    const len = 22;
    const hb = tB.y - r.pos.y;
    tDir.set(f.x, -hb / len, f.z).normalize();
    let tEnd = len * 1.3;
    if (tDir.y < 0) tEnd = Math.min(tEnd, -hb / tDir.y);
    tC.copy(tB).addScaledVector(tDir, tEnd);
    r.beam.set(tB, tC);
    if (Math.random() < 0.5) this.fx.dust(tC.clone(), 1, 1.2);
    r.beamTick -= dt;
    if (r.beamTick > 0) return;
    r.beamTick = 0.1;
    this.shake(0.12, tC);
    for (const t of this.targets(r)) {
      // 선분-점 거리
      tD.set(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z).sub(tB);
      const proj = clamp(tD.dot(tDir), 0, tEnd);
      const cx = tB.x + tDir.x * proj, cy = tB.y + tDir.y * proj, cz = tB.z + tDir.z * proj;
      const dx = t.pos.x - cx, dz = t.pos.z - cz;
      if (Math.hypot(dx, dz) > t.radius + 1.3) continue;
      if (cy < t.pos.y - 1.5 || cy > t.pos.y + t.height + 1.5) continue;
      const fin = act.t > 2.3;
      const hd = fin ? { dmg: 12, kb: 24, lift: 12, launch: true, power: 3, snd: 'robotHeavy' } : { dmg: 3, kb: 7, lift: 5, stun: 0.25, power: 2, snd: 'robotPunch', launch: t.kind === 'human' && Math.random() < 0.2 };
      tDir.clone();
      this.applyHit(r, t, hd, tA.set(tDir.x, 0, tDir.z).normalize(), tD.set(cx, cy, cz), { noSnd: !fin && Math.random() < 0.6 });
      this.fwdReset(r);
    }
  }

  fwdReset(r) { r.fwd(tA); }

  autoAim(r, from, f, cosMin, maxD) {
    const t = this.nearestEnemy(r, r.pos, maxD, f, cosMin);
    const out = new THREE.Vector3(f.x, 0, f.z);
    if (t) {
      out.set(t.pos.x - from.x, t.pos.y + t.height * 0.5 - from.y, t.pos.z - from.z).normalize();
      out.y = clamp(out.y, -0.35, 0.35);
      out.normalize();
    }
    return out;
  }

  nearestEnemy(r, p, maxD, f, cosMin) {
    // 머리가 부서진 로봇: 조준 거리와 원뿔이 좁아진다
    const m = r && r.kind === 'robot' && r.mods;
    if (m && m.aimRange !== 1) { maxD *= m.aimRange; if (f) cosMin = 1 - (1 - cosMin) * m.aimCone; }
    let best = null, bd = maxD;
    for (const t of this.targets(r)) {
      if (t.kind === 'robot' && t.state === 'idle' && t.owner === r.pilot) continue;
      const dx = t.pos.x - p.x, dz = t.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if (f && d > 0.1 && (dx * f.x + dz * f.z) / d < cosMin) continue;
      const pri = t.kind === 'robot' && t.state === 'idle' ? d + 6 : d;
      if (pri < bd) { bd = pri; best = t; }
    }
    return best;
  }

  // ---------------- 발사체 ----------------
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.type === 'missile') {
        p.age += dt;
        if (p.age > 0.32) {
          if (!p.target || p.target.dead || p.target.state === 'dead' || p.target.riding) p.target = this.nearestEnemy(p.owner, p.pos, 40);
          const sp = Math.min(30, p.vel.length() + dt * 40);
          if (p.target) {
            tA.set(p.target.pos.x - p.pos.x, p.target.pos.y + p.target.height * 0.45 - p.pos.y, p.target.pos.z - p.pos.z).normalize().multiplyScalar(sp);
            p.vel.lerp(tA, 1 - Math.exp(-dt * 3.2));
          } else p.vel.y -= 10 * dt;
          p.vel.setLength(sp);
        } else p.vel.multiplyScalar(0.96);
        this.fx.thruster(p.pos, tB.copy(p.vel).normalize().negate(), 0.55);
        p.mesh.quaternion.setFromUnitVectors(DOWN, tB.copy(p.vel).normalize());
      } else if (p.type === 'boomer') {
        p.age += dt;
        const o = p.owner;
        if (!p.back && p.age > 0.42) { p.back = true; p.hitSet.clear(); }
        if (p.back) {
          if (o.dead || o.riding) { p.life = 0; }
          else {
            tA.set(o.pos.x - p.pos.x, o.pos.y + 1.1 - p.pos.y, o.pos.z - p.pos.z);
            const dd = tA.length();
            if (dd < 1.0 && p.age > 0.55) { p.life = 0; p.caught = true; }
            p.vel.lerp(tA.normalize().multiplyScalar(24), 1 - Math.exp(-dt * 9));
          }
        } else p.vel.multiplyScalar(Math.exp(-dt * 1.6));
        p.mesh.rotation.set(Math.PI / 2, 0, p.age * 22);
        if (Math.random() < 0.6) this.fx.trailPuff(p.pos, 0xffa040, 0.35);
      } else if (p.type === 'fist') {
        this.fx.thruster(p.pos, tB.copy(p.vel).normalize().negate(), 1.3);
        p.mesh.quaternion.setFromUnitVectors(tB.set(0, 0, 1), tC.copy(p.vel).normalize());
      } else if (p.kind === 'sling') {
        p.mesh.quaternion.setFromUnitVectors(DOWN, tB.copy(p.vel).normalize());
        if (Math.random() < 0.5) this.fx.trailPuff(p.pos, 0xffa040, 0.3);
      } else {
        if (Math.random() < 0.7) this.fx.trailPuff(p.pos, 0xff66dd, 0.5);
      }
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      let dead = p.life <= 0;
      if (p.type !== 'boomer') { const gy = this.groundY(p.pos.x, p.pos.z, p.pos.y + 0.5); if (gy !== null && p.pos.y < gy + 0.2) dead = true; }
      if (!dead) {
        for (const t of this.targets(p.owner)) {
          if (p.hitSet && p.hitSet.has(t)) continue;
          const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
          if (Math.hypot(dx, dz) > p.r + t.radius) continue;
          if (p.pos.y < t.pos.y - p.r || p.pos.y > t.pos.y + t.height + p.r) continue;
          tDir.copy(p.vel).setY(0).normalize();
          if (p.type === 'fist') {
            p.hitSet.add(t);
            this.applyHit(p.owner, t, { dmg: 22, kb: 30, lift: 14, launch: true, power: 3, snd: 'robotHeavy' }, tDir, p.pos.clone());
            if (t.kind === 'robot') { dead = true; break; }
          } else if (p.type === 'boomer') {
            p.hitSet.add(t);
            this.applyHit(p.owner, t, p.back ? { dmg: 6, kb: 4, lift: 7, launch: true, power: 1, snd: 'kick', chase: true } : { dmg: 7, kb: 3, lift: 2, stun: 0.55, power: 1, snd: 'punch' }, tDir, p.pos.clone());
          } else if (p.type === 'shot' && p.kind === 'sling') {
            // 하루 새총: 가벼운 견제. 로봇에게도 조금은 아프다
            this.applyHit(p.owner, t, { dmg: 6, kb: 6, lift: 3, stun: 0.32, power: 1, snd: 'punch' }, tDir, p.pos.clone());
            dead = true; break;
          } else if (p.type === 'shot') {
            if (p.owner.act && p.owner.act.name === 'blaster') p.owner.act.flags.shotHit = true;
            this.applyHit(p.owner, t, { dmg: 5, kb: 9, lift: 4, stun: 0.3, power: 2, snd: 'robotPunch' }, tDir, p.pos.clone());
            dead = true; break;
          } else {
            dead = true; break;
          }
        }
      }
      if (dead) {
        if (p.type === 'missile') {
          this.fx.explosion(p.pos, 0.6);
          this.sound('explosion', p.pos, 0.55, 1.4);
          this.shake(0.2, p.pos);
          this.areaHit(p.owner, p.pos, 2.8, { dmg: 9, kb: 13, lift: 11, launch: true, power: 2, snd: 'kick' });
        } else if (p.type === 'fist') {
          this.fx.explosion(p.pos, 0.7);
          this.sound('explosion', p.pos, 0.6, 1.2);
        } else if (p.type === 'boomer') { if (!p.caught) this.fx.sparkle(p.pos, 0xffa040); }
        else this.fx.hit(p.pos, UP, 0, 0xff66dd);
        this.removeProj(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  removeProj(p) {
    if (p.mesh.userData.pooledCarrot) this.releaseCarrot(p.mesh);
    else this.scene.remove(p.mesh);
  }

  // 당근 메시 풀: 부메랑·새총·미사일·아이템이 발사마다 새 메시를 만들지 않게 한다
  takeCarrot(scale) {
    const pool = this.carrotPool || (this.carrotPool = []);
    const mesh = pool.pop() || createCarrot();
    mesh.userData.pooledCarrot = true;
    mesh.visible = true;
    mesh.quaternion.identity();
    mesh.scale.setScalar(scale);
    return mesh;
  }

  releaseCarrot(mesh) {
    this.scene.remove(mesh);
    const pool = this.carrotPool || (this.carrotPool = []);
    if (mesh.userData.pooledCarrot && pool.length < 24) pool.push(mesh);
  }

  // ---------------- 당근 아이템 ----------------
  updateCarrots(dt) {
    if (this.phase === 'fight') {
      this.carrotT -= dt;
      if (this.carrotT <= 0 && this.carrots.length < 3) {
        this.carrotT = 8 + Math.random() * 5;
        let pt;
        if (this.arena.randomPoint) pt = this.arena.randomPoint(2.5);
        else { const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * (this.arena.radius - 7); pt = { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d }; }
        const mesh = this.takeCarrot(1.5);
        this.scene.add(mesh);
        const c = { mesh, pos: new THREE.Vector3(pt.x, (pt.y || 0) + 26, pt.z), gy: pt.y || 0, landed: false, t: 0 };
        if (!this.arena.randomPoint) for (const o of this.arena.obstacles) if (Math.hypot(c.pos.x - o.x, c.pos.z - o.z) < o.r + 1) { c.pos.x += (o.r + 1.5) * Math.sign(c.pos.x - o.x || 1); }
        this.carrots.push(c);
      }
    }
    for (let i = this.carrots.length - 1; i >= 0; i--) {
      const c = this.carrots[i];
      c.t += dt;
      if (!c.landed) {
        c.pos.y -= dt * 22;
        if (c.pos.y <= c.gy + 0.7) { c.pos.y = c.gy + 0.7; c.landed = true; this.fx.dust(c.pos, 5, 0.6); this.fx.sparkle(c.pos, 0xffa040); }
      }
      c.mesh.position.set(c.pos.x, c.pos.y + (c.landed ? Math.sin(c.t * 4) * 0.15 : 0), c.pos.z);
      c.mesh.rotation.y = c.t * 2.5;
      if (!c.landed) continue;
      let taken = false;
      for (const h of this.humans) {
        if (h.dead || h.out || h.riding) continue;
        if (this.dist2D(h.pos, c.pos) < 1.2 && Math.abs(h.pos.y + 0.7 - c.pos.y) < 1.4) {
          h.hp = Math.min(h.maxHp, h.hp + 15);
          h.addGauge(32);
          this.fx.sparkle(c.pos, 0xffb040);
          this.sound('gaugeFull', c.pos, 0.5, 1.5);
          this.ui.callout(h.pos, '🥕 +32', 'good');
          taken = true;
          break;
        }
      }
      // Raw pickups feed on-foot pilots; a rabbit needs a dispenser or grinder.
      if (taken) { this.releaseCarrot(c.mesh); this.carrots.splice(i, 1); }
    }
  }

  // ---------------- 물리 보조 ----------------
  pushObstacles(e) {
    if (e.pos.y > 2.6) return;
    for (const o of this.arena.obstacles) {
      const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
      const d = Math.hypot(dx, dz), m = o.r + e.radius;
      if (d < m && d > 0.001) {
        e.pos.x = o.x + (dx / d) * m; e.pos.z = o.z + (dz / d) * m;
        const vn = (e.vel.x * dx + e.vel.z * dz) / d;
        if (vn < 0) {
          if (e.state === 'launched' && vn < -10) { e.vel.x -= (dx / d) * vn * 1.6; e.vel.z -= (dz / d) * vn * 1.6; this.fx.dust(e.pos, 4, 0.8); this.sound('land', e.pos, 0.8); }
          else { e.vel.x -= (dx / d) * vn; e.vel.z -= (dz / d) * vn; }
        }
      }
    }
  }

  separate() {
    const list = [];
    for (const h of this.humans) if (!h.dead && !h.out && !h.riding) list.push(h);
    for (const r of this.robots) if (r.state === 'idle' || r.state === 'active') list.push(r);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.height, b.height) * 0.8) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), m = (a.radius + b.radius) * 0.85;
      if (d >= m || d < 0.0001) continue;
      const push = (m - d);
      const wa = a.kind === 'robot' ? (b.kind === 'robot' ? 0.5 : 0.1) : b.kind === 'robot' ? 0.9 : 0.5;
      const nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
      b.pos.x += nx * push * (1 - wa); b.pos.z += nz * push * (1 - wa);
    }
  }

  dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  groundY(x, z, y) {
    const a = this.arena;
    if (a.groundAt) return a.groundAt(x, z, y);
    return Math.hypot(x, z) <= a.radius ? 0 : null;
  }

  // ---------------- 연출 보조 ----------------
  sound(name, pos, vol = 1, pitch = 1) {
    let pan = 0, att = 1;
    if (pos) {
      const s = this.toScreen(pos);
      pan = clamp((s.x - 0.5) * 1.4, -0.8, 0.8);
      const d = this.camera.position.distanceTo(pos);
      att = clamp(1.25 - d / 70, 0.35, 1.1);
    }
    audio.sfx(name, { vol: vol * att, pitch, pan });
  }

  shake(amount, pos) {
    let k = 1;
    if (pos && this.player) k = clamp(1.2 - this.dist2D(pos, this.player.riding ? this.player.riding.pos : this.player.pos) / 40, 0.3, 1);
    this.trauma = Math.min(1.2, this.trauma + amount * k);
  }

  slow(scale, dur) {
    this.timeScale = Math.min(this.timeScale, scale);
    this.slowT = Math.max(this.slowT, dur);
  }

  toScreen(p) {
    tD.copy(p).project(this.camera);
    return { x: (tD.x + 1) / 2, y: (1 - tD.y) / 2, z: tD.z };
  }

  updateCamera(realDt) {
    const cam = this.camera, pl = this.player;
    if (!pl) return;
    if (this.cockpitCamera.update(this, realDt)) return;
    const width = typeof innerWidth === 'number' ? innerWidth : 1280;
    const height = typeof innerHeight === 'number' ? innerHeight : 720;
    const touch = typeof document !== 'undefined' && document.documentElement?.classList.contains('touch-mode');
    const offset = cam.view?.enabled ? cam.view.offsetY * height / cam.view.fullHeight : 0;
    const view = cameraViewport(width, height, touch, offset, cam.fov);
    const me = pl.riding || pl;
    const player = cameraSubject(me, this._camPlayer || (this._camPlayer = {}));
    if (pl.dead || pl.out) { player.x = player.y = player.z = 0; }
    const lead = tA.set(0, 0, 0);
    if (!pl.dead && me.vel) {
      lead.set(me.vel.x * 0.14, 0, me.vel.z * 0.14);
      if (lead.length() > 1.2) lead.setLength(1.2);
    }
    this.camLead.lerp(lead, 1 - Math.exp(-realDt * 2.5));
    const pts = this._camPts || (this._camPts = []);
    const pool = this._camPool || (this._camPool = []);
    pts.length = 0;
    const add = (entity) => {
      if (Math.hypot(entity.pos.x - player.x, entity.pos.z - player.z) >= 12) return;
      const i = pts.length;
      pts.push(cameraSubject(entity, pool[i] || (pool[i] = {})));
    };
    for (const h of this.humans) if (h !== pl && !h.dead && !h.out) add(h.riding || h);
    for (const r of this.robots) if (r.state === 'idle' && r.owner === pl) add(r);
    const frame = frameCombat(view, player, pts, this.camLead, this.arena.radius,
      this._camFrame || (this._camFrame = {}));
    let distance = frame.distance;
    if (pl.dead || pl.out) distance *= 1.6;
    if (this.phase === 'intro') distance *= 1.35;
    const k = 1 - Math.exp(-realDt * 6.5);
    if (!this._cameraReady) {
      this.camLook.set(frame.x, frame.y, frame.z);
      this.camDist = distance;
      this._cameraReady = true;
    } else {
      this.camLook.lerp(tB.set(frame.x, frame.y, frame.z), k);
      // Boarding changes the visual center by several units at once. Center
      // the new body before fitting, avoiding a one-frame excessive zoom-out.
      if (this._camKind !== me.kind) this.camLook.y = frame.y;
    }
    this._camKind = me.kind;
    this.zoomPunch = Math.max(0, this.zoomPunch - realDt * 2.2);
    distance *= 1 - Math.sin(this.zoomPunch * Math.PI) * 0.06;
    this.camDist += (distance - this.camDist) * (1 - Math.exp(-realDt * (distance > this.camDist ? 4.5 : 1.5)));
    // A mount, launch or resize can grow the visual bounds in one frame.
    // Protect the local fighter immediately, while normal zoom-in stays slow.
    this.camDist = Math.max(this.camDist, fitSubject(view, this.camLook, player));
    const aim = cameraAim(view, this.camLook, this.camDist, this._camAim || (this._camAim = {}));
    this.camPos.set(aim.x, aim.y + Math.sin(CAMERA_PITCH) * this.camDist,
      aim.z + Math.cos(CAMERA_PITCH) * this.camDist);
    cam.position.copy(this.camPos);
    this.trauma = Math.max(0, this.trauma - realDt * 1.9);
    const s = this.reducedMotion ? 0 : this.trauma * this.trauma;
    if (s > 0) {
      const t = this.time * 60;
      cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * s * 0.7;
      cam.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3)) * s * 0.6;
      cam.position.z += Math.sin(t * 2.1 + 2) * s * 0.4;
    }
    cam.lookAt(tD.set(aim.x, aim.y, aim.z));
    if (s > 0) cam.rotateZ(Math.sin(this.time * 90) * s * 0.02);
  }
}

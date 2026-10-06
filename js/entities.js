// 전투 엔티티: 사람(Human)과 토끼 로봇(Robot)
import * as THREE from 'three';
import { createHuman, createRobot } from './models.js';
import { HUMAN_ACTS, ROBOT_ACTS, ROBOT_MOVES, ROBOT_STANCE } from './actions.js';
import { makePose, blendInto, sample, applyRig, P } from './poses.js';
import { ROBOT_STATS, RULES, DIFFICULTY } from './data.js';
import { AICtrl } from './ai.js';
import { PlayerCtrl } from './input.js';
import { ROBOT_GAITS, applyRobotReadyPose } from './robot-presentation.js';
import { attachRobotCombat, robotContactSegments, sweptRobotContacts } from './robot-combat.js';
import { createGroundMarkerGeometry, projectGroundMarker } from './ground-marker.js';
import { PARTS, PART_BIT, PART_NAME, PART_EFFECT, partMaxHp, robotMods, stepJuice, juiceCost, skillJuice, skillPart, skillBlock as blockOf } from './robot-systems.js';

const tF = new THREE.Vector3();
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tM = new THREE.Matrix4();
const tM2 = new THREE.Matrix4();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angLerp = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

const KNEEL = makePose({ tx: 0.5, nx: 0.3, ex: 1.0, llx: -1.45, slx: 1.5, lrx: 0.45, srx: 2.2, alx: -0.25, flx: -0.4, arx: -0.6, frx: -0.9, alz: 0.1, arz: -0.1 });
const RFALL = makePose({ tx: -0.25, nx: -0.3, ex: -0.8, alz: 0.9, arz: -0.9, alx: -0.3, arx: -0.3, llx: -0.6, slx: 0.9, lrx: 0.1, srx: 0.5 });
const RHURT = makePose({ ...ROBOT_STANCE, tx: -0.4, nx: -0.35, alx: 0.3, arx: 0.3, alz: 0.5, arz: -0.5, ex: -0.6 });
const RJUMP = makePose({ ...ROBOT_STANCE, llx: -0.9, slx: 1.3, lrx: 0.1, srx: 0.5, alz: 0.5, arz: -0.5, ex: -0.9 });
const RSTANCE = makePose(ROBOT_STANCE);
const HP = {};
for (const k of Object.keys(P)) HP[k] = makePose(P[k]);
const FLAT = { h: 0, vx: 0, vz: 0, pad: 0 };
const ROBOT_COMBO = new Set(['tp1', 'tp2', 'bk1', 'bk2', 'bk3', 'blaster', 'hs1', 'hs2']);
const STUNNED = new Set(['hurt', 'launched', 'down']);
// 탑승 중 하차: 호출 버튼을 이만큼 누르고 있기
export const EJECT_HOLD = 0.6;
// 스킬 2 종류 → 액션 이름 (guard/parry 는 state 'guard')
const SKILL2_ACT = { roll: 'rollDodge', flip: 'backFlip', smoke: 'smokeStep', barrier: 'barrierCast', brace: 'brace', blink: 'blinkStep' };
const GUARD_KINDS = new Set(['guard', 'parry']);

// ---------------- 발밑 표식: 접지 그림자 + 팀 색 링 (플레이어는 굵은 링 + 진행 방향 화살표) ----------------
// 그림자 맵이 꺼진 저품질에서도 캐릭터가 땅에 붙어 보이고, 작은 화면에서 누가 나인지 바로 보이게 한다.
// 전투원마다 드로우 1회. 텍스처는 문서/캔버스 없이 만든다 (노드 테스트에서도 동작).
let markTex = null, markGeo = null;
function markTextures() {
  if (markTex) return markTex;
  const N = 64;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const make = (player) => {
    const d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1, w = ((y + 0.5) / N) * 2 - 1, r = Math.hypot(u, w);
      // 로컬 +z(앞) = 텍스처 아래쪽(w < 0)
      let blob = 0.5 * (1 - smooth(0.12, 0.56, r));
      let ring = 0, ink = 0;
      if (player) {
        ring = smooth(0.58, 0.62, r) * (1 - smooth(0.72, 0.76, r));
        ink = smooth(0.53, 0.57, r) * (1 - smooth(0.78, 0.82, r));
        // 앞쪽 셰브론
        const f = -w, s = Math.abs(u);
        if (f > 0.7 && f < 0.99 && s < 0.3) {
          const edge = 0.99 - s * 0.95;
          const c = smooth(edge - 0.2, edge - 0.16, f) * (1 - smooth(edge - 0.03, edge, f));
          const o = smooth(edge - 0.25, edge - 0.21, f) * (1 - smooth(edge + 0.01, edge + 0.04, f));
          ring = Math.max(ring, c); ink = Math.max(ink, o);
        }
      } else {
        ring = smooth(0.6, 0.63, r) * (1 - smooth(0.69, 0.72, r)) * 0.85;
        ink = smooth(0.57, 0.6, r) * (1 - smooth(0.72, 0.75, r)) * 0.5;
      }
      const dark = Math.max(blob, ink * 0.75);
      const a = Math.max(ring, dark);
      const v = a > 0 ? Math.round(255 * ring / a) : 0;
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.round(255 * a);
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };
  markGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  markTex = { player: make(true), other: make(false) };
  return markTex;
}
function addMark(f, color, size, player) {
  const T = markTextures();
  const mat = new THREE.MeshBasicMaterial({ map: player ? T.player : T.other, color, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const projected = f.kind === 'human';
  const m = new THREE.Mesh(projected ? createGroundMarkerGeometry() : markGeo, mat);
  m.name = 'rr-mark';
  m.userData.rrGroundMark = true;
  m.userData.rrProjectedGround = projected;
  m.renderOrder = -1;
  m.castShadow = m.receiveShadow = false;
  f.rig.root.add(m);
  f.mark = m; f.markSize = size; f.markPlayer = player;
  const dispose = f.rig.dispose;
  f.rig.dispose = () => { dispose(); mat.dispose(); if (projected) m.geometry.dispose(); };
}
// 공격으로 치지 않는 기술: 배리어를 깨지 않는다
const NON_ATTACK = new Set(['barrierCast', 'rollDodge', 'backFlip', 'smokeStep', 'blinkStep', 'brace', 'burst', 'summon']);
// Damaged groups keep dangling from these joints after their shell breaks.
const PART_NODES = { armL: ['foreL'], armR: ['foreR'], head: ['earL', 'earR'], legs: ['shinL'] };

// 떨어져 나가는 부위: 보이는 메시만 같은 지오메트리/재질로 복사한다 (userData 복사 없이)
function snapshotPiece(node) {
  const g = new THREE.Group();
  node.updateWorldMatrix(true, true);
  const inv = tM.copy(node.matrixWorld).invert();
  let shell = null, shellVolume = -1;
  node.traverseVisible((o) => {
    if (!o.isMesh) return;
    const box = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
    const size = box.getSize(tA);
    const volume = size.x * size.y * size.z;
    if (volume > shellVolume) { shell = o; shellVolume = volume; }
  });
  if (shell) {
    const m = new THREE.Mesh(shell.geometry, shell.material);
    tM2.multiplyMatrices(inv, shell.matrixWorld).decompose(m.position, m.quaternion, m.scale);
    m.castShadow = true;
    g.add(m);
  }
  node.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  g.scale.multiplyScalar(0.46);
  return g;
}

class Fighter {
  constructor(game, rig, kind) {
    this.g = game;
    this.rig = rig;
    this.kind = kind;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = true;
    this.act = null;
    this.hs = 0;
    this.flash = 0;
    this.flashShown = 0;
    this.pose = makePose();
    this.tp = makePose();
    this.restHips = rig.hips.position.y;
    this.sc = this.restHips / 0.8;
    this.radius = rig.radius;
    this.height = rig.height;
    this.walkPh = 0;
    this.moveAmt = 0;
    this.spinYaw = 0;
    this.footRest = this.measureFeet();
  }

  fwd(out = tF) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  // 발밑 지형. 지형 API 가 없으면 평평한 원판으로 본다
  ground(y) {
    const a = this.g.arena;
    if (a.surfaceAt) return a.surfaceAt(this.pos.x, this.pos.z, y);
    return Math.hypot(this.pos.x, this.pos.z) <= a.radius && y > -1.2 ? FLAT : null;
  }

  // 걸어서는 허공(구멍/섬 밖)으로 나가지 않게 한다. 벽을 따라 미끄러지도록 축별로 시도
  keepOnGround(px, pz, y) {
    let s = this.ground(y);
    if (s) return s;
    const nx = this.pos.x, nz = this.pos.z;
    this.pos.z = pz;
    s = this.ground(y);
    if (s) return s;
    this.pos.x = px; this.pos.z = nz;
    s = this.ground(y);
    if (s) return s;
    this.pos.z = pz;
    return this.ground(y);
  }

  pushWalls() {
    const a = this.g.arena;
    if (a.pushOut) { if (a.pushOut(this) && this.state === 'launched') this.g.wallBounce(this); }
    else this.g.pushObstacles(this);
  }

  measureFeet() {
    applyRig(this.rig, this.pose, this.restHips, this.sc);
    this.rig.root.updateMatrixWorld(true);
    const a = this.rig.footL.getWorldPosition(tA).y;
    const b = this.rig.footR.getWorldPosition(tB).y;
    return Math.min(a, b) - this.rig.root.position.y;
  }

  startAct(name, table) {
    const def = table[name];
    this.act = { name, def, t: 0, hits: new Map(), ev: 0, buf: false, flags: {} };
    if (this.kind === 'robot') this.rig.presentMotion?.(this.pose, name, this.broken);
    return this.act;
  }

  // 공통 액션 진행: 이벤트, 전진, 히트
  stepAct(dt, onEvent) {
    const a = this.act;
    const d = a.def;
    if (this.kind === 'robot' && d.hits?.some(hit => hit.contact)) {
      this.contactTick = { action: a, from: a.t,
        before: d.hits.map(hit => hit.contact ? robotContactSegments(this.rig, hit.contact) : null) };
    }
    a.t += dt;
    if (d.events) {
      while (a.ev < d.events.length && d.events[a.ev][0] <= a.t) { onEvent(d.events[a.ev][1], a); a.ev++; }
    }
    if (this.act !== a) return;
    if (d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1]) {
      const f = this.fwd();
      this.vel.x = f.x * d.lunge[2];
      this.vel.z = f.z * d.lunge[2];
    }
    if (d.hits) {
      for (let j = 0; j < d.hits.length; j++) {
        const h = d.hits[j];
        if (h.contact && this.kind === 'robot') continue; // Resolve after this tick's pose/root.
        if (a.t < h.t0 || a.t > h.t1) continue;
        this.g.meleeSweep(this, h, j, a);
      }
    }
  }

  applyPose(dt, snap, plant) {
    if (this.clearBrokenMotionOffsets) this.clearBrokenMotionOffsets();
    if (!snap) {
      // 회전 기술이 끝난 뒤 여러 바퀴를 되감지 않도록 가까운 각도로 접는다
      for (const k of ['hry', 'hx']) { const v = this.pose[k]; if (v > Math.PI || v < -Math.PI) this.pose[k] = v - Math.round(v / (Math.PI * 2)) * Math.PI * 2; }
    }
    if (snap) Object.assign(this.pose, this.tp);
    else blendInto(this.pose, this.tp, 1 - Math.exp(-dt * 16));
    const rig = this.rig;
    applyRig(rig, this.pose, this.restHips, this.sc);
    if (plant) {
      rig.root.updateMatrixWorld(true);
      const a = rig.footL.getWorldPosition(tA).y;
      const b = rig.footR.getWorldPosition(tB).y;
      const low = Math.min(a, b) - rig.root.position.y;
      rig.hips.position.y += this.footRest - low + Math.max(0, this.pose.hy) * this.sc;
    }
    if (this.kind === 'robot') rig.presentMotion?.(this.pose, this.act?.name, this.broken);
    if (this.kind === 'robot') rig.presentCombat?.(this.pose, this.act?.name, this.broken);
  }

  syncRoot() {
    if (this.kind === 'robot') {
      this.clearBrokenMotionOffsets?.();
      this.rig.presentMotion?.(this.pose, this.act?.name, this.broken);
      this.rig.presentCombat?.(this.pose, this.act?.name, this.broken);
      this.applyBrokenMotion?.(0);
    }
    if (this.kind === 'human') this.rig.animateFace?.(this.g.time + this.id * .37);
    const r = this.rig.root;
    r.position.copy(this.pos);
    r.rotation.y = this.facing + this.spinYaw;
    if (this.hs > 0) {
      const s = 0.05 * this.sc;
      r.position.x += (Math.random() - 0.5) * s * 2;
      r.position.z += (Math.random() - 0.5) * s * 2;
    }
    this.syncMark();
  }

  // 발밑 표식을 지면 높이에 붙인다. 공중에서는 작고 옅어진다 (루트는 y축 회전만 하므로 로컬 y = 월드 y 차이)
  syncMark() {
    const m = this.mark;
    if (!m) return;
    if (this.kind === 'robot') {
      // 로봇 표식은 타고 있는 파일럿 색. 내가 타면 플레이어 표식으로 바뀐다
      const who = this.pilot || this.owner, mine = !!(this.pilot && this.pilot.isPlayer);
      if (mine !== this.markPlayer) { this.markPlayer = mine; m.material.map = mine ? markTextures().player : markTextures().other; }
      if (who) m.material.color.setHex(who.color);
    }
    const gh = this.gh;
    if (gh === undefined || gh < -50 || this.rig.root.parent !== this.g.scene) { m.visible = false; return; }
    const h = Math.max(0, this.pos.y - gh);
    const k = clamp(1 - h / 7, 0.3, 1);
    if (m.userData.rrProjectedGround) {
      m.visible = projectGroundMarker(m, { arena: this.g.arena, root: this.rig.root, groundHeight: gh,
        size: this.markSize * (0.65 + 0.35 * k), facing: this.facing });
      m.material.opacity = k;
      return;
    }
    m.visible = true;
    m.position.set(0, gh - this.pos.y + 0.05, 0);
    m.rotation.y = -this.spinYaw;
    m.scale.setScalar(this.markSize * (0.65 + 0.35 * k));
    m.material.opacity = k;
  }

  updateFlash(realDt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - realDt * 7);
    if (this.flash !== this.flashShown) { this.rig.setFlash(this.flash); this.flashShown = this.flash; }
  }
}

// ============================ 사람 ============================
export class Human extends Fighter {
  constructor(g, id, pilot, isPlayer, diffIdx) {
    const rig = createHuman(pilot);
    super(g, rig, 'human');
    this.id = id;
    this.pilot = pilot;
    this.P = pilot;
    this.name = pilot.name;
    this.color = pilot.color;
    this.isPlayer = isPlayer;
    this.ctrl = isPlayer ? new PlayerCtrl() : new AICtrl(g, this, DIFFICULTY[diffIdx]);
    this.robotType = 'titan';
    this.maxHp = pilot.hp || RULES.humanHp;
    this.hp = this.maxHp;
    this.stock = g.stockCount;
    this.gauge = 0;
    this.state = 'normal';
    this.stateT = 0;
    this.riding = null;
    this.boardTarget = null;
    this.boardT = 0;
    this.boardNeed = 1;
    this.boardTick = 0;
    this.invuln = 0;
    this.dashCd = 0;
    this.stun = 0;
    this.dead = false;
    this.out = false;
    this.respawnT = 0;
    this.koT = 0;
    this.lastHitBy = null;
    this.lastHitT = -99;
    this.kos = 0;
    this.falls = 0;
    this.dmgDealt = 0;
    this.ejectHold = 0;
    this.needRelease = false;
    this.gaugeFullShown = false;
    this.outOrder = 0;
    // 콤보/공중전
    this.airJumpsLeft = pilot.airJumps || 0;
    this.airCount = 0;
    this.chaseT = 0;
    this.chaseTarget = null;
    this.floatT = 0;
    this.juggleT = 0;
    this.gh = 0;          // 발밑 지면 높이
    this.plat = null;     // 올라탄 움직이는 발판
    // 배리어/패리
    this.shieldT = 0;
    this.guardStart = -99;
    this.parryBuff = 0;
    this.combo = { n: 0, dmg: 0, t: 0, target: null, best: 0 };
    // 스킬 쿨다운 (cd1: 스킬 1, cd2: 스킬 2 방어기 / 브레이크 버스트)
    this.cd1 = 0;
    this.cd2 = 0;
    this.cd2Max = (pilot.skill2 && pilot.skill2.cd) || 1;
    // 일방적인 전투 방지: 쉬지 않고 연속으로 맞은 횟수와 자유롭게 움직인 시간
    this.hitsTaken = 0;
    this.freeT = 0;
    this.stunChain = 0;    // 연속 경직 시간
    this.bubbleT = 0;      // 도리 당근 배리어
    this.comeback = 1;     // 뒤처진 만큼 게이지 충전 배율 (game.update 가 매 틱 계산)
    // UI 가 매 틱 읽는 값: 객체를 재사용해 할당을 만들지 않는다
    this._hud = [
      { name: '', cd: 0, cdMax: 1, ready: true, hold: false, burst: false, active: false, why: '', juice: 0 },
      { name: '', cd: 0, cdMax: 1, ready: true, hold: false, burst: false, active: false, why: '', juice: 0 },
    ];
    this._ctx = { kind: null, progress: 0, label: '', hint: '', near: false };
    g.scene.add(rig.root);
    addMark(this, this.color, 1.3, isPlayer);
  }

  get robot() {
    for (const r of this.g.robots) if (r.owner === this && r.state !== 'dead') return r;
    return null;
  }
  get team() { return this.id; }
  get alive() { return !this.dead && !this.out; }
  get airborne() { return !this.onGround && this.pos.y - this.gh > 0.55; }

  cancelAct() {
    if (this.act && this.act.name === 'summon') this.rig.remote.visible = false;
    this.act = null;
    this.floatT = 0;
  }

  // ---------- 스킬 (UI 계약) ----------
  // skillHud(): [스킬 1, 스킬 2]. 매 틱 읽어도 되도록 캐시 객체를 갱신해 돌려준다
  //   { name, cd, cdMax, ready, hold(누르고 있는 기술), burst(지금 스킬 2 로 브레이크 버스트 가능), active(발동 중) }
  //   why: 못 쓰는 이유 ('' | 'cd' | 'juice' 당근쥬스 부족 | 'part' 필요한 부위 파괴), juice: 당근쥬스 소모량 (사람 상태는 0)
  //   탑승 중에는 로봇 스킬 1/2 (cds.k / cds.l) 를 같은 모양으로 돌려준다
  skillHud() {
    const h = this._hud, a = h[0], b = h[1];
    const r = this.riding;
    if (r) {
      const st = r.stats.skills, mul = (this.P.robot && this.P.robot.cd) || 1;
      a.name = st[1].name; a.cdMax = st[1].cd * mul; a.cd = r.cds.k; a.why = r.skillBlock(1); a.ready = a.why === ''; a.juice = skillJuice(r.type, 1, r.broken); a.hold = false; a.burst = false; a.active = !!(r.act && r.act.name === r.moves.k);
      b.name = st[2].name; b.cdMax = st[2].cd * mul; b.cd = r.cds.l; b.why = r.skillBlock(2); b.ready = b.why === ''; b.juice = skillJuice(r.type, 2, r.broken); b.hold = false; b.burst = false; b.active = !!(r.act && r.act.name === r.moves.l);
      return h;
    }
    const s1 = this.P.skill1, s2 = this.P.skill2;
    a.name = s1.name; a.cdMax = s1.cd; a.cd = this.cd1; a.ready = this.cd1 <= 0; a.why = a.ready ? '' : 'cd'; a.juice = 0; a.hold = false; a.burst = false;
    a.active = !!(this.act && this.act.name === this.P.acts.heavy);
    b.name = s2.name; b.cdMax = this.cd2Max; b.cd = this.cd2; b.ready = this.cd2 <= 0; b.why = b.ready ? '' : 'cd'; b.juice = 0; b.hold = GUARD_KINDS.has(s2.kind);
    b.burst = this.canBurst();
    b.active = this.state === 'guard' || this.bubbleT > 0 || !!(this.act && this.act.def.counter);
    return h;
  }

  // 콤보 한계: 더 이상 공중에 붙잡아 둘 수 없다
  juggleCapped() { return this.hitsTaken >= RULES.juggleCap || this.stunChain >= RULES.juggleTime; }

  // 연속으로 맞는 중 스킬 2 로 탈출할 수 있는가
  canBurst() {
    return this.hitsTaken >= RULES.burstHits && this.cd2 <= 0 && !(this.koT > 0) && this.hp > 0 && !this.riding
      && (this.state === 'hurt' || this.state === 'launched');
  }

  // 스킬 1: 파일럿 대표 기술 (쿨다운)
  useSkill1(name) {
    if (!name || this.cd1 > 0 || !HUMAN_ACTS[name]) return false;
    this.cd1 = this.P.skill1.cd;
    this.doAct(name);
    return true;
  }

  // 스킬 2 를 지금 쓸 수 있는가 (부작용 없음)
  skill2Ready(i) {
    const sk = this.P.skill2;
    if (!sk || this.cd2 > 0) return false;
    if (GUARD_KINDS.has(sk.kind)) return !!i.grd && this.onGround;
    if (!i.grdP) return false;
    return this.onGround || sk.kind === 'blink' || sk.kind === 'barrier' || sk.kind === 'smoke';
  }

  // 스킬 2: 방어 기술. guard/parry 는 누르고 있는 동안 가드, 나머지는 쿨다운 기술
  useSkill2(i) {
    if (!this.skill2Ready(i)) return false;
    const sk = this.P.skill2;
    if (GUARD_KINDS.has(sk.kind)) { this.startGuard(); return true; }
    const inMag = Math.hypot(i.mx, i.mz);
    if (sk.kind === 'roll' && inMag > 0.2) this.facing = Math.atan2(i.mx, i.mz);
    this.cd2 = this.cd2Max = sk.cd;
    this.doAct(SKILL2_ACT[sk.kind]);
    return true;
  }

  // 가드를 풀면 짧은 쿨다운. 최대 유지 시간을 다 써서 풀리면 조금 더 길다
  endGuard(timeout = false) {
    this.setState('normal');
    const sk = this.P.skill2;
    this.cd2 = this.cd2Max = timeout ? 1.2 : (sk && sk.cd) || 0.3;
  }

  jumpUp(mul = 1) {
    const g = this.g;
    this.vel.y = (this.P.jump || 11.5) * mul; this.onGround = false;
    g.sound('jump', this.pos, 0.7);
    g.fx.dust(this.pos, 5, 0.6);
  }

  startDash(i, inMag, speed) {
    const g = this.g;
    this.setState('dash');
    const dx = inMag > 0.2 ? i.mx / inMag : Math.sin(this.facing);
    const dz = inMag > 0.2 ? i.mz / inMag : Math.cos(this.facing);
    this.facing = Math.atan2(dx, dz);
    const ds = 17 + speed * 0.3;
    this.vel.x = dx * ds; this.vel.z = dz * ds;
    if (!this.onGround) this.vel.y = Math.max(this.vel.y, 2);
    this.invuln = Math.max(this.invuln, 0.16);
    this.dashCd = 0.45;
    g.sound('dash', this.pos, 0.8);
    g.fx.dust(this.pos, 6, 0.7);
  }

  // 루나 순간이동: 스틱 방향(없으면 뒤)으로. 발밑이 없는 곳으로는 가지 않는다
  blink() {
    const g = this.g, i = this.ctrl.in;
    const m = Math.hypot(i.mx, i.mz);
    const dx = m > 0.2 ? i.mx / m : -Math.sin(this.facing);
    const dz = m > 0.2 ? i.mz / m : -Math.cos(this.facing);
    const d = (this.P.skill2 && this.P.skill2.dist) || 4.5;
    const ox = this.pos.x, oz = this.pos.z;
    g.fx.sparkle(tA.copy(this.pos).setY(this.pos.y + 1), this.color);
    g.fx.ring(tA.copy(this.pos).setY(this.pos.y + 0.08), null, 0.3, 1.6, 0.3, this.color, 0.9);
    let ok = false;
    for (const k of [1, 0.65, 0.35]) {
      this.pos.x = ox + dx * d * k; this.pos.z = oz + dz * d * k;
      const s = this.ground(this.pos.y + 0.6);
      if (s && (!this.onGround || Math.abs(s.h - this.pos.y) < 1.6)) { ok = true; break; }
    }
    if (!ok) { this.pos.x = ox; this.pos.z = oz; }
    this.vel.x = dx * 3; this.vel.z = dz * 3;
    if (!this.onGround) this.vel.y = Math.max(this.vel.y, 2);
    g.fx.sparkle(tA.copy(this.pos).setY(this.pos.y + 1), this.color);
    g.sound('dash', this.pos, 0.7, 1.6);
  }

  update(dt, realDt) {
    this.updateFlash(realDt);
    if (this.out) return;
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.g.phase === 'fight') this.g.respawn(this);
      return;
    }
    if (this.riding) { this.updateRiding(dt); return; }
    const g = this.g;
    const P = this.P;
    this.frozen = false;
    if (this.hs > 0) {
      this.hs -= realDt;
      this.frozen = true;
      this.syncRoot();
      return;
    }
    const i = this.ctrl.in;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd -= dt;
    this.stateT += dt;
    this.chaseT -= dt;
    this.parryBuff = Math.max(0, this.parryBuff - dt);
    if (this.cd1 > 0) this.cd1 = Math.max(0, this.cd1 - dt);
    if (this.cd2 > 0) this.cd2 = Math.max(0, this.cd2 - dt);
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) g.endBubble(this); }
    // 자유롭게 움직인 시간이 쌓이면 연속 피격 수를 초기화한다
    if (STUNNED.has(this.state)) { this.freeT = 0; this.stunChain += dt; }
    else if (this.hitsTaken > 0 || this.stunChain > 0) { this.freeT += dt; if (this.freeT >= RULES.freeReset) { this.hitsTaken = 0; this.stunChain = 0; } }
    const fighting = g.phase === 'fight';
    if (fighting && !this.robot) this.addGauge(RULES.gaugePassive * dt * (g.enemyRiding(this) ? RULES.enemyRobotGauge : 1));
    const canSummon = this.gauge >= RULES.gaugeMax && !this.robot;
    // 호출 입력 버퍼: 경직 중에 눌러도 0.5초 안에 풀리면 호출
    if (i.actP && canSummon) this.summonBuf = 0.5;
    else if (this.summonBuf > 0) this.summonBuf -= dt;
    // 긴급 호출: 맞고 있거나 날아가는 중에도 게이지 MAX 면 배리어를 터뜨리며 호출
    if (fighting && this.summonBuf > 0 && canSummon && STUNNED.has(this.state) && this.koT <= 0) {
      this.summonBuf = 0;
      g.emergencySummon(this);
      this.doAct('summon');
    }
    // 브레이크 버스트: 연속으로 맞는 중 스킬 2 를 소모해 빠져나온다
    if (fighting && i.grdP && this.canBurst()) g.breakBurst(this);

    let wantX = 0, wantZ = 0;
    const speed = P.speed || 7.4;
    const inMag = Math.hypot(i.mx, i.mz);
    const canCtl = fighting;
    if (this.onGround) { this.airJumpsLeft = P.airJumps || 0; if (this.state !== 'act') this.airCount = 0; }
    const chaseOK = this.chaseT > 0 && this.chaseTarget && !this.chaseTarget.dead;

    switch (this.state) {
      case 'normal': {
        if (!canCtl) break;
        wantX = i.mx; wantZ = i.mz;
        if (chaseOK && (i.jump || (i.atk && this.onGround))) {
          // 띄운 직후: 점프나 공격 버튼으로 추격 점프 (터치에서는 점프 버튼이 없어도 된다)
          this.superJump();
        } else if (i.jump && this.onGround) {
          this.jumpUp();
        } else if (i.jump && this.airJumpsLeft > 0) {
          this.airJumpsLeft--;
          this.vel.y = (P.jump || 11.5) * 0.95;
          if (inMag > 0.2) { this.vel.x = i.mx * speed; this.vel.z = i.mz * speed; }
          g.sound('jump', this.pos, 0.6, 1.35);
          g.fx.sparkle(tA.copy(this.pos), this.color);
        } else if (i.dash && this.dashCd <= 0) {
          this.startDash(i, inMag, speed);
        } else if (i.atk) {
          if (this.airborne) {
            if (this.faceAirTarget()) this.doAct(this.nextAir());
            else if (this.pos.y - this.gh > 0.9) this.doAct('airKick');
          } else if (this.onGround) this.doAct('jab1');
        } else if (i.hvy && this.cd1 <= 0 && (this.airborne || this.onGround)) {
          this.useSkill1(this.airborne ? P.acts.airHvy : P.acts.heavy);
        } else if (this.summonBuf > 0 && canSummon) {
          this.summonBuf = 0;
          this.doAct('summon');
        } else if (i.act && this.onGround && g.boardableNear(this)) {
          this.beginBoard(g.boardableNear(this));
        } else if (i.grd || i.grdP) {
          this.useSkill2(i);
        }
        break;
      }
      case 'dash': {
        if (canCtl && i.atk) { this.doAct('tackle'); break; }
        if (canCtl && i.hvy && this.cd1 <= 0) { this.useSkill1(P.acts.dashHvy); break; }
        if (canCtl && (i.grdP || i.grd) && this.useSkill2(i)) break;
        if (canCtl && i.jump && this.onGround) { this.setState('normal'); this.jumpUp(0.9); break; }
        this.vel.x *= Math.exp(-dt * 3);
        this.vel.z *= Math.exp(-dt * 3);
        if (Math.random() < 0.5) g.fx.trailPuff(tA.copy(this.pos).setY(this.pos.y + 0.8), this.color, 0.45);
        if (this.stateT > 0.22) this.setState('normal');
        break;
      }
      case 'act': {
        const a = this.act;
        if (!a) { this.setState('normal'); break; }
        const d = a.def;
        // 띄운 직후: 기술을 캔슬하고 추격 점프 (점프, 또는 땅에서 공격 버튼)
        if (canCtl && chaseOK && a.hits.size > 0 && !d.air && (i.jump || (i.atk && this.onGround && !d.hop))) { this.act = null; this.superJump(); break; }
        // 잽 시작 직후(판정 전)에는 점프/대시로 캔슬된다: 터치 점프 버튼과 키보드 모두 부드럽게
        if (canCtl && (a.name === 'jab1' || a.name === 'jab2') && a.t < 0.1 && a.hits.size === 0 && this.onGround) {
          if (i.jump) { this.act = null; this.setState('normal'); this.jumpUp(); break; }
          if (i.dash && this.dashCd <= 0) { this.act = null; this.startDash(i, inMag, speed); break; }
        }
        // 공격 후딜은 방어 기술로 캔슬된다 (사람 상태에서도 몸을 지킬 수 있게)
        if (canCtl && !d.dodge && !d.counter && a.name !== 'summon' && a.t >= d.chain && !this.airborne && (i.grdP || i.grd) && this.skill2Ready(i)) {
          this.act = null; this.setState('normal'); this.useSkill2(i); break;
        }
        if (canCtl && i.atk) a.buf = 'atk';
        else if (canCtl && i.hvy) a.buf = 'hvy';
        // 모으기: 강공격 키를 누르고 있는 동안 멈춰서 힘을 모은다
        if (d.hold && !a.released && a.t >= d.hold[0]) {
          if (i.hvyD && a.charge < d.hold[1] && canCtl) {
            a.charge += dt;
            a.mult = 1 + a.charge * 1.1;
            if (inMag > 0.3) this.facing = angLerp(this.facing, Math.atan2(i.mx, i.mz), 1 - Math.exp(-dt * 10));
            if (Math.random() < 0.6) { this.rig.handR.getWorldPosition(tA); g.fx.trailPuff(tA, a.charge > 0.9 ? 0xffe060 : this.color, 0.35 + a.charge * 0.4); }
            this.chargeTick = (this.chargeTick || 0) - dt;
            if (this.chargeTick <= 0) { this.chargeTick = 0.16; g.sound('boardTick', this.pos, 0.35, 0.7 + a.charge); }
            if (a.charge >= d.hold[1] && !a.full) { a.full = true; g.fx.sparkle(tA, 0xffe060); g.sound('gaugeFull', this.pos, 0.5, 1.6); }
            this.vel.x *= 0.8; this.vel.z *= 0.8;
            this.moveAmt = 0;
            break;
          }
          a.released = true;
        }
        if (d.iv && a.t >= d.iv[0] && a.t <= d.iv[1]) this.invuln = Math.max(this.invuln, 0.05);
        if (d.air && !d.dive) this.airLock(dt, a);
        this.stepAct(dt, (ev) => this.onEvent(ev, a));
        if (this.act !== a) break;
        if (a.name === 'airKick' || d.dive) {
          if (Math.random() < 0.7) g.fx.trailPuff(tA.copy(this.pos).setY(this.pos.y + 0.5), d.dive ? this.color : 0xffffff, 0.45);
          if (this.onGround) {
            if (d.land) g.pilotLand(this, d.land);
            else {
              g.fx.dust(this.pos, 8, 0.9);
              g.fx.shockwave(this.pos, 2.2, 0xffe0a0, 0.3);
              g.sound('land', this.pos, 0.9);
              g.shake(0.06, this.pos);
            }
            this.act = null; this.setState('normal'); this.dashCd = 0.1;
            break;
          }
        } else if (d.air && this.onGround && a.t > 0.05) {
          this.act = null; this.setState('normal');
          break;
        }
        if (a.buf && a.t >= d.chain) {
          let nx = a.buf === 'hvy' ? d.nextH : (d.next || (d.hop ? 'AIR' : null));
          if (nx === 'LAUNCH') nx = P.acts.launcher;
          if (nx === 'AIR') nx = this.airborne && this.airCount < (P.airChain || 3) ? (this.faceAirTarget(), this.nextAir()) : null;
          if (nx && HUMAN_ACTS[nx]) { this.doAct(nx); break; }
          if (a.t >= d.dur) a.buf = false;
        }
        if (a.t >= d.dur) { this.act = null; this.setState('normal'); }
        break;
      }
      case 'guard': {
        const sk = P.skill2;
        if (!i.grd || !canCtl) { this.endGuard(); break; }
        if (sk && sk.hold && this.stateT > sk.hold) { this.endGuard(true); break; }
        if (inMag > 0.3) this.facing = angLerp(this.facing, Math.atan2(i.mx, i.mz), 1 - Math.exp(-dt * 12));
        if (i.act) { const r = g.boardableNear(this); if (r) this.beginBoard(r); }
        break;
      }
      case 'hurt': {
        this.stun -= dt;
        this.vel.x *= Math.exp(-dt * 7);
        this.vel.z *= Math.exp(-dt * 7);
        if (this.stun <= 0 && this.onGround) this.setState('normal');
        break;
      }
      case 'launched': {
        if (this.koT > 0) {
          this.koT -= dt;
          if (this.koT <= 0) { g.kill(this, 'ko'); return; }
        }
        g.fx.trailPuff(tA.copy(this.pos).setY(this.pos.y + 0.7), this.koT > 0 ? 0xff5040 : 0xffffff, this.koT > 0 ? 0.7 : 0.5);
        break;
      }
      case 'down': {
        this.vel.x *= Math.exp(-dt * 9);
        this.vel.z *= Math.exp(-dt * 9);
        if (this.koT > 0) { this.koT -= dt; if (this.koT <= 0) { g.kill(this, 'ko'); return; } break; }
        // 누워 있는 동안은 무적: 쓰러진 상대를 계속 때리는 걸 막는다
        this.invuln = Math.max(this.invuln, 0.05);
        const quick = canCtl && this.stateT > RULES.quickRise && (i.atk || i.hvy || i.jump || i.dash || i.grdP || inMag > 0.5);
        if (this.stateT > RULES.downTime || quick) {
          this.setState('normal');
          this.invuln = RULES.wakeInvuln;
          this.hitsTaken = 0; this.stunChain = 0;
          if (quick && inMag > 0.5) { this.facing = Math.atan2(i.mx, i.mz); this.vel.x = i.mx * speed * 1.2; this.vel.z = i.mz * speed * 1.2; }
        }
        break;
      }
      case 'boarding': {
        const r = this.boardTarget;
        if (!canCtl || !i.act || !r || r.state !== 'idle' || inMag > 0.5) { this.cancelBoard(''); break; }
        this.facing = angLerp(this.facing, Math.atan2(r.pos.x - this.pos.x, r.pos.z - this.pos.z), 0.3);
        this.boardT += dt;
        this.boardTick -= dt;
        if (this.boardTick <= 0) { this.boardTick = 0.18; g.sound('boardTick', this.pos, 0.6, 0.8 + (this.boardT / this.boardNeed) * 0.8); }
        if (this.boardT >= this.boardNeed) g.board(this, r);
        break;
      }
    }

    // 이동
    if (this.state === 'normal' || this.state === 'guard') {
      const m = Math.hypot(wantX, wantZ);
      const sp = this.state === 'guard' ? 0 : speed;
      const accel = this.onGround ? 85 : this.padT > 0 ? 3 : 34;
      const tx = wantX * sp, tz = wantZ * sp;
      this.vel.x += clamp(tx - this.vel.x, -accel * dt, accel * dt);
      this.vel.z += clamp(tz - this.vel.z, -accel * dt, accel * dt);
      if (m > 0.15 && this.state === 'normal') this.facing = angLerp(this.facing, Math.atan2(wantX, wantZ), 1 - Math.exp(-dt * 24));
      this.moveAmt = Math.hypot(this.vel.x, this.vel.z) / speed;
    } else if (this.state === 'act') {
      const a = this.act;
      const d = a && a.def;
      if (d && d.air && !d.dive && a.lock) {
        // airLock 가 속도를 정한다
      } else if (d && d.air && !d.dive) {
        // 공중 콤보 중에는 거의 제자리에 떠 있다
        const k = Math.exp(-dt * 5);
        this.vel.x *= k; this.vel.z *= k;
      } else if (a && !(d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1]) && a.name !== 'airKick' && !d.dive && this.onGround) {
        const k = Math.exp(-dt * 10);
        this.vel.x *= k; this.vel.z *= k;
      }
      this.moveAmt = 0;
    } else if (this.state === 'boarding') {
      this.vel.x *= 0.7; this.vel.z *= 0.7; this.moveAmt = 0;
    } else this.moveAmt = 0;

    this.physics(dt);
    this.buildPose(dt);
    this.syncRoot();
    if (this.invuln > 0 && this.state !== 'dash' && this.state !== 'down' && !(this.act && this.act.def.iv)) this.rig.root.visible = Math.floor(this.invuln * 14) % 2 === 0;
    else this.rig.root.visible = true;
  }

  startGuard() {
    this.setState('guard');
    this.guardStart = this.g.time;
  }

  // 공중 콤보 대상: 가까이 떠 있는 적 사람
  airTarget() {
    let best = null, bd = 3.6;
    for (const o of this.g.humans) {
      if (o === this || o.dead || o.out || o.riding) continue;
      const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
      const dy = o.pos.y - this.pos.y;
      if (d < bd && dy > -1.6 && dy < 3.8 && (o.state === 'launched' || o.state === 'hurt' || !o.onGround)) { bd = d; best = o; }
    }
    return best;
  }

  // 공중 콤보 중에는 대상과 같은 높이를 따라가며 붙어 있는다
  airLock(dt, a) {
    if (a.lock === undefined) a.lock = this.airTarget();
    const t = a.lock;
    if (!t || t.dead || t.riding || t.onGround) { a.lock = null; return; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 4.5) { a.lock = null; return; }
    this.facing = angLerp(this.facing, Math.atan2(dx, dz), 1 - Math.exp(-dt * 20));
    const dy = t.pos.y - this.pos.y;
    const k = 1 - Math.exp(-dt * 14);
    this.vel.y += (clamp(t.vel.y + dy * 7, -12, 16) - this.vel.y) * k;
    const pull = clamp((d - 0.9) * 9, -6, 14);
    this.vel.x += ((dx / (d || 1)) * pull + t.vel.x * 0.8 - this.vel.x) * k;
    this.vel.z += ((dz / (d || 1)) * pull + t.vel.z * 0.8 - this.vel.z) * k;
  }

  faceAirTarget() {
    const t = this.airTarget();
    if (!t) return null;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    this.facing = Math.atan2(dx, dz);
    return t;
  }

  nextAir() {
    const max = this.P.airChain || 3;
    if (this.airCount >= max - 1) return 'airSpike';
    return this.airCount % 2 === 0 ? 'air1' : 'air2';
  }

  // 추격 점프: 띄운 상대에게 날아오른다
  superJump() {
    const t = this.chaseTarget;
    const g = this.g;
    this.chaseT = 0;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const up = clamp(t.pos.y + Math.max(0, t.vel.y) * 0.22 - this.pos.y + 0.6, 1.2, 7);
    const vy = Math.min(19, Math.sqrt(2 * 34 * up));
    const tApex = vy / 34;
    const hs = clamp((d - 1.0) / tApex, 0, 17);
    this.facing = Math.atan2(dx, dz);
    this.vel.set((dx / (d || 1)) * hs, vy, (dz / (d || 1)) * hs);
    this.onGround = false;
    this.airCount = 0;
    this.setState('normal');
    g.sound('dash', this.pos, 0.9, 1.3);
    g.fx.dust(this.pos, 8, 0.8);
    g.fx.shockwave(this.pos, 1.8, this.color, 0.25);
    if (this.isPlayer) g.ui.callout(this.pos, 'CHASE!', 'sk', 2.2);
  }

  addGauge(v) {
    if (this.robot || this.riding) return;
    const was = this.gauge;
    // 역전 도움(comeback)은 뒤처진 사람에게만 1 보다 크다
    this.gauge = Math.min(RULES.gaugeMax, this.gauge + v * (this.P.gaugeMul || 1) * (this.comeback || 1));
    if (was < RULES.gaugeMax && this.gauge >= RULES.gaugeMax) this.g.gaugeFull(this);
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  doAct(name) {
    const prev = this.act;
    this.cancelAct();
    const a = this.startAct(name, HUMAN_ACTS);
    a.charge = 0; a.mult = 1;
    const d = a.def;
    this.setState('act');
    const g = this.g;
    if (name === 'summon') g.startShield(this);
    else if (this.shieldT > 0 && !NON_ATTACK.has(name)) g.endShield(this, true);
    // 도리 배리어: 공격하면 풀린다
    if (this.bubbleT > 0 && !NON_ATTACK.has(name)) { this.bubbleT = 0; g.endBubble(this); }
    if (name === 'heavy' || name === 'kick3' || d.armor) g.sound('whiff', this.pos, 0.8, 0.8);
    else if (name !== 'summon' && name !== 'barrierCast' && name !== 'brace') g.sound('whiff', this.pos, 0.6, 1.1 + Math.random() * 0.15);
    if (name === 'airKick') { const f = this.fwd(); this.vel.set(f.x * 10, -17, f.z * 10); }
    if (d.dive) { const f = this.fwd(); this.vel.set(f.x * d.dive[0], d.dive[1], f.z * d.dive[0]); }
    if (d.air && !d.dive) {
      this.airCount++;
      if (d.hang) this.vel.y = Math.max(this.vel.y, d.hang);
      this.floatT = d.floatT || 0;
      a.lock = this.airTarget();
    }
    if (prev && prev.def.air && d.air) a.fromAir = true;
  }

  onEvent(ev, a) {
    const g = this.g;
    if (ev === 'remoteOut') { this.rig.remote.visible = true; g.sound('grab', this.pos, 0.5, 1.4); }
    else if (ev === 'remoteBeep') { g.sound('remote', this.pos, 1); this.rig.handR.getWorldPosition(tA); g.fx.sparkle(tA, 0xff9a3c); }
    else if (ev === 'summonCall') { this.rig.remote.visible = false; g.summonRobot(this); }
    else if (ev === 'sling' || ev === 'slingFan' || ev === 'slingDown') g.throwSling(this, ev);
    else if (ev === 'trap' || ev === 'trapDrop') g.placeTrap(this, ev === 'trapDrop');
    else if (ev === 'barrier') g.startBubble(this);
    else if (ev === 'brace') { g.sound('grab', this.pos, 0.7, 0.8); g.fx.ring(tA.copy(this.pos).setY(this.pos.y + 0.08), null, 0.4, 1.8, 0.25, this.color, 0.9); }
    else if (ev === 'blink') this.blink();
    else if (ev === 'smoke') g.smokeBurst(this);
    else if (ev === 'whiffHeavy') g.sound('whiff', this.pos, 0.8, 0.75);
    else if (ev === 'hop') {
      const d = a.def;
      this.vel.y = d.hop; this.onGround = false;
      const f = this.fwd();
      const fs = d.hopBack ? -d.hopBack : 2.5;
      this.vel.x = f.x * fs; this.vel.z = f.z * fs;
      g.fx.dust(this.pos, 6, 0.7);
      g.sound('jump', this.pos, 0.6, 1.1);
    } else if (ev === 'boomerang') g.throwBoomerang(this);
  }

  beginBoard(r) {
    this.setState('boarding');
    this.boardTarget = r;
    this.boardT = 0;
    this.boardTick = 0;
    this.boardNeed = (r.owner === this ? RULES.boardOwner : RULES.boardOther) * ((this.P.robot && this.P.robot.board) || 1);
    this.g.onBoardStart(this, r);
  }

  cancelBoard(msg) {
    this.boardTarget = null;
    this.boardT = 0;
    if (this.state === 'boarding') this.setState('normal');
    if (msg) this.g.ui.callout(this.pos, msg, 'bad');
  }

  physics(dt) {
    const g = this.g;
    // 연속 피격이 한계를 넘으면 공중에 붙잡아 둘 수 없다: 체공 보정 없이 빨리 떨어진다
    const capped = this.juggleCapped();
    let grav = this.state === 'launched' ? (capped ? 38 : this.juggleT > 0 ? 17 : 27) : 34;
    const locked = this.state === 'act' && this.act && this.act.lock;
    if (locked) grav = 0;
    else if (this.floatT > 0) { this.floatT -= dt; grav = 12; if (this.vel.y < -3) this.vel.y = -3; }
    if (this.juggleT > 0) this.juggleT -= dt;
    if (this.padT > 0) this.padT -= dt;
    const wasGround = this.onGround;
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    if (wasGround && this.plat) { this.pos.x += this.plat.vx * dt; this.pos.z += this.plat.vz * dt; }
    this.vel.y -= grav * dt;
    this.pos.addScaledVector(this.vel, dt);
    const st = this.state;
    // 걸어서는 허공으로 떨어지지 않는다 (넉백, 대시, 공중 기술은 예외)
    // 지상 대시도 허공 앞에서 멈춘다. 건너가려면 점프해야 한다
    const walker = wasGround && (st === 'normal' || st === 'guard' || st === 'boarding' || st === 'dash' || (st === 'act' && this.act && !this.act.def.air && !this.act.def.dive));
    const qy = Math.max(py, this.pos.y);
    let s = this.ground(qy);
    if (!s && walker) s = this.keepOnGround(px, pz, qy);
    if (s) {
      const snap = walker && this.vel.y <= 0 && this.pos.y - s.h < 0.35;
      if ((this.pos.y <= s.h && this.pos.y > s.h - 1.6 && this.vel.y <= 0) || snap) {
        const impact = -this.vel.y;
        this.pos.y = s.h;
        this.gh = s.h;
        this.plat = s.vx || s.vz ? { vx: s.vx, vz: s.vz } : null;
        if (st === 'launched') {
          const hsp = Math.hypot(this.vel.x, this.vel.z);
          if (impact > 7 && !capped) {
            this.vel.y = impact * 0.38;
            this.vel.x *= 0.7; this.vel.z *= 0.7;
            g.fx.dust(this.pos, 10, 1.1);
            g.sound('land', this.pos, 1, 0.8);
            g.shake(0.05, this.pos);
          } else {
            this.vel.y = 0;
            this.onGround = true;
            this.setState('down');
            g.fx.dust(this.pos, 6, 0.8);
            if (hsp > 3) this.vel.multiplyScalar(0.5);
          }
        } else {
          if (!wasGround && impact > 6) { g.fx.dust(this.pos, 4, 0.6); g.sound('land', this.pos, 0.35); }
          this.vel.y = 0;
          this.onGround = true;
          if (s.pad > 0 && st !== 'down') g.jumpPad(this, s.pad, s.padTo);
        }
      } else if (this.pos.y > s.h + 0.02) {
        this.onGround = false;
        this.gh = s.h;
      }
    } else {
      this.onGround = false;
      this.gh = -99;
      this.plat = null;
    }
    this.pushWalls();
    if (this.pos.y < RULES.arenaFallY) g.kill(this, 'fall');
  }

  buildPose(dt) {
    const tp = this.tp;
    let snap = false, plant = this.onGround;
    const st = this.state;
    if (st === 'act' && this.act) {
      sample(this.act.def.frames, this.act.t, tp);
      snap = true;
    } else if (st === 'guard') Object.assign(tp, HP.guard);
    else if (st === 'boarding') {
      Object.assign(tp, HP.board);
      const w = Math.sin(this.stateT * 22) * 0.35;
      tp.alx += w; tp.arx -= w;
    } else if (st === 'hurt') Object.assign(tp, HP.hurt);
    else if (st === 'launched') {
      Object.assign(tp, HP.launched);
      tp.hx = clamp(-this.vel.y * 0.05, -0.8, 0.8) - 0.3;
      plant = false;
    } else if (st === 'down') { Object.assign(tp, HP.down); plant = false; }
    else if (st === 'dash') {
      Object.assign(tp, HP.stance);
      tp.tx = 0.6; tp.hy = -0.1; tp.alx = 0.6; tp.arx = 0.6; tp.flx = -0.3; tp.frx = -0.3; tp.llx = -0.9; tp.slx = 1.2; tp.lrx = 0.7; tp.srx = 0.9;
    } else if (!this.onGround) Object.assign(tp, this.vel.y > 0 ? HP.jump : HP.fall);
    else {
      Object.assign(tp, HP.stance);
      const s = clamp(this.moveAmt, 0, 1);
      if (s > 0.08) {
        this.walkPh += dt * (7 + 7 * s);
        const ph = this.walkPh;
        const sn = Math.sin(ph);
        tp.ty = 0;
        tp.tx = 0.28 * s;
        tp.llx = -sn * 0.95 * s - 0.1;
        tp.lrx = sn * 0.95 * s - 0.1;
        tp.slx = 0.2 + Math.max(0, Math.sin(ph - 1.4)) * 1.3 * s;
        tp.srx = 0.2 + Math.max(0, -Math.sin(ph - 1.4)) * 1.3 * s;
        tp.alx = sn * 0.9 * s - 0.35; tp.arx = -sn * 0.9 * s - 0.35;
        tp.flx = -1.4; tp.frx = -1.4; tp.alz = 0.12; tp.arz = -0.12;
        tp.hy = Math.abs(Math.cos(ph)) * 0.06 * s;
      } else {
        const b = Math.sin(this.g.time * 4 + this.id) * 0.025;
        tp.hy += b; tp.alx += b; tp.arx -= b;
      }
    }
    this.applyPose(dt, snap, plant);
  }

  updateRiding(dt) {
    const r = this.riding;
    this.pos.copy(r.pos);
    const tp = this.tp;
    Object.assign(tp, HP.pilot);
    if (r.act) {
      const w = Math.sin(r.act.t * 20) * 0.4;
      tp.alx = -1.5 + w; tp.arx = -1.5 - w; tp.tx = 0.35;
    }
    this.applyPose(dt, false, false);
    const root = this.rig.root;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.visible = true;
  }
}

// ============================ 로봇 ============================
export class Robot extends Fighter {
  constructor(g, type, owner, x, z) {
    const rig = createRobot(type, { team: owner.color });
    super(g, rig, 'robot');
    attachRobotCombat(rig, type); // Includes the primitive-model fallback path.
    this.type = type;
    this.stats = ROBOT_STATS[type];
    this.moves = ROBOT_MOVES[type];
    this.owner = owner;
    this.pilot = null;
    this.maxArmor = this.stats.armor;
    this.armor = this.maxArmor;
    // 당근쥬스 에너지 (0..maxJuice). 스킬/대시/공중 추진에 쓰고, 바닥나면 느려지고 스킬을 못 쓴다
    this.maxJuice = RULES.juiceMax;
    this.juice = this.maxJuice;
    this.mods = robotMods(0, this.juice);
    this.juiceEmpty = false;
    this.juiceWarned = false;
    this.denyT = -99;
    this.debris = [];
    this.damageNodes = {};
    this.damageFxAt = {};
    this.damageClock = 0;
    this.damageApplied = [];
    this.damageDetails = {};
    this.damageDetailGeo = {
      joint: new THREE.TorusGeometry(0.16, 0.035, 6, 12),
      cable: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0.12, -0.18, 0.12),
        new THREE.Vector3(-0.09, -0.36, 0.1), new THREE.Vector3(0.06, -0.54, 0.06),
      ]), 8, 0.026, 5, false),
    };
    this.damageDetailMat = new THREE.MeshStandardMaterial({ color: 0x42edff, emissive: 0x00bfe8, emissiveIntensity: 1.5, metalness: 0.25, roughness: 0.28 });
    for (const part of PARTS) for (const name of PART_NODES[part]) {
      const node = rig[name];
      if (node) {
        this.damageNodes[name] = { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() };
        const joint = new THREE.Mesh(this.damageDetailGeo.joint, this.damageDetailMat);
        joint.rotation.x = Math.PI / 2;
        joint.position.set(0, 0, 0.12);
        const cable = new THREE.Mesh(this.damageDetailGeo.cable, this.damageDetailMat);
        joint.visible = cable.visible = false;
        joint.castShadow = cable.castShadow = true;
        node.add(joint, cable);
        (this.damageDetails[part] ||= []).push(joint, cable);
      }
    }
    this.resetParts();
    this.state = 'falling';
    this.stateT = 0;
    this.idleT = RULES.robotIdleLife;
    this.cds = { k: 0, l: 0, dash: 0 };
    this.id = 100 + g.robotSeq++;
    this.stagger = 0;
    // 사람의 반격: 약점 노출 시간과 사람에게 누적으로 맞은 피해 (일정량이면 휘청)
    this.exposedT = 0;
    this.humanDmg = 0;
    this.dashT = 0;
    this.stepSign = 1;
    this.missileIdx = 0;
    this.beam = null;
    this.beamTick = 0;
    this.landY = 0;
    this.gh = 0;
    this.plat = null;
    this.pos.set(x, 80, z);
    this.vel.set(0, -52, 0);
    this.facing = Math.atan2(-x, -z);
    this.onGround = false;
    this.eyeLevel = 0.3;
    this.ringMat = new THREE.MeshBasicMaterial({ color: owner.color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(g.ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.setScalar(this.radius + 1.2);
    this.ring.visible = false;
    g.scene.add(this.ring);
    g.scene.add(rig.root);
    addMark(this, owner.color, this.radius + 1, false);
    Object.assign(this.pose, RFALL);
  }

  get team() { return this.pilot ? this.pilot.id : this.owner ? this.owner.id : -1; }
  get name() { return this.stats ? this.type : ''; }

  // ---------- 부위 파괴 ----------
  // parts: 부위별 남은 내구도, partMax: 최대치, broken: 부서진 부위 비트마스크 (robot-systems.js PART_BIT)
  resetParts() {
    this.clearBrokenMotionOffsets();
    this.clearDebris();
    this.partMax = partMaxHp(this.maxArmor);
    this.parts = { ...this.partMax };
    this.broken = 0;
    for (const k of PARTS) for (const n of PART_NODES[k]) if (this.rig[n]) {
      const node = this.rig[n], rest = this.damageNodes[n];
      node.visible = true;
      if (rest) { node.position.copy(rest.position); node.quaternion.copy(rest.quaternion); node.scale.copy(rest.scale); }
    }
    for (const pieces of Object.values(this.damageDetails)) for (const piece of pieces) piece.visible = false;
    this.damageFxAt = {};
    this.damageClock = 0;
    this.mods = robotMods(0, this.juice, this.mods);
  }

  breakPart(part) {
    const bit = PART_BIT[part];
    if (!bit || this.broken & bit) return false;
    this.broken |= bit;
    this.parts[part] = 0;
    this.detachPart(part, true);
    this.mods = robotMods(this.broken, this.juice, this.mods);
    const g = this.g;
    g.ui.callout(this.pos, PART_NAME[part] + ' 파괴!', this.pilot && this.pilot.isPlayer ? 'bad' : 'sk', this.height + 1.2);
    g.sound('explosion', this.pos, 0.7, 1.5);
    g.shake(0.25, this.pos);
    if (this.pilot && this.pilot.isPlayer) g.ui.toast('⚠ ' + PART_NAME[part] + ' 파괴: ' + PART_EFFECT[part]);
    return true;
  }

  // 부서진 부위도 리그에 남겨 두어 매달린 파츠가 계속 보이게 한다.
  detachPart(part, fly) {
    for (const piece of this.damageDetails[part] || []) piece.visible = true;
    for (const k of PART_NODES[part]) {
      const node = this.rig[k];
      if (!node) continue;
      if (fly) this.flyOff(node);
      node.visible = true;
    }
  }

  // 네트워크 스냅샷으로 받은 broken 반영: fly 면 새로 부서진 부위를 날려 보내고, 없어진 비트는 다시 보인다
  syncBroken(prev, fly = true) {
    this.clearBrokenMotionOffsets();
    for (const k of PARTS) {
      const on = (this.broken & PART_BIT[k]) !== 0;
      if (on) this.detachPart(k, fly && !(prev & PART_BIT[k]));
      else for (const n of PART_NODES[k]) if (this.rig[n]) {
        const node = this.rig[n], rest = this.damageNodes[n];
        node.visible = true;
        if (rest) { node.position.copy(rest.position); node.quaternion.copy(rest.quaternion); node.scale.copy(rest.scale); }
      }
      for (const piece of this.damageDetails[k] || []) piece.visible = on;
    }
    this.mods = robotMods(this.broken, this.juice, this.mods);
  }

  flyOff(node) {
    const g = this.g;
    const piece = snapshotPiece(node);
    if (!piece.children.length) return;
    g.scene.add(piece);
    const p = piece.position;
    const ox = p.x - this.pos.x, oz = p.z - this.pos.z, l = Math.hypot(ox, oz) || 1;
    const vel = new THREE.Vector3(ox / l * (5 + Math.random() * 4), 9 + Math.random() * 4, oz / l * (5 + Math.random() * 4));
    const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
    this.debris.push({ obj: piece, vel, spin, t: 0, bounced: 0 });
    tA.copy(p);
    g.fx.explosion(tA, 0.45);
    g.fx.hit(tA, tB.set(ox / l, 0.6, oz / l), 2, 0xffc070);
    g.fx.sparkle(tA, 0xff9a3c);
  }

  updateDebris(dt) {
    const g = this.g;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], o = d.obj;
      d.t += dt;
      d.vel.y -= 30 * dt;
      o.position.addScaledVector(d.vel, dt);
      o.rotateX(d.spin.x * dt); o.rotateY(d.spin.y * dt); o.rotateZ(d.spin.z * dt);
      const gy = g.groundY ? g.groundY(o.position.x, o.position.z, o.position.y + 1) : null;
      if (gy !== null && o.position.y < gy + 0.25 && d.vel.y < 0) {
        o.position.y = gy + 0.25;
        d.vel.y *= -0.35; d.vel.x *= 0.55; d.vel.z *= 0.55; d.spin.multiplyScalar(0.5);
        if (d.bounced++ === 0) { g.fx.dust(o.position, 4, 0.8); g.sound('land', o.position, 0.5, 1.3); }
      }
      if (d.t < 1 && Math.random() < 0.35) g.fx.trailPuff(tA.copy(o.position), 0x666666, 0.5);
      if (d.t > 1.8) o.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
      if (d.t > 2.4) { g.scene.remove(o); this.debris.splice(i, 1); }
    }
  }

  clearDebris() {
    for (const d of this.debris) this.g.scene.remove(d.obj);
    this.debris.length = 0;
  }

  clearBrokenMotionOffsets() {
    for (const d of this.damageApplied || []) {
      d.node.rotation.x -= d.x; d.node.rotation.y -= d.y; d.node.rotation.z -= d.z;
    }
    if (this.damageApplied) this.damageApplied.length = 0;
  }

  applyBrokenMotion(dt = 0, presentationTime) {
    this.clearBrokenMotionOffsets();
    const broken = this.broken;
    if (!broken) return;
    const time = Number.isFinite(presentationTime) ? presentationTime : Number.isFinite(this.g.time) ? this.g.time : (this.damageClock += dt);
    const moving = clamp(this.moveAmt, 0, 1.3);
    const phase = time * (8 + moving * 5) + this.id * 0.173;
    const sway = Math.sin(phase), twitch = Math.sin(phase * 2.31);
    this.damageDetailMat.emissiveIntensity = 1.1 + (0.5 + 0.5 * Math.sin(time * 27 + this.id)) * 1.2;
    const r = this.rig;
    const add = (node, x = 0, y = 0, z = 0) => {
      if (!node) return;
      node.rotation.x += x; node.rotation.y += y; node.rotation.z += z;
      this.damageApplied.push({ node, x, y, z });
    };
    if (broken & PART_BIT.armL) add(r.foreL, 0, twitch * 0.11, 0.62 + sway * 0.16);
    if (broken & PART_BIT.armR) add(r.foreR, 0, -twitch * 0.11, -0.62 - sway * 0.16);
    if (broken & PART_BIT.head) {
      add(r.earL, 0, twitch * 0.08, 0.38 + sway * 0.18);
      add(r.earR, 0, -twitch * 0.08, -0.38 - sway * 0.18);
      add(r.head, 0, 0, Math.sin(phase * 0.5) * (0.025 + moving * 0.035));
    }
    if (broken & PART_BIT.legs) {
      add(r.shinL, 0.48 + sway * (0.12 + moving * 0.2), 0, twitch * 0.06);
      add(r.hips, 0, 0, Math.sin(phase * 0.5) * (0.025 + moving * 0.06));
    }
    if (moving > 0.08) {
      if (broken & PART_BIT.armL) add(r.torso, 0, 0, Math.sin(phase * 0.5) * 0.025);
      if (broken & PART_BIT.armR) add(r.torso, 0, 0, -Math.sin(phase * 0.5) * 0.025);
    }

    const pulsePeriod = this.g.phase === 'fight' ? 0.31 : 0.48;
    const pulse = Math.floor((time + this.id * 0.037) / pulsePeriod);
    for (const part of PARTS) {
      for (const piece of this.damageDetails[part] || []) piece.visible = !!(broken & PART_BIT[part]);
      if (!(broken & PART_BIT[part]) || this.damageFxAt[part] === pulse) continue;
      this.damageFxAt[part] = pulse;
      const node = r[part === 'armL' ? 'foreL' : part === 'armR' ? 'foreR' : part === 'head' ? 'head' : 'shinL'];
      if (!node) continue;
      node.getWorldPosition(tA);
      tA.y += part === 'head' ? 0.35 : 0.12;
      this.g.fx.sparkle(tA, pulse % 3 ? 0x66eaff : 0xffd45c);
      if (pulse % 2 === 0) this.g.fx.trailPuff(tA, 0x8ceeff, 0.42);
    }
  }

  // ---------- 당근쥬스 ----------
  useJuice(n) { if (n > 0) this.juice = Math.max(0, this.juice - n); }
  addJuice(n) {
    const prev = this.juice;
    if (n > 0) this.juice = Math.min(this.maxJuice, this.juice + n);
    return this.juice - prev;
  }

  // 스킬 슬롯(1|2)을 못 쓰는 이유: '' | 'cd' | 'juice' | 'part'
  skillBlock(slot) { return blockOf(this.type, slot, slot === 1 ? this.cds.k : this.cds.l, this.juice, this.broken); }

  spendSkill(slot, cdMul) {
    this.cds[slot === 1 ? 'k' : 'l'] = this.stats.skills[slot].cd * cdMul;
    this.useJuice(skillJuice(this.type, slot, this.broken));
  }

  trySkill(slot, cdMul) {
    const why = this.skillBlock(slot);
    if (why) { if (why !== 'cd') this.denySkill(why, slot); return false; }
    this.spendSkill(slot, cdMul);
    this.doAct(slot === 1 ? this.moves.k : this.moves.l);
    return true;
  }

  // 막힌 입력 알림 (연타해도 0.8초에 한 번)
  denySkill(why, slot) {
    const g = this.g;
    if (g.time < this.denyT) return;
    this.denyT = g.time + 0.8;
    const part = why === 'legs' ? 'legs' : why === 'part' ? skillPart(this.type, slot) : null;
    const msg = part ? PART_NAME[part] + ' 파손!' : '쥬스 부족!';
    if (this.pilot && this.pilot.isPlayer) g.ui.callout(this.pos, msg, 'bad', this.height + 1);
    g.sound('boardCancel', this.pos, 0.4, 1.5);
  }

  // 쥬스가 바닥나거나 다시 찼을 때 한 번씩 알린다
  juiceNotice(mods) {
    const g = this.g, me = this.pilot && this.pilot.isPlayer;
    if (mods.empty !== this.juiceEmpty) {
      this.juiceEmpty = mods.empty;
      if (mods.empty) {
        g.ui.callout(this.pos, '쥬스 바닥!', me ? 'bad' : 'sk', this.height + 1);
        if (me) g.ui.toast('🥕 쥬스가 바닥났어요. 확정 피해로 AP를 모아 판매대에서 20 AP로 구매하거나 당근밭에서 직접 갈아 채우세요.');
      } else g.ui.callout(this.pos, '쥬스 충전!', 'good', this.height + 1);
    }
    if (this.juice < RULES.juiceLow && !this.juiceWarned) {
      this.juiceWarned = true;
      if (me && !mods.empty) g.ui.toast('🥕 쥬스 부족: 확정 피해로 AP를 모아 판매대에서 20 AP로 구매하거나 당근밭에서 직접 갈아 채우세요.');
    } else if (this.juice > RULES.juiceLow + 10) this.juiceWarned = false;
  }

  setEyes(v) {
    this.eyeLevel += (v - this.eyeLevel) * 0.2;
    this.rig.animateFace?.(this.g.time + this.id * .83);
    // Dark embroidered eyes stay dark even during powered attacks.
    for (const e of this.rig.eyes) e.material.emissiveIntensity = Math.min(.14, this.eyeLevel * .045);
    if (this.rig.chestCore) this.rig.chestCore.material.emissiveIntensity = this.eyeLevel * (.12 + Math.sin(this.g.time * 3) * .025);
  }

  doAct(name) {
    this.startAct(name, ROBOT_ACTS);
    this.g.sound('whiff', this.pos, 1.2, 0.55);
    this.g.onRobotSkill(this, name);
  }

  update(dt, realDt) {
    this.updateFlash(realDt);
    this.contactTick = null;
    const g = this.g;
    if (this.debris.length) this.updateDebris(dt);
    this.stateT += dt;
    if (this.state === 'dead') return;
    if (this.state === 'falling') {
      this.pos.addScaledVector(this.vel, dt);
      this.spinYaw = Math.sin(this.stateT * 3) * 0.2;
      tA.copy(this.pos).setY(this.pos.y + this.height * 0.6);
      g.fx.thruster(tA, tB.set(0, 1, 0), 2.2);
      g.fx.thruster(tA, tB.set((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4), 1.6);
      if (this.pos.y <= this.landY) { this.pos.y = this.landY; this.gh = this.landY; this.spinYaw = 0; this.onGround = true; this.state = 'idle'; this.stateT = 0; g.robotLanded(this); }
      Object.assign(this.tp, RFALL);
      this.applyPose(dt, false, false);
      this.applyBrokenMotion(dt);
      this.setEyes(2);
      this.syncRoot();
      return;
    }
    this.frozen = false;
    if (this.hs > 0) { this.hs -= realDt; this.frozen = true; this.applyBrokenMotion(dt); this.syncRoot(); return; }
    if (this.exposedT > 0 && Math.random() < 0.4) { tA.copy(this.pos).setY(this.pos.y + this.height * (0.4 + Math.random() * 0.5)); this.g.fx.trailPuff(tA, 0xffe070, 0.8); }

    if (this.state === 'idle') {
      this.idleT -= dt;
      this.juice = stepJuice(this.juice, this.maxJuice, dt, false, g.phase === 'fight', this.broken);
      this.ring.visible = true;
      this.ring.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
      const pu = 1 + Math.sin(g.time * 5) * 0.06;
      this.ring.scale.setScalar((this.radius + 1.2) * pu);
      this.ringMat.opacity = 0.35 + Math.sin(g.time * 5) * 0.2;
      this.ringMat.color.setHex(this.owner ? this.owner.color : 0xffffff);
      this.vel.x *= Math.exp(-dt * 6); this.vel.z *= Math.exp(-dt * 6);
      this.physics(dt);
      Object.assign(this.tp, this.stateT < 0.5 ? RFALL : KNEEL);
      if (this.stateT < 0.12) { Object.assign(this.tp, KNEEL); Object.assign(this.pose, KNEEL); }
      this.applyPose(dt, false, this.onGround);
      this.applyBrokenMotion(dt);
      this.setEyes(0.25 + (Math.sin(g.time * 3) > 0.9 ? 0.6 : 0));
      this.syncRoot();
      if (this.idleT <= 0) g.destroyRobot(this, 'timeout');
      return;
    }

    // active
    this.ring.visible = false;
    const pilot = this.pilot;
    const i = pilot.ctrl.in;
    const bonus = (pilot.P && pilot.P.robot) || {};
    const cdMul = bonus.cd || 1;
    const fighting = g.phase === 'fight';
    this.cds.k = Math.max(0, this.cds.k - dt);
    this.cds.l = Math.max(0, this.cds.l - dt);
    this.cds.dash -= dt;
    if (this.exposedT > 0) this.exposedT -= dt;
    if (this.humanDmg > 0) this.humanDmg = Math.max(0, this.humanDmg - dt * 8);
    if (fighting) this.armor -= RULES.robotDrain * dt;
    if (this.armor <= 0) { g.destroyRobot(this, 'armor'); return; }
    this.juice = stepJuice(this.juice, this.maxJuice, dt, true, fighting, this.broken);
    const mods = robotMods(this.broken, this.juice, this.mods);
    if (fighting) this.juiceNotice(mods);

    if (pilot.supplyHeld && pilot.supplyId >= 0) {
      this.act = null;
      this.dashT = 0;
      if (this.beam) { this.beam.stop(); this.beam = null; }
      this.moveAmt = 0;
      this.vel.x *= Math.exp(-dt * 12); this.vel.z *= Math.exp(-dt * 12);
      this.physics(dt);
      const p = clamp(pilot.supplyProgress || 0, 0, 1), crank = Math.sin(g.time * 12 + this.id * 0.31);
      Object.assign(this.tp, RSTANCE);
      this.tp.tx = 0.16 + p * 0.2 + Math.sin(g.time * 4) * 0.04;
      this.tp.alx = -0.85 + crank * 0.12; this.tp.arx = -0.9 - crank * 0.12;
      this.tp.flx = -0.25 + crank * 0.18; this.tp.frx = -0.25 - crank * 0.32;
      this.tp.alz = 0.18; this.tp.arz = -0.18;
      this.applyPose(dt, false, this.onGround);
      this.applyBrokenMotion(dt);
      this.setEyes(2.2 + p * 0.5);
      this.syncRoot();
      return;
    }

    // 하차: E 길게
    if (!i.act) pilot.needRelease = false;
    if (i.act && !pilot.supplyHeld && !pilot.needRelease && fighting) {
      pilot.ejectHold += dt;
      if (pilot.ejectHold > EJECT_HOLD) { g.eject(pilot, false); return; }
    } else pilot.ejectHold = 0;

    const sp = this.stats.speed * (bonus.speed || 1) * mods.speed;
    let wx = 0, wz = 0;
    const inMag = Math.hypot(i.mx, i.mz);
    this.spinYaw *= 0.8;
    // Finish contact attacks on the next tick: the hit frame and its replicated
    // pose/action must describe the same swing, even at a combo boundary.
    if (this.act?.contactFinish) {
      const finished = this.act;
      if (finished.buf && finished.def.next && finished.t >= finished.def.chain) this.doAct(finished.def.next);
      else if (finished.t >= finished.def.dur) this.act = null;
      else delete finished.contactFinish;
    }
    if (this.stagger > 0) {
      this.stagger -= dt;
      this.vel.x *= Math.exp(-dt * 4); this.vel.z *= Math.exp(-dt * 4);
    } else if (this.act) {
      const a = this.act;
      const d = a.def;
      if (fighting && i.atk && d.next) a.buf = true;
      // 스킬 캔슬: 기본 콤보가 적중한 뒤라면 K/L 로 바로 스킬을 이어 콤보를 잇는다
      if (fighting && ROBOT_COMBO.has(a.name)) {
        if (i.hvy || i.grdP) {
          const slot = i.hvy ? 1 : 2, why = this.skillBlock(slot);
          if (!why) a.sk = slot === 1 ? 'k' : 'l';
          else if (why !== 'cd') this.denySkill(why, slot);
        }
        const hit = a.hits.size > 0 || a.flags.shotHit;
        if (a.sk && hit && a.t >= Math.min(d.chain, 0.2) * 0.7 && !this.skillBlock(a.sk === 'k' ? 1 : 2)) {
          const sk = a.sk;
          this.spendSkill(sk === 'k' ? 1 : 2, cdMul);
          this.act = null; this.doAct(this.moves[sk]); g.onSkillCancel(this);
        }
      }
      if (this.act !== a) { /* 캔슬됨 */ } else {
      this.stepAct(dt, (ev, act) => g.robotEvent(this, ev, act));
      if (this.act === a) {
        if (d.spin) {
          this.spinYaw = (a.t * d.spin) % (Math.PI * 2);
          wx = i.mx * d.steer; wz = i.mz * d.steer;
          this.vel.x += clamp(wx - this.vel.x, -30 * dt, 30 * dt);
          this.vel.z += clamp(wz - this.vel.z, -30 * dt, 30 * dt);
          if (d.hits && Math.random() < 0.5) g.fx.dust(this.pos, 1, 1.4);
        } else if (a.name === 'laser') {
          if (inMag > 0.2 && !i.cockpitDriving) this.facing = angLerp(this.facing, Math.atan2(i.mx, i.mz), 1 - Math.exp(-dt * 1.6));
          this.vel.x *= 0.8; this.vel.z *= 0.8;
          g.updateLaser(this, dt, a);
        } else if (a.name === 'stomp') {
          if (a.flags.jumped && !a.flags.slammed) {
            if (a.t > 0.78 && this.vel.y > -60) this.vel.y = -65;
            if (inMag > 0.2) { this.vel.x += i.mx * 20 * dt; this.vel.z += i.mz * 20 * dt; }
            this.thrust(1.4);
            if (this.onGround && a.t > 0.3) { a.flags.slammed = true; if (a.t < 0.86) a.t = 0.86; g.stompSlam(this); }
          } else if (!(d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1])) {
            this.vel.x *= Math.exp(-dt * 8); this.vel.z *= Math.exp(-dt * 8);
          }
        } else if (!(d.lunge && a.t >= d.lunge[0] && a.t <= d.lunge[1])) {
          this.vel.x *= Math.exp(-dt * 8); this.vel.z *= Math.exp(-dt * 8);
          if (d.next === 'blaster' || !d.lunge) {
            if (inMag > 0.2 && !i.cockpitDriving) this.facing = angLerp(this.facing, Math.atan2(i.mx, i.mz), 1 - Math.exp(-dt * 5));
          }
        }
        if (d.boost) this.thrust(1.3);
        if (this.act === a) {
          if (d.hits?.some(hit => hit.contact)) {
            if ((a.buf && d.next && a.t >= d.chain) || a.t >= d.dur) a.contactFinish = true;
          } else if (a.buf && d.next && a.t >= d.chain) { this.doAct(d.next); }
          else if (a.t >= d.dur) { this.act = null; if (this.beam) { this.beam.stop(); this.beam = null; } }
        }
      }
      }
    } else if (fighting) {
      wx = i.mx; wz = i.mz;
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.thrust(1.6);
        if (Math.random() < 0.6) g.fx.trailPuff(tA.copy(this.pos).setY(this.pos.y + this.height * 0.5), this.team >= 0 ? this.pilot.color : 0xffffff, 1.4);
        if (i.atk) { this.dashT = 0; this.doAct(this.moves.combo); }
      } else {
        const accel = this.onGround ? 58 : this.padT > 0 ? 3 : 22;
        this.vel.x += clamp(wx * sp - this.vel.x, -accel * dt, accel * dt);
        this.vel.z += clamp(wz * sp - this.vel.z, -accel * dt, accel * dt);
        if (inMag > 0.15 && !i.cockpitDriving) this.facing = angLerp(this.facing, Math.atan2(wx, wz), 1 - Math.exp(-dt * 13));
        if (i.jump && this.onGround) {
          this.vel.y = this.stats.jump * mods.jump; this.onGround = false;
          g.sound('dash', this.pos, 1, 0.6);
          g.fx.dust(this.pos, 10, 1.6);
        } else if (i.dash && this.cds.dash <= 0 && !mods.dash) {
          this.denySkill(this.broken & PART_BIT.legs ? 'legs' : 'juice', 0);
        } else if (i.dash && this.cds.dash <= 0) {
          const dx = inMag > 0.2 ? i.mx / inMag : Math.sin(this.facing);
          const dz = inMag > 0.2 ? i.mz / inMag : Math.cos(this.facing);
          if (!i.cockpitDriving) this.facing = Math.atan2(dx, dz);
          const ds = this.type === 'bolt' ? 34 : 26;
          this.vel.x = dx * ds; this.vel.z = dz * ds;
          this.dashT = 0.3; this.cds.dash = this.type === 'bolt' ? 0.7 : 1.1;
          this.useJuice(juiceCost(RULES.juiceDash, this.broken));
          g.sound('dash', this.pos, 1.1, 0.7);
          g.fx.dust(this.pos, 8, 1.4);
        } else if (i.atk) this.doAct(this.moves.combo);
        else if (i.hvy) this.trySkill(1, cdMul);
        else if (i.grdP) this.trySkill(2, cdMul);
        if (!this.onGround) { this.thrust(0.9); if (fighting) this.useJuice(juiceCost(RULES.juiceBoost, this.broken) * dt); }
      }
    } else {
      this.vel.x *= 0.85; this.vel.z *= 0.85;
    }
    this.moveAmt = this.act || this.stagger > 0 ? 0 : Math.hypot(this.vel.x, this.vel.z) / sp;
    this.physics(dt);
    this.buildPose(dt);
    this.setEyes(3);
    this.syncRoot();
    this.resolveContactHits();
  }

  resolveContactHits() {
    const tick = this.contactTick; this.contactTick = null;
    if (!tick || this.act !== tick.action || this.state !== 'active' || this.g.phase !== 'fight') return;
    this.rig.root.updateMatrixWorld(true);
    const a = tick.action;
    for (let index = 0; index < a.def.hits.length; index++) {
      if (this.act !== a) break;
      const hit = a.def.hits[index]; if (!hit.contact) continue;
      const segments = sweptRobotContacts(tick.before[index], robotContactSegments(this.rig, hit.contact), tick.from, a.t, hit);
      if (segments.length) this.g.meleeSweep(this, hit, index, a, segments);
    }
  }

  thrust(scale) {
    const g = this.g;
    for (const t of this.rig.thrusters) {
      t.getWorldPosition(tA);
      tB.set(-Math.sin(this.facing) * 0.6, -1, -Math.cos(this.facing) * 0.6).normalize();
      g.fx.thruster(tA, tB, scale);
    }
  }

  physics(dt) {
    const g = this.g;
    const wasGround = this.onGround;
    if (this.padT > 0) this.padT -= dt;
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    if (wasGround && this.plat) { this.pos.x += this.plat.vx * dt; this.pos.z += this.plat.vz * dt; }
    this.vel.y -= 44 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const qy = Math.max(py, this.pos.y);
    const walker = wasGround && this.stagger <= 0 && (this.state === 'idle' || (this.state === 'active' && !(this.act && this.act.name === 'stomp')));
    let s = this.ground(qy);
    if (!s && walker) s = this.keepOnGround(px, pz, qy);
    if (s) {
      const snap = walker && this.vel.y <= 0 && this.pos.y - s.h < 0.45;
      if ((this.pos.y <= s.h && this.pos.y > s.h - 2 && this.vel.y <= 0) || snap) {
        const impact = -this.vel.y;
        this.pos.y = s.h; this.vel.y = 0; this.onGround = true; this.gh = s.h;
        this.plat = s.vx || s.vz ? { vx: s.vx, vz: s.vz } : null;
        if (!wasGround && impact > 8 && this.state === 'active') {
          g.fx.dust(this.pos, 14, 2);
          g.sound('robotStep', this.pos, 1.3, 0.7);
          g.shake(0.25, this.pos);
        }
        if (s.pad > 0 && this.state === 'active') g.jumpPad(this, s.pad, s.padTo);
      } else if (this.pos.y > s.h + 0.05) { this.onGround = false; this.gh = s.h; }
    } else { this.onGround = false; this.gh = -99; this.plat = null; }
    this.pushWalls();
    if (this.pos.y < RULES.arenaFallY) g.destroyRobot(this, 'fall');
  }

  buildPose(dt) {
    const tp = this.tp;
    let snap = false, plant = this.onGround;
    if (this.act) {
      sample(this.act.def.frames, this.act.t, tp);
      snap = true;
      if (this.act.name === 'stomp' && !this.onGround) plant = false;
    } else if (this.stagger > 0) Object.assign(tp, RHURT);
    else if (!this.onGround) { Object.assign(tp, RJUMP); plant = false; }
    else {
      Object.assign(tp, RSTANCE);
      const s = clamp(this.moveAmt, 0, 1.3);
      const gait = ROBOT_GAITS[this.type] || ROBOT_GAITS.titan;
      if (s > 0.08) {
        const prev = Math.sin(this.walkPh);
        this.walkPh += dt * (4.2 + 3.2 * s) * gait.cadence;
        const ph = this.walkPh;
        const sn = Math.sin(ph);
        if ((prev < 0) !== (sn < 0)) this.g.robotStep(this, sn < 0 ? this.rig.footL : this.rig.footR);
        tp.tx = gait.lean * s; tp.ty = sn * gait.sway * s;
        tp.llx = -sn * gait.stride * s - 0.08; tp.lrx = sn * gait.stride * s - 0.08;
        tp.slx = 0.18 + Math.max(0, Math.sin(ph - 1.4)) * .80 * s;
        tp.srx = 0.18 + Math.max(0, -Math.sin(ph - 1.4)) * .80 * s;
        tp.alx = sn * gait.swing * s - 0.25; tp.arx = -sn * gait.swing * s - 0.25;
        tp.flx = -.45; tp.frx = -.45;
        if (this.type === 'hammer') { tp.arx = -.60 - sn * .16 * s; tp.frx = -.55; }
        if (this.type === 'cannon') { tp.alx -= .15; tp.arx -= .15; }
        tp.ex = -0.35 * s + Math.sin(ph * 2) * 0.08;
      } else {
        tp.ex += Math.sin(this.g.time * 1.7 + this.id) * 0.12;
      }
      applyRobotReadyPose(this.type, tp, s);
      if (s <= .08) { const b = Math.sin(this.g.time * 2.5 + this.id) * .04; tp.alx += b; tp.arx -= b; }
      if (this.dashT > 0) { tp.tx = 0.6; tp.alx = 0.7; tp.arx = 0.7; tp.ex = -1.2; tp.llx = -0.3; tp.lrx = 0.5; tp.slx = 0.6; tp.srx = 0.9; }
    }
    this.applyPose(dt, snap, plant);
    this.applyBrokenMotion(dt);
  }

  dispose() {
    this.g.scene.remove(this.rig.root);
    this.g.scene.remove(this.ring);
    this.clearBrokenMotionOffsets();
    this.clearDebris();
    for (const pieces of Object.values(this.damageDetails)) for (const piece of pieces) piece.removeFromParent();
    this.damageDetailGeo.joint.dispose(); this.damageDetailGeo.cable.dispose(); this.damageDetailMat.dispose();
    this.ringMat.dispose();
    this.rig.dispose();
    if (this.beam) { this.beam.stop(); this.beam = null; }
  }
}

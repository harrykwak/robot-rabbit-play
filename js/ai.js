// 컴퓨터 상대 AI. 사람일 때와 로봇 탑승 중일 때 두의 두뇌로 나뉜다
import { ROBOT_STATS, RULES } from './data.js';

const RANGE = { titan: 4.2, bolt: 3.8, cannon: 12, hammer: 4.6 };
// 길찾기 캐시: 경과 시뮬레이션 시간 기준으로 재계산 빈도를 제한한다
export const NAV = {
  replan: 0.2,     // 지상 재계산 주기(초)
  replanAir: 0.25, // 공중 재계산 주기(초). 공중에서는 arena 가 점프 경유점을 기억한다
  minGap: 0.06,    // 착지·목표 변경·도착으로 앞당길 때도 이 간격보다 자주 계산하지 않는다
  retarget: 1.5,   // 목표가 이만큼 움직이면 즉시 재계산
  retargetY: 1.2,
  reach: 1.3,      // arena.waypoint 가 건너뛰는 노드 반경. 이 안에 들어오면 도착으로 본다
  settle: 0.35,    // 이보다 가까운 경유점은 목표로 직진
};

export class AICtrl {
  constructor(game, me, diff) {
    this.g = game;
    this.me = me;
    this.d = diff;
    this.in = { mx: 0, mz: 0, jump: false, atk: false, hvy: false, grd: false, grdP: false, dash: false, act: false, actP: false, pause: false };
    this.thinkT = Math.random() * 0.5;
    this.mode = 'fight';
    this.target = null;
    this.atkT = 0;
    this.guardT = 0;
    this.pending = null;
    this.pendingT = 0;
    this.seenAct = null;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.navAge = Infinity;
    this.nav = null;
    this.navActor = null;
    this.navGoal = null;
    this.navGround = null;
    this.navArrive = false;
    this.navJump = false;
    this.navAir = null;
    this.holdT = 0;
  }

  poll() {}

  consume() {
    const i = this.in;
    i.jump = i.atk = i.hvy = i.dash = i.actP = i.grdP = false;
  }

  think(dt) {
    const me = this.me;
    const i = this.in;
    if (me.dead || this.g.phase !== 'fight') { i.mx = i.mz = 0; i.act = i.grd = false; this.resetNav(null); return; }
    // 탑승/하차로 조종 대상이 바뀌면 이전 몸의 경로·공중 경유점을 버린다
    if (this.navActor !== (me.riding || me)) this.resetNav(me.riding || me);
    this.navAge += dt;
    this.thinkT -= dt;
    this.atkT -= dt;
    this.guardT -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.8 + Math.random() * 1.6; }
    if (this.pending) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) { i[this.pending] = true; this.pending = null; }
    }
    if (me.riding) this.robotBrain(dt);
    else this.humanBrain(dt);
    // 모으기 강공격: 잠깐 누르고 있다가 뗀다
    if (this.holdT > 0) { this.holdT -= dt; i.hvyD = this.holdT > 0; } else i.hvyD = false;
    this.avoidEdge();
  }

  enemies() {
    const out = [];
    for (const h of this.g.humans) {
      if (h === this.me || h.dead) continue;
      out.push(h.riding || h);
    }
    return out;
  }

  nearest(list, from) {
    let best = null, bd = Infinity;
    for (const a of list) {
      const d = Math.hypot(a.pos.x - from.x, a.pos.z - from.z);
      if (d < bd) { bd = d; best = a; }
    }
    return [best, bd];
  }

  steer(tx, tz, speed = 1) {
    const l = Math.hypot(tx, tz) || 1;
    this.in.mx = (tx / l) * speed;
    this.in.mz = (tz / l) * speed;
  }

  resetNav(actor) {
    this.navActor = actor;
    this.nav = null;
    this.navGoal = null;
    this.navGround = null;
    this.navArrive = false;
    this.navJump = false;
    this.navAir = null;
    this.navAge = Infinity;
  }

  planNav(me, tx, tz, ty, grounded) {
    const a = this.g.arena;
    this.navAge = 0;
    this.navGround = grounded;
    this.navGoal = { x: tx, z: tz, y: ty };
    this.nav = a.waypoint({ x: me.pos.x, y: me.pos.y, z: me.pos.z }, { x: tx, y: ty !== undefined ? ty : me.pos.y, z: tz }, this);
    // 계산 시점에 이미 가까운 경유점(마지막 노드·패드)은 다시 "도착" 판정하지 않는다
    this.navArrive = !!this.nav && Math.hypot(this.nav.x - me.pos.x, this.nav.z - me.pos.z) >= NAV.reach;
  }

  // 지형을 따라 목표로 이동: 직선으로 못 가면 경로 노드를 따른다
  goTo(tx, tz, speed = 1, ty) {
    const me = this.me.riding || this.me;
    const a = this.g.arena;
    if (a.waypoint) {
      if (this.navActor !== me) this.resetNav(me);
      const grounded = !!me.onGround;
      const goal = this.navGoal;
      const age = this.navAge;
      // 주기 만료. 착지하면 앞당겨 다음 구간을 받고, 이륙 때는 arena 가 공중 경유점(navAir)을 기억한 경우만 앞당긴다
      let replan = !goal || age >= (grounded ? NAV.replan : NAV.replanAir);
      if (!replan && age >= NAV.minGap) {
        replan = (grounded && this.navGround === false) ||
          (!grounded && this.navGround === true && !!this.navAir) ||
          Math.hypot(tx - goal.x, tz - goal.z) > NAV.retarget ||
          (ty !== undefined && goal.y !== undefined && Math.abs(ty - goal.y) > NAV.retargetY) ||
          (ty === undefined) !== (goal.y === undefined) ||
          // 지상에서 경유점에 도착했으면 다음 노드를 바로 받는다 (노드 주위를 맴돌지 않게)
          (grounded && !!this.nav && this.navArrive && Math.hypot(this.nav.x - me.pos.x, this.nav.z - me.pos.z) < NAV.reach);
      }
      if (replan) this.planNav(me, tx, tz, ty, grounded);
      let w = this.nav;
      // 발밑 경유점으로 향하면 조향 벡터가 0이 되어 멈추므로 목표로 직진한다
      if (w && !w.jump && Math.hypot(w.x - me.pos.x, w.z - me.pos.z) < NAV.settle) w = null;
      if (w) {
        const dx = w.x - me.pos.x, dz = w.z - me.pos.z;
        this.steer(dx, dz, speed);
        // 건너뛰기 구간: 앞이 허공이 되는 가장자리에서 점프
        this.navJump = !!w.jump || !me.onGround || !!this.navAir;
        if (w.jump && me.onGround && a.isVoid) {
          const l = Math.hypot(dx, dz) || 1;
          const look = me.radius + 0.9;
          if (a.isVoid(me.pos.x + (dx / l) * look, me.pos.z + (dz / l) * look)) this.in.jump = true;
        }
        return;
      }
    }
    this.navJump = false;
    this.steer(tx - me.pos.x, tz - me.pos.z, speed);
  }

  avoidEdge() {
    const me = this.me.riding || this.me;
    const a = this.g.arena;
    const i = this.in;
    if (this.navJump) { this.navJump = false; return; }
    // 앞쪽이 허공이면 방향을 튼다
    if (a.isVoid && me.onGround && (i.mx || i.mz)) {
      const l = Math.hypot(i.mx, i.mz) || 1;
      const look = 1.6 + me.radius;
      if (a.isVoid(me.pos.x + (i.mx / l) * look, me.pos.z + (i.mz / l) * look)) {
        const sx = -i.mz, sz = i.mx;
        const left = !a.isVoid(me.pos.x + sx / l * look, me.pos.z + sz / l * look);
        const k = left ? 1 : -1;
        i.mx = sx * k * 0.8; i.mz = sz * k * 0.8;
        if (a.isVoid(me.pos.x + i.mx * look, me.pos.z + i.mz * look)) { i.mx = -me.pos.x; i.mz = -me.pos.z; const m = Math.hypot(i.mx, i.mz) || 1; i.mx /= m; i.mz /= m; }
      }
      return;
    }
    const R = this.g.arena.radius;
    const d = Math.hypot(me.pos.x, me.pos.z);
    if (d > R - 4.5) {
      const k = Math.min(1, (d - (R - 4.5)) / 3);
      const i = this.in;
      i.mx = i.mx * (1 - k) - (me.pos.x / d) * k;
      i.mz = i.mz * (1 - k) - (me.pos.z / d) * k;
    }
  }

  decide() {
    const g = this.g, me = this.me, d = this.d;
    const p = me.pos;
    // 1) 내 빈 로봇에 타러 간다
    const mine = me.robot && me.robot.state === 'idle' ? me.robot : null;
    // 2) 다른 사람이 로봇에 타는 중이면 방해
    let interrupt = null, idist = Infinity;
    for (const h of g.humans) {
      if (h === me || h.dead || h.state !== 'boarding') continue;
      const dd = Math.hypot(h.pos.x - p.x, h.pos.z - p.z);
      if (dd < 16 && dd < idist) { idist = dd; interrupt = h; }
    }
    // 3) 빈 적 로봇 빼앗기
    let steal = null, sdist = Infinity;
    for (const r of g.robots) {
      if (r.state !== 'idle' || r.owner === me || (r.owner && r.owner.shieldT > 0)) continue;
      const dd = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
      if (dd < 13 && dd < sdist) { sdist = dd; steal = r; }
    }
    // 위협: 탑승 중인 적 로봇
    let threat = null, tdist = Infinity;
    for (const r of g.robots) {
      if (r.state !== 'active' || r.pilot === me) continue;
      const dd = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
      if (dd < tdist) { tdist = dd; threat = r; }
    }
    const humans = g.humans.filter((h) => h !== me && !h.dead && !h.riding && !(h.shieldT > 0));
    const [foe, fdist] = this.nearest(humans, p);
    // 내 로봇이 떨어지는 중이면 착지 지점 근처에서 기다린다
    const falling = me.robot && me.robot.state === 'falling' ? me.robot : null;
    if (falling) { this.mode = 'board'; this.target = falling; return; }

    if (interrupt && !(interrupt.shieldT > 0) && Math.random() < 0.5 + d.aggro * 0.5) {
      this.mode = 'fight'; this.target = interrupt; return;
    }
    if (mine) {
      if (fdist < 1.8 && Math.random() < 0.35) { this.mode = 'fight'; this.target = foe; return; }
      this.mode = 'board'; this.target = mine; return;
    }
    if (steal && Math.random() < d.steal) { this.mode = 'board'; this.target = steal; return; }
    if (me.gauge >= RULES.gaugeMax && !me.robot && me.state !== 'act') {
      if (fdist > 2.6 || Math.random() < 0.3) { this.mode = 'summon'; return; }
    }
    if (threat && tdist < 10) { this.mode = 'flee'; this.target = threat; return; }
    let carrot = null, cd = Infinity;
    for (const c of g.carrots) {
      if (!c.landed) continue;
      const dd = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (dd < cd) { cd = dd; carrot = c; }
    }
    if (carrot && cd < 9 && (fdist > 4 || me.hp < 40)) { this.mode = 'pickup'; this.target = carrot; return; }
    if (foe) { this.mode = 'fight'; this.target = foe; return; }
    if (threat) { this.mode = 'flee'; this.target = threat; return; }
    this.mode = 'idle';
  }

  humanBrain(dt) {
    const g = this.g, me = this.me, d = this.d, i = this.in;
    if (this.thinkT <= 0) { this.thinkT = d.react * (0.7 + Math.random() * 0.9); this.decide(); }
    i.act = false;
    i.grd = this.guardT > 0;
    const t = this.target;
    const p = me.pos;
    // 맞는 중 긴급 소환
    if (me.gauge >= RULES.gaugeMax && !me.robot && (me.state === 'hurt' || me.state === 'launched') && Math.random() < d.skill * 0.08) i.actP = true;
    // 띄운 뒤 추격 점프, 공중에서는 연타
    if (me.chaseT > 0 && me.chaseTarget && Math.random() < d.aggro * 0.25) { i.jump = true; this.atkT = 0.12; }
    if (!me.onGround && me.state !== 'act' && me.airTarget && me.airTarget() && this.atkT <= 0) {
      if (Math.random() < d.aggro) { if (me.airCount >= (me.P.airChain || 3) - 1 && Math.random() < 0.5) i.hvy = true; else i.atk = true; }
      this.atkT = 0.1 + d.react * 0.3;
    }
    if (this.mode === 'summon') {
      i.mx = i.mz = 0;
      if (me.gauge >= RULES.gaugeMax && !me.robot && me.state !== 'act') i.actP = true;
      this.mode = 'fight';
      this.thinkT = 1.1;
      return;
    }
    if (!t || (t.dead) || (t.state === 'dead')) { i.mx = i.mz = 0; this.thinkT = Math.min(this.thinkT, 0.1); return; }
    const dx = t.pos.x - p.x, dz = t.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (this.mode === 'board') {
      if (t.state === 'falling') { if (dist > 5) this.goTo(t.pos.x, t.pos.z, 1, t.landY); else { i.mx = i.mz = 0; } return; }
      if (t.state !== 'idle') { this.thinkT = 0; return; }
      const reach = t.radius + RULES.boardRange - 0.35;
      if (dist < reach && Math.abs(t.pos.y - p.y) < 1.4) { i.mx = i.mz = 0; i.act = true; }
      else { this.goTo(t.pos.x, t.pos.z, 1, t.pos.y); if (dist > 7 && Math.random() < 0.01) i.dash = true; }
      return;
    }
    if (this.mode === 'flee') {
      const ax = -dx, az = -dz;
      this.steer(ax + az * 0.5 * this.strafe - p.x * 0.05, az - ax * 0.5 * this.strafe - p.z * 0.05);
      if (dist < 7 && t.act && Math.random() < 0.05 + d.aggro * 0.05) i.dash = true;
      return;
    }
    if (this.mode === 'pickup') {
      if (!g.carrots.includes(t)) { this.thinkT = 0; return; }
      this.goTo(t.pos.x, t.pos.z, 1, t.pos.y - 0.7);
      return;
    }
    if (this.mode !== 'fight') { i.mx = i.mz = 0; return; }
    // 가드 판단: 상대가 공격을 시작한 순간 한 번만
    if (t.kind === 'human' && t.act && t.act !== this.seenAct && dist < 2.6) {
      this.seenAct = t.act;
      if (Math.random() < d.guard && t.act.name !== 'heavy') this.guardT = 0.4 + Math.random() * 0.2;
      else if (Math.random() < d.guard * 0.4) i.dash = true;
    }
    if (this.guardT > 0) { i.mx = i.mz = 0; this.steer(dx, dz, 0.01); return; }
    if (t.shieldT > 0) { this.steer(-dx, -dz, 0.6); return; }
    if (dist > 1.35) {
      const s = dist > 4 ? 1 : 0.85;
      if (dist > 5 || Math.abs(t.pos.y - p.y) > 1) this.goTo(t.pos.x, t.pos.z, s, t.pos.y);
      else this.steer(dx + (dist < 5 ? -dz * 0.25 * this.strafe : 0), dz + (dist < 5 ? dx * 0.25 * this.strafe : 0), s);
      if (dist > 3.8 && dist < 6.5 && Math.random() < 0.012 * d.aggro && me.state !== 'act') {
        i.dash = true; this.pending = 'atk'; this.pendingT = 0.07;
      } else if (dist > 2.4 && dist < 4 && Math.random() < 0.006 * d.aggro && me.onGround) {
        i.jump = true; this.pending = 'atk'; this.pendingT = 0.22;
      }
    } else {
      i.mx = dx * 0.02; i.mz = dz * 0.02;
    }
    if (dist < 1.7 * (me.P.reach || 1) && this.atkT <= 0) {
      if (Math.random() < d.aggro) {
        const a = me.act && me.act.name;
        // 콤보 루트: 잽 2타 뒤 띄우기, 가끔 파일럿 강공격
        if ((a === 'jab1' || a === 'jab2') && Math.random() < 0.35 + d.aggro * 0.3) i.hvy = true;
        else if (!a && Math.random() < 0.14) { i.hvy = true; if (me.P.id === 'rico') this.holdT = 0.2 + Math.random() * 0.7; }
        else i.atk = true;
      }
      this.atkT = 0.12 + Math.random() * 0.1 + d.react * 0.25;
      if (me.act && me.act.name === 'kick3') this.atkT = 0.55 + d.react;
    }
  }

  robotBrain(dt) {
    const g = this.g, me = this.me, d = this.d, i = this.in;
    const r = me.riding;
    i.act = false;
    i.grd = false;
    const [t, dist] = this.nearest(this.enemies(), r.pos);
    if (!t) { i.mx = i.mz = 0; return; }
    const dx = t.pos.x - r.pos.x, dz = t.pos.z - r.pos.z;
    const want = RANGE[r.type];
    // 기본 콤보가 맞았으면 스킬 캔슬
    if (r.act && r.act.hits && r.act.hits.size > 0 && Math.random() < d.skill * 0.3) {
      if (r.cds.k <= 0 && r.type !== 'cannon') i.hvy = true; else if (r.cds.l <= 0 && r.type === 'titan') i.grdP = true;
    }
    // 스킬 중에는 목표 방향으로 조향 (회전기/레이저)
    if (r.act) {
      const n = r.act.name;
      if (n === 'tornado' || n === 'hspin' || n === 'laser' || n === 'drill') this.steer(dx, dz, 1);
      else { i.mx = i.mz = 0; }
      if (this.atkT <= 0 && r.act.def.next && dist < want + 2.5 && Math.random() < d.aggro) { i.atk = true; this.atkT = 0.15 + d.react * 0.3; }
      return;
    }
    const fx = Math.sin(r.facing), fz = Math.cos(r.facing);
    const align = (fx * dx + fz * dz) / (dist || 1);
    if (r.type === 'cannon') {
      if (dist < 8) this.steer(-dx + dz * 0.6 * this.strafe, -dz - dx * 0.6 * this.strafe);
      else if (dist > 16) this.steer(dx, dz);
      else this.steer(dx * 0.1 + dz * 0.3 * this.strafe, dz * 0.1 - dx * 0.3 * this.strafe, 0.5);
    } else if (dist > want) this.goTo(t.pos.x, t.pos.z, 1, t.pos.y);
    else this.steer(dx, dz, 0.05);
    if (this.thinkT > 0) return;
    this.thinkT = d.react * (0.5 + Math.random() * 0.6);
    const ready = (k) => r.cds[k] <= 0;
    const roll = Math.random() < d.skill;
    const ty = r.type;
    if (roll) {
      if (ty === 'titan') {
        if (ready('l') && dist < 11 && Math.random() < 0.5) return void (i.grdP = true);
        if (ready('k') && dist > 5 && dist < 24 && align > 0.7) return void (i.hvy = true);
      } else if (ty === 'bolt') {
        if (ready('l') && dist < 5.5) return void (i.grdP = true);
        if (ready('k') && dist > 4 && dist < 16 && align > 0.6) return void (i.hvy = true);
      } else if (ty === 'cannon') {
        if (ready('l') && dist > 6 && dist < 24 && align > 0.75) return void (i.grdP = true);
        if (ready('k') && dist < 28) return void (i.hvy = true);
      } else if (ty === 'hammer') {
        if (ready('l') && dist > 4 && dist < 15 && align > 0.75) return void (i.grdP = true);
        if (ready('k') && dist < 7) return void (i.hvy = true);
      }
    }
    const atkRange = ty === 'cannon' ? 22 : want + 1.3;
    if (dist < atkRange && (ty !== 'cannon' || align > 0.8) && Math.random() < 0.5 + d.aggro * 0.5) i.atk = true;
    if (t.pos.y > 3 && dist < 6 && Math.random() < 0.3) i.jump = true;
    if (dist > 14 && ty !== 'cannon' && Math.random() < 0.2) i.dash = true;
  }
}

import * as THREE from 'three';
import { createJuiceStationModel } from './juice-station-models.js';

export const JUICE_SERVICE = Object.freeze({ price: 20, refill: 60, shopTime: 1.1, farmTime: 3.2, range: 3.4, maxAP: 999 });
const LOCATIONS = {
  farm: [[-13, -13], [8, 15]], fort: [[-11, -15], [9, 13]], sky: [[-16, 0], [0, -4]],
};

export class JuiceStations {
  constructor(game) {
    this.game = game;
    this.stations = [];
    // Minimal test arenas intentionally do not create decorative terrain.
    if (!game.arena.safePoint) return;
    const points = LOCATIONS[game.arena.stageId] || LOCATIONS.farm;
    for (let id = 0; id < points.length; id++) {
      const [x, z] = points[id], p = game.arena.safePoint(x, z, 3);
      const kind = id === 0 ? 'shop' : 'farm', model = createJuiceStationModel(kind);
      model.root.position.set(p.x, p.y, p.z);
      // Counter backs onto the perimeter, its opening faces the arena centre.
      const facing = Math.atan2(-p.x, -p.z);
      model.root.rotation.y = facing;
      game.scene.add(model.root);
      const approach = kind === 'shop' ? 5.8 : 3.8;
      const pos = new THREE.Vector3(p.x + Math.sin(facing) * approach, p.y, p.z + Math.cos(facing) * approach);
      // Keep the service point on a real, reachable floor (especially sky islands).
      const ground = game.groundY(pos.x, pos.z, p.y + .5);
      if (ground === null || Math.abs(ground - p.y) > .4) pos.set(p.x, p.y, p.z);
      this.stations.push({ id, kind, model, pos, duration: kind === 'shop' ? JUICE_SERVICE.shopTime : JUICE_SERVICE.farmTime });
    }
  }
  near(human) {
    const r = human?.riding;
    if (!r || human.dead || human.out || r.state !== 'active') return null;
    return this.stations.find(s => Math.hypot(s.pos.x - r.pos.x, s.pos.z - r.pos.z) <= JUICE_SERVICE.range && Math.abs(s.pos.y - r.pos.y) < 1) || null;
  }
  context(human) {
    const station = this.near(human);
    if (!station) return null;
    const full = human.riding.juice >= human.riding.maxJuice - .5;
    const affordable = station.kind === 'farm' || human.attackPoints >= JUICE_SERVICE.price;
    return { kind: 'supply', label: station.kind === 'shop' ? '주스 구매' : '당근 갈기',
      hint: full ? '가득 참' : affordable ? (station.kind === 'shop' ? '20 AP · 길게' : '무료 · 길게') : '20 AP 필요',
      near: true, progress: human.supplyProgress || 0, station, ready: !full && affordable };
  }
  update(human, dt) {
    const i = human.ctrl.in, r = human.riding;
    if (!i.act) { human._supplyLatch = false; human._supplyDone = false; }
    const context = this.context(human);
    // A fresh press chooses service vs eject once, for the whole hold.
    if (i.actP && context?.ready && !human.needRelease) human._supplyLatch = true;
    human.supplyHeld = !!human._supplyLatch && !!i.act;
    const moving = Math.hypot(i.mx, i.mz) > .2;
    const safe = r && r.onGround && r.stagger <= 0 && r.hs <= 0 && !r.act && r.dashT <= 0;
    const continuing = human.supplyHeld && context?.ready && safe && !moving && !i.jump && !i.atk && !i.hvy && !i.grdP && !human._supplyDone;
    if (!continuing || this.game.phase !== 'fight') { human.supplyId = -1; human.supplyProgress = 0; return; }
    const s = context.station;
    if (human.supplyId !== s.id) human.supplyProgress = 0;
    human.supplyId = s.id;
    human.ejectHold = 0;
    human.supplyProgress = Math.min(1, human.supplyProgress + dt / s.duration);
    if (human.supplyProgress < 1) return;
    if (s.kind === 'shop') human.attackPoints -= JUICE_SERVICE.price;
    const got = r.addJuice(JUICE_SERVICE.refill);
    human._supplyDone = true;
    this.game.fx.sparkle(r.pos, 0xffa42b);
    this.game.sound('gaugeFull', r.pos, .65, 1.2);
    if (human.isPlayer) this.game.ui.toast((s.kind === 'shop' ? '20 AP로 구매' : '직접 간 당근') + ' · 주스 +' + Math.round(got));
  }
  present(time) {
    for (const s of this.stations) {
      const user = this.game.humans.find(h => h.supplyId === s.id && h.supplyProgress > 0);
      s.model.animate(time, user?.supplyProgress || 0, !!user);
    }
  }
  collide(actor) {
    if (actor.dead || actor.riding) return;
    for (const s of this.stations) {
      if (s.kind !== 'shop') continue;
      const p = s.model.root.position;
      if (actor.pos.y > p.y + 3 || actor.pos.y < p.y - .5) continue;
      const dx = actor.pos.x - p.x, dz = actor.pos.z - p.z, d = Math.hypot(dx, dz);
      const radius = 2.25 + actor.radius;
      if (d >= radius) continue;
      const nx = d > .001 ? dx / d : Math.sin(s.model.root.rotation.y), nz = d > .001 ? dz / d : Math.cos(s.model.root.rotation.y);
      actor.pos.x = p.x + nx * radius; actor.pos.z = p.z + nz * radius;
      const into = actor.vel.x * nx + actor.vel.z * nz;
      if (into < 0) { actor.vel.x -= nx * into; actor.vel.z -= nz * into; }
    }
  }
  dispose() { for (const s of this.stations) { s.model.root.removeFromParent(); s.model.dispose(); } this.stations.length = 0; }
}

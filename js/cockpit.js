// Mounted controls are relative to the rabbit's eyes, on host and remote input alike.
import * as THREE from 'three';

export function prepareMountedInput(robot, input, dt) {
  const out = { ...input, cockpitDriving: true };
  if (!robot.pilot?.supplyHeld && robot.stagger <= 0) robot.facing -= input.mx * dt * 2.15;
  const forward = -input.mz;
  out.mx = Math.sin(robot.facing) * forward;
  out.mz = Math.cos(robot.facing) * forward;
  return out;
}

export class CockpitCamera {
  constructor() { this.hidden = new Map(); this.robot = null; this.pitch = .28; this.direction = new THREE.Vector3(); }
  restore() {
    for (const [object, mask] of this.hidden) object.layers.mask = mask;
    this.hidden.clear(); this.robot = null;
  }
  reset(camera) {
    this.restore();
    if (this.saved) { camera.fov = this.saved.fov; camera.near = this.saved.near; camera.updateProjectionMatrix(); this.saved = null; }
  }
  update(game, dt) {
    const pilot = game.player, robot = pilot?.riding, camera = game.camera;
    if (!robot || pilot.dead || pilot.out || robot.state === 'dead' || game.phase === 'end') {
      if (this.robot) { this.reset(camera); game._cameraReady = false; }
      return false;
    }
    if (!this.saved) this.saved = { fov: camera.fov, near: camera.near };
    if (this.robot !== robot) { this.restore(); this.robot = robot; this.pitch = .28; }
    // Layers leave authoritative visibility and network snapshots untouched.
    // Keep the animated paws/weapons visible below the eye line.
    const hands = new Set();
    for (const arm of [robot.rig.armL, robot.rig.armR]) arm?.traverse(o => hands.add(o));
    robot.rig.root.traverse(o => {
      if (o.isMesh && !hands.has(o) && !this.hidden.has(o)) { this.hidden.set(o, o.layers.mask); o.layers.set(1); }
    });
    const wantedFov = camera.aspect < 1 ? 82 : 72;
    if (camera.fov !== wantedFov || camera.near !== .08 || camera.view?.enabled) {
      camera.fov = wantedFov; camera.near = .08; camera.clearViewOffset(); camera.updateProjectionMatrix();
    }
    const f = robot.facing, sx = Math.sin(f), sz = Math.cos(f);
    const root = robot.rig.root.position;
    // Visual eye placement belongs to the sculpt, independent of combat hitboxes.
    const eye = robot.rig.eyeHeight ?? robot.height * .83;
    const forward = robot.rig.eyeForward ?? .5;
    const bob = game.reducedMotion ? 0 : Math.sin(game.time * 7) * Math.min(.026, (robot.moveAmt || 0) * .025);
    camera.position.set(root.x + sx * forward, root.y + eye + bob, root.z + sz * forward);
    let pitch = .25, distance = 25;
    const station = game.juiceStations?.near(pilot);
    if (station) {
      const p = station.model.root.position, dx = p.x - robot.pos.x, dz = p.z - robot.pos.z, d = Math.hypot(dx, dz);
      if (d > .1 && (dx * sx + dz * sz) / d > .6) {
        pitch = Math.min(.68, Math.atan2(camera.position.y - p.y - (station.kind === 'shop' ? 2.4 : 1.8), d));
        distance = d;
      }
    }
    for (const target of game.targets(robot)) {
      const dx = target.pos.x - robot.pos.x, dz = target.pos.z - robot.pos.z, d = Math.hypot(dx, dz);
      if (d < 2 || d >= distance || (dx * sx + dz * sz) / d < .8) continue;
      distance = d;
      pitch = THREE.MathUtils.clamp(Math.atan2(camera.position.y - target.pos.y - target.height * .5, d), -.25, .62);
    }
    this.pitch += (pitch - this.pitch) * (1 - Math.exp(-dt * 5));
    camera.lookAt(camera.position.x + sx * 20, camera.position.y - Math.tan(this.pitch) * 20, camera.position.z + sz * 20);
    game.trauma = Math.max(0, game.trauma - dt * 1.9);
    game.camPos.copy(camera.position);
    return true;
  }
}

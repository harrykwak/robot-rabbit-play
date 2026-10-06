import * as THREE from 'three';

export function prepareMountedInput(robot, input, dt) {
  const out = { ...input, cockpitDriving: true };
  if (!robot.pilot?.supplyHeld && robot.stagger <= 0) robot.facing -= input.mx * dt * 2.15;
  const forward = -input.mz;
  out.mx = Math.sin(robot.facing) * forward; out.mz = Math.cos(robot.facing) * forward;
  return out;
}
export function mountedFov(aspect, first) {
  const horizontal = first ? 108 : 96;
  const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontal / 2)) / Math.max(.3, aspect)));
  return THREE.MathUtils.clamp(vertical, first ? 76 : 66, first ? 110 : 102);
}
// This controller changes only local camera layers, never authoritative visibility.
export class CockpitCamera {
  constructor(options = {}) {
    this.hidden = new Map(); this.robot = null; this.mode = 'first'; this.pitch = .22;
    try {
      this.storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
      const saved = JSON.parse(this.storage?.getItem('rr-camera') || 'null');
      if (saved?.version === 1 && ['first', 'chase'].includes(saved.mounted)) this.mode = saved.mounted;
    } catch { this.storage = null; }
    this.ray = new THREE.Raycaster(); this.anchor = new THREE.Vector3(); this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.origin = new THREE.Vector3();
    this.position = new THREE.Vector3(); this.hits = []; this.obstacles = []; this.clearance = Infinity; this.fallback = false;
    this.hitPoint = new THREE.Vector3();
    if (typeof document !== 'undefined' && document.body?.append && document.addEventListener) this.installControls();
  }
  installControls() {
    const b = document.createElement('button'); b.id = 'mounted-camera-toggle'; b.type = 'button'; b.hidden = true;
    b.style.cssText = 'position:fixed;left:12px;top:78px;z-index:35;border:1px solid #6e94a5;border-radius:10px;background:#14263bea;color:#fff9ea;padding:10px 13px;font:600 12px system-ui;cursor:pointer';
    b.addEventListener('click', () => { this.toggle(); b.blur(); }); document.body.append(b); this.button = b;
    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this.robot) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      e.preventDefault(); this.toggle();
    }); this.label();
  }
  label() {
    if (!this.button) return;
    this.button.textContent = this.mode === 'chase' ? '3인칭 · C' : '1인칭 · C';
    this.button.title = '탑승 시점 전환. 선택한 시점은 다음 플레이에도 유지됩니다.';
    this.button.setAttribute('aria-pressed', String(this.mode === 'first'));
  }
  toggle() {
    this.mode = this.mode === 'chase' ? 'first' : 'chase'; this.ready = false; this.label();
    try { this.storage?.setItem('rr-camera', JSON.stringify({ version: 1, mounted: this.mode })); } catch { /* private storage may be unavailable */ }
  }
  restoreVisibility() { for (const [o, mask] of this.hidden) o.layers.mask = mask; this.hidden.clear(); }
  restore() { this.restoreVisibility(); this.robot = null; this.ready = false; if (this.button) this.button.hidden = true; }
  reset(camera) {
    this.restore();
    if (this.saved) {
      camera.fov = this.saved.fov; camera.near = this.saved.near;
      const v = this.saved.view;
      if (v?.enabled) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix(); this.saved = null;
    }
    this.obstacles.length = 0; this.obstacleKey = null;
  }
  hideSelf(robot, pilot) {
    // All meshes including weapons, pilot, outlines and quality-dependent bakes.
    for (const root of [robot.rig.root, pilot.rig?.root]) root?.traverse(o => {
      if (o.isMesh && !this.hidden.has(o)) { this.hidden.set(o, o.layers.mask); o.layers.disable(0); }
    });
  }
  collisionDistance(game, anchor, position) {
    const a = game.arena;
    if (!a?.group) return anchor.distanceTo(position);
    const key = `${a.stageId}:${a.quality}`;
    if (this.obstacleKey !== key || this.obstacleGroup !== a.group) {
      this.obstacles.length = 0; a.group.updateWorldMatrix(true, true);
      for (const proxy of a.cameraBoxes || []) this.obstacles.push({ ...proxy, box: new THREE.Box3() });
      // Quality batching does not discard the original simple meshes. Use their
      // analytic bounds and the authored art proxies, never the merged triangles.
      a.group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.batch || o.userData.cameraProxied || o.userData.outline || o.userData.rrOutline || o.material?.transparent) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        this.obstacles.push({ node: o, localBox: o.geometry.boundingBox, box: new THREE.Box3() });
      });
      this.obstacleKey = key; this.obstacleGroup = a.group;
    }
    this.direction.subVectors(position, anchor);
    const length = this.direction.length(); if (length < .001) return 0;
    this.direction.divideScalar(length); this.ray.set(anchor, this.direction);
    let safe = length;
    // Inflated boxes bound a swept near-plane volume. Matrices keep moving roofs
    // and platforms current. Cost depends on prop count, not art triangle count.
    for (const p of this.obstacles) {
      p.node.updateWorldMatrix(true, false);
      p.box.copy(p.localBox).applyMatrix4(p.node.matrixWorld).expandByScalar(.4);
      if (p.box.containsPoint(anchor)) { safe = 0; break; }
      if (this.ray.ray.intersectBox(p.box, this.hitPoint)) safe = Math.min(safe, Math.max(0, anchor.distanceTo(this.hitPoint)-.15));
    }
    return safe;
  }
  update(game, dt) {
    const pilot = game.player, robot = pilot?.riding, camera = game.camera;
    if (!robot || pilot.dead || pilot.out || robot.state === 'dead' || game.phase === 'end') {
      if (this.robot) { this.reset(camera); game._cameraReady = false; } return false;
    }
    if (!this.saved) this.saved = {fov:camera.fov, near:camera.near, view:camera.view ? {...camera.view} : null};
    if (this.robot !== robot) { this.restoreVisibility(); this.robot = robot; this.ready = false; this.pitch = .22; }
    if (this.button) this.button.hidden = false;
    if (this.button) this.button.style.top = camera.aspect < 1 ? '204px' : '78px';
    const f = robot.facing, sx = Math.sin(f), sz = Math.cos(f), root = robot.rig.root.position;
    // The authored eye anchor follows this actual posed head, including the
    // rig scale/hip planting. A root-height approximation can miss it by a metre.
    if (robot.rig.viewpoint) robot.rig.viewpoint.getWorldPosition(this.anchor);
    else this.anchor.set(root.x + sx*(robot.rig.eyeForward ?? .5), root.y + (robot.rig.eyeHeight ?? 5.13), root.z + sz*(robot.rig.eyeForward ?? .5));
    let first = this.mode === 'first';
    if (!first) {
      const back = camera.aspect < 1 ? 16 : 12.5;
      this.desired.set(root.x - sx*back + sz*7.2, root.y+9.3, root.z - sz*back - sx*7.2);
      if (!this.ready) this.position.copy(this.desired);
      else this.position.lerp(this.desired, 1-Math.exp(-Math.min(dt,.1)*10));
      this.clearance = this.collisionDistance(game, this.anchor, this.position);
      this.fallback = this.clearance < (this.fallback ? 6.2 : 4.8);
      first = this.fallback;
      if (!first) {
        const length = this.anchor.distanceTo(this.position);
        camera.position.copy(this.anchor).lerp(this.position, Math.min(1,this.clearance/Math.max(length,.001)));
        this.target.set(root.x+sx*6.5,root.y+2.8,root.z+sz*6.5); camera.lookAt(this.target);
        if (this.clearance < 8) this.hideSelf(robot,pilot); else this.restoreVisibility();
      }
    }
    if (first) {
      this.hideSelf(robot,pilot);
      camera.position.copy(this.anchor);
      let pitch=.22, distance=24;
      for (const target of game.targets(robot)) {
        const dx=target.pos.x-robot.pos.x, dz=target.pos.z-robot.pos.z, d=Math.hypot(dx,dz);
        if(d<1 || d>=distance || (dx*sx+dz*sz)/d<.82) continue;
        const eyeDistance=Math.hypot(target.pos.x-camera.position.x,target.pos.z-camera.position.z);
        distance=d; pitch=THREE.MathUtils.clamp(Math.atan2(camera.position.y-target.pos.y-target.height*.5,eyeDistance),-.45,1.15);
      }
      this.pitch+=(pitch-this.pitch)*(1-Math.exp(-Math.min(dt,.1)*5));
      camera.lookAt(camera.position.x+sx*20,camera.position.y-Math.tan(this.pitch)*20,camera.position.z+sz*20);
    }
    const fov=mountedFov(camera.aspect,first);
    if(camera.fov!==fov || camera.near!==.12 || camera.view?.enabled) { camera.fov=fov;camera.near=.12;camera.clearViewOffset();camera.updateProjectionMatrix(); }
    game.trauma=Math.max(0,game.trauma-dt*1.9); game.camPos.copy(camera.position); this.ready=true; return true;
  }
}

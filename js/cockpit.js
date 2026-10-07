import * as THREE from 'three';
import { CloseContactView } from './close-contact.js';

export function prepareMountedInput(robot, input, dt) {
  const out = { ...input, cockpitDriving: true };
  if (!robot.pilot?.supplyHeld && robot.stagger <= 0) robot.facing -= input.mx * dt * 2.15;
  const forward = -input.mz;
  out.mx = Math.sin(robot.facing) * forward; out.mz = Math.cos(robot.facing) * forward;
  return out;
}
export function mountedFov(aspect, first) {
  const horizontal = first ? 94 : 96;
  const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontal / 2)) / Math.max(.3, aspect)));
  return THREE.MathUtils.clamp(vertical, 66, first ? 96 : 102);
}
// This controller changes only local camera layers, never authoritative visibility.
export class CockpitCamera {
  constructor(options = {}) {
    this.hidden = new Map(); this.robot = null; this.mode = 'first'; this.pitch = .16; this.lookPitch = .16; this.hitTime = 0; this.hitStrength = 0; this.clock = 0; this.rearEnabled = true;
    try {
      this.storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
      const saved = JSON.parse(this.storage?.getItem('rr-camera') || 'null');
      if (saved?.version === 1 && ['first', 'chase'].includes(saved.mounted)) this.mode = saved.mounted;
      if (saved?.version === 1 && saved.rearView === false) this.rearEnabled = false;
    } catch { this.storage = null; }
    this.ray = new THREE.Raycaster(); this.anchor = new THREE.Vector3(); this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.origin = new THREE.Vector3();
    this.position = new THREE.Vector3(); this.hits = []; this.obstacles = []; this.clearance = Infinity; this.fallback = false;
    this.hitPoint = new THREE.Vector3(); this.lastRoot = new THREE.Vector3(); this.eyeY = null;
    this.contactView=new CloseContactView();
    if (typeof document !== 'undefined' && document.body?.append && document.addEventListener) this.installControls();
  }
  installControls() {
    const b = document.createElement('button'); b.id = 'mounted-camera-toggle'; b.type = 'button'; b.hidden = true;
    b.className = 'btn';
    b.addEventListener('click', () => { this.toggle(); b.blur(); }); (document.querySelector('#pause .col')||document.body).append(b); this.button = b;
    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this.robot) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      e.preventDefault(); this.toggle();
    }); this.label();
    // Vertical look is a local camera gesture. It never changes combat/network
    // inputs, and the two thumb control regions are separate DOM elements.
    const canvas = document.getElementById?.('gl'); let drag = null;
    canvas?.addEventListener('pointerdown', e => {
      if (!this.robot || this.mode !== 'first' || e.button > 0 || drag) return;
      drag = { id: e.pointerId, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId);
    });
    canvas?.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!this.robot || this.mode !== 'first') { drag=null; return; }
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + (e.clientY-drag.y)/Math.max(320,globalThis.innerHeight||800)*1.6,.04,.9);
      drag.y=e.clientY;
    });
    const release = e => { if (drag?.id === e.pointerId) drag=null; };
    canvas?.addEventListener('pointerup',release); canvas?.addEventListener('pointercancel',release);
    canvas?.addEventListener('lostpointercapture',release);
    globalThis.addEventListener?.('blur',()=>{drag=null});
    globalThis.addEventListener?.('resize',()=>{drag=null});
    globalThis.addEventListener?.('rr-input-reset',()=>{drag=null});
  }
  label() {
    if (!this.button) return;
    this.button.textContent = this.mode === 'chase' ? '3인칭 · C' : '1인칭 · C';
    this.button.title = '탑승 시점 전환. 1인칭에서 화면을 위아래로 끌어 시선을 조절합니다. 선택한 시점은 저장됩니다.';
    this.button.setAttribute('aria-pressed', String(this.mode === 'first'));
  }
  toggle() {
    this.mode = this.mode === 'chase' ? 'first' : 'chase'; this.ready = false; this.label();
    this.savePreference();
  }
  savePreference() { try { this.storage?.setItem('rr-camera', JSON.stringify({version:1,mounted:this.mode,rearView:this.rearEnabled})); } catch { /* optional storage */ } }
  toggleRearView() { this.rearEnabled=!this.rearEnabled;this.savePreference();return this.rearEnabled; }
  restoreVisibility() { for (const [o, mask] of this.hidden) o.layers.mask = mask; this.hidden.clear(); }
  restore() { this.hitTime = 0; this.restoreVisibility(); this.robot = null; this.ready = false; this.eyeY=null; if (this.button) this.button.hidden = true; }
  reset(camera) {
    this.restore();
    this.contactView.reset();
    if (this.saved) {
      camera.fov = this.saved.fov; camera.near = this.saved.near;
      const v = this.saved.view;
      if (v?.enabled) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix(); this.saved = null;
    }
    this.obstacles.length = 0; this.obstacleKey = null;
  }
  confirmHit(power = 1) { this.hitTime = .2; this.hitStrength = THREE.MathUtils.clamp(power / 3, .35, 1); }
  showAttackingLimbs(robot) {
    const limbs = [robot.rig.armL, robot.rig.armR];
    if (robot.type === 'bolt' && robot.act) {
      if (['bk2','bk3','drill','tornado'].includes(robot.act.name)) limbs.push(robot.rig.legL);
      if (['bk1','bk3','drill','tornado'].includes(robot.act.name)) limbs.push(robot.rig.legR);
    }
    for (const limb of limbs) limb?.traverse(o => {
      if (this.hidden.has(o)) { o.layers.mask = this.hidden.get(o); this.hidden.delete(o); }
    });
  }
  hideSelf(robot, pilot) {
    // All meshes including weapons, pilot, outlines and quality-dependent bakes.
    for (const root of [robot.rig.root, pilot.rig?.root]) root?.traverse(o => {
      if (o.isMesh && !this.hidden.has(o)) { this.hidden.set(o, o.layers.mask); o.layers.disable(0); }
    });
  }
  collisionDistance(game, anchor, position, padding=.4) {
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
      p.box.copy(p.localBox).applyMatrix4(p.node.matrixWorld).expandByScalar(padding);
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
    if (this.robot !== robot) { this.restoreVisibility(); this.robot = robot; this.ready = false; this.lookPitch = this.pitch = .16; this.hitTime = 0; this.eyeY=null; }
    if (this.button) this.button.hidden = false;
    const f = robot.facing, sx = Math.sin(f), sz = Math.cos(f), root = robot.pos;
    // A seated, unanimated head-height anchor stays inside the collision body.
    // Pose head bob/recoil is cosmetic; it must not move the player's eyes.
    const height=robot.rig.eyeHeight??5.13, desiredY=root.y+height;
    if(this.eyeY===null || this.lastRoot.distanceToSquared(root)>25) this.eyeY=desiredY;
    else {
      this.eyeY+=(desiredY-this.eyeY)*(1-Math.exp(-Math.min(dt,.1)*18));
      this.eyeY=THREE.MathUtils.clamp(this.eyeY,desiredY-.45,desiredY+.3);
    }
    this.lastRoot.copy(root); this.origin.set(root.x,this.eyeY,root.z);
    this.clock += dt; this.hitTime = Math.max(0, this.hitTime - dt);
    const impact = Math.sin(this.hitTime / .2 * Math.PI) * this.hitStrength;
    let swing = 0; const act = robot.act;
    if (act && Number.isFinite(act.t)) {
      const pulse = t => { const age = act.t - t; return age >= 0 && age < .18 ? Math.sin(age / .18 * Math.PI) : 0; };
      for (const hit of act.def.hits || []) swing = Math.max(swing, pulse(hit.t0));
      for (const [t,event] of act.def.events || []) if (/^(shot[LR]|rocketFist|missile|laserOn|smash|megaSlam)$/.test(event)) swing = Math.max(swing,pulse(t));
    }
    const motion = game.reducedMotion ? 0 : 1;
    const portrait = THREE.MathUtils.clamp((1-camera.aspect)/.55,0,1);
    // Keep collision avoidance and the optional chase view from the current release.
    const forward=this.mode==='first' ? -3.2-portrait-motion*(swing*.16+impact*.12) : Math.min(robot.radius*.45,robot.rig.eyeForward??.6);
    this.anchor.set(root.x+sx*forward,this.eyeY,root.z+sz*forward);
    const safe=this.collisionDistance(game,this.origin,this.anchor,.18);
    this.anchor.copy(this.origin).addScaledVector(this.direction.set(sx,0,sz),Math.sign(forward)*Math.min(Math.abs(forward),safe));
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
      if (forward < 0 && safe > 1.5) this.showAttackingLimbs(robot);
      camera.position.copy(this.anchor);
      const shake = Math.min(.04,(game.trauma||0)**2*.06)*motion;
      camera.position.x += sz*Math.sin(this.clock*53)*shake;
      camera.position.z -= sx*Math.sin(this.clock*53)*shake;
      camera.position.y += Math.sin(this.clock*67)*shake;
      // Targets cannot pull the horizon up/down. Pitch changes only by the
      // player's explicit look gesture, at a fixed lens throughout movement.
      this.pitch=this.lookPitch-motion*(swing*.022+impact*.028);
      camera.up.set(0,1,0);
      camera.lookAt(camera.position.x+sx*20,camera.position.y-Math.tan(this.pitch)*20,camera.position.z+sz*20);
    }
    const fov=mountedFov(camera.aspect,first);
    this.contactView.update(game,robot,first);
    if(camera.fov!==fov || camera.near!==.12 || camera.view?.enabled) { camera.fov=fov;camera.near=.12;camera.clearViewOffset();camera.updateProjectionMatrix(); }
    game.trauma=Math.max(0,game.trauma-dt*1.9); game.camPos.copy(camera.position); this.ready=true; return true;
  }
}

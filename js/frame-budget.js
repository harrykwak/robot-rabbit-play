// Simulation is independent of display refresh rate and rendering quality.
// At most maxSteps ticks run per display frame so a slow device cannot fall into a
// catch-up death spiral; up to one extra tick of backlog is kept to absorb vsync jitter.
export class FixedClock {
  constructor(hz = 60, maxSteps = 2) { this.step = 1 / hz; this.maxSteps = maxSteps; this.reset(); }
  reset() { this.previous = null; this.accumulator = 0; this.dropped = 0; }
  // Fraction of the next tick already elapsed, used to interpolate rendering.
  get alpha() { return Math.min(1, Math.max(0, this.accumulator / this.step)); }
  advance(now, update) {
    if (this.previous === null) { this.previous = now; return 0; }
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    const limit = this.step * (this.maxSteps + 1);
    this.dropped += Math.max(0, elapsed - limit);
    this.accumulator += Math.min(elapsed, limit);
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      this.accumulator -= this.step; steps++;
      if (update(this.step) === false) { this.accumulator = 0; break; }
    }
    if (this.accumulator > this.step) { this.dropped += this.accumulator - this.step; this.accumulator = this.step; }
    return steps;
  }
}

// Render interpolation between the last two simulation ticks. The simulation keeps
// authoritative transforms; apply() shows a blended pose for one render and restore()
// puts the tick values back before the next tick runs. Allocation free after warm-up.
export class Interpolator {
  constructor(THREE, snapDistance = 4) {
    this.snap2 = snapDistance * snapDistance;
    this.records = new WeakMap();
    this.list = [];
    this.applied = [];
    this.tick = 0;
    this.q = new THREE.Quaternion();
    this.makeRecord = () => ({ tick: -1, parent: null, p: new THREE.Vector3(), q: new THREE.Quaternion(), cp: new THREE.Vector3(), cq: new THREE.Quaternion(), ex: 0, ey: 0, ez: 0, camera: false });
  }
  // Call before each simulation tick with every object whose motion should be smoothed.
  capture(objects) {
    this.tick++;
    this.list.length = 0;
    for (const o of objects) {
      if (!o) continue;
      let r = this.records.get(o);
      if (!r) this.records.set(o, (r = this.makeRecord()));
      r.tick = this.tick; r.parent = o.parent;
      r.p.copy(o.position); r.q.copy(o.quaternion);
      this.list.push(o);
    }
  }
  apply(alpha) {
    this.applied.length = 0;
    if (alpha >= 1) return;
    for (const o of this.list) {
      const r = this.records.get(o);
      if (!r || r.tick !== this.tick || r.parent !== o.parent) continue;
      if (r.p.distanceToSquared(o.position) > this.snap2) continue; // respawn / teleport
      r.cp.copy(o.position); r.cq.copy(o.quaternion);
      r.ex = o.rotation.x; r.ey = o.rotation.y; r.ez = o.rotation.z;
      o.position.lerpVectors(r.p, r.cp, alpha);
      o.quaternion.copy(this.q.slerpQuaternions(r.q, r.cq, alpha));
      this.applied.push(o);
    }
  }
  // Euler angles are restored exactly so yaw-only rigs never flip to an equivalent x/z=PI form.
  restore() {
    for (const o of this.applied) {
      const r = this.records.get(o);
      o.position.copy(r.cp);
      if (o.isCamera) o.quaternion.copy(r.cq); else o.rotation.set(r.ex, r.ey, r.ez);
    }
    this.applied.length = 0;
  }
  reset() { this.list.length = 0; this.applied.length = 0; this.tick++; }
}

// Game render rate. 'auto' starts at 60 everywhere and drops to 30 once for the session when
// sustained frame times miss the 60 budget; '30' and '60' are explicit. Thermal pressure caps at 30.
export class RenderBudget {
  constructor() { this.last = null; this.scale = 1; this.thermal = 0; this.capped = false; this.samples = []; this.windowStart = null; this.warm = false; }
  reset() { this.last = null; this.samples.length = 0; this.windowStart = null; this.warm = false; }
  fps(mode, selected = 'auto', mobile = false) {
    if (mode === 'paused' || mode === 'result') return 0;
    // 메뉴 전시대는 카메라가 계속 돌기 때문에 15fps 에서는 끊겨 보인다
    if (mode !== 'game') return 30;
    void mobile;
    if (this.thermal >= 2 || selected === '30') return 30;
    return selected === 'auto' && this.capped ? 30 : 60;
  }
  due(now, fps, dirty = false) {
    if (dirty || this.last === null) { this.last = now; return true; }
    if (!fps) return false;
    const interval = 1000 / fps;
    const delta = now - this.last;
    if (delta + 0.5 < interval) return false;
    this.last += Math.max(1, Math.floor((delta + .5) / interval)) * interval;
    return true;
  }
  // Returns 'fps' when auto frame rate fell back to 30, 'scale' when resolution dropped, else false.
  // One-way within a session: no oscillation between rates or resolutions.
  // hiDpi: rendering above one pixel per CSS pixel, so resolution is the cheaper thing to give up first.
  observe(interval, now, fps, adaptive, autoRate = false, hiDpi = false) {
    if ((!adaptive && !autoRate) || fps === 0) return false;
    if (this.windowStart === null) this.windowStart = now;
    if (interval > 0 && interval < 1000) this.samples.push(interval);
    if (now - this.windowStart < 3000 || this.samples.length < 20) return false;
    const sorted = this.samples.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * .9)];
    this.samples = []; this.windowStart = now;
    // The first window after a reset contains shader warm-up and the countdown; skip it.
    if (!this.warm) { this.warm = true; return false; }
    if (p90 <= (1000 / fps) * 1.45) return false;
    const canScale = adaptive && this.scale > .65;
    if (!(hiDpi && canScale) && fps > 30 && autoRate && !this.capped) { this.capped = true; return 'fps'; }
    if (!adaptive) return false;
    const old = this.scale;
    this.scale = Math.max(.65, +(this.scale - .1).toFixed(2));
    return old !== this.scale ? 'scale' : false;
  }
}

export class FrameStats {
  constructor(element) { this.element = element; this.reset(); }
  reset() { this.start = null; this.last = null; this.frames = []; this.cpu = []; this.calls = 0; this.triangles = 0; }
  record(now, cpu, calls, triangles, info) {
    if (!this.element) return;
    if (info.target === 0) {
      this.element.textContent = `${info.mode} · 정지 화면 · 연속 렌더링 0 fps · ${calls} draws (마지막 갱신)`;
      this.reset(); return;
    }
    if (this.start === null) this.start = now;
    if (this.last !== null) this.frames.push(now - this.last);
    this.last = now; this.cpu.push(cpu); this.calls = calls; this.triangles = triangles;
    if (now - this.start < 1000) return;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0;
    const fps = this.frames.length * 1000 / Math.max(1, now - this.start);
    const ms = this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length;
    this.element.textContent = `${info.mode} · ${fps.toFixed(0)} fps / ${info.target} · p95 ${p95.toFixed(1)} ms · CPU ${ms.toFixed(1)} ms · ${calls} draws · ${triangles.toLocaleString('en-US')} tris · DPR ${info.dpr.toFixed(2)} · 열 상태 ${info.thermal}`;
    this.element.dataset.fps = fps.toFixed(1);
    this.element.dataset.calls = String(calls);
    this.element.dataset.triangles = String(triangles);
    this.frames = []; this.cpu = []; this.start = now;
  }
}

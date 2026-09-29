// Simulation is independent of display refresh rate and rendering quality.
export class FixedClock {
  constructor(hz = 60, maxSteps = 5) { this.step = 1 / hz; this.maxSteps = maxSteps; this.reset(); }
  reset() { this.previous = null; this.accumulator = 0; this.dropped = 0; }
  advance(now, update) {
    if (this.previous === null) { this.previous = now; return 0; }
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    const limit = this.step * this.maxSteps;
    this.dropped += Math.max(0, elapsed - limit);
    this.accumulator += Math.min(elapsed, limit);
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      this.accumulator -= this.step; steps++;
      if (update(this.step) === false) { this.accumulator = 0; break; }
    }
    return steps;
  }
}

export class RenderBudget {
  constructor() { this.last = null; this.scale = 1; this.thermal = 0; this.samples = []; this.windowStart = null; }
  reset() { this.last = null; this.samples.length = 0; this.windowStart = null; }
  fps(mode, selected = 'auto', mobile = false) {
    if (mode === 'paused' || mode === 'result') return 0;
    if (mode !== 'game') return 15;
    if (this.thermal >= 2) return 30;
    return selected === '30' || (selected === 'auto' && mobile) ? 30 : 60;
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
  observe(interval, now, fps, adaptive) {
    if (!adaptive || fps === 0) return false;
    if (this.windowStart === null) this.windowStart = now;
    if (interval > 0 && interval < 1000) this.samples.push(interval);
    if (now - this.windowStart < 3000 || this.samples.length < 20) return false;
    const sorted = this.samples.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * .9)];
    const old = this.scale;
    // Only reduce within a match. Avoid resolution oscillation and reallocations.
    if (p90 > (1000 / fps) * 1.45) this.scale = Math.max(.65, +(this.scale - .1).toFixed(2));
    this.samples = []; this.windowStart = now;
    return old !== this.scale;
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

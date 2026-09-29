// 이펙트 시스템: 불꽃, 임팩트 플래시, 충격 링, 먼지, 폭발, 레이저, 만화 효과선
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const tV = new THREE.Vector3(), tV2 = new THREE.Vector3(), tQ = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// ---------------- 텍스처 ----------------
function makeAtlas() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  // 0: 부드러운 점
  let gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // 1: 별 모양 임팩트 플래시
  g.save(); g.translate(S * 1.5, S / 2);
  const spikes = 8;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? S * (i % 4 === 0 ? 0.5 : 0.36) : S * 0.1;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,.2)');
  g.fillStyle = gr; g.fill();
  gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
  // 2: 연기 뭉치
  g.save(); g.translate(S / 2, S * 1.5);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, r = i === 0 ? 0 : S * 0.18;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, rr = S * (i === 0 ? 0.3 : 0.2);
    gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // 3: 단단한 점 (파편)
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(S * 1.5, S * 1.5, S * 0.32, 0, Math.PI * 2); g.fill();
  gr = g.createRadialGradient(S * 1.5, S * 1.5, S * 0.3, S * 1.5, S * 1.5, S * 0.48);
  gr.addColorStop(0, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(S * 1.5, S * 1.5, S * 0.48, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return new THREE.CanvasTexture(c);
}
const ringTex = () => canvasTex((g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.35)'); gr.addColorStop(0.82, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});
const hexTex = () => canvasTex((g, S) => {
  g.translate(S / 2, S / 2);
  const hex = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  hex(S * 0.46); g.fillStyle = 'rgba(255,255,255,.25)'; g.fill();
  g.lineWidth = S * 0.05; g.strokeStyle = '#fff'; g.stroke();
  g.lineWidth = S * 0.015;
  for (let r = 0.1; r < 0.45; r += 0.12) { hex(S * r); g.stroke(); }
});
const crackTex = () => canvasTex((g, S) => {
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(40,24,12,.95)'; g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + Math.random() * 0.3, r = S * 0.06, x = Math.cos(a) * r, y = Math.sin(a) * r;
    g.lineWidth = S * 0.028;
    g.beginPath(); g.moveTo(x, y);
    while (r < S * 0.46) { r += S * rnd(0.05, 0.09); a += rnd(-0.3, 0.3); x = Math.cos(a) * r; y = Math.sin(a) * r; g.lineTo(x, y); g.lineWidth *= 0.85; }
    g.stroke();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.16);
  gr.addColorStop(0, 'rgba(40,24,12,.8)'); gr.addColorStop(1, 'rgba(40,24,12,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S * 0.16, 0, Math.PI * 2); g.fill();
}, 512);
const beamTex = () => canvasTex((g, S) => {
  const gr = g.createLinearGradient(0, 0, S, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,.6)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}, 64);
const pillarTex = () => canvasTex((g, S) => {
  const gr = g.createLinearGradient(0, S, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}, 64);

// ---------------- 파티클 시스템 (속도 방향으로 늘어나는 빌보드) ----------------
const VS = [
  'attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec3 iData;',
  'varying vec2 vUv; varying vec4 vCol;',
  'void main(){',
  '  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);',
  '  vec2 c = position.xy; float s = iData.x;',
  '  if (iData.y > 0.0) {',
  '    vec3 v = (modelViewMatrix * vec4(iVel, 0.0)).xyz; float l = length(v.xy);',
  '    vec2 d = l > 0.0001 ? v.xy / l : vec2(1.0, 0.0); vec2 n = vec2(-d.y, d.x);',
  '    float len = s + l * iData.y;',
  '    mv.xy += d * c.x * len + n * c.y * s;',
  '  } else {',
  '    float r = iData.z * 0.0; mv.xy += c * s;',
  '  }',
  '  float cell = floor(iData.z + 0.5);',
  '  vUv = (c + 0.5) * 0.5 + vec2(mod(cell, 2.0), 1.0 - floor(cell / 2.0)) * 0.5;',
  '  vCol = iCol;',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');
const FS_ADD = 'uniform sampler2D map; varying vec2 vUv; varying vec4 vCol; void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }';
const FS_NORM = 'uniform sampler2D map; varying vec2 vUv; varying vec4 vCol; void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb * t.rgb, a); }';

class Particles {
  constructor(scene, atlas, max, additive) {
    this.max = max;
    this.limit = max;
    this.n = 0;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    const mk = (size) => new THREE.InstancedBufferAttribute(new Float32Array(max * size), size).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(3); this.aVel = mk(3); this.aCol = mk(4); this.aData = mk(3);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iVel', this.aVel); geo.setAttribute('iCol', this.aCol); geo.setAttribute('iData', this.aData);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas } }, vertexShader: VS, fragmentShader: additive ? FS_ADD : FS_NORM,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    });
    if (additive) { mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; mat.blendEquation = THREE.AddEquation; }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 5 : 4;
    scene.add(this.mesh);
    // CPU 상태
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 3);
    this.s = new Float32Array(max * 2); this.life = new Float32Array(max * 2);
    this.phys = new Float32Array(max * 4); // gravity, drag, stretch, tex
    this.flags = new Uint8Array(max); // 1: 실시간, 2: 바닥 튕김, 4: 페이드인
  }
  // opts 없이 인자로 받아 할당 없이 처리
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, r1, g1, b1, grav, drag, stretch, tex, flags) {
    if (this.n >= this.limit) return;
    const i = this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c0[i4] = r; this.c0[i4 + 1] = g; this.c0[i4 + 2] = b; this.c0[i4 + 3] = a;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.s[i * 2] = s0; this.s[i * 2 + 1] = s1;
    this.life[i * 2] = 0; this.life[i * 2 + 1] = life;
    this.phys[i4] = grav; this.phys[i4 + 1] = drag; this.phys[i4 + 2] = stretch; this.phys[i4 + 3] = tex;
    this.flags[i] = flags;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    // 파티클이 죽을 때마다 불리므로 클로저를 만들지 않고 copyWithin 으로 옮긴다
    const i3 = i * 3, j3 = j * 3, i4 = i * 4, j4 = j * 4;
    this.p.copyWithin(i3, j3, j3 + 3); this.v.copyWithin(i3, j3, j3 + 3); this.c1.copyWithin(i3, j3, j3 + 3);
    this.c0.copyWithin(i4, j4, j4 + 4); this.phys.copyWithin(i4, j4, j4 + 4);
    this.s[i * 2] = this.s[j * 2]; this.s[i * 2 + 1] = this.s[j * 2 + 1];
    this.life[i * 2] = this.life[j * 2]; this.life[i * 2 + 1] = this.life[j * 2 + 1];
    this.flags[i] = this.flags[j];
  }
  update(dt, realDt) {
    const P = this.p, Vv = this.v;
    for (let i = this.n - 1; i >= 0; i--) {
      const f = this.flags[i];
      const d = f & 1 ? realDt : dt;
      const L = (this.life[i * 2] += d);
      if (L >= this.life[i * 2 + 1]) { this.kill(i); continue; }
      const i3 = i * 3, i4 = i * 4;
      const drag = Math.exp(-this.phys[i4 + 1] * d);
      Vv[i3] *= drag; Vv[i3 + 1] = Vv[i3 + 1] * drag - this.phys[i4] * d; Vv[i3 + 2] *= drag;
      P[i3] += Vv[i3] * d; P[i3 + 1] += Vv[i3 + 1] * d; P[i3 + 2] += Vv[i3 + 2] * d;
      if (f & 2 && P[i3 + 1] < 0.05 && P[i3] * P[i3] + P[i3 + 2] * P[i3 + 2] < 576) { P[i3 + 1] = 0.05; Vv[i3 + 1] = Math.abs(Vv[i3 + 1]) * 0.35; Vv[i3] *= 0.6; Vv[i3 + 2] *= 0.6; }
    }
    const aP = this.aPos.array, aV = this.aVel.array, aC = this.aCol.array, aD = this.aData.array;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4;
      const t = this.life[i * 2] / this.life[i * 2 + 1];
      aP[i3] = P[i3]; aP[i3 + 1] = P[i3 + 1]; aP[i3 + 2] = P[i3 + 2];
      aV[i3] = Vv[i3]; aV[i3 + 1] = Vv[i3 + 1]; aV[i3 + 2] = Vv[i3 + 2];
      const ct = Math.min(1, t * 1.6);
      aC[i4] = this.c0[i4] + (this.c1[i3] - this.c0[i4]) * ct;
      aC[i4 + 1] = this.c0[i4 + 1] + (this.c1[i3 + 1] - this.c0[i4 + 1]) * ct;
      aC[i4 + 2] = this.c0[i4 + 2] + (this.c1[i3 + 2] - this.c0[i4 + 2]) * ct;
      let fade = 1 - t;
      if (this.flags[i] & 4) fade *= Math.min(1, t * 8);
      aC[i4 + 3] = this.c0[i4 + 3] * fade * (2 - fade);
      aD[i3] = this.s[i * 2] + (this.s[i * 2 + 1] - this.s[i * 2]) * (1 - (1 - t) * (1 - t));
      aD[i3 + 1] = this.phys[i4 + 2];
      aD[i3 + 2] = this.phys[i4 + 3];
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aData.needsUpdate = true;
    this.aPos.clearUpdateRanges(); this.aVel.clearUpdateRanges(); this.aCol.clearUpdateRanges(); this.aData.clearUpdateRanges();
    this.aPos.addUpdateRange(0, this.n * 3); this.aVel.addUpdateRange(0, this.n * 3); this.aCol.addUpdateRange(0, this.n * 4); this.aData.addUpdateRange(0, this.n * 3);
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

// ---------------- FX ----------------
export class FX {
  constructor(scene, camera, overlay) {
    this.scene = scene;
    this.camera = camera;
    const atlas = makeAtlas();
    this.add = new Particles(scene, atlas, 5000, true);
    this.smoke = new Particles(scene, atlas, 1800, false);
    this.tex = { ring: ringTex(), hex: hexTex(), crack: crackTex(), beam: beamTex(), pillar: pillarTex() };
    // 링 풀
    this.rings = [];
    const plane = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.tex.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 6;
      m.frustumCulled = false;
      scene.add(m);
      this.rings.push({ m, on: false });
    }
    // 파편
    this.debrisMax = 220;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.debrisMax);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.count = 0;
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    this.debris.setColorAt(0, new THREE.Color());
    scene.add(this.debris);
    this.dList = [];
    this.dObj = new THREE.Object3D();
    // 조명 풀 (런타임에 추가/삭제하지 않음)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 26, 1.6);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.lightIdx = 0;
    this.lightsOn = true;
    this.density = 1; // 장식용 파티클 개수 배율 (절전 화질에서 줄인다)
    this.smokeSize = 1; // 연기 빌보드 크기 배율 (면적 = 제곱, 오버드로 감소)
    this.low = false;
    this.dPool = [];
    this.active = [];
    // 오버레이
    this.ov = overlay;
    this.ctx = overlay.getContext('2d');
    this.lines = null;
    this.impact = 0;
    this.ovDirty = false;
    this.overlayDpr = 2;
    const rs = () => {
      const d = Math.min(devicePixelRatio || 1, this.overlayDpr);
      const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
      if (overlay.width !== w) overlay.width = w;
      if (overlay.height !== h) overlay.height = h;
    };
    rs();
    this.resizeOverlay = rs;
    this.onResize = rs;
    addEventListener('resize', rs);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    this.pillarGeo.translate(0, 0.5, 0);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.tmpC = new THREE.Color();
  }

  setQuality(low) {
    low = !!low;
    this.low = low;
    this.add.limit = low ? 1400 : this.add.max;
    this.smoke.limit = low ? 500 : this.smoke.max;
    this.debrisBudget = low ? 70 : this.debrisMax;
    if (this.dList.length > this.debrisBudget) this.recycleDebris(this.dList.splice(0, this.dList.length - this.debrisBudget));
    this.density = low ? 0.5 : 1;
    this.smokeSize = low ? 0.75 : 1;
    // 점광원 3개는 모든 조명 재질의 프래그먼트 셰이더에서 매 픽셀 계산된다 (세기 0 이어도).
    // 절전에서는 숨겨서 셰이더의 점광원 수를 0 으로 만든다. 전환 순간 한 번만 셰이더가 다시 컴파일된다.
    const on = !low;
    if (this.lightsOn !== on) {
      this.lightsOn = on;
      for (const L of this.lights) { L.l.visible = on; L.l.intensity = 0; L.peak = 0; }
    }
    const dpr = low ? 1 : 2;
    if (this.overlayDpr !== dpr) { this.overlayDpr = dpr; this.resizeOverlay(); }
    return this;
  }

  // 장식용 개수: 절전에서는 줄이되 최소 1 개는 남긴다
  q(n) { return this.density === 1 ? n : Math.max(1, Math.round(n * this.density)); }

  recycleDebris(list) { for (const d of list) this.dPool.push(d); }

  ring(pos, normal, r0, r1, dur, color, alpha = 1, opt = {}) {
    let slot = null;
    for (const r of this.rings) if (!r.on) { slot = r; break; }
    if (!slot) return null;
    slot.on = true;
    const m = slot.m;
    m.visible = true;
    m.material.map = opt.map || this.tex.ring;
    m.material.blending = opt.normal ? THREE.NormalBlending : THREE.AdditiveBlending;
    const col = this.tmpC.set(color);
    const k = opt.normal ? 1 : 2.2;
    m.material.color.setRGB(col.r * k, col.g * k, col.b * k);
    m.material.opacity = alpha;
    m.position.copy(pos);
    if (normal) m.quaternion.setFromUnitVectors(Z, tV.copy(normal).normalize());
    else m.quaternion.setFromUnitVectors(Z, Y);
    if (opt.spin) m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(Math.max(0.01, r0));
    Object.assign(slot, { t: 0, dur, r0, r1, alpha, real: !!opt.real, hold: opt.hold || 0, pulse: opt.pulse || 0, delay: opt.delay || 0 });
    if (slot.delay > 0) m.visible = false;
    return slot;
  }

  flashLight(pos, color, intensity, dur) {
    if (!this.lightsOn) return;
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos);
    L.l.position.y += 1;
    L.l.color.set(color);
    L.peak = intensity; L.t = 0; L.dur = dur;
    L.l.intensity = intensity;
  }

  spawnDebris(pos, n, speed, color, size) {
    const c = this.tmpC.set(color);
    n = this.q(n);
    for (let i = 0; i < n; i++) {
      if (this.dList.length >= (this.debrisBudget || this.debrisMax)) this.dPool.push(this.dList.shift());
      const a = Math.random() * Math.PI * 2;
      const s = speed * rnd(0.4, 1);
      // 조각 객체를 재사용해 폭발마다 Vector3/Euler/Color 할당이 생기지 않게 한다
      const d = this.dPool.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, life: 0, t: 0, c: new THREE.Color() };
      d.p.copy(pos);
      d.v.set(Math.cos(a) * s, rnd(0.5, 1.3) * speed, Math.sin(a) * s);
      d.r.set(Math.random() * 3, Math.random() * 3, 0);
      d.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
      d.s = size * rnd(0.5, 1.2); d.life = rnd(0.9, 1.6); d.t = 0;
      d.c.setRGB(c.r * rnd(0.7, 1), c.g * rnd(0.7, 1), c.b * rnd(0.7, 1));
      this.dList.push(d);
    }
  }

  // ======== 공개 API ========
  hit(pos, dir, power = 0, color = 0xffffff) {
    const P = Math.max(0, Math.min(3, power | 0));
    const A = this.add;
    const col = this.tmpC.set(color);
    const cr = col.r, cg = col.g, cb = col.b;
    const x = pos.x, y = pos.y, z = pos.z;
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    const k = 1 + P * 0.55;
    // 별 모양 백열 플래시
    const star = [1.6, 2.6, 4.2, 6.2][P];
    A.spawn(x, y, z, 0, 0, 0, [0.08, 0.1, 0.13, 0.17][P], star, star * 1.2, 3.2, 3, 2.6, 1, 2.4, 1.8, 1.2, 0, 0, 0, 1, 1);
    A.spawn(x, y, z, 0, 0, 0, [0.12, 0.15, 0.2, 0.25][P], star * 0.6, star * 1.3, cr * 2.4, cg * 2.4, cb * 2.4, 0.8, cr, cg, cb, 0, 0, 0, 1, 1);
    A.spawn(x, y, z, 0, 0, 0, 0.16 + P * 0.03, star * 0.9, star * 1.3, 1.6, 1.3, 1, 0.45, cr, cg, cb, 0, 0, 0, 0, 1);
    // 방향성 스트릭 불꽃
    const n = this.q([12, 20, 30, 46][P]);
    for (let i = 0; i < n; i++) {
      const sp = rnd(8, 26) * k;
      const sx = rnd(-1, 1), sy = rnd(-0.6, 1), sz = rnd(-1, 1);
      const along = rnd(0.45, 1);
      const vx = dx * sp * along + sx * sp * 0.55, vy = dy * sp * along + sy * sp * 0.5 + 2, vz = dz * sp * along + sz * sp * 0.55;
      const hot = Math.random() < 0.6;
      A.spawn(x, y, z, vx, vy, vz, rnd(0.18, 0.42) * (1 + P * 0.15), 0.08 * k, 0.03 * k, hot ? 4 : cr * 3.2, hot ? 3.4 : cg * 3.2, hot ? 2.2 : cb * 3.2, 1, cr * 2.2, cg * 1.6, cb * 1.2, 22, 3.2, 0.045, 0, 0);
    }
    // 색 파편 점
    for (let i = 0, nd = this.q(6 + P * 6); i < nd; i++) {
      const sp = rnd(4, 12) * k;
      A.spawn(x, y, z, rnd(-1, 1) * sp + dx * sp * 0.6, rnd(0, 1.2) * sp, rnd(-1, 1) * sp + dz * sp * 0.6, rnd(0.3, 0.6), 0.14 * k, 0.05, cr * 2.5, cg * 2.5, cb * 2.5, 1, cr, cg, cb, 26, 1.5, 0, 3, 2);
    }
    // 충격 링 (타격 방향에 수직)
    const nrm = tV2.set(dx, dy, dz);
    if (nrm.lengthSq() < 0.01) nrm.set(0, 1, 0);
    this.ring(pos, nrm, 0.2, [1.3, 2.2, 3.6, 5.8][P], [0.16, 0.2, 0.26, 0.32][P], 0xffffff, 1, { real: true });
    if (P >= 1) this.ring(pos, nrm, 0.1, [0, 1.4, 2.4, 3.8][P], 0.24, color, 0.9, { real: true, delay: 0.03 });
    if (P >= 2) {
      this.ring(tV.set(x, Math.max(0.1, y * 0.2), z), null, 0.3, 3 + P, 0.35, color, 0.7);
      this.spawnDebris(pos, 4 + P * 3, 7 + P * 2, P >= 3 ? 0xd8dde6 : color, 0.18 + P * 0.05);
      if (y < 4) this.dust(tV.set(x, 0, z), 4 + P * 2, 0.8 + P * 0.3);
    }
    if (P >= 1) this.flashLight(pos, color === 0xffffff ? 0xfff0d0 : color, [0, 8, 18, 34][P], 0.14 + P * 0.04);
  }

  guard(pos, dir) {
    const A = this.add;
    const nrm = tV2.copy(dir || Y).negate();
    this.ring(pos, nrm, 0.9, 1.6, 0.22, 0x66f6ff, 1, { map: this.tex.hex, real: true });
    this.ring(pos, nrm, 0.3, 2.2, 0.2, 0x9ff8ff, 0.8, { real: true });
    A.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.1, 1.4, 1.9, 2.2, 3.6, 4, 1, 0.5, 1.5, 2, 0, 0, 0, 1, 1);
    for (let i = 0, ng = this.q(10); i < ng; i++) {
      const sp = rnd(6, 14);
      A.spawn(pos.x, pos.y, pos.z, (-dir.x + rnd(-0.8, 0.8)) * sp, rnd(0, 1) * sp, (-dir.z + rnd(-0.8, 0.8)) * sp, rnd(0.15, 0.3), 0.07, 0.02, 2.5, 3.6, 4, 1, 0.4, 1.2, 2, 18, 3, 0.04, 0, 0);
    }
  }

  dust(pos, count = 8, scale = 1) {
    const S = this.smoke;
    const z = this.smokeSize;
    for (let i = 0, n = this.q(count); i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5 * scale;
      const sp = rnd(1.5, 4.5) * scale;
      const g = rnd(0.82, 0.96);
      S.spawn(pos.x + Math.cos(a) * r, pos.y + 0.15 + Math.random() * 0.3 * scale, pos.z + Math.sin(a) * r, Math.cos(a) * sp, rnd(0.5, 2) * scale, Math.sin(a) * sp, rnd(0.45, 0.8), 0.45 * scale * z, 1.5 * scale * z, g * 0.92, g * 0.84, g * 0.7, 0.55, g * 0.85, g * 0.78, g * 0.66, -0.6, 3.2, 0, 2, 4);
    }
  }

  shockwave(pos, radius, color = 0xffd27a, duration = 0.5) {
    const p = tV.set(pos.x, (pos.y || 0) + 0.12, pos.z);
    this.ring(p, null, 0.3, radius, duration, color, 1);
    this.ring(p, null, 0.2, radius * 0.7, duration * 0.8, 0xffffff, 0.8, { delay: 0.05 });
    this.ring(tV.set(pos.x, 0.06, pos.z), null, radius * 0.45, radius * 0.5, 1.4, 0xffffff, 0.85, { map: this.tex.crack, normal: true, spin: true, hold: 0.8 });
    const S = this.smoke;
    // 링(범위 표시)은 그대로 두고 흙먼지 개수와 크기만 줄인다
    const n = this.q(Math.ceil(Math.min(36, 10 + radius * 2.5)));
    const z = this.smokeSize;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = (radius / duration) * rnd(0.5, 0.8);
      const g = rnd(0.85, 0.97);
      S.spawn(pos.x + Math.cos(a) * 0.6, 0.3, pos.z + Math.sin(a) * 0.6, Math.cos(a) * sp, rnd(0.5, 2), Math.sin(a) * sp, rnd(0.6, 1), 0.8 * z, (2 + radius * 0.1) * z, g * 0.92, g * 0.84, g * 0.7, 0.6, g * 0.85, g * 0.78, g * 0.66, 0, 4, 0, 2, 4);
    }
  }

  explosion(pos, scale = 1) {
    const A = this.add, S = this.smoke;
    const x = pos.x, y = pos.y, z = pos.z;
    A.spawn(x, y, z, 0, 0, 0, 0.14, 4 * scale, 6 * scale, 3, 2.4, 1.6, 1, 2, 1, 0.3, 0, 0, 0, 1, 1);
    const zs = this.smokeSize;
    for (let i = 0, n = this.q(Math.ceil(16 * scale + 4)); i < n; i++) {
      const sp = rnd(2, 8) * scale;
      const vx = rnd(-1, 1), vy = rnd(-0.3, 1), vz = rnd(-1, 1);
      A.spawn(x + vx * 0.5 * scale, y + vy * 0.5 * scale, z + vz * 0.5 * scale, vx * sp, vy * sp + 2, vz * sp, rnd(0.35, 0.65), rnd(1, 1.7) * scale, rnd(2.2, 3) * scale, 2.2, 1.3, 0.4, 0.9, 1, 0.2, 0.05, -2, 3, 0, 0, 0);
    }
    for (let i = 0, n = this.q(Math.ceil(12 * scale + 4)); i < n; i++) {
      const sp = rnd(1, 4) * scale, a = Math.random() * Math.PI * 2;
      const g = rnd(0.18, 0.3);
      S.spawn(x + Math.cos(a) * scale, y + rnd(0, 1) * scale, z + Math.sin(a) * scale, Math.cos(a) * sp, rnd(1, 4) * scale, Math.sin(a) * sp, rnd(1, 1.7), 1.5 * scale * zs, 4.2 * scale * zs, g, g, g, 0.8, g * 1.6, g * 1.5, g * 1.4, -1.5, 1.6, 0, 2, 4);
    }
    for (let i = 0, n = this.q(Math.ceil(24 * scale)); i < n; i++) {
      const sp = rnd(10, 26) * scale;
      A.spawn(x, y, z, rnd(-1, 1) * sp, rnd(-0.2, 1) * sp, rnd(-1, 1) * sp, rnd(0.25, 0.5), 0.1 * scale + 0.04, 0.03, 4, 2.8, 1.2, 1, 2, 0.6, 0.1, 20, 2.5, 0.04, 0, 0);
    }
    this.ring(tV.set(x, y, z), null, 0.5, 5 * scale, 0.35, 0xffb060, 1);
    this.ring(tV.set(x, y, z), tV2.set(0.2, 1, 0.4), 0.5, 4 * scale, 0.3, 0xffffff, 0.8);
    this.spawnDebris(pos, Math.round(6 * scale + 2), 10 * scale, 0x5a5a66, 0.2 + 0.1 * scale);
    this.flashLight(pos, 0xff9a40, 36 * scale, 0.35);
  }

  thruster(pos, dir, scale = 1) {
    const sp = 11 * scale;
    this.add.spawn(pos.x + rnd(-0.1, 0.1) * scale, pos.y, pos.z + rnd(-0.1, 0.1) * scale, dir.x * sp + rnd(-1, 1), dir.y * sp + rnd(-1, 1), dir.z * sp + rnd(-1, 1), rnd(0.12, 0.22), 0.55 * scale, 0.12 * scale, 2.4, 3, 4, 1, 0.3, 0.6, 2.4, 0, 4, 0.02, 0, 0);
    if (Math.random() < 0.18 * this.density) {
      const g = rnd(0.7, 0.9);
      this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * sp * 0.5, dir.y * sp * 0.5 + 1, dir.z * sp * 0.5, rnd(0.4, 0.7), 0.4 * scale, 1.4 * scale, g, g, g, 0.35, g, g, g, -1, 3, 0, 2, 4);
    }
  }

  beam(from, to, width = 0.8, color = 0xff66cc, duration = 1.2) {
    const col = new THREE.Color(color);
    const mk = (c, op) => {
      const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.frustumCulled = false;
      m.renderOrder = 7;
      this.scene.add(m);
      return m;
    };
    const core = mk(new THREE.Color(4, 3.6, 3.8), 1);
    const glow = mk(new THREE.Color(col.r * 3, col.g * 3, col.b * 3), 0.45);
    const A = this.add;
    const st = { from: from.clone(), to: to.clone(), t: 0, alive: true };
    const self = this;
    const place = () => {
      const d = tV.subVectors(st.to, st.from);
      const len = d.length() || 0.01;
      tQ.setFromUnitVectors(Y, d.divideScalar(len));
      const flick = 1 + Math.sin(st.t * 70) * 0.12 + Math.random() * 0.1;
      const grow = Math.min(1, st.t * 8);
      for (const [m, w] of [[core, width * 0.35], [glow, width]]) {
        m.position.copy(st.from); m.quaternion.copy(tQ);
        m.scale.set(w * flick * grow, len, w * flick * grow);
      }
    };
    const eff = {
      update(dt, real) {
        st.t += real;
        if (!st.alive || st.t > duration) { self.scene.remove(core, glow); core.material.dispose(); glow.material.dispose(); return false; }
        place();
        const e = st.to, o = st.from;
        A.spawn(e.x, e.y, e.z, 0, 0, 0, 0.06, width * 3.2, width * 4, 4, 3, 3.6, 0.9, col.r * 2, col.g * 2, col.b * 2, 0, 0, 0, 1, 1);
        A.spawn(o.x, o.y, o.z, 0, 0, 0, 0.05, width * 2, width * 2.4, 4, 3.6, 4, 0.8, col.r, col.g, col.b, 0, 0, 0, 0, 1);
        for (let i = 0, nb = self.q(3); i < nb; i++) { const sp = rnd(6, 16); A.spawn(e.x, e.y + 0.2, e.z, rnd(-1, 1) * sp, rnd(0.2, 1.2) * sp, rnd(-1, 1) * sp, rnd(0.2, 0.4), 0.09, 0.03, 4, 3, 3.5, 1, col.r * 2, col.g, col.b * 2, 20, 2, 0.05, 0, 2); }
        if (Math.random() < 0.3 * self.density) self.ring(tV2.set(e.x, Math.max(0.1, e.y), e.z), null, 0.3, width * 3, 0.2, color, 0.8);
        return true;
      },
    };
    place();
    this.active.push(eff);
    return { set(f, t) { st.from.copy(f); st.to.copy(t); }, stop() { st.alive = false; },
      snapshot() { return st.alive && st.t <= duration ? { from: st.from.toArray(), to: st.to.toArray(), width, color } : null; } };
  }

  pillar(pos, color = 0xffa040, duration = 1.8) {
    const col = new THREE.Color(color);
    const m = new THREE.Mesh(this.pillarGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col.r * 2.4, col.g * 2.4, col.b * 2.4), map: this.tex.pillar, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, pos.y, pos.z);
    m.frustumCulled = false;
    m.renderOrder = 6;
    this.scene.add(m);
    const inner = new THREE.Mesh(this.pillarGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), map: this.tex.pillar, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.add(inner);
    inner.scale.set(0.35, 1, 0.35);
    const base = pos.clone();
    let t = 0;
    const self = this;
    this.ring(tV.set(pos.x, pos.y + 0.1, pos.z), null, 0.5, 4, 0.5, color, 1);
    this.active.push({
      update(dt, real) {
        t += real;
        if (t > duration) { self.scene.remove(m); m.material.dispose(); inner.material.dispose(); return false; }
        const u = t / duration;
        const w = (u < 0.1 ? u / 0.1 : 1) * (1.6 - u * 0.9) * (1 + Math.sin(t * 40) * 0.06);
        m.scale.set(w, 70, w);
        m.material.opacity = 1 - u * u;
        inner.material.opacity = 1 - u;
        if (Math.random() < 0.8 * self.density) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
          self.add.spawn(base.x + Math.cos(a) * r, base.y + Math.random() * 2, base.z + Math.sin(a) * r, 0, rnd(6, 14), 0, rnd(0.5, 1), 0.3, 0.05, col.r * 3, col.g * 3, col.b * 3, 1, 3, 3, 3, -2, 0.5, 0.03, 1, 0);
        }
        return true;
      },
    });
  }

  targetMarker(pos, radius, duration) {
    const p = pos.clone();
    p.y = Math.max(0.08, p.y);
    const outer = this.ring(p, null, radius, radius, duration, 0xff5030, 0.9, { pulse: 1 });
    const inner = this.ring(p, null, radius * 1.4, 0.2, duration, 0xffc040, 1);
    if (outer) outer.hold = duration;
  }

  sparkle(pos, color = 0xffe066) {
    const c = this.tmpC.set(color);
    for (let i = 0, n = this.q(16); i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = rnd(2, 5);
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, rnd(1, 5), Math.sin(a) * sp, rnd(0.4, 0.8), 0.45, 0.05, c.r * 3, c.g * 3, c.b * 3, 1, 3, 3, 3, 4, 2, 0, 1, 1);
    }
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.25, 1.5, 2.5, c.r * 2, c.g * 2, c.b * 2, 0.8, c.r, c.g, c.b, 0, 0, 0, 0, 1);
  }

  trailPuff(pos, color = 0xffffff, size = 0.5) {
    const c = this.tmpC.set(color);
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0.3, 0, 0.25, size, size * 0.3, c.r * 1.3, c.g * 1.3, c.b * 1.3, 0.5, c.r * 0.5, c.g * 0.5, c.b * 0.5, 0, 0, 0, 0, 0);
  }

  speedLines(strength = 1, cx = 0.5, cy = 0.5) {
    if (this.reducedMotion) return;
    if (strength <= 0) return;
    if (this.lines && this.lines.s > strength && this.lines.t < 0.15) return;
    this.lines = { s: strength, cx, cy, t: 0 };
  }

  impactFrame(strength = 1) { if (this.reducedMotion) return; this.impact = Math.max(this.impact, 0.12 * Math.min(2.5, strength)); this.impactS = strength; }

  clear() {
    this.add.clear(); this.smoke.clear();
    for (const r of this.rings) { r.on = false; r.m.visible = false; }
    for (const e of this.active) { if (e.kill) e.kill(); }
    for (const e of this.active) e.update(0, 1e6);
    this.active = [];
    this.recycleDebris(this.dList); this.dList = []; this.debris.count = 0;
    // peak 도 지워야 다음 update 에서 꺼진 조명이 남은 수명만큼 다시 켜지지 않는다
    for (const L of this.lights) { L.l.intensity = 0; L.peak = 0; }
    this.lines = null; this.impact = 0;
    this.ctx.clearRect(0, 0, this.ov.width, this.ov.height);
  }

  update(dt, realDt = dt) {
    this.add.update(dt, realDt);
    this.smoke.update(dt, realDt);
    for (const r of this.rings) {
      if (!r.on) continue;
      const d = r.real ? realDt : dt;
      if (r.delay > 0) { r.delay -= d; if (r.delay <= 0) r.m.visible = true; else continue; }
      r.t += d;
      const total = r.dur + r.hold;
      if (r.t >= total) { r.on = false; r.m.visible = false; continue; }
      const u = Math.min(1, r.t / r.dur);
      const e = 1 - Math.pow(1 - u, 3);
      let s = r.r0 + (r.r1 - r.r0) * e;
      if (r.pulse) s *= 1 + Math.sin(r.t * 18) * 0.05;
      r.m.scale.setScalar(Math.max(0.01, s));
      const fu = r.hold > 0 ? Math.max(0, (r.t - r.dur) / r.hold) : u;
      r.m.material.opacity = r.alpha * (r.hold > 0 ? 1 - fu : (1 - u) * (1 - u) * 0.6 + (1 - u) * 0.4);
    }
    for (let i = this.active.length - 1; i >= 0; i--) if (!this.active[i].update(dt, realDt)) this.active.splice(i, 1);
    for (const L of this.lights) {
      if (L.peak <= 0) continue;
      L.t += realDt;
      const u = L.t / L.dur;
      if (u >= 1) { L.l.intensity = 0; L.peak = 0; } else L.l.intensity = L.peak * (1 - u) * (1 - u);
    }
    // 파편
    const D = this.dList, o = this.dObj;
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.t += dt;
      if (d.t > d.life) { this.dPool.push(D[i]); D.splice(i, 1); continue; }
      d.v.y -= 30 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s * 0.5 && d.p.x * d.p.x + d.p.z * d.p.z < 576) { d.p.y = d.s * 0.5; d.v.y = Math.abs(d.v.y) * 0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
    }
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      o.position.copy(d.p); o.rotation.copy(d.r);
      o.scale.setScalar(d.s * Math.min(1, (d.life - d.t) * 4));
      o.updateMatrix();
      this.debris.setMatrixAt(i, o.matrix);
      this.debris.setColorAt(i, d.c);
    }
    this.debris.count = D.length;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    this.drawOverlay(realDt);
  }

  drawOverlay(dt) {
    const c = this.ctx, W = this.ov.width, H = this.ov.height;
    const on = this.lines || this.impact > 0;
    if (!on) { if (this.ovDirty) { c.clearRect(0, 0, W, H); this.ovDirty = false; } return; }
    c.clearRect(0, 0, W, H);
    this.ovDirty = true;
    if (this.impact > 0) {
      const s = this.impactS || 1;
      const k = Math.min(1, this.impact / 0.12);
      if (this.impact > 0.07) {
        c.fillStyle = 'rgba(255,255,255,' + Math.min(0.18, 0.1 * s).toFixed(3) + ')';
        c.fillRect(0, 0, W, H);
      }
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,6,20,' + (0.7 * k).toFixed(3) + ')');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      this.impact -= dt;
    }
    const L = this.lines;
    if (L) {
      L.t += dt;
      const life = 0.35 + L.s * 0.05;
      if (L.t > life) { this.lines = null; return; }
      const u = L.t / life;
      const cx = L.cx * W, cy = L.cy * H;
      const R = Math.hypot(W, H);
      const inner = Math.min(W, H) * (0.16 + u * 0.12);
      const n = Math.round(26 + L.s * 16);
      c.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - u)).toFixed(3) + ')';
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const w = (0.003 + Math.random() * 0.008) * Math.max(1, L.s);
        const r0 = inner + Math.min(W, H) * (0.12 + Math.random() * 0.3);
        c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        c.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
        c.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
        c.closePath();
      }
      c.fill();
    }
  }
}

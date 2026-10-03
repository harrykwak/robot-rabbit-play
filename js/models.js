// 절차적 캐릭터 모델: 치비 파일럿과 토끼 로봇. 툰 셰이딩 + 역 헐 아웃라인
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bakeVertexColored, renderStats } from './model-quality.js';
import { pilotSurface, pilotCape } from './pilot-sculpt.js';
const sculpt = part => G('pilot-'+part, () => pilotSurface(part), () => pilotSurface(part,true));

// ---------------- 품질 설정 ----------------
// low: 아웃라인(역 헐) 드로우 제거 + 저분할 지오메트리 + 본(그룹)별 정적 파트 병합
let lowQuality = false;
export function setModelQuality(low) { lowQuality = !!low; }
export function getModelQuality() { return lowQuality ? 'low' : 'high'; }
export const modelRenderStats = renderStats;

// 기존 리그/아이템(미리보기, 게임 씬 등)에 품질을 적용한다. 반복 호출해도 결과가 같다.
export function applyModelQuality(root, low) {
  if (!root) return;
  low = !!low;
  const models = [], outlines = [];
  root.traverse((o) => {
    if (o.userData.rrModel) models.push(o.userData.rrModel);
    if (o.userData.rrOutline) outlines.push(o);
  });
  for (const m of models) m.setLow(low);
  for (const o of outlines) o.visible = !low;
}

// ---------------- 공용 리소스 ----------------
const grad = (() => {
  const d = new Uint8Array([70, 150, 215, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const geoCache = new Map();
const lowMakers = new WeakMap();
const lowCache = new WeakMap();
function G(key, make, makeLow) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    if (makeLow) lowMakers.set(g, makeLow);
    geoCache.set(key, g);
  }
  return g;
}
// 공유 캐시 지오메트리의 저분할 버전 (역시 공유 캐시, 리그가 해제하지 않음)
function lowGeo(g) {
  let l = lowCache.get(g);
  if (!l) {
    const make = lowMakers.get(g);
    l = make ? make() : g;
    lowCache.set(g, l);
  }
  return l;
}
const half = (s, min) => Math.min(s, Math.max(min, Math.ceil(s / 2)));
const rbox = (w, h, d, r = Math.min(w, h, d) * 0.22) => G('rb' + [w, h, d, r].map((v) => v.toFixed(3)).join(','), () => new RoundedBoxGeometry(w, h, d, 2, r), () => new RoundedBoxGeometry(w, h, d, 1, r));
const box = (w, h, d) => G('bx' + [w, h, d].join(','), () => new THREE.BoxGeometry(w, h, d));
const sph = (r, ws = 16, hs = 12) => G('sp' + r + ',' + ws, () => new THREE.SphereGeometry(r, ws, hs), () => new THREE.SphereGeometry(r, half(ws, 6), half(hs, 4)));
const cyl = (rt, rb, h, s = 14) => G('cy' + [rt, rb, h, s].join(','), () => new THREE.CylinderGeometry(rt, rb, h, s), () => new THREE.CylinderGeometry(rt, rb, h, half(s, 6)));
const cone = (r, h, s = 12) => G('co' + [r, h, s].join(','), () => new THREE.ConeGeometry(r, h, s), () => new THREE.ConeGeometry(r, h, half(s, 5)));
const caps = (r, l) => G('ca' + r + ',' + l, () => new THREE.CapsuleGeometry(r, l, 4, 12), () => new THREE.CapsuleGeometry(r, l, 2, 8));
const torus = (r, t) => G('to' + r + ',' + t, () => new THREE.TorusGeometry(r, t, 8, 24), () => new THREE.TorusGeometry(r, t, 5, 12));
// Flat stitched insignia: a readable rabbit shape, with no texture or extra material in low mode.
const rabbitPatch = () => G('rabbitPatch', () => {
  const s = new THREE.Shape();
  s.moveTo(-0.055, 0.005);
  s.bezierCurveTo(-0.09, -0.075, 0.09, -0.075, 0.055, 0.005);
  s.lineTo(0.064, 0.095); s.quadraticCurveTo(0.04, 0.128, 0.022, 0.085);
  s.lineTo(0.01, 0.025); s.lineTo(-0.01, 0.025);
  s.lineTo(-0.022, 0.085); s.quadraticCurveTo(-0.04, 0.128, -0.064, 0.095);
  s.closePath();
  return new THREE.ShapeGeometry(s, 5);
});

const outlineMats = new Map();
function outlineMat(w) {
  let m = outlineMats.get(w);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: 0x0b0d18, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(4) + ';');
  };
  m.customProgramCacheKey = () => 'ol' + w;
  outlineMats.set(w, m);
  return m;
}
// 아웃라인은 항상 만들어 두고 품질에 따라 보이기만 전환한다
function addOutline(mesh, mat, low = lowQuality) {
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.castShadow = false;
  o.userData.rrOutline = true;
  o.visible = !low;
  mesh.add(o);
  return o;
}
// 작은 아이템용: 병합 없이 메시 지오메트리만 저분할/원본으로 전환
function tagSwap(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.rrOutline) meshes.push(o); });
  let cur = false;
  root.userData.rrModel = {
    setLow(low) {
      low = !!low;
      if (low === cur) return;
      cur = low;
      for (const m of meshes) {
        if (!m.userData.rrHigh) m.userData.rrHigh = m.geometry;
        m.geometry = low ? lowGeo(m.userData.rrHigh) : m.userData.rrHigh;
      }
    },
  };
  if (lowQuality) root.userData.rrModel.setLow(true);
  return root;
}

// 리그마다 재질을 따로 가진다 (피격 플래시용)
class Kit {
  constructor(outline, plush = false) {
    this.plush = plush;
    this.mats = new Map();
    this.flashMats = [];
    this.all = [];
    this.meshes = [];
    this.kept = [];
    this.low = false;
    this.bakes = null;
    this.bakedSrc = null;
    this.bakedGeos = [];
    this.ol = outlineMat(outline);
  }
  m(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = this.plush
        ? new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
        : new THREE.MeshToonMaterial({ color, gradientMap: grad });
      this.mats.set(color, m);
      this.flashMats.push(m);
      this.all.push(m);
    }
    return m;
  }
  glow(color, intensity = 1.5) {
    const m = new THREE.MeshToonMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, gradientMap: grad });
    this.all.push(m);
    return m;
  }
  add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, outline = true) {
    const mesh = new THREE.Mesh(geo, typeof mat === 'number' ? this.m(mat) : mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.meshes.push(mesh);
    if (outline) addOutline(mesh, this.ol, false);
    return mesh;
  }
  // 병합 대상이 아닌(동적) 메시: 저품질에서 지오메트리만 저분할로 바꾼다
  keep(mesh) { this.kept.push(mesh); return mesh; }
  // 정적 파트 판정: 플래시 재질을 쓰고, 조상/자손 Kit 메시가 모두 정적일 것
  bake() {
    const kit = new Set(this.meshes);
    const flash = new Set(this.flashMats);
    const ok = new Set(this.meshes.filter((m) => flash.has(m.material)));
    for (const m of this.meshes) {
      if (ok.has(m)) continue;
      for (let p = m.parent; kit.has(p); p = p.parent) ok.delete(p);
    }
    for (const m of this.meshes) {
      for (let p = m.parent; kit.has(p); p = p.parent) if (!ok.has(p)) { ok.delete(m); break; }
    }
    const bones = new Map();
    this.bakedSrc = [];
    for (const m of this.meshes) {
      if (!ok.has(m)) { this.kept.push(m); continue; }
      m.updateMatrix();
      const mat = m.matrix.clone();
      let p = m.parent;
      for (; kit.has(p); p = p.parent) { p.updateMatrix(); mat.premultiply(p.matrix); }
      if (m.parent === p) this.bakedSrc.push(m);
      let list = bones.get(p);
      if (!list) bones.set(p, (list = []));
      list.push({ geometry: lowGeo(m.geometry), matrix: mat, color: m.material.color });
    }
    this.bakes = [];
    if (!bones.size) return;
    const vc = this.plush
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 })
      : new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: grad });
    vc.emissive.copy(this.flashMats[0]?.emissive ?? vc.emissive);
    this.flashMats.push(vc);
    this.all.push(vc);
    for (const [bone, parts] of bones) {
      const geo = bakeVertexColored(parts);
      // Authored plush surface gradients (cheek blush) keep their vertex colors
      // through the static bake, using the same single flashable material.
      if (this.plush) {
        const colors = geo.attributes.color;
        let offset = 0;
        for (const p of parts) {
          const source = p.geometry.attributes.color;
          if (source) for (let i = 0; i < source.count; i++) {
            colors.setXYZ(offset + i, source.getX(i) * p.color.r,
              source.getY(i) * p.color.g, source.getZ(i) * p.color.b);
          }
          offset += p.geometry.attributes.position.count;
        }
      }
      this.bakedGeos.push(geo);
      const mesh = new THREE.Mesh(geo, vc);
      mesh.name = 'rr-baked';
      mesh.userData.rrBaked = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bone.add(mesh);
      this.bakes.push(mesh);
    }
  }
  setLow(low) {
    low = !!low;
    if (low === this.low) return;
    if (low && !this.bakes) this.bake();
    this.low = low;
    for (const b of this.bakes || []) b.visible = low;
    // 병합된 원본은 저품질에서 뼈에서 떼어 둔다 (행렬 갱신/컬링 비용도 제거, 고품질 복귀 시 재부착)
    for (const m of this.bakedSrc || []) {
      if (low) { m.userData.rrBone = m.parent; m.removeFromParent(); }
      else if (m.userData.rrBone) { m.userData.rrBone.add(m); m.userData.rrBone = null; }
    }
    for (const m of this.kept) {
      if (!m.userData.rrHigh) m.userData.rrHigh = m.geometry;
      m.geometry = low ? lowGeo(m.userData.rrHigh) : m.userData.rrHigh;
    }
    for (const m of this.meshes) for (const c of m.children) if (c.userData.rrOutline) c.visible = !low;
  }
  finish(rig) {
    let last = -1;
    rig.meshes = this.meshes;
    rig.setFlash = (v) => {
      if (v === last) return;
      last = v;
      for (const m of this.flashMats) m.emissive.setRGB(v, v * 0.95, v * 0.85);
    };
    rig.dispose = () => {
      for (const m of this.all) m.dispose();
      for (const g of this.bakedGeos) g.dispose();
    };
    rig.setQuality = (low) => applyModelQuality(rig.root, low);
    rig.root.userData.rrModel = { setLow: (low) => this.setLow(low) };
    if (lowQuality) this.setLow(true);
    return rig;
  }
}

const grp = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
};


// ---------------- 아이템 ----------------
const carrotMats = {
  body: new THREE.MeshToonMaterial({ color: 0xff8a1f, gradientMap: grad }),
  leaf: new THREE.MeshToonMaterial({ color: 0x3fcf4a, gradientMap: grad }),
  line: new THREE.MeshToonMaterial({ color: 0xd8620c, gradientMap: grad }),
};
export function createCarrot() {
  const g = new THREE.Group();
  const ol = outlineMat(0.02);
  const body = new THREE.Mesh(cone(0.17, 0.5, 10), carrotMats.body);
  body.rotation.x = Math.PI;
  body.position.y = -0.05;
  body.castShadow = true;
  addOutline(body, ol);
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(cone(0.05, 0.26, 6), carrotMats.leaf);
    l.position.set(Math.sin(i * 2.1) * 0.05, 0.3, Math.cos(i * 2.1) * 0.05);
    l.rotation.set(Math.cos(i * 2.1) * 0.4, 0, -Math.sin(i * 2.1) * 0.4);
    l.castShadow = true;
    g.add(l);
  }
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(torus(0.12 - i * 0.04, 0.012), carrotMats.line);
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.05 - i * 0.14;
    g.add(r);
  }
  return tagSwap(g);
}

export function createRemote() {
  const g = new THREE.Group();
  const ol = outlineMat(0.015);
  const body = new THREE.Mesh(cyl(0.07, 0.035, 0.34, 10), carrotMats.body);
  body.position.y = -0.2;
  body.castShadow = true;
  addOutline(body, ol);
  g.add(body);
  const btn = new THREE.Mesh(sph(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.4), toneMapped: false }));
  btn.position.set(0, -0.12, 0.06);
  g.add(btn);
  const ant = new THREE.Mesh(cone(0.04, 0.14, 6), carrotMats.leaf);
  ant.position.y = -0.04;
  ant.rotation.x = Math.PI;
  g.add(ant);
  g.visible = false;
  return tagSwap(g);
}

// ---------------- 사람 ----------------
// 웹툰풍 파일럿: 약 1:5 등신, 달걀형 얼굴 + 캔버스 얼굴 데칼(눈/눈썹/입), 파일럿별 헤어와 의상.
// 뼈 구조(hips/torso/head/legL.../handR)는 포즈 시스템이 그대로 쓴다.
const HR = 0.175, HX = 0.9 * HR, HYR = 1.1 * HR, HZR = 0.95 * HR, HCY = 0.2, HCZ = 0.01;
// 머리 타원체 표면점. d: 정면 기준 좌우 각(+x = 캐릭터 왼쪽), th: 정수리 기준 극각
const hp = (d, th, k = 1) => [HX * k * Math.sin(d) * Math.sin(th), HCY + HYR * k * Math.cos(th), HCZ + HZR * k * Math.cos(d) * Math.sin(th)];
// 얼굴 데칼이 덮는 구면 범위와 캔버스 크기 (가로/세로 각 밀도가 거의 같게)
const FACE = { d: 0.95, th0: 1.05, thL: 1.25, W: 256, H: 168 };
const faceGeo = () => G('face', () => new THREE.SphereGeometry(1, 20, 12, Math.PI / 2 - FACE.d, FACE.d * 2, FACE.th0, FACE.thL), () => new THREE.SphereGeometry(1, 10, 6, Math.PI / 2 - FACE.d, FACE.d * 2, FACE.th0, FACE.thL));
const dome = (r) => G('dm' + r, () => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), () => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
const r2 = (v) => Math.max(0.01, Math.round(v * 100) / 100);

const EYE_SHAPES = {
  sharp: { w: 46, h: 17, tilt: 5, lid: 0.1, lash: 5, angry: 0.22, browT: 6 },
  round: { w: 44, h: 23, tilt: 1, lid: 0, lash: 4.5, angry: -0.06, browT: 4.5, crease: 1 },
  cool: { w: 46, h: 15, tilt: 3, lid: 0.28, lash: 4.5, angry: 0.08, browT: 5 },
  sleepy: { w: 44, h: 18, tilt: -1, lid: 0.42, lash: 4.5, angry: -0.12, browT: 4, crease: 1 },
  fierce: { w: 44, h: 15, tilt: 6, lid: 0.12, lash: 6, angry: 0.4, browT: 7.5 },
  sly: { w: 46, h: 17, tilt: 6, lid: 0.3, lash: 5.5, angry: 0, browT: 4, crease: 1, lashes: 1 },
};
const css = (c) => '#' + new THREE.Color(c).getHexString();
const shade = (c, k) => { const o = new THREE.Color(c); o.multiplyScalar(k); return '#' + o.getHexString(); };
const faceTex = new Map();
// 얼굴 텍스처(파일럿 조합별 캐시). DOM 이 없으면(null) 메시 눈으로 대체한다
function faceTexture(f) {
  if (typeof document === 'undefined') return null;
  const key = JSON.stringify(f);
  let tex = faceTex.get(key);
  if (tex) return tex;
  const { W, H } = FACE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (!x) return null;
  const E = { ...(EYE_SHAPES[f.eyes] || EYE_SHAPES.sharp), ...(f.blink ? { h: .4, lid: 1, lash: 3 } : {}) };
  const VY = 0.82; // 타원체가 세로로 길어 생기는 늘어짐 보정
  const ink = '#1d1522';
  const ES = 1.45; // 웹툰풍 큰 눈
  const ex = (0.4 / (FACE.d * 2)) * W, eyeY = ((1.57 - FACE.th0) / FACE.thL) * H, browY = ((1.27 - FACE.th0) / FACE.thL) * H;
  x.lineCap = x.lineJoin = 'round';
  for (const s of [-1, 1]) {
    // 눈: s 방향이 바깥 눈꼬리
    x.save();
    x.translate(W / 2 + s * ex, eyeY);
    x.scale(s * ES, VY * ES);
    const { w, h, tilt, lid } = E, top = -h + h * lid, bot = h * 0.55;
    const almond = () => {
      x.beginPath();
      x.moveTo(-w / 2, 2);
      x.bezierCurveTo(-w * 0.3, top, w * 0.2, top - 1, w / 2, -tilt);
      x.bezierCurveTo(w * 0.3, bot, -w * 0.2, bot + 1, -w / 2, 2);
      x.closePath();
    };
    almond();
    x.fillStyle = '#fffaf4';
    x.fill();
    x.save();
    almond();
    x.clip();
    const irx = w * 0.26, iry = h * 0.98, icx = w * 0.02, icy = h * 0.05;
    const g = x.createLinearGradient(0, icy - iry, 0, icy + iry);
    g.addColorStop(0, shade(f.eye, 0.25));
    g.addColorStop(0.55, css(f.eye));
    g.addColorStop(1, shade(f.eye, 1.6));
    x.fillStyle = g;
    x.beginPath(); x.ellipse(icx, icy, irx, iry, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = shade(f.eye, 0.15);
    x.beginPath(); x.ellipse(icx, icy - 1, irx * 0.45, iry * 0.55, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.ellipse(icx - irx * 0.35 * s, icy - iry * 0.38, irx * 0.34, irx * 0.4, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(icx + irx * 0.4 * s, icy + iry * 0.38, irx * 0.15, 0, Math.PI * 2); x.fill();
    x.restore();
    // 윗속눈썹 라인 + 눈꼬리
    x.strokeStyle = x.fillStyle = ink;
    x.lineWidth = E.lash * 1.2;
    x.beginPath(); x.moveTo(-w / 2, 2); x.bezierCurveTo(-w * 0.3, top, w * 0.2, top - 1, w / 2, -tilt); x.stroke();
    x.beginPath(); x.moveTo(w / 2 - 8, -tilt - 3); x.lineTo(w / 2 + 7, -tilt - 6 - tilt * 0.3); x.lineTo(w / 2 - 1, -tilt + 3); x.closePath(); x.fill();
    if (E.lashes) {
      x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(w * 0.3, top + 1); x.lineTo(w * 0.42, top - 7); x.stroke();
    }
    x.strokeStyle = '#6a3f3a';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(w / 2 - 2, -tilt + 3); x.quadraticCurveTo(w * 0.3, bot + 1, -w * 0.05, bot + 1); x.stroke();
    if (E.crease) {
      x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(-w * 0.18, top - 5); x.quadraticCurveTo(w * 0.15, top - 8, w * 0.42, -tilt - 7); x.stroke();
    }
    x.restore();
    // 눈썹: 안쪽 두껍고 바깥으로 가늘어지는 획
    x.save();
    x.translate(W / 2 + s * (ex - 4), browY + 4);
    x.scale(s, VY);
    const bl = 44, a = E.angry, t = E.browT;
    x.fillStyle = f.brow;
    x.beginPath();
    x.moveTo(-bl / 2, a * 16 - t / 2);
    x.quadraticCurveTo(0, -t - 3 - a * 2, bl / 2, -a * 12 - 4);
    x.quadraticCurveTo(0, t * 0.2 - a * 2, -bl / 2, a * 16 + t / 2);
    x.closePath();
    x.fill();
    x.restore();
    if (f.blush) {
      x.strokeStyle = '#ff7f98';
      x.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        const bx = W / 2 + s * (ex + 2) + (i - 1) * 7;
        x.beginPath(); x.moveTo(bx + 3, 88); x.lineTo(bx - 2, 96); x.stroke();
      }
    }
  }
  // 코: 짧은 그림자 획
  x.strokeStyle = '#c47f68';
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(W / 2 + 1, 96); x.lineTo(W / 2 + 4, 104); x.lineTo(W / 2 - 1, 105); x.stroke();
  // 입
  const my = ((2.03 - FACE.th0) / FACE.thL) * H;
  x.strokeStyle = '#7a3036';
  x.fillStyle = '#8c2f3b';
  x.lineWidth = 2.6;
  x.beginPath();
  const m = f.mouth || 'smile';
  if (m === 'flat') { x.moveTo(W / 2 - 7, my); x.lineTo(W / 2 + 6, my + 1); x.stroke(); }
  else if (m === 'smirk') { x.moveTo(W / 2 - 8, my + 1); x.quadraticCurveTo(W / 2 + 2, my + 3, W / 2 + 10, my - 4); x.stroke(); }
  else if (m === 'cat') { x.moveTo(W / 2 - 11, my - 2); x.quadraticCurveTo(W / 2 - 5, my + 6, W / 2, my); x.quadraticCurveTo(W / 2 + 5, my + 6, W / 2 + 11, my - 2); x.stroke(); }
  else if (m === 'grin') {
    x.moveTo(W / 2 - 11, my - 2); x.quadraticCurveTo(W / 2, my + 14, W / 2 + 11, my - 2); x.closePath(); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(W / 2 - 8, my - 2, 16, 3);
  } else { x.moveTo(W / 2 - 8, my - 1); x.quadraticCurveTo(W / 2, my + 5, W / 2 + 8, my - 1); x.stroke(); }
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceTex.set(key, tex);
  return tex;
}

// 머리카락 한 가닥: a(뿌리) → b(끝)으로 뾰족한 4각 콘
const _hUp = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
function strand(K, parent, a, b, w, color, outline = true, seg = 4) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = r2(_dir.length());
  _dir.normalize();
  const m = K.add(parent, cone(Math.round(w * 1000) / 1000, len, seg), color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0, 0, 0, outline);
  m.quaternion.setFromUnitVectors(_hUp, _dir);
  return m;
}

export function createHuman(o = {}) {
  const body = o.body ?? 0xff4d4d, accent = o.accent ?? 0x2b3a67, skin = o.skin ?? 0xffd3ae, hair = o.hair ?? 0x3a2418, style = o.style ?? 0;
  const L = o.look || {};
  const outfit = L.outfit || 'bomber', legsT = L.legs || 'slim';
  const inner = L.inner ?? 0xffffff, pants = L.pants ?? accent, shoe = L.shoe ?? 0xffffff, sole = L.sole ?? accent, socks = L.socks ?? 0xffffff;
  const K = new Kit(0.008, true);
  const root = new THREE.Group();
  const hips = grp(root, 0, 0.86, 0);
  const rig = { root, hips, height: 1.9, radius: 0.45 };

  // ----- 하체 -----
  if (legsT === 'skirt') {
    const sk = K.add(hips, cyl(0.165, 0.245, 0.24, 10), pants, 0, -0.08, 0);
    sk.scale.set(1, 1, 0.78);
  } else {
    K.add(hips, rbox(0.31, 0.17, 0.2, 0.05), pants, 0, -0.03, 0);
  }
  K.add(hips, rbox(0.32, 0.04, 0.21, 0.015), L.belt ?? 0x22252f, 0, 0.05, 0, 0, 0, 0, false);
  for (const s of [1, -1]) {
    const leg = grp(hips, 0.105 * s, -0.035, 0);
    const shin = grp(leg, 0, -0.36, 0);
    const foot = grp(shin, 0, -0.35, 0);
    if (legsT === 'shorts') {
      K.add(leg, rbox(0.155, 0.17, 0.17, 0.05), pants, 0, -0.06, 0);
      K.add(leg, rbox(0.115, 0.3, 0.125, 0.05), skin, 0, -0.27, 0, 0, 0, 0, false);
      K.add(shin, rbox(0.12, 0.38, 0.13, 0.05), socks, 0, -0.19, 0);
    } else if (legsT === 'skirt') {
      K.add(leg, rbox(0.115, 0.42, 0.125, 0.05), skin, 0, -0.2, 0);
      K.add(shin, rbox(0.12, 0.36, 0.13, 0.05), socks, 0, -0.2, 0);
    } else if (legsT === 'cargo') {
      K.add(leg, sculpt('thigh'), pants, 0, 0, 0);
      K.add(leg, rbox(0.05, 0.13, 0.12, 0.02), shade2(pants), 0.085 * s, -0.24, 0, 0, 0, 0, false);
      K.add(shin, sculpt('shin'), pants, 0, 0, 0);
      K.add(shin, rbox(0.16, 0.06, 0.175, 0.02), shade2(pants), 0, -0.33, 0, 0, 0, 0, false);
    } else {
      K.add(leg, sculpt('thigh'), pants, 0, 0, 0);
      K.add(shin, sculpt('shin'), pants, 0, 0, 0);
    }
    // 하이탑 스니커즈
    K.add(foot, sculpt('boot'), shoe, 0, 0, 0.01);
    K.add(foot, rbox(0.226, 0.03, 0.374, 0.014), sole, 0, -0.092, 0.053, 0, 0, 0, false);
    K.add(foot, box(0.12, 0.025, 0.095), inner, 0, 0.042, 0.075, -0.18, 0, 0, false);
    rig[s > 0 ? 'legL' : 'legR'] = leg;
    rig[s > 0 ? 'shinL' : 'shinR'] = shin;
    rig[s > 0 ? 'footL' : 'footR'] = foot;
  }

  // ----- 상체 -----
  const torso = grp(hips, 0, 0.03, 0);
  const wide = outfit === 'hoodie' || outfit === 'coat' ? 1.07 : 1;
  const fz = 0.178 * wide; // 몸통 타원 비율, 가슴 앞면 z
  const jacket = K.add(torso, sculpt('jacket'), body); jacket.scale.x = wide * (style === 6 ? 1.17 : 1); jacket.name = 'tailored-jacket';
  K.add(torso, cyl(0.045, 0.05, 0.12, 8), skin, 0, 0.55, 0, 0, 0, 0, false);
  const front = (w, h, y, c, z = 0) => K.add(torso, rbox(w, h, 0.03, 0.01), c, 0, y, fz + z, -0.055, 0, 0, false);
  if (outfit === 'blazer') {
    front(0.12, 0.34, 0.33, inner);
    K.add(torso, rbox(0.04, 0.16, 0.025, 0.01), L.tie ?? 0xff4d6d, 0, 0.4, fz + 0.022, -0.06, 0, 0, false);
    K.add(torso, rbox(0.07, 0.035, 0.03, 0.01), L.tie ?? 0xff4d6d, 0, 0.48, fz + 0.02, 0, 0, 0, false);
    for (const s of [1, -1]) K.add(torso, rbox(0.035, 0.24, 0.03, 0.01), shade2(body), 0.045 * s, 0.38, fz + 0.012, -0.05, 0, 0.35 * s, false);
    K.add(torso, rbox(0.05, 0.05, 0.02, 0.01), 0xffd84a, -0.1, 0.36, fz - 0.01, 0, 0, 0, false);
  } else if (outfit === 'hoodie') {
    front(0.1, 0.12, 0.44, inner);
    K.add(torso, rbox(0.22, 0.1, 0.05, 0.02), shade2(body), 0, 0.14, fz - 0.015, -0.06, 0, 0, false);
    for (const s of [1, -1]) K.add(torso, cyl(0.007, 0.007, 0.12, 4), 0xffffff, 0.035 * s, 0.4, fz + 0.012, 0, 0, 0, false);
    if (style !== 2) K.add(torso, sph(0.12, 10, 8), body, 0, 0.5, -0.1).scale.set(1.35, 0.7, 0.8);
  } else if (outfit === 'tech') {
    K.add(torso, cyl(0.085, 0.1, 0.12, 10), accent, 0, 0.52, 0);
    front(0.012, 0.42, 0.28, 0x9aa3b8);
    K.add(torso, rbox(0.05, 0.5, 0.03, 0.01), 0x16161e, 0, 0.29, fz + 0.012, -0.05, 0, 0.62, false);
    K.add(torso, rbox(0.05, 0.04, 0.035, 0.01), L.trim ?? 0xffd84a, -0.02, 0.3, fz + 0.03, 0, 0, 0.62, false);
  } else if (outfit === 'track') {
    K.add(torso, cyl(0.08, 0.095, 0.08, 10), body, 0, 0.52, 0);
    front(0.014, 0.44, 0.28, 0xffffff);
    for (const s of [1, -1]) K.add(torso, rbox(0.022, 0.46, 0.03, 0.01), 0xffffff, 0.09 * s, 0.28, fz - 0.02, -0.05, 0, 0.1 * s, false);
  } else if (outfit === 'utility') {
    front(0.1, 0.16, 0.42, inner);
    K.add(torso, sculpt('vest'), accent).name = 'tailored-utility-vest';
    for (const s of [1, -1]) K.add(torso, rbox(0.08, 0.08, 0.03, 0.015), shade2(accent), 0.09 * s, 0.22, fz + 0.012, -0.06, 0, 0, false);
    K.add(torso, sph(0.12, 10, 8), body, 0, 0.5, -0.1).scale.set(1.3, 0.7, 0.8);
  } else if (outfit === 'vest') {
    front(0.17, 0.44, 0.28, inner);
    K.add(torso, rbox(0.34, 0.08, 0.26, 0.03), accent, 0, 0.05, 0, 0, 0, 0, false).scale.set(1, 1, 0.9);
  } else if (outfit === 'coat') {
    K.add(torso, cyl(0.12, 0.09, 0.12, 10), accent, 0, 0.53, 0);
    front(0.1, 0.3, 0.34, inner);
    for (const y of [0.3, 0.2, 0.1]) for (const s of [1, -1]) K.add(torso, sph(0.013, 6, 4), 0xffd84a, 0.07 * s, y, fz, 0, 0, 0, false);
    // 뒷자락: 다리 앞쪽 동작과 부딪히지 않게 뒤/옆에만
    const capeMat = K.m(body).clone(); capeMat.side = THREE.DoubleSide; K.all.push(capeMat);
    rig.cape = K.add(torso, G('pilotCape', () => pilotCape(), () => pilotCape(true)), capeMat, 0, 0, 0, 0, 0, 0, false);
    K.keep(rig.cape);
  } else {
    // bomber
    front(0.1, 0.32, 0.34, inner);
    K.add(torso, torus(0.07, 0.026), accent, 0, 0.51, 0, Math.PI / 2, 0, 0, false);
    K.add(torso, cyl(0.168, 0.166, 0.07, 12), accent, 0, 0.05, 0, 0, 0, 0, false).scale.set(1, 1, 0.7);
    K.add(torso, rbox(0.06, 0.05, 0.02, 0.01), 0xffd84a, -0.1, 0.38, fz - 0.012, -0.05, 0, 0, false);
  }
  // 당근 배지 (모든 파일럿 공통 포인트)
  K.add(torso, cone(0.017, 0.06, 6), 0xff8a1f, 0.1, 0.39, fz - 0.003, Math.PI, 0, 0, false);
  K.add(torso, cone(0.011, 0.03, 4), 0x3fcf4a, 0.1, 0.43, fz - 0.003, 0, 0, 0, false);
  // Broad shoulder seams and a back patch remain legible from the gameplay camera.
  for (const s of [1, -1]) {
    K.add(torso, box(0.17, 0.035, 0.022), inner, 0.095 * s, 0.425, -0.153 * wide, 0.05, 0, -0.16 * s, false);
  }
  K.add(torso, rbox(0.2, 0.22, 0.023, 0.035), accent, 0, 0.275, -0.162 * wide, 0.07, 0, 0, false);
  K.add(torso, rabbitPatch(), inner, 0, 0.27, -0.178 * wide, 0.07, Math.PI, 0, false);
  if (outfit === 'bomber' || outfit === 'coat') {
    for (const s of [1, -1]) K.add(torso, box(0.065, 0.17, 0.03), accent, 0.065 * s, 0.43, fz + 0.02, -0.1, 0, 0.36 * s, false);
  }

  // ----- 머리 -----
  const head = grp(torso, 0, 0.57, 0);
  // Enlarge the complete face/hair assembly without moving animation joints or hitboxes.
  head.scale.set(1.62, 1.5, 1.48);
  const headM = K.add(head, sph(HR, 20, 14), skin, 0, HCY, HCZ);
  headM.scale.set(0.9, 1.1, 0.95);
  const brow = shade(hair, 0.55);
  const faceStyle = { eyes: L.eyes || 'sharp', eye: L.eye ?? 0x5a3a2a, mouth: L.mouth || 'smile', blush: !!L.blush, brow };
  const tex = faceTexture(faceStyle);
  let faceMat = null;
  if (tex) {
    faceMat = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: false, gradientMap: grad });
    K.all.push(faceMat);
    const face = K.add(head, faceGeo(), faceMat, 0, HCY, HCZ, 0, 0, 0, false);
    face.scale.set(HX * 1.02, HYR * 1.02, HZR * 1.02);
    face.castShadow = face.receiveShadow = false;
  } else {
    for (const s of [1, -1]) {
      const e = hp(0.4 * s, 1.56, 1.0);
      K.add(head, sph(0.022, 8, 6), 0x1b1b28, e[0], e[1], e[2], 0, 0, 0, false).scale.set(1.3, 1, 0.5);
    }
  }
  // 헤어 베이스: 얼굴 앞면을 비우도록 위/뒤로 밀어 둔다
  const capHair = (sx = 1, sy = 1, sz = 1, dy = 0.04, dz = -0.035) => K.add(head, sph(0.1925, 18, 12), hair, 0, HCY + dy, HCZ + dz).scale.set(0.9 * sx, 1.06 * sy, 0.95 * sz);
  const hairLight = new THREE.Color(hair).lerp(new THREE.Color(0xffeddc), 0.16).getHex();
  let bangIndex = 0;
  const bang = (d0, d1, th1, w, th0 = 0.62, col = (++bangIndex % 3 === 1 ? hairLight : hair)) => strand(K, head, hp(d0, th0, 1.1), hp(d1, th1, 1.08), w, col);
  const spike = (d, th, len, w, bx = 0, by = 0.5, bz = -0.5, col = hair) => {
    const a = hp(d, th, 1.0);
    const n = [Math.sin(d) * Math.sin(th) + bx, Math.cos(th) + by, Math.cos(d) * Math.sin(th) + bz];
    const l = Math.hypot(n[0], n[1], n[2]);
    return strand(K, head, a, [a[0] + (n[0] / l) * len, a[1] + (n[1] / l) * len, a[2] + (n[2] / l) * len], w, col);
  };
  const side = (s, th1, w = 0.045, d0 = 0.95, d1 = 0.86) => strand(K, head, hp(d0 * s, 0.9, 1.1), hp(d1 * s, th1, 1.12), w, hair);
  if (style === 1) {
    // 준: 뒤로 쓴 캡 + 차분하게 내린 앞머리
    capHair();
    for (const [d0, d1, th] of [[-0.45, -0.55, 1.3], [-0.15, -0.3, 1.34], [0.15, 0.02, 1.36], [0.45, 0.35, 1.3]]) bang(d0, d1, th, 0.05, 0.8);
    side(1, 1.75); side(-1, 1.75);
    const cap = K.add(head, dome(0.2), body, 0, HCY + 0.045, HCZ - 0.03, -0.22, 0, 0);
    cap.scale.set(0.92, 0.92, 0.98);
    K.add(head, rbox(0.2, 0.025, 0.14, 0.01), accent, 0, HCY + 0.06, HCZ - 0.24, -0.35, 0, 0);
    K.add(head, sph(0.02, 6, 4), accent, 0, HCY + 0.23, HCZ - 0.07, 0, 0, 0, false);
  } else if (style === 2) {
    // 미미: 토끼 후드 + 핑크 단발 앞머리 + 당근 핀
    const hood = K.add(head, sph(0.2, 18, 12), body, 0, HCY + 0.03, HCZ - 0.06);
    hood.scale.set(0.99, 1.07, 1.02);
    K.add(head, torus(0.155, 0.022), accent, 0, HCY + 0.02, HCZ + 0.115, -0.08, 0, 0, false).scale.set(0.95, 1.12, 1);
    for (const [d0, d1, th] of [[-0.5, -0.55, 1.28], [-0.2, -0.25, 1.3], [0.1, 0.05, 1.3], [0.4, 0.4, 1.28]]) bang(d0, d1, th, 0.05, 0.85);
    side(1, 1.9, 0.045, 0.9, 0.84); side(-1, 1.9, 0.045, 0.9, 0.84);
    for (const s of [1, -1]) {
      const ear = K.add(head, caps(0.05, 0.26), body, 0.09 * s, HCY + 0.34, HCZ - 0.06, -0.18, 0, -0.2 * s);
      ear.scale.set(1, 1, 0.55);
      K.add(ear, caps(0.025, 0.2), 0xffb3c8, 0, 0.01, 0.025, 0, 0, 0, false).scale.set(1, 1, 0.5);
    }
    const pin = hp(0.62, 0.95, 1.1);
    K.add(head, cone(0.02, 0.07, 6), 0xff8a1f, pin[0], pin[1], pin[2], 0, 0, 2.2, false);
    K.add(head, cone(0.013, 0.035, 4), 0x3fcf4a, pin[0] + 0.03, pin[1] + 0.02, pin[2], 0, 0, -0.9, false);
  } else if (style === 3) {
    // 소라: 옆으로 넘긴 앞머리 + 하이 포니테일
    capHair();
    for (const [d0, d1, th, w] of [[-0.55, -0.1, 1.2, 0.05], [-0.25, 0.25, 1.28, 0.055], [0.05, 0.55, 1.4, 0.055], [0.35, 0.8, 1.55, 0.05]]) bang(d0, d1, th, w, 0.6);
    side(-1, 1.8, 0.04);
    const tie = hp(Math.PI, 0.55, 1.05);
    K.add(head, torus(0.04, 0.018), accent, tie[0], tie[1], tie[2], 0.9, 0, 0, false);
    K.add(head, sph(0.06, 10, 8), hair, tie[0], tie[1], tie[2] - 0.04);
    strand(K, head, [tie[0], tie[1], tie[2] - 0.05], [0, tie[1] - 0.55, tie[2] - 0.22], 0.075, hair);
    strand(K, head, [tie[0], tie[1], tie[2] - 0.05], [0.08, tie[1] - 0.4, tie[2] - 0.16], 0.05, hair);
    strand(K, head, [tie[0], tie[1], tie[2] - 0.05], [-0.07, tie[1] - 0.44, tie[2] - 0.2], 0.05, hair);
  } else if (style === 4) {
    // 도리: 매끈한 방패 헬멧 + 단발 보브
    capHair(1.05, 1, 1, 0.03);
    for (const [d0, d1, th] of [[-0.45, -0.45, 1.3], [-0.15, -0.15, 1.32], [0.15, 0.15, 1.32], [0.45, 0.45, 1.3]]) bang(d0, d1, th, 0.055, 0.85);
    for (const s of [1, -1]) { side(s, 1.85, 0.06, 1.05, 0.95); side(s, 1.75, 0.05, 1.35, 1.2); }
    const helm = K.add(head, dome(0.215), accent, 0, HCY + 0.06, HCZ - 0.02, -0.1, 0, 0);
    helm.scale.set(0.95, 0.95, 1.02);
    K.add(head, torus(0.2, 0.02), body, 0, HCY + 0.07, HCZ - 0.02, Math.PI / 2 - 0.1, 0, 0, false).scale.set(0.95, 1.02, 1);
    K.add(head, rbox(0.05, 0.22, 0.24, 0.02), body, 0, HCY + 0.19, HCZ - 0.04, 0, 0, 0, false);
    const em = hp(0, 0.7, 1.2);
    K.add(head, rbox(0.07, 0.07, 0.02, 0.01), 0xffd84a, em[0], em[1] + 0.01, em[2], -0.7, 0, Math.PI / 4, false);
  } else if (style === 5) {
    // 하루: 뒤로 뻗친 헝클어진 머리 + 이마 고글
    capHair();
    for (const [d, th, len] of [[0, 0.35, 0.2], [0.5, 0.55, 0.18], [-0.5, 0.55, 0.18], [0.9, 1.0, 0.15], [-0.9, 1.0, 0.15], [Math.PI, 0.9, 0.16], [2.4, 0.8, 0.16], [-2.4, 0.8, 0.16]]) spike(d, th, len, 0.055, 0, 0.3, -0.8);
    bang(-0.2, -0.35, 1.32, 0.04, 0.7);
    bang(0.25, 0.4, 1.25, 0.04, 0.7);
    K.add(head, torus(0.19, 0.016), 0x2b2b35, 0, HCY + 0.06, HCZ - 0.01, Math.PI / 2 - 0.35, 0, 0, false).scale.set(0.97, 1.02, 1);
    for (const s of [1, -1]) {
      const g = hp(0.28 * s, 0.72, 1.12);
      K.add(head, cyl(0.045, 0.045, 0.04, 10), 0x2b2b35, g[0], g[1], g[2], 1.0, 0, 0, false);
      K.add(head, cyl(0.034, 0.034, 0.01, 10), 0x7fe0ff, g[0], g[1] + 0.012, g[2] + 0.018, 1.0, 0, 0, false);
    }
  } else if (style === 6) {
    // 타로: 투블럭 + 상투 + 두건 머리띠
    capHair(0.96, 0.98, 1);
    for (const [d, th] of [[-0.4, 0.75], [0, 0.72], [0.4, 0.75]]) spike(d, th, 0.12, 0.05, 0, 1.2, 0.4);
    K.add(head, sph(0.06, 10, 8), hair, 0, HCY + 0.22, HCZ - 0.09);
    K.add(head, torus(0.035, 0.014), body, 0, HCY + 0.2, HCZ - 0.09, Math.PI / 2, 0, 0, false);
    K.add(head, torus(0.18, 0.024), body, 0, HCY + 0.1, HCZ - 0.005, Math.PI / 2 - 0.15, 0, 0, false).scale.set(0.95, 1.03, 1);
    for (const s of [1, -1]) strand(K, head, [0.02 * s, HCY + 0.07, HCZ - 0.2], [0.12 * s, HCY - 0.12, HCZ - 0.3], 0.03, body, false);
  } else if (style === 7) {
    // 루나: 히메컷 긴 생머리 + 뾰족 모자
    capHair(1.02);
    for (const d of [-0.5, -0.25, 0, 0.25, 0.5]) bang(d, d, 1.3, 0.05, 0.8);
    for (const s of [1, -1]) side(s, 2.0, 0.045, 0.95, 0.9);
    K.add(head, rbox(0.3, 0.5, 0.07, 0.03), hair, 0, HCY - 0.2, HCZ - 0.15, 0.12, 0, 0);
    for (const x of [-0.1, 0, 0.1]) strand(K, head, [x, HCY - 0.4, HCZ - 0.18], [x * 1.1, HCY - 0.52, HCZ - 0.2], 0.045, hair, false);
    K.add(head, cyl(0.3, 0.3, 0.025, 18), accent, 0, HCY + 0.16, HCZ - 0.02, -0.12, 0, 0);
    K.add(head, cyl(0.155, 0.16, 0.05, 14), 0xffd84a, 0, HCY + 0.19, HCZ - 0.025, -0.12, 0, 0, false);
    K.add(head, cone(0.155, 0.46, 12), accent, 0, HCY + 0.42, HCZ - 0.09, -0.35, 0, 0.08);
    K.add(head, sph(0.035, 8, 6), 0xffe070, 0.03, HCY + 0.64, HCZ - 0.2, 0, 0, 0, false);
  } else {
    // 리코: 위로 쓸어 올린 스파이키 투블럭
    capHair(0.97);
    for (const [d, th, len] of [[0, 0.25, 0.2], [0.45, 0.4, 0.17], [-0.45, 0.4, 0.17], [2.6, 0.7, 0.15], [-2.6, 0.7, 0.15], [Math.PI, 0.55, 0.16]]) spike(d, th, len, 0.06, 0, 0.9, -0.5);
    for (const [d, bx] of [[-0.3, -0.3], [0.05, 0.1], [0.35, 0.4]]) spike(d, 0.7, 0.16, 0.055, bx, 1.1, 0.7);
    bang(0.15, 0.32, 1.28, 0.04, 0.72);
    K.add(head, rbox(0.3, 0.03, 0.04, 0.012), 0xff3344, 0, HCY + 0.12, HCZ + 0.17, -0.45, 0, 0, false);
  }

  // ----- 팔 -----
  const sleeve = outfit === 'vest' ? skin : body;
  for (const s of [1, -1]) {
    const arm = grp(torso, 0.27 * s, 0.43, 0);

    K.add(arm, sculpt('sleeve'), sleeve, 0, 0, 0);
    if (outfit === 'track') K.add(arm, rbox(0.02, 0.3, 0.1, 0.008), 0xffffff, 0.072 * s, -0.14, 0, 0, 0, 0, false);
    if (outfit === 'bomber' && s > 0) K.add(arm, rbox(0.02, 0.06, 0.06, 0.008), 0xffd84a, 0.074, -0.08, 0, 0, 0, 0, false);
    const fore = grp(arm, 0, -0.26, 0);
    K.add(fore, sculpt('forearm'), sleeve, 0, 0, 0);
    const cuff = outfit === 'vest' ? 0xffffff : outfit === 'coat' || outfit === 'tech' ? accent : outfit === 'blazer' ? inner : shade2(body);
    K.add(fore, rbox(0.165, 0.05, 0.16, 0.015), cuff, 0, -0.21, 0, 0, 0, false);
    const hand = grp(fore, 0, -0.27, 0);
    if (L.hands === 'boxing') {
      K.add(hand, sculpt('mitten'), body, 0, -0.01, 0.01);
      K.add(hand, cyl(0.07, 0.07, 0.05, 10), 0xffffff, 0, 0.06, 0, 0, 0, 0, false);
    } else {
      K.add(hand, sph(0.069, 10, 8), skin, 0, -0.01, 0.01).scale.set(1, 1.15, 1.05);
      if (L.hands === 'fingerless') K.add(hand, rbox(0.13, 0.065, 0.13, 0.02), 0x1b1b24, 0, 0.0, 0.01, 0, 0, 0, false);
    }
    rig[s > 0 ? 'armL' : 'armR'] = arm;
    rig[s > 0 ? 'foreL' : 'foreR'] = fore;
    rig[s > 0 ? 'handL' : 'handR'] = hand;
  }
  rig.torso = torso;
  rig.head = head;
  rig.remote = createRemote();
  rig.remote.position.set(0, -0.02, 0.04);
  rig.handR.add(rig.remote);
  for (const [color, material] of K.mats) material.roughness = color === skin ? .68 : color === hair ? .52 : .91;
  rig.design = 'tailored-adventure-v19';
  // A separate cloth joint adds a secondary beat without altering combat bones.
  if (rig.cape) {
    const mesh = rig.cape, joint = grp(torso); joint.add(mesh); rig.capeJoint = joint;
    // Keep dynamic cloth separate from the static material bake.
    rig.animateFace = time => { joint.rotation.x = Math.sin(time * 2.1) * .045; joint.rotation.z = Math.sin(time * 1.4) * .025; };
  }
  const animateCloth = rig.animateFace;
  const blinkTexture = faceMat ? faceTexture({ ...faceStyle, blink: true }) : null;
  rig.animateFace = time => {
    animateCloth?.(time);
    if (faceMat && Number.isFinite(time)) faceMat.map = ((time + style * .47) % 4.1 < .13) ? blinkTexture : tex;
  };
  K.finish(rig);
  // 얼굴 데칼은 병합하지 않는 별도 재질이라 피격 플래시를 따로 전달한다
  if (faceMat) {
    const flash = rig.setFlash;
    rig.setFlash = (v) => { flash(v); faceMat.emissive.setRGB(v, v * 0.95, v * 0.85); };
  }
  return rig;
}
// 의상 디테일용 어두운 톤 (숫자 색 → 숫자 색)
function shade2(c) { const o = new THREE.Color(c); o.multiplyScalar(0.72); return o.getHex(); }


// ---------------- 토끼 로봇 ----------------
export const ROBOT_INFO = {
  titan: { name: '캐럿 타이탄', color: 0xeeb88e, desc: '살구빛 갈기와 포근한 크림 얼굴의 다정한 사자토끼 복서. 솜주먹 로켓 펀치와 점프 스톰프가 특기.' },
  bolt: { name: '볼트 헤어', color: 0xa9d6c6, desc: '민트빛 털과 크림 목도리, 길게 선 귀의 경쾌한 산토끼. 드릴 이어 돌진과 토네이도 킥으로 달린다.' },
  cannon: { name: '문 캐논', color: 0xc7b8dc, desc: '라벤더빛 털과 나른한 눈웃음, 폭신한 늘어진 귀의 달토끼. 씨앗 포드의 유도 당근과 문 레이저가 특기.' },
  hammer: { name: '해머 버니', color: 0xb6c7a1, desc: '세이지빛 털과 크림 앞치마의 온순한 농장토끼. 커다란 당근 해머로 빙글 돌고 땅을 두드린다.' },
};

const PAL = {
  // The colored fleece frames a single cream face; breed identity comes from
  // silhouette and cloth accessories, never facial aggression or exposed hardware.
  titan: { main: 0xeeb88e, dark: 0xa27459, acc: 0xf1c49c, fur: 0xfff1dd, inner: 0xe8b4a5, bulk: 1.12, fist: 0.9, ear: 1.25, head: [1.43, 1.28, 1.08], belly: 1.02 },
  bolt: { main: 0xa9d6c6, dark: 0x648d80, acc: 0xffefd7, fur: 0xfff4e4, inner: 0xe7b8ad, bulk: 0.84, fist: 0.58, ear: 2.15, head: [1.27, 1.34, 1.02], belly: 0.95 },
  cannon: { main: 0xc7b8dc, dark: 0x9687b1, acc: 0xf1dba5, fur: 0xfff2e4, inner: 0xe0b8c7, bulk: 1, fist: 0.62, ear: 1.75, head: [1.49, 1.3, 1.12], belly: 1.08 },
  hammer: { main: 0xb6c7a1, dark: 0x7d9571, acc: 0xffeed7, fur: 0xfff1dd, inner: 0xe5b8a8, bulk: 1.22, fist: 0.7, ear: 1.8, head: [1.52, 1.3, 1.12], belly: 1.08 },
};
const BUTTON_INK = 0x3d302c;
// Robot-only surface cache. Low keeps 16x12 body surfaces, 24x18 faces and
// 24x16 paws; pilot/item geometry and materials are untouched.
const plushSphere = (face = false) => G('plushSphere' + face,
  () => new THREE.SphereGeometry(1, face === true || face === 'paw' ? 32 : 24, face === true ? 24 : face === 'paw' ? 20 : 16),
  () => new THREE.SphereGeometry(1, face === true || face === 'paw' ? 24 : 16, face === true ? 18 : face === 'paw' ? 16 : 12));

// One continuous bottom-heavy volume. A narrowed upper hemisphere removes the
// stacked chest/pelvis silhouette without changing any animation joint.
const plushPear = () => G('plushPear', () => makePearGeometry(28, 20), () => makePearGeometry(16, 12));
function makePearGeometry(ws, hs) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), taper = 1 - 0.2 * y;
    p.setXYZ(i, p.getX(i) * taper, y, p.getZ(i) * taper);
  }
  g.computeVertexNormals();
  return g;
}
// A swept, round-ended ear. Folded ears arch outward and then hang beside the
// face, with the curve authored into geometry under the public ear joint.
function rabbitEar(length, width, fold = 0, inner = false) {
  const makeEar = (rows, sides) => {
    const positions = [], indices = [];
    const rings = inner ? rows - 4 : rows;
    for (let i = 0; i <= rings; i++) {
      const u = i / rings, t = (i + (inner ? 2 : 0)) / rows;
      const r = Math.pow(Math.sin(Math.PI * u), 0.52);
      const x = fold * length * t * t * 0.6;
      const y = length * (t - Math.abs(fold) * 1.15 * t * t);
      const dx = fold * length * 1.2 * t;
      const dy = length * (1 - Math.abs(fold) * 2.3 * t);
      const n = Math.hypot(dx, dy), nx = dy / n, ny = -dx / n;
      // Inset rows follow the outer centerline, including the tangent frame.
      const shellR = Math.pow(Math.sin(Math.PI * t), 0.52);
      const front = inner ? width * shellR * 0.42 + 0.008 : 0;
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        const across = Math.cos(a) * width * r * (inner ? 0.58 : 1);
        positions.push(x + nx * across, y + ny * across,
          front + Math.sin(a) * width * r * (inner ? 0.025 : 0.42) - t * t * 0.06);
        if (i < rings && j < sides) {
          const k = i * (sides + 1) + j;
          indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };
  return G('plushEar' + [length, width, fold, inner].join(','),
    () => makeEar(28, 16), () => makeEar(16, 10));
}

// A single scalloped cushion ring, with no tufts, spikes or layered fur blobs.
const lionMane = () => G('plushLionMane', () => plushManeGeometry(96, 12), () => plushManeGeometry(64, 8));
function plushManeGeometry(around, cross) {
  const positions = [], indices = [];
  for (let i = 0; i <= around; i++) {
    const a = i / around * Math.PI * 2;
    const scallop = 0.028 * Math.cos(12 * a);
    for (let j = 0; j <= cross; j++) {
      const b = j / cross * Math.PI * 2;
      const thickness = 0.23 + scallop;
      positions.push(Math.cos(a) * (1.4 + thickness * Math.cos(b)),
        0.52 + Math.sin(a) * (1.22 + thickness * Math.cos(b)),
        -0.12 + thickness * Math.sin(b) * 1.8);
      if (i < around && j < cross) {
        const k = i * (cross + 1) + j;
        indices.push(k, k + cross + 1, k + 1, k + 1, k + cross + 1, k + cross + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const moonPatch = () => G('moonPatch', () => {
  const s = new THREE.Shape();
  s.moveTo(0.1, 0.14);
  s.bezierCurveTo(-0.2, 0.23, -0.23, -0.18, 0.07, -0.16);
  s.bezierCurveTo(-0.09, -0.08, -0.06, 0.08, 0.1, 0.14);
  return new THREE.ShapeGeometry(s, 10);
});

// Face marks follow the cream head surface; none project like a separate muzzle.
function faceZ(P, x, y) {
  return -0.04 + P.head[2] * Math.sqrt(Math.max(0,
    1 - (x / P.head[0]) ** 2 - ((y - 0.52) / P.head[1]) ** 2));
}
function cheekBlush(P, type, side) {
  const makeBlush = (segments) => {
    const positions = [], colors = [], indices = [];
    const cream = new THREE.Color(P.fur), pink = new THREE.Color(P.inner), color = new THREE.Color();
    // Eight concentric rings fade from a warm tint to the exact fleece color.
    // The entire patch is only 0.006 above the ellipsoid, including its edge.
    for (let row = 0; row <= 8; row++) for (let j = 0; j <= segments; j++) {
      const r = row / 8, a = j / segments * Math.PI * 2;
      const x = side * 0.67 + Math.cos(a) * 0.21 * r, y = 0.37 + Math.sin(a) * 0.115 * r;
      positions.push(x, y, faceZ(P, x, y) + 0.006);
      color.copy(cream).lerp(pink, 0.52 * (1 - r * r) ** 2);
      colors.push(color.r, color.g, color.b);
      if (row < 8 && j < segments) {
        const k = row * (segments + 1) + j;
        indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    // Same analytic normals as the head, so the patch never shades like a wart.
    const normals = positions.map(() => 0);
    for (let i = 0; i < positions.length; i += 3) {
      const n = new THREE.Vector3(positions[i] / P.head[0] ** 2,
        (positions[i + 1] - 0.52) / P.head[1] ** 2, (positions[i + 2] + 0.04) / P.head[2] ** 2).normalize();
      normals[i] = n.x; normals[i + 1] = n.y; normals[i + 2] = n.z;
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return g;
  };
  return G('plushBlush' + type + side, () => makeBlush(24), () => makeBlush(16));
}
function faceStroke(P, key, points, radius = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, faceZ(P, x, y) + 0.008)));
  return G('plushStroke' + key, () => new THREE.TubeGeometry(curve, 16, radius, 6, false),
    () => new THREE.TubeGeometry(curve, 12, radius, 5, false));
}
// Highlight and dark button are one vertex-colored mesh. Blinking therefore
// carries the tiny highlight with the eye, and keeps the low-mode draw budget.
const buttonEye = () => G('plushButtonEye', () => button(20, 14), () => button(12, 8));
function button(ws, hs) {
  return bakeVertexColored([
    { geometry: sph(1, ws, hs), matrix: new THREE.Matrix4(), color: new THREE.Color(BUTTON_INK) },
    { geometry: sph(1, 8, 6), matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(-0.27, 0.36, 0.89), new THREE.Quaternion(), new THREE.Vector3(0.17, 0.17, 0.12)),
      color: new THREE.Color(0xfff7e9) },
  ]);
}
function moonEyes(P) {
  const parts = [-1, 1].map(s => ({
    geometry: faceStroke(P, 'moonEye' + s, [[s * 0.29, 0.62], [s * 0.39, 0.59], [s * 0.49, 0.63]], 0.024),
    matrix: new THREE.Matrix4(), color: new THREE.Color(BUTTON_INK),
  }));
  return G('plushMoonEyes', () => bakeVertexColored(parts),
    () => bakeVertexColored(parts.map(p => ({ ...p, geometry: lowGeo(p.geometry) }))));
}
const plushCarrotHammer = () => {
  // Rounded crown, full shoulder and a gently tapered carrot tip. The lathe is
  // continuous, so there is no seam between a cylinder and a separate cone.
  const profile = [[0, -1.45], [0.075, -1.36], [0.19, -1.1], [0.34, -0.74],
    [0.48, -0.3], [0.58, 0.16], [0.62, 0.49], [0.58, 0.72], [0.4, 0.91], [0.17, 1.01], [0, 1.04]];
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const points = curve.getPoints(32);
  // The spline may overshoot the two closed tips; negative radii invert faces.
  for (const p of points) p.x = Math.max(0, p.x);
  return G('plushCarrotHammer', () => new THREE.LatheGeometry(points, 32),
    () => new THREE.LatheGeometry(points, 24));
};

export function createRobot(type = 'titan', opts = {}) {
  const P = PAL[type] || PAL.titan, b = P.bulk;
  const team = opts.team ?? 0xffffff;
  const K = new Kit(0.012, true);
  const root = new THREE.Group(), hips = grp(root, 0, 2.6, 0);
  // Gameplay dimensions, all joints and all sockets remain the existing contract.
  const rig = { root, hips, height: 5.5, radius: type === 'bolt' ? 1.25 : type === 'hammer' ? 1.55 : 1.45,
    type, eyes: [], thrusters: [], muzzles: [], weapon: null,
    eyeIntensity: 0.08, coreIntensity: 0.24,
    eyeHeight: 5.13, eyeForward: faceZ(P, 0, 0.63) + 0.05 };
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
    roughness: 0.85, metalness: 0, emissive: 0x090604, emissiveIntensity: rig.eyeIntensity });
  const coreM = new THREE.MeshStandardMaterial({ color: P.acc, roughness: 1, metalness: 0,
    emissive: 0x493329, emissiveIntensity: rig.coreIntensity });
  K.all.push(eyeM, coreM);
  const blushM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
  K.all.push(blushM);
  K.flashMats.push(blushM);
  const soft = (parent, name, color, x, y, z, sx, sy, sz, outline = true, face = false) => {
    const m = K.add(parent, plushSphere(face), color, x, y, z, 0, 0, 0, outline);
    m.name = name;
    m.scale.set(sx, sy, sz);
    return m;
  };

  // Low belly and overlapping haunches make the visible legs short and chubby.
  soft(hips, 'rabbit-rump', P.main, 0, -0.32, -0.1, 0.91 * b, 0.91, 0.76);
  soft(hips, 'cottontail', P.fur, 0, -0.12, -0.91, 0.4, 0.39, 0.37);
  for (const s of [1, -1]) {
    const leg = grp(hips, 0.58 * b * s, -0.2, 0);
    soft(leg, 'rabbit-haunch', P.main, -0.06 * s, -0.22, -0.05, 0.46 * b, 0.77, 0.51);
    const shin = grp(leg, 0, -1.05, 0);
    soft(shin, 'rabbit-hock', P.main, 0, -0.3, 0.02, 0.37 * b, 0.72, 0.4);
    const foot = grp(shin, 0, -1.05, 0);
    soft(foot, 'hind-paw', P.fur, 0, 0.07, 0.24, 0.44 * b, 0.37, type === 'bolt' ? 0.78 : 0.65, true, 'paw');
    if (type === 'bolt') {
      soft(shin, 'soft-heel-pack', P.dark, 0, -0.38, -0.35, 0.18, 0.32, 0.19);
      rig.thrusters.push(grp(shin, 0, -0.75, -0.6));
    }
    rig[s > 0 ? 'legL' : 'legR'] = leg;
    rig[s > 0 ? 'shinL' : 'shinR'] = shin;
    rig[s > 0 ? 'footL' : 'footR'] = foot;
  }

  const torso = grp(hips, 0, 0.15, 0);
  const body = K.add(torso, plushPear(), P.main, 0, 0.26, -0.1);
  body.name = 'rabbit-body';
  body.scale.set(0.97 * b * P.belly, 1.23, 0.79 * P.belly);
  soft(torso, 'fleece-belly', P.fur, 0, 0.19, 0.53, 0.71 * b, 0.83, 0.27, false);
  rig.chestCore = K.add(torso, sph(0.13, 16, 12), coreM, 0, 0.42, 0.66, 0, 0, 0, false);
  rig.chestCore.name = 'soft-energy-button';
  // Keep the original boarding anchor and transparent canopy for mounted pilots.
  rig.cockpit = grp(torso, 0, 0.62, 0.72);
  const glass = new THREE.Mesh(sph(0.66, 20, 14), new THREE.MeshStandardMaterial({
    color: 0xfff5e7, roughness: 1, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false }));
  glass.position.set(0, 0.62, 0.74);
  glass.scale.set(1, 1, 0.8);
  glass.renderOrder = 2;
  K.all.push(glass.material);
  K.keep(glass);
  torso.add(glass);
  // Equipment stays behind the plush silhouette, with unchanged exhaust sockets.
  soft(torso, 'saddle-pack', P.dark, 0, 0.83, -0.72, 0.51 * b, 0.55, 0.29);
  K.add(torso, rabbitPatch(), team, 0, 0.89, -1.015, 0, Math.PI, 0, false).scale.setScalar(1.8);
  for (const s of [1, -1]) {
    soft(torso, 'exhaust-cuff', P.dark, 0.38 * s, 0.35, -0.86, 0.16, 0.22, 0.19, false);
    rig.thrusters.push(grp(torso, 0.38 * s, 0.15, -0.98));
  }

  // A single cream mochi face occupies almost the whole head. The colored back
  // is tucked inside its perimeter; there is no muzzle, teeth, socket or brow.
  const head = grp(torso, 0, 1.75, 0);
  rig.viewpoint = grp(head, 0, 0.63, rig.eyeForward);
  if (type === 'titan') K.add(head, lionMane(), P.acc).name = 'lionhead-mane';
  soft(head, 'head-fleece-back', P.main, 0, 0.55, -0.26,
    P.head[0] * 0.98, P.head[1] * 0.98, P.head[2], true, true);
  soft(head, 'rabbit-skull', P.fur, 0, 0.52, -0.04, ...P.head, true, true);
  for (const s of [-1, 1]) K.add(head, cheekBlush(P, type, s), blushM, 0, 0, 0, 0, 0, 0, false).name = 'soft-cheek-blush';
  soft(head, 'rabbit-nose', P.inner, 0, 0.32, faceZ(P, 0, 0.32) + 0.012,
    0.066, 0.047, 0.027, false);
  K.add(head, faceStroke(P, 'smile' + type, [[-0.085, 0.21], [0, 0.18], [0.085, 0.21]]),
    BUTTON_INK, 0, 0, 0, 0, 0, 0, false).name = 'tiny-smile';
  if (type === 'cannon') {
    const e = K.add(head, moonEyes(P), eyeM, 0, 0, 0, 0, 0, 0, false);
    e.name = 'sleepy-curved-eyes';
    rig.eyes.push(e);
    rig.laserOrigin = grp(head, 0, 0.72, 0.7);
    rig.muzzles.push(rig.laserOrigin);
    // Moon signature lives on the back of the hood, keeping the face quiet.
    K.add(head, moonPatch(), P.acc, 0, 0.95, -1.285, 0, Math.PI, 0, false).name = 'moon-hood-patch';
  } else {
    for (const s of [1, -1]) {
      const x = (type === 'bolt' ? 0.35 : 0.4) * s, y = 0.63;
      const e = K.add(head, buttonEye(), eyeM, x, y, faceZ(P, x, y) + 0.014, 0, 0, 0, false);
      e.scale.set(0.077, 0.092, 0.035);
      e.rotation.y = Math.atan2(x * P.head[2], P.head[0] ** 2);
      e.name = 'dark-button-eye';
      rig.eyes.push(e);
    }
  }
  for (const s of [1, -1]) {
    const ear = grp(head, 0.34 * s, 1, -0.1);
    // Geometry moves to the larger head crown; the damage/animation joint stays.
    const tilt = grp(ear, 0.47 * s, 0.48, -0.1);
    tilt.rotation.z = -(type === 'bolt' ? 0.09 : type === 'titan' ? 0.2 : 0.05) * s;
    tilt.rotation.x = type === 'bolt' ? -0.09 : 0;
    const fold = type === 'hammer' ? 1.32 * s : type === 'cannon' ? (s > 0 ? 1.04 : -1.34) : 0;
    const L = P.ear * (type === 'bolt' && s < 0 ? 0.96 : 1);
    const width = type === 'bolt' ? 0.25 : type === 'titan' ? 0.3 : 0.38;
    K.add(tilt, rabbitEar(L, width, fold), P.main).name = 'rabbit-ear';
    K.add(tilt, rabbitEar(L, width, fold, true), P.inner, 0, 0, 0, 0, 0, 0, false).name = 'rabbit-ear-lining';
    rig[s > 0 ? 'earL' : 'earR'] = ear;
  }

  if (type === 'bolt') {
    // A pillowy cream scarf, with a soft hanging end at the side.
    soft(torso, 'hare-scarf', P.acc, 0, 1.15, 0.04, 0.74, 0.21, 0.59);
    soft(torso, 'scarf-knot', P.fur, -0.65, 1.09, 0.38, 0.22, 0.23, 0.2);
    const end = soft(torso, 'scarf-end', P.acc, -0.74, 0.69, 0.46, 0.2, 0.46, 0.12);
    end.rotation.z = -0.15;
  } else if (type === 'hammer') {
    soft(torso, 'farm-apron', P.acc, 0, 0.08, 0.64, 0.86, 0.82, 0.16, false);
    soft(torso, 'apron-pocket', P.fur, 0, -0.22, 0.8, 0.31, 0.23, 0.032, false);
    for (const s of [1, -1]) {
      const strap = soft(torso, 'apron-strap', P.acc, 0.52 * s, 0.89, 0.53, 0.068, 0.43, 0.04, false);
      strap.rotation.z = -0.2 * s;
    }
  }
  if (type === 'cannon') {
    // Pods sit behind the head instead of making armored shoulder pauldrons.
    // Their parents/launch sockets retain the existing missile positions.
    for (const s of [1, -1]) {
      const pod = grp(torso, 1.05 * s, 1.95, -0.25);
      soft(pod, 'moon-seed-pod', P.main, 0, -0.13, -0.49, 0.3, 0.38, 0.45);
      for (let k = 0; k < 3; k++) rig.muzzles.push(grp(pod, (k - 1) * 0.24, 0.05, 0.6));
    }
  }

  for (const s of [1, -1]) {
    const arm = grp(torso, 1.25 * b * s, 1.45, 0);
    // Overlap through shoulder and elbow, with no caps, rings or cuff plates.
    soft(arm, 'rabbit-upper-paw', P.main, -0.075 * s, -0.42, 0,
      type === 'bolt' ? 0.35 : 0.44, 0.78, 0.42);
    const fore = grp(arm, 0, -0.95, 0);
    soft(fore, 'rabbit-forepaw', P.main, 0, -0.32, 0,
      type === 'titan' ? 0.46 : 0.36, 0.72, type === 'titan' ? 0.45 : 0.36);
    const hand = grp(fore, 0, -0.9, 0), fist = grp(hand), f = P.fist;
    soft(fist, 'front-paw', type === 'titan' ? P.acc : P.fur,
      0, -f * 0.15, 0.05, f * 0.66, f * 0.62, f * 0.6, true, 'paw');
    if (type === 'titan') {
      // Broad cream fabric wrist wrap, inset into the mitten, not a metal ring.
      soft(fist, 'boxer-wrap', P.fur, 0, f * 0.16, -0.025, f * 0.5, f * 0.25, f * 0.48, false);
    }
    rig[s > 0 ? 'armL' : 'armR'] = arm;
    rig[s > 0 ? 'foreL' : 'foreR'] = fore;
    rig[s > 0 ? 'handL' : 'handR'] = hand;
    rig[s > 0 ? 'fistL' : 'fistR'] = fist;
  }
  if (type === 'hammer') {
    const w = grp(rig.handR, 0, -0.2, 0.05);
    K.add(w, cyl(0.12, 0.12, 2.6, 16), 0xb38d69, 0, -1.2, 0);
    const headG = grp(w, 0, -2.55, 0);
    // One smooth carrot head with a rounded, tapered end, instead of cone seams.
    const carrot = K.add(headG, plushCarrotHammer(), 0xedaa70, -0.45, 0, 0);
    carrot.name = 'carrot-hammer';
    carrot.rotation.z = -Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const leaf = soft(headG, 'carrot-leaf', P.dark, 0.89, (i - 1) * 0.2, 0,
        0.46, 0.12, 0.16, false);
      leaf.rotation.z = (i - 1) * 0.48;
    }
    rig.weapon = w;
  }
  rig.torso = torso;
  rig.head = head;
  rig.makeFist = () => {
    const low = K.low, g = new THREE.Group(), f = P.fist;
    const geo = plushSphere('paw');
    const m = new THREE.Mesh(low ? lowGeo(geo) : geo, K.m(type === 'titan' ? P.acc : P.fur));
    m.scale.set(f * 0.66, f * 0.62, f * 0.6);
    m.castShadow = true;
    if (!low) addOutline(m, K.ol, false);
    g.add(m);
    return g;
  };

  const phase = { titan: 0, bolt: 1.1, cannon: 2.2, hammer: 3.3 }[type] ?? 0;
  // Deterministic presentation-time animation, no allocations/rebuilds/material
  // writes. The dynamic meshes survive baking; sleepy lids gently narrow.
  rig.animateFace = (time) => {
    if (!Number.isFinite(time)) return;
    const t = ((time + phase) % 4.7 + 4.7) % 4.7;
    const blink = t < 0.18 ? Math.sin(t / 0.18 * Math.PI) ** 2 : 0;
    for (const e of rig.eyes) {
      e.scale.y = type === 'cannon' ? 1 - blink * 0.15 : 0.092 * (1 - blink * 0.94);
      if (type === 'cannon') e.position.y = 0.61 * (1 - e.scale.y);
    }
  };
  return K.finish(rig);
}

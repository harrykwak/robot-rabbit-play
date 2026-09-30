// 절차적 캐릭터 모델: 치비 파일럿과 토끼 로봇. 툰 셰이딩 + 역 헐 아웃라인
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bakeVertexColored, renderStats } from './model-quality.js';

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
const sph = (r, ws = 16, hs = 12) => G('sp' + r + ',' + ws, () => new THREE.SphereGeometry(r, ws, hs), () => new THREE.SphereGeometry(r, half(ws, 6), half(hs, 4)));
const cyl = (rt, rb, h, s = 14) => G('cy' + [rt, rb, h, s].join(','), () => new THREE.CylinderGeometry(rt, rb, h, s), () => new THREE.CylinderGeometry(rt, rb, h, half(s, 6)));
const cone = (r, h, s = 12) => G('co' + [r, h, s].join(','), () => new THREE.ConeGeometry(r, h, s), () => new THREE.ConeGeometry(r, h, half(s, 5)));
const caps = (r, l) => G('ca' + r + ',' + l, () => new THREE.CapsuleGeometry(r, l, 4, 12), () => new THREE.CapsuleGeometry(r, l, 2, 8));
const torus = (r, t) => G('to' + r + ',' + t, () => new THREE.TorusGeometry(r, t, 8, 24), () => new THREE.TorusGeometry(r, t, 5, 12));

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
  constructor(outline) {
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
      m = new THREE.MeshToonMaterial({ color, gradientMap: grad });
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
    const vc = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: grad });
    vc.emissive.copy(this.flashMats[0]?.emissive ?? vc.emissive);
    this.flashMats.push(vc);
    this.all.push(vc);
    for (const [bone, parts] of bones) {
      const geo = bakeVertexColored(parts);
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

// ---------------- 털 뭉치 (가벼운 로우폴리) ----------------
// 부드러운 법선의 이코사 구슬 + 짧은 원뿔 가닥을 한 지오메트리로 합친다: 뭉치 하나 = 드로우 1회.
// 아웃라인/그림자 없이 쓰고, 저품질에서는 축소판(또는 빈 지오메트리)이 본 병합에 들어가 드로우가 늘지 않는다.
const _white = new THREE.Color(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const puffGeos = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1)];
for (const g of puffGeos) g.setAttribute('normal', g.attributes.position.clone()); // 단위 구: 법선 = 위치
const strandGeo = new THREE.ConeGeometry(1, 1, 4, 1, true).translate(0, 0.5, 0);
// blobs: [x, y, z, r, detail], strands: [x, y, z, dx, dy, dz, len, r]
function furMerge(blobs = [], strands = []) {
  const parts = [];
  for (const [x, y, z, r, d = 0] of blobs) {
    parts.push({ geometry: puffGeos[d], matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r, r)), color: _white });
  }
  for (const [x, y, z, dx, dy, dz, len, r] of strands) {
    const q = new THREE.Quaternion().setFromUnitVectors(_up, new THREE.Vector3(dx, dy, dz).normalize());
    parts.push({ geometry: strandGeo, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, len, r)), color: _white });
  }
  const g = bakeVertexColored(parts);
  g.deleteAttribute('color');
  return g;
}
const furGeo = (key, high, low) => G('fur' + key, () => furMerge(...high), () => furMerge(...(low || [])));
const FUR = {
  // 폼폼 꼬리
  tail: () => furGeo('tail', [
    [[0, 0, -0.05, 0.34, 1], ...[[0.22, 0.08, -0.06], [-0.22, 0.06, -0.04], [0.06, 0.24, -0.08], [-0.04, -0.2, -0.06], [0.12, -0.08, -0.22], [-0.12, 0.1, -0.22]].map(([x, y, z]) => [x, y, z, 0.2])],
  ], [[[0, 0, -0.06, 0.42, 1]]]),
  // 콧수염 패드 + 볼털
  muzzle: () => furGeo('muzzle', [
    [[0.13, 0.27, 0.64, 0.13, 1], [-0.13, 0.27, 0.64, 0.13, 1], ...[1, -1].flatMap((s) => [[0.5 * s, 0.28, 0.44, 0.16], [0.6 * s, 0.18, 0.34, 0.13], [0.42 * s, 0.14, 0.5, 0.12]])],
    [1, -1].flatMap((s) => [[0.6 * s, 0.24, 0.4, s, -0.3, 0.3, 0.22, 0.05], [0.52 * s, 0.1, 0.46, 0.8 * s, -0.8, 0.3, 0.2, 0.05], [0.66 * s, 0.3, 0.3, s, 0.1, 0, 0.2, 0.045]]),
  ], [[[0.13, 0.27, 0.64, 0.13], [-0.13, 0.27, 0.64, 0.13], [0.52, 0.24, 0.42, 0.17], [-0.52, 0.24, 0.42, 0.17]]]),
  whiskers: () => furGeo('whiskers', [[], [1, -1].flatMap((s) => [0, 1, 2].map((k) => [0.2 * s, 0.24 + k * 0.05, 0.7, s, (k - 1) * 0.25, 0.15, 0.5, 0.018]))]),
  // 목 주변 가슴털 (x는 몸통 폭에 맞춰 스케일)
  ruff: () => {
    const pts = [];
    for (let i = 0; i < 9; i++) { const a = -1.3 + i * (2.6 / 8); pts.push([0.62 * Math.sin(a), 1.66 + 0.04 * Math.cos(i * 1.7), 0.02 + 0.55 * Math.cos(a), a, 0.19 + 0.04 * (i % 2)]); }
    // 앞쪽 아래로 늘어지는 두 번째 층 (둥근 덩어리만, 가닥은 짧게 옆으로)
    const lower = [-0.5, -0.17, 0.17, 0.5].map((a, i) => [0.5 * Math.sin(a), 1.47 - 0.03 * (i % 2), 0.08 + 0.52 * Math.cos(a), 0.17]);
    return furGeo('ruff', [[...pts.map(([x, y, z, , r]) => [x, y, z, r]), ...lower], pts.filter((p, i) => i % 2 === 0).map(([x, y, z, a]) => [x, y + 0.02, z, Math.sin(a), 0.35, Math.cos(a), 0.16, 0.08])],
      [[[0.5, 1.66, 0.32, 0.23], [0, 1.68, 0.57, 0.25], [-0.5, 1.66, 0.32, 0.23]]]);
  },
  // 손목/발목 털 커프 (반지름 0.3 기준, 메시 스케일로 맞춤). 저품질은 생략
  cuff: () => {
    const ring = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ring.push([Math.cos(a), Math.sin(a), i]); }
    return furGeo('cuff', [ring.map(([c, s, i]) => [0.3 * c, i % 2 ? 0.035 : -0.035, 0.3 * s, i % 2 ? 0.12 : 0.14])]);
  },
  // 귀 끝 솜털
  earTip: () => furGeo('earTip', [
    [[0, 0, 0, 0.2], [0.08, 0.1, 0, 0.13], [-0.08, 0.08, 0.02, 0.12], [0, 0.16, 0, 0.11]],
    [[0, 0.1, 0, 0, 1, 0.1, 0.22, 0.06], [0.08, 0.08, 0, 0.5, 1, 0, 0.18, 0.05], [-0.08, 0.08, 0, -0.5, 1, 0, 0.18, 0.05]],
  ], [[[0, 0.05, 0, 0.22], [0, 0.18, 0, 0.14]]]),
  // 귓속 분홍 털 (저품질 생략)
  earInner: () => furGeo('earInner', [
    [[0, -0.02, 0, 0.12], [0.03, 0.1, 0.01, 0.11], [-0.025, 0.21, 0, 0.1], [0.015, 0.31, 0, 0.085], [0, 0.4, 0, 0.065]],
  ]),
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
  const E = EYE_SHAPES[f.eyes] || EYE_SHAPES.sharp;
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
  const K = new Kit(0.018);
  const root = new THREE.Group();
  const hips = grp(root, 0, 0.98, 0);
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
    const leg = grp(hips, 0.085 * s, -0.07, 0);
    const shin = grp(leg, 0, -0.42, 0);
    const foot = grp(shin, 0, -0.4, 0);
    if (legsT === 'shorts') {
      K.add(leg, rbox(0.155, 0.17, 0.17, 0.05), pants, 0, -0.06, 0);
      K.add(leg, rbox(0.115, 0.3, 0.125, 0.05), skin, 0, -0.27, 0, 0, 0, 0, false);
      K.add(shin, rbox(0.12, 0.38, 0.13, 0.05), socks, 0, -0.19, 0);
    } else if (legsT === 'skirt') {
      K.add(leg, rbox(0.115, 0.42, 0.125, 0.05), skin, 0, -0.2, 0);
      K.add(shin, rbox(0.12, 0.36, 0.13, 0.05), socks, 0, -0.2, 0);
    } else if (legsT === 'cargo') {
      K.add(leg, rbox(0.165, 0.44, 0.18, 0.05), pants, 0, -0.2, 0);
      K.add(leg, rbox(0.05, 0.13, 0.12, 0.02), shade2(pants), 0.085 * s, -0.24, 0, 0, 0, 0, false);
      K.add(shin, rbox(0.15, 0.36, 0.165, 0.05), pants, 0, -0.17, 0);
      K.add(shin, rbox(0.16, 0.06, 0.175, 0.02), shade2(pants), 0, -0.33, 0, 0, 0, 0, false);
    } else {
      K.add(leg, rbox(0.145, 0.44, 0.16, 0.05), pants, 0, -0.2, 0);
      K.add(shin, rbox(0.125, 0.4, 0.14, 0.05), pants, 0, -0.19, 0);
    }
    // 하이탑 스니커즈
    K.add(foot, rbox(0.14, 0.12, 0.25, 0.045), shoe, 0, -0.035, 0.035);
    K.add(foot, rbox(0.15, 0.035, 0.265, 0.015), sole, 0, -0.09, 0.04, 0, 0, 0, false);
    rig[s > 0 ? 'legL' : 'legR'] = leg;
    rig[s > 0 ? 'shinL' : 'shinR'] = shin;
    rig[s > 0 ? 'footL' : 'footR'] = foot;
  }

  // ----- 상체 -----
  const torso = grp(hips, 0, 0.03, 0);
  const wide = outfit === 'hoodie' || outfit === 'coat' ? 1.07 : 1;
  const jz = 0.66, fz = 0.121 * wide; // 몸통 타원 비율, 가슴 앞면 z
  K.add(torso, cyl(0.2 * wide, 0.16 * wide, 0.5, 12), body, 0, 0.27, 0).scale.set(1, 1, jz);
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
    K.add(torso, cyl(0.212, 0.172, 0.36, 12), accent, 0, 0.3, 0).scale.set(1, 1, 0.68);
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
    K.add(hips, rbox(0.34, 0.5, 0.04, 0.02), body, 0, -0.24, -0.11, 0.12, 0, 0);
    for (const s of [1, -1]) K.add(hips, rbox(0.04, 0.42, 0.18, 0.02), body, 0.165 * s, -0.2, -0.02, 0, 0, 0.1 * s);
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

  // ----- 머리 -----
  const head = grp(torso, 0, 0.57, 0);
  const headM = K.add(head, sph(HR, 20, 14), skin, 0, HCY, HCZ);
  headM.scale.set(0.9, 1.1, 0.95);
  const brow = shade(hair, 0.55);
  const tex = faceTexture({ eyes: L.eyes || 'sharp', eye: L.eye ?? 0x5a3a2a, mouth: L.mouth || 'smile', blush: !!L.blush, brow });
  let faceMat = null;
  if (tex) {
    faceMat = new THREE.MeshToonMaterial({ map: tex, transparent: true, depthWrite: false, gradientMap: grad });
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
  const bang = (d0, d1, th1, w, th0 = 0.62, col = hair) => strand(K, head, hp(d0, th0, 1.1), hp(d1, th1, 1.08), w, col);
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
    const arm = grp(torso, 0.225 * s, 0.47, 0);
    K.add(arm, sph(0.075, 10, 8), outfit === 'vest' ? accent : body, 0, 0, 0, 0, 0, 0, false);
    K.add(arm, rbox(0.12, 0.3, 0.12, 0.04), sleeve, 0, -0.14, 0);
    if (outfit === 'track') K.add(arm, rbox(0.02, 0.3, 0.1, 0.008), 0xffffff, 0.058 * s, -0.14, 0, 0, 0, 0, false);
    if (outfit === 'bomber' && s > 0) K.add(arm, rbox(0.02, 0.06, 0.06, 0.008), 0xffd84a, 0.06, -0.08, 0, 0, 0, 0, false);
    const fore = grp(arm, 0, -0.28, 0);
    K.add(fore, rbox(0.105, 0.24, 0.105, 0.035), sleeve, 0, -0.1, 0);
    const cuff = outfit === 'vest' ? 0xffffff : outfit === 'coat' || outfit === 'tech' ? accent : outfit === 'blazer' ? inner : shade2(body);
    K.add(fore, rbox(0.115, 0.05, 0.115, 0.015), cuff, 0, -0.21, 0, 0, 0, 0, false);
    const hand = grp(fore, 0, -0.27, 0);
    if (L.hands === 'boxing') {
      K.add(hand, sph(0.085, 12, 10), body, 0, -0.01, 0.01);
      K.add(hand, cyl(0.07, 0.07, 0.05, 10), 0xffffff, 0, 0.06, 0, 0, 0, 0, false);
    } else {
      K.add(hand, sph(0.06, 10, 8), skin, 0, -0.01, 0.01).scale.set(1, 1.15, 1.05);
      if (L.hands === 'fingerless') K.add(hand, rbox(0.11, 0.06, 0.11, 0.02), 0x1b1b24, 0, 0.0, 0.01, 0, 0, 0, false);
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
  titan: { name: '캐럿 타이탄', color: 0xff4b3a, desc: '거대한 건틀릿으로 모든 걸 부수는 파워 브롤러. 로켓 펀치와 점프 스톰프가 특기.' },
  bolt: { name: '볼트 헤어', color: 0x33d4ff, desc: '부스터로 전장을 가르는 스피드형. 귀를 드릴로 바꿔 돌진하고 토네이도 킥으로 휩쓴다.' },
  cannon: { name: '문 캐논', color: 0x9b6bff, desc: '어깨 포드의 유도 당근 미사일과 눈에서 뿜는 문 레이저로 멀리서 제압하는 포격형.' },
  hammer: { name: '해머 버니', color: 0x58cf5a, desc: '거대한 당근 해머를 휘두르는 중장갑 버니. 회전 해머와 대지 가르기 슬램.' },
};

const PAL = {
  titan: { main: 0xff4b3a, dark: 0x6e1d1c, acc: 0xffc93a, metal: 0xdfe3ea, bulk: 1.12, fist: 0.9, ear: 1.25 },
  bolt: { main: 0x33d4ff, dark: 0x1c3a66, acc: 0xffffff, metal: 0xeaf6ff, bulk: 0.84, fist: 0.58, ear: 1.5 },
  cannon: { main: 0x9b6bff, dark: 0x242a5c, acc: 0xffd24a, metal: 0xd4d2ee, bulk: 1.0, fist: 0.62, ear: 1.3 },
  hammer: { main: 0x58cf5a, dark: 0x2c5f31, acc: 0xffd63a, metal: 0xf0ead2, bulk: 1.22, fist: 0.7, ear: 1.1 },
};

export function createRobot(type = 'titan', opts = {}) {
  const P = PAL[type] || PAL.titan;
  const team = opts.team ?? 0xffffff;
  const b = P.bulk;
  const K = new Kit(0.055);
  const root = new THREE.Group();
  const hips = grp(root, 0, 2.6, 0);
  const rig = { root, hips, height: 5.5, radius: type === 'bolt' ? 1.25 : type === 'hammer' ? 1.55 : 1.45, type, eyes: [], thrusters: [], muzzles: [], weapon: null };
  const eyeCol = type === 'cannon' ? 0xff4fd8 : type === 'bolt' ? 0x7dfcff : type === 'hammer' ? 0xfff27a : 0x66f0ff;
  const eyeM = K.glow(eyeCol, 1.5);
  const coreM = K.glow(type === 'titan' ? 0xffa030 : eyeCol, 1.5);
  // 털: 작은 공유 지오메트리 뭉치, 그림자/아웃라인 없음 (저품질은 본 병합에 축소판으로 들어간다)
  const FURC = 0xfff3e2;
  const fur = (parent, geo, color, x, y, z, sx = 1, sy = 1, sz = 1, outline = false) => {
    const m = K.add(parent, geo, color, x, y, z, 0, 0, 0, outline);
    m.scale.set(sx, sy, sz);
    m.castShadow = outline;
    m.userData.fur = true;
    return m;
  };

  // 골반/꼬리
  K.add(hips, rbox(1.35 * b, 0.62, 0.95), P.dark, 0, -0.05, 0);
  K.add(hips, rbox(0.7 * b, 0.4, 0.2, 0.08), P.acc, 0, -0.05, 0.47, 0, 0, 0, false);
  fur(hips, FUR.tail(), 0xffffff, 0, 0.08, -0.6, b, 1, 1, true);

  // 다리
  for (const s of [1, -1]) {
    const leg = grp(hips, 0.58 * b * s, -0.2, 0);
    K.add(leg, sph(0.36, 12, 10), P.metal, 0, 0, 0, 0, 0, 0, false);
    K.add(leg, rbox(0.62 * b, 1.0, 0.7 * b), P.main, 0, -0.52, 0);
    const shin = grp(leg, 0, -1.05, 0);
    K.add(shin, sph(0.33, 12, 10), P.metal, 0, 0, 0.05, 0, 0, 0, false);
    K.add(shin, rbox(0.72 * b, 0.98, 0.8 * b), P.main, 0, -0.5, 0);
    K.add(shin, rbox(0.5 * b, 0.55, 0.14, 0.05), P.acc, 0, -0.45, 0.4 * b, 0, 0, 0, false);
    const foot = grp(shin, 0, -1.05, 0);
    K.add(foot, rbox(0.86 * b, 0.32, 1.35), P.dark, 0, -0.14, 0.18);
    K.add(foot, rbox(0.7 * b, 0.16, 0.4, 0.06), P.metal, 0, -0.02, 0.72, 0, 0, 0, false);
    fur(foot, FUR.cuff(), FURC, 0, 0.06, 0, 1.3 * b, 1, 1.4 * b);
    if (type === 'bolt') {
      K.add(shin, cyl(0.2, 0.26, 0.7, 10), P.metal, 0, -0.35, -0.5, 0.25);
      const t = grp(shin, 0, -0.75, -0.6);
      rig.thrusters.push(t);
    }
    rig[s > 0 ? 'legL' : 'legR'] = leg;
    rig[s > 0 ? 'shinL' : 'shinR'] = shin;
    rig[s > 0 ? 'footL' : 'footR'] = foot;
  }

  // 몸통
  const torso = grp(hips, 0, 0.15, 0);
  K.add(torso, cyl(0.52 * b, 0.6 * b, 0.6, 14), P.metal, 0, 0.3, 0);
  K.add(torso, rbox(1.95 * b, 1.35, 1.2, 0.28), P.main, 0, 1.08, 0);
  K.add(torso, rbox(2.0 * b, 0.2, 1.24, 0.08), team, 0, 0.52, 0, 0, 0, 0, false);
  K.add(torso, rbox(1.0 * b, 0.5, 0.2, 0.08), P.acc, 0, 0.45, 0.55);
  const core = K.add(torso, sph(0.2, 12, 10), coreM, 0, 0.42, 0.66, 0, 0, 0, false);
  rig.chestCore = core;
  // 조종석 캐노피
  const cockpit = grp(torso, 0, 0.62, 0.72);
  rig.cockpit = cockpit;
  const glass = new THREE.Mesh(sph(0.66, 20, 14), new THREE.MeshToonMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.28, depthWrite: false, gradientMap: grad }));
  glass.position.set(0, 0.62, 0.74);
  glass.scale.set(1, 1, 0.8);
  glass.renderOrder = 2;
  K.all.push(glass.material);
  K.keep(glass);
  torso.add(glass);
  K.add(torso, torus(0.62, 0.07), P.dark, 0, 1.0, 0.62, 0, 0, 0, false);
  // 가슴 털 칼라 (목 주변)
  fur(torso, FUR.ruff(), FURC, 0, 0, 0, b, 1, 1);
  // 백팩 + 추진기
  K.add(torso, rbox(1.25 * b, 1.05, 0.55), P.dark, 0, 1.05, -0.78);
  for (const s of [1, -1]) {
    K.add(torso, cyl(0.2, 0.28, 0.4, 10), P.metal, 0.38 * s, 0.4, -0.95);
    rig.thrusters.push(grp(torso, 0.38 * s, 0.15, -0.98));
  }
  // 머리
  const head = grp(torso, 0, 1.75, 0);
  K.add(head, cyl(0.3, 0.35, 0.3, 10), P.metal, 0, 0.05, 0, 0, 0, 0, false);
  K.add(head, rbox(1.3, 1.02, 1.12, 0.3), P.main, 0, 0.55, 0);
  K.add(head, rbox(1.0, 0.56, 0.22, 0.1), P.metal, 0, 0.36, 0.52);
  // 토끼 주둥이: 콧수염 패드 + 볼털 + 수염, 앞니 판
  fur(head, FUR.muzzle(), FURC, 0, 0, 0);
  fur(head, FUR.whiskers(), 0x3a3346, 0, 0, 0);
  for (const s of [1, -1]) {
    K.add(head, rbox(0.15, 0.24, 0.08, 0.03), 0xffffff, 0.08 * s, 0.07, 0.68, 0, 0, 0, false);
    K.add(head, sph(0.2, 10, 8), P.acc, 0.66 * s, 0.45, 0, 0, 0, Math.PI / 2, false).scale.set(1, 0.5, 1);
  }
  K.add(head, sph(0.09, 8, 6), 0xff7aa8, 0, 0.36, 0.75, 0, 0, 0, false).scale.set(1.2, 0.85, 1);
  if (type === 'cannon') {
    const v = K.add(head, rbox(1.1, 0.24, 0.16, 0.06), eyeM, 0, 0.72, 0.56, 0, 0, 0, false);
    rig.eyes.push(v);
    K.add(head, rbox(1.2, 0.36, 0.1, 0.05), P.dark, 0, 0.72, 0.5, 0, 0, 0, false);
    rig.laserOrigin = grp(head, 0, 0.72, 0.7);
    rig.muzzles.push(rig.laserOrigin);
  } else {
    for (const s of [1, -1]) {
      const e = K.add(head, sph(0.13, 12, 10), eyeM, 0.3 * s, 0.72, 0.56, 0, 0, 0, false);
      e.scale.set(1, type === 'titan' ? 0.75 : 1.15, 0.5);
      rig.eyes.push(e);
      if (type === 'titan') K.add(head, rbox(0.34, 0.08, 0.1, 0.03), P.dark, 0.3 * s, 0.86, 0.58, 0, 0, -0.25 * s, false);
    }
  }
  // 귀
  for (const s of [1, -1]) {
    const ear = grp(head, 0.34 * s, 1.0, -0.1);
    const tilt = grp(ear, 0, 0, 0);
    tilt.rotation.z = -0.18 * s;
    const L = P.ear;
    const e = K.add(tilt, caps(0.24, L), P.main, 0, L * 0.5 + 0.2, 0);
    e.scale.set(1, 1, 0.62);
    K.add(tilt, caps(0.12, L * 0.8), 0xffb3cf, 0, L * 0.5 + 0.2, 0.1, 0, 0, 0, false).scale.set(1, 1, 0.4);
    fur(tilt, FUR.earInner(), 0xffc6da, 0, L * 0.3 + 0.28, 0.13, 1, L * 0.75 + 0.2, 0.8);
    if (type !== 'bolt') fur(tilt, FUR.earTip(), P.main, 0, L + 0.34, 0, 1, 1, 0.75);
    K.add(tilt, cyl(0.26, 0.26, 0.2, 10), P.metal, 0, 0.1, 0);
    K.add(tilt, rbox(0.3, 0.12, 0.2, 0.04), team, 0, L * 0.3 + 0.2, -0.05, 0, 0, 0, false);
    if (type === 'bolt') {
      K.add(tilt, cone(0.26, 0.8, 10), P.metal, 0, L + 0.75, 0);
      for (let k = 0; k < 3; k++) K.add(tilt, torus(0.2 - k * 0.05, 0.03), P.acc, 0, L + 0.5 + k * 0.2, 0, Math.PI / 2, 0, 0, false);
    }
    rig[s > 0 ? 'earL' : 'earR'] = ear;
  }
  if (type === 'titan') {
    const ant = K.add(head, cone(0.16, 0.55, 8), 0xff8a1f, 0, 1.3, 0.2, Math.PI);
    for (let i = 0; i < 3; i++) K.add(ant, cone(0.06, 0.3, 5), 0x3fcf4a, Math.sin(i * 2.1) * 0.06, -0.38, Math.cos(i * 2.1) * 0.06, Math.PI + Math.cos(i * 2.1) * 0.4, 0, Math.sin(i * 2.1) * 0.4, false);
  }
  if (type === 'hammer') {
    K.add(head, rbox(1.36, 0.22, 1.18, 0.08), P.acc, 0, 0.98, 0, 0, 0, 0, false);
  }
  // 어깨 포드 (문 캐논)
  if (type === 'cannon') {
    for (const s of [1, -1]) {
      const pod = grp(torso, 1.05 * s, 1.95, -0.25);
      K.add(pod, rbox(0.8, 0.62, 1.05, 0.14), P.dark, 0, 0, 0);
      K.add(pod, rbox(0.84, 0.14, 1.08, 0.05), team, 0, 0.18, 0, 0, 0, 0, false);
      for (let k = 0; k < 3; k++) {
        const x = (k - 1) * 0.24;
        K.add(pod, cone(0.1, 0.3, 8), 0xff8a1f, x, -0.08, 0.62, Math.PI / 2, 0, 0, false);
        rig.muzzles.push(grp(pod, x, 0.05, 0.6));
      }
    }
  }
  // 팔
  for (const s of [1, -1]) {
    const arm = grp(torso, 1.25 * b * s, 1.45, 0);
    K.add(arm, sph(0.52, 14, 10), P.main, 0, 0.05, 0);
    K.add(arm, rbox(0.7, 0.18, 0.7, 0.06), team, 0.06 * s, 0.38, 0, 0, 0, 0, false);
    K.add(arm, rbox(0.46, 0.85, 0.46), P.metal, 0, -0.5, 0);
    const fore = grp(arm, 0, -0.95, 0);
    K.add(fore, sph(0.3, 10, 8), P.dark, 0, 0, 0, 0, 0, 0, false);
    K.add(fore, rbox(0.62 * (type === 'titan' ? 1.2 : 1), 0.82, 0.66 * (type === 'titan' ? 1.2 : 1)), P.main, 0, -0.42, 0);
    fur(fore, FUR.cuff(), FURC, 0, -0.8, 0, type === 'titan' ? 1.25 : 1.05, 1, type === 'titan' ? 1.3 : 1.1);
    const hand = grp(fore, 0, -0.9, 0);
    const fist = grp(hand, 0, 0, 0);
    const f = P.fist;
    K.add(fist, rbox(f, f * 0.95, f, f * 0.25), type === 'titan' ? P.acc : P.dark, 0, -f * 0.3, 0.02);
    K.add(fist, rbox(f * 1.02, f * 0.25, f * 0.5, f * 0.1), P.metal, 0, -f * 0.3, f * 0.3, 0, 0, 0, false);
    rig[s > 0 ? 'armL' : 'armR'] = arm;
    rig[s > 0 ? 'foreL' : 'foreR'] = fore;
    rig[s > 0 ? 'handL' : 'handR'] = hand;
    rig[s > 0 ? 'fistL' : 'fistR'] = fist;
  }
  // 해머
  if (type === 'hammer') {
    const w = grp(rig.handR, 0, -0.2, 0.05);
    K.add(w, cyl(0.12, 0.12, 2.6, 8), 0x8a5a2b, 0, -1.2, 0);
    const headG = grp(w, 0, -2.55, 0);
    K.add(headG, cyl(0.62, 0.62, 1.1, 14), 0xff8a1f, 0, 0, 0, 0, 0, Math.PI / 2);
    K.add(headG, cone(0.62, 1.1, 14), 0xff8a1f, -1.1, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) K.add(headG, cone(0.14, 0.8, 5), 0x3fcf4a, 0.75, Math.sin(i * 1.6) * 0.25, Math.cos(i * 1.6) * 0.25, 0, 0, -Math.PI / 2 + Math.sin(i * 1.6) * 0.4, false);
    for (let i = 0; i < 3; i++) K.add(headG, torus(0.5 - i * 0.1, 0.03), 0xd8620c, -0.2 - i * 0.35, 0, 0, 0, Math.PI / 2, 0, false);
    rig.weapon = w;
  }
  rig.torso = torso;
  rig.head = head;
  rig.makeFist = () => {
    // 발사체는 1초 남짓 살기 때문에 생성 시점 품질을 따른다 (지오메트리는 공유 캐시)
    const low = K.low;
    const q = (geo) => (low ? lowGeo(geo) : geo);
    const g = new THREE.Group();
    const f = P.fist;
    const m = new THREE.Mesh(q(rbox(f, f * 0.95, f, f * 0.25)), K.m(type === 'titan' ? P.acc : P.dark));
    if (!low) addOutline(m, K.ol, false);
    m.castShadow = true;
    g.add(m);
    const k = new THREE.Mesh(q(rbox(f * 1.02, f * 0.25, f * 0.5, f * 0.1)), K.m(P.metal));
    k.position.set(0, 0, f * 0.3);
    g.add(k);
    const ring = new THREE.Mesh(q(cyl(f * 0.45, f * 0.55, f * 0.5, 12)), K.m(P.main));
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -f * 0.6;
    if (!low) addOutline(ring, K.ol, false);
    g.add(ring);
    return g;
  };
  return K.finish(rig);
}

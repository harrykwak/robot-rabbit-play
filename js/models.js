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
export function createHuman(o = {}) {
  const body = o.body ?? 0xff4d4d, accent = o.accent ?? 0x2b3a67, skin = o.skin ?? 0xffd3ae, hair = o.hair ?? 0x3a2418, style = o.style ?? 0;
  const K = new Kit(0.022);
  const root = new THREE.Group();
  const hips = grp(root, 0, 0.8, 0);
  K.add(hips, rbox(0.46, 0.22, 0.3), accent, 0, -0.02, 0);
  const rig = { root, hips, height: 1.9, radius: 0.45 };
  for (const s of [1, -1]) {
    const leg = grp(hips, 0.13 * s, -0.08, 0);
    K.add(leg, rbox(0.2, 0.34, 0.22), accent, 0, -0.16, 0);
    const shin = grp(leg, 0, -0.33, 0);
    K.add(shin, rbox(0.19, 0.3, 0.2), accent, 0, -0.14, 0);
    const foot = grp(shin, 0, -0.3, 0);
    K.add(foot, rbox(0.23, 0.14, 0.34, 0.06), 0xfafafa, 0, -0.02, 0.05);
    K.add(foot, rbox(0.235, 0.05, 0.345, 0.02), body, 0, -0.07, 0.05, 0, 0, 0, false);
    rig[s > 0 ? 'legL' : 'legR'] = leg;
    rig[s > 0 ? 'shinL' : 'shinR'] = shin;
    rig[s > 0 ? 'footL' : 'footR'] = foot;
  }
  const torso = grp(hips, 0, 0.02, 0);
  K.add(torso, rbox(0.5, 0.46, 0.32, 0.1), body, 0, 0.25, 0);
  K.add(torso, rbox(0.52, 0.07, 0.34, 0.03), 0x22252f, 0, 0.04, 0, 0, 0, 0, false);
  K.add(torso, rbox(0.2, 0.14, 0.05, 0.03), 0xffffff, 0, 0.3, 0.16, 0, 0, 0, false);
  const head = grp(torso, 0, 0.5, 0);
  K.add(head, cyl(0.08, 0.09, 0.1, 8), skin, 0, 0.02, 0, 0, 0, 0, false);
  K.add(head, sph(0.33, 20, 14), skin, 0, 0.3, 0);
  const eyeM = K.m(0x1b1b28);
  for (const s of [1, -1]) {
    const e = K.add(head, sph(0.05, 10, 8), eyeM, 0.11 * s, 0.3, 0.29, 0, 0, 0, false);
    e.scale.set(0.95, 1.5, 0.6);
    const hl = K.add(head, sph(0.018, 6, 4), 0xffffff, 0.1 * s + 0.015, 0.335, 0.325, 0, 0, 0, false);
    hl.castShadow = false;
    const bl = K.add(head, sph(0.045, 8, 6), 0xff9aa8, 0.19 * s, 0.2, 0.25, 0, 0, 0, false);
    bl.scale.set(1, 0.55, 0.4);
    bl.castShadow = false;
  }
  // 헤어/모자 스타일
  if (style === 1) {
    K.add(head, sph(0.345, 18, 12), hair, 0, 0.33, -0.05);
    const cap = K.add(head, sph(0.36, 18, 10), accent, 0, 0.4, -0.01);
    cap.scale.set(1, 0.72, 1);
    K.add(head, rbox(0.44, 0.04, 0.26, 0.02), accent, 0, 0.49, 0.3, -0.12);
    K.add(head, sph(0.06, 8, 6), body, 0, 0.66, 0);
  } else if (style === 2) {
    const hood = K.add(head, sph(0.37, 18, 12), body, 0, 0.33, -0.06);
    hood.scale.set(1.02, 1, 1);
    K.add(head, sph(0.345, 18, 12), hair, 0, 0.36, -0.03, 0, 0, 0, false);
    for (const s of [1, -1]) {
      const ear = K.add(head, caps(0.07, 0.34), body, 0.14 * s, 0.82, -0.06, -0.15, 0, -0.18 * s);
      ear.scale.set(1, 1, 0.55);
      K.add(ear, caps(0.035, 0.26), 0xffb3c8, 0, 0.01, 0.03, 0, 0, 0, false).scale.set(1, 1, 0.5);
    }
  } else if (style === 3) {
    K.add(head, sph(0.35, 18, 12), hair, 0, 0.35, -0.05);
    const tail = K.add(head, caps(0.1, 0.34), hair, 0, 0.3, -0.42, 0.5);
    tail.scale.set(1, 1, 0.8);
    K.add(head, torus(0.08, 0.025), body, 0, 0.47, -0.36, 0.9, 0, 0, false);
  } else if (style === 4) {
    // 도리: 둥근 방패 헬멧 + 앞 가리개
    K.add(head, sph(0.345, 18, 12), hair, 0, 0.33, -0.05);
    const helm = K.add(head, sph(0.375, 18, 10), accent, 0, 0.37, -0.02);
    helm.scale.set(1.05, 0.78, 1.05);
    K.add(head, rbox(0.5, 0.06, 0.12, 0.03), 0xffd84a, 0, 0.5, 0.28, -0.2, 0, 0, false);
    K.add(head, rbox(0.08, 0.2, 0.44, 0.03), body, 0, 0.62, -0.02, 0, 0, 0, false);
  } else if (style === 5) {
    // 하루: 뒤로 뻗친 머리 + 이마 고글
    K.add(head, sph(0.345, 18, 12), hair, 0, 0.35, -0.05);
    for (const [x, y, z, rx, rz] of [[0.12, 0.5, -0.3, 1.2, -0.3], [-0.12, 0.5, -0.3, 1.2, 0.3], [0, 0.58, -0.22, 0.9, 0]]) K.add(head, cone(0.09, 0.28, 6), hair, x, y, z, rx, 0, rz);
    K.add(head, torus(0.33, 0.035), 0x2b2b35, 0, 0.44, 0.02, Math.PI / 2 - 0.25, 0, 0, false);
    for (const s of [1, -1]) {
      K.add(head, cyl(0.09, 0.09, 0.07, 10), 0x2b2b35, 0.12 * s, 0.5, 0.3, 1.3, 0, 0, false);
      K.add(head, cyl(0.065, 0.065, 0.02, 10), 0x7fe0ff, 0.12 * s, 0.515, 0.335, 1.3, 0, 0, false);
    }
  } else if (style === 6) {
    // 타로: 짧은 머리 + 상투 + 두건
    K.add(head, sph(0.34, 18, 12), hair, 0, 0.33, -0.06);
    K.add(head, sph(0.12, 10, 8), hair, 0, 0.72, -0.12);
    K.add(head, torus(0.335, 0.05), body, 0, 0.42, -0.02, Math.PI / 2 - 0.12, 0, 0, false);
    K.add(head, caps(0.04, 0.2), body, 0.05, 0.36, -0.4, 0.9, 0, 0.4, false);
  } else if (style === 7) {
    // 루나: 긴 머리 + 뾰족 모자
    K.add(head, sph(0.35, 18, 12), hair, 0, 0.34, -0.06);
    const back = K.add(head, caps(0.2, 0.3), hair, 0, 0.12, -0.2, 0.15);
    back.scale.set(1.3, 1, 0.7);
    K.add(head, cyl(0.52, 0.52, 0.04, 16), accent, 0, 0.56, -0.02, -0.08, 0, 0);
    K.add(head, cone(0.3, 0.62, 12), accent, 0, 0.88, -0.1, -0.35, 0, 0);
    K.add(head, sph(0.06, 8, 6), 0xffe070, 0, 1.12, -0.28, 0, 0, 0, false);
  } else {
    K.add(head, sph(0.345, 18, 12), hair, 0, 0.35, -0.05);
    const spikes = [[0, 0.62, 0.02, -0.4, 0], [0.16, 0.58, -0.04, -0.2, -0.6], [-0.16, 0.58, -0.04, -0.2, 0.6], [0.08, 0.58, -0.24, 0.5, -0.3], [-0.1, 0.56, -0.26, 0.6, 0.35], [0, 0.46, -0.36, 1.1, 0]];
    for (const [x, y, z, rx, rz] of spikes) K.add(head, cone(0.1, 0.3, 6), hair, x, y, z, rx, 0, rz);
    K.add(head, rbox(0.5, 0.05, 0.06, 0.02), 0xff3344, 0, 0.47, 0.22, -0.3, 0, 0, false);
  }
  for (const s of [1, -1]) {
    const arm = grp(torso, 0.31 * s, 0.43, 0);
    K.add(arm, sph(0.1, 10, 8), body, 0, 0, 0, 0, 0, 0, false);
    K.add(arm, rbox(0.16, 0.26, 0.16), body, 0, -0.12, 0);
    const fore = grp(arm, 0, -0.25, 0);
    K.add(fore, rbox(0.14, 0.2, 0.14), skin, 0, -0.1, 0);
    const hand = grp(fore, 0, -0.24, 0);
    K.add(hand, sph(0.12, 12, 10), 0xff5b3a === body ? 0xffffff : 0xf04a3a, 0, 0, 0.01);
    K.add(hand, cyl(0.1, 0.1, 0.06, 10), 0xffffff, 0, 0.1, 0, 0, 0, 0, false);
    rig[s > 0 ? 'armL' : 'armR'] = arm;
    rig[s > 0 ? 'foreL' : 'foreR'] = fore;
    rig[s > 0 ? 'handL' : 'handR'] = hand;
  }
  rig.torso = torso;
  rig.head = head;
  rig.remote = createRemote();
  rig.remote.position.set(0, -0.02, 0.04);
  rig.handR.add(rig.remote);
  return K.finish(rig);
}

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

  // 골반/꼬리
  K.add(hips, rbox(1.35 * b, 0.62, 0.95), P.dark, 0, -0.05, 0);
  K.add(hips, rbox(0.7 * b, 0.4, 0.2, 0.08), P.acc, 0, -0.05, 0.47, 0, 0, 0, false);
  K.add(hips, sph(0.42, 14, 10), 0xffffff, 0, 0.05, -0.62);

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
  for (const s of [1, -1]) {
    K.add(head, rbox(0.14, 0.2, 0.08, 0.03), 0xffffff, 0.075 * s, 0.1, 0.62, 0, 0, 0, false);
    K.add(head, sph(0.2, 10, 8), P.acc, 0.66 * s, 0.45, 0, 0, 0, Math.PI / 2, false).scale.set(1, 0.5, 1);
  }
  K.add(head, sph(0.09, 8, 6), 0xff7aa8, 0, 0.3, 0.64, 0, 0, 0, false);
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

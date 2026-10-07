// 하늘섬 아레나: 공용 환경(하늘, 조명, 구름) + 스테이지 3종 (당근 농장, 풍차 요새, 구름 정원)
// 지형은 도형 목록으로 표현한다. 도형마다 발자국(원/회전 사각형)과 윗면 높이가 있다.
//   disc: 원판 (holes 로 구멍), mound: 완만한 언덕, box: 블록/다리/움직이는 발판, ramp: 경사로
// 게임 쪽 API: setStage, setQuality, groundAt, surfaceAt, pushOut, isVoid, safePoint, randomPoint, waypoint
import * as THREE from 'three';
import { createEnvironmentArt, islandRadius } from './environment-art.js';

const STEP = 0.7; // 걸어서 오를 수 있는 높이
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const grad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([112, 140, 167, 193, 216, 235, 248, 255]), 8, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
})();
// Matte clay/paint responds continuously to the warm key and cool fill.
const toon = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .94, metalness: 0, ...extra });
const olMat = new THREE.MeshBasicMaterial({ color: 0x514b48, side: THREE.BackSide });
olMat.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.025;'); };

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, olMat);
    o.userData.outline = true;
    m.add(o);
  }
  parent.add(m);
  return m;
}

// ---------------- 절전 화질: 정적 메시 합치기 ----------------
// 움직이지 않는 스테이지 메시를 재질별로 한 지오메트리로 굽는다. 윤곽선은 전부 한 번에 그린다.
// 원본은 숨기기만 하므로 고화질로 돌아가면 그대로 다시 보인다. 충돌/길찾기는 도형 목록만 쓰므로 영향 없음.
const _mw = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3();
function bakeBatch(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const hidden = [];
  const piece = (mat, cast, recv, geo, matrix, start, count) => {
    const key = mat.uuid + (cast ? '1' : '0') + (recv ? '1' : '0');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast, recv, pieces: [] }));
    const idx = geo.index, total = idx ? idx.count : geo.attributes.position.count;
    const s = Math.max(0, start), e = Math.min(total, start + count);
    if (e > s) b.pieces.push({ geo, matrix: matrix.clone(), start: s, count: e - s });
  };
  // 숨길 수 있는 메시: 정적, 불투명, 보임, 그리고 자식이 전부 윤곽선이거나 함께 구워지는 메시.
  // three.js 는 부모를 숨기면 자식도 숨기므로, 굽지 않는 자식(투명/움직임/그룹/인스턴스)이
  // 하나라도 있으면 그 부모는 굽지 않고 그대로 둔다.
  const ok = new Map();
  const bakeable = (o) => {
    if (ok.has(o)) return ok.get(o);
    let r = !!o.isMesh && !o.isInstancedMesh && !o.userData.dyn && !o.userData.outline && o.visible;
    if (r) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => !m || m.transparent)) r = false;
    }
    if (r) for (const c of o.children) if (!(c.userData.outline && c.isMesh && !c.material.transparent) && !bakeable(c)) { r = false; break; }
    ok.set(o, r);
    return r;
  };
  const walk = (o) => {
    if (o.userData.dyn) return;
    if (bakeable(o)) {
      {
        _mw.multiplyMatrices(inv, o.matrixWorld);
        const geo = o.geometry;
        if (Array.isArray(o.material)) {
          for (const g of geo.groups) { const m = o.material[g.materialIndex]; if (m) piece(m, o.castShadow, o.receiveShadow, geo, _mw, g.start, g.count); }
        } else piece(o.material, o.castShadow, o.receiveShadow, geo, _mw, 0, Infinity);
        for (const c of o.children) if (c.userData.outline && c.visible) piece(c.material, false, false, geo, _mw, 0, Infinity);
        hidden.push(o);
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  const merged = [], geos = [];
  for (const b of buckets.values()) {
    const withUv = b.mat !== olMat;
    let nv = 0, ni = 0;
    for (const p of b.pieces) { nv += p.geo.index ? p.geo.attributes.position.count : p.count; ni += p.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = withUv ? new Float32Array(nv * 2) : null;
    const col = b.mat.vertexColors ? new Float32Array(nv * 3).fill(1) : null;
    const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const p of b.pieces) {
      const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, I = g.index;
      _nm.getNormalMatrix(p.matrix);
      const flip = p.matrix.determinant() < 0;
      const v0 = I ? 0 : p.start, vn = I ? P.count : p.count;
      for (let k = 0; k < vn; k++) {
        const src = v0 + k, dst = vo + k;
        _v.fromBufferAttribute(P, src).applyMatrix4(p.matrix);
        pos[dst * 3] = _v.x; pos[dst * 3 + 1] = _v.y; pos[dst * 3 + 2] = _v.z;
        if (N) { _v.fromBufferAttribute(N, src).applyMatrix3(_nm).normalize(); nor[dst * 3] = _v.x; nor[dst * 3 + 1] = _v.y; nor[dst * 3 + 2] = _v.z; }
        if (uv && U) { uv[dst * 2] = U.getX(src); uv[dst * 2 + 1] = U.getY(src); }
        if (col && C) { col[dst * 3] = C.getX(src); col[dst * 3 + 1] = C.getY(src); col[dst * 3 + 2] = C.getZ(src); }
      }
      for (let k = 0; k < p.count; k += 3) {
        const a = I ? I.getX(p.start + k) : k, bb = I ? I.getX(p.start + k + 1) : k + 1, c = I ? I.getX(p.start + k + 2) : k + 2;
        index[io++] = vo + a; index[io++] = vo + (flip ? c : bb); index[io++] = vo + (flip ? bb : c);
      }
      vo += vn;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geos.push(geo);
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv;
    m.matrixAutoUpdate = false;
    m.userData.batch = true;
    m.visible = false;
    root.add(m);
    merged.push(m);
  }
  return { merged, hidden, geos };
}

const groundTextures = new Map();
const THEMES = {
  farm: { turf: '#94b778', light: '#b0c98c', path: '#d2c7aa', edge: '#ede2c5', grass: 0x83aa68, rim: 0x567849, dirt: 0xa47c59, rock: 0x827d86, stone: 0x9aaba7, cap: 0xc6cfbd, sky: [0x75bdd9, 0xc5e7ea, 0x8dbccf] },
  fort: { turf: '#a0b282', light: '#bbca98', path: '#d8c6a8', edge: '#eee0c4', grass: 0xaaa47c, rim: 0x95815b, dirt: 0xb18b63, rock: 0x8e8280, stone: 0xc79776, cap: 0xf1dfbb, sky: [0x80b7d9, 0xf4e5cf, 0xadcbd2] },
  sky: { turf: '#91b3a7', light: '#b2c9b8', path: '#e2dcd1', edge: '#f4e9db', grass: 0x9cb8ae, rim: 0x728f8c, dirt: 0xb1a3a4, rock: 0x8b8aab, stone: 0xa7b9be, cap: 0xdce0d7, sky: [0x9fa5de, 0xebcfdc, 0xafc6e3] },
};
function groundTexture(theme = 'farm', cx = 0, cz = 0, radius = 24) {
  const key = theme + ':' + cx + ':' + cz + ':' + radius;
  if (groundTextures.has(key)) return groundTextures.get(key);
  const p = THEMES[theme], c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d'), extent = radius * 1.09, scale = 1024 / (extent * 2);
  const X = x => (x - cx + extent) * scale, Z = z => (z - cz + extent) * scale;
  let seed = 719;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = p.turf; g.fillRect(0, 0, 1024, 1024);
  // Broad watercolour washes, with a quiet centre for combat telegraphs.
  for (let i = 0; i < 170; i++) {
    const x = random() * 1024, z = random() * 1024, r = 35 + random() * 110;
    const wash = g.createRadialGradient(x, z, 0, x, z, r);
    wash.addColorStop(0, i % 3 ? p.light : p.turf); wash.addColorStop(1, p.turf);
    g.globalAlpha = .16; g.fillStyle = wash; g.beginPath(); g.ellipse(x, z, r, r * .65, random() * TAU, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  const routes = theme === 'farm' ? [
    [[0, 20], [0, 12], [0, 2], [0, -18.1]],
    [[0, 12], [-15, 12], [-16, -9], [0, -17]],
    [[0, 12], [15, 12], [16, -9], [0, -17]],
    [[-6, -5], [-10, -8], [-12, -10], [-13, -13]],
    [[0, 12], [2, 13], [4, 15], [8, 15]],
    [[0, -8], [2, -7], [3, -7], [4, -6]],
  ] : theme === 'fort' ? [
    [[0, 25], [-1, 17], [1, 12], [0, 4]],
    [[-23, 0], [-15, 0], [-12, -3], [-10.5, -3]],
    [[23, 1], [18, 1], [13, -3], [10.5, -3]],
    [[-11, -3], [-11, -10], [-8, -16], [0, -19]],
    [[11, -3], [12, -10], [9, -16], [0, -19]],
    [[0, 12], [2, 13], [4, 14], [9, 13]],
    [[-15, -9], [-15, -12], [-13, -14], [-11, -15]],
  ] : [
    [[0, 20], [0, 15], [0, 12], [0, 6.3]],
    [[0, 4.5], [2, 0], [0, -3], [0, -9]],
    [[0, 13], [-16, 14], [-18, -9], [0, -17]],
    [[0, 13], [16, 14], [18, -9], [0, -17]],
    [[-19, -4], [-16, -4], [-13, -4], [-8, -4]],
    [[19, -4], [16, -4], [13, -4], [8, -4]],
  ];
  for (const route of routes) {
    const curve = new THREE.CubicBezierCurve(new THREE.Vector2(...route[0]), new THREE.Vector2(...route[1]), new THREE.Vector2(...route[2]), new THREE.Vector2(...route[3]));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const draw = (color, width) => { g.strokeStyle = color; g.lineWidth = width * scale; g.beginPath(); g.moveTo(X(route[0][0]), Z(route[0][1])); g.bezierCurveTo(X(route[1][0]), Z(route[1][1]), X(route[2][0]), Z(route[2][1]), X(route[3][0]), Z(route[3][1])); g.stroke(); };
    const routeWidth = theme === 'fort' ? 1.4 : 1.85;
    draw(theme === 'sky' ? '#abc0b6' : '#809666', 2.1 * routeWidth);
    draw(theme === 'sky' ? '#c8c7c1' : '#b8b298', 1.83 * routeWidth);
    draw(p.path, 1.63 * routeWidth);
    // Staggered cobbles follow each curve, never a repeated tile grid.
    const n = Math.ceil(curve.getLength() / .52);
    for (let i = 0; i <= n; i++) {
      const q = curve.getPointAt(i / n), t = curve.getTangentAt(i / n), angle = Math.atan2(t.y, t.x);
      for (let row = -1; row <= 1; row++) {
        g.save(); g.translate(X(q.x - t.y * row * .5), Z(q.y + t.x * row * .5)); g.rotate(angle + (random() - .5) * .18);
        g.fillStyle = ['#ded4b8', '#e8dfc8', '#cfc5a9', p.edge][(i + row + 4) % 4]; g.globalAlpha = .78;
        g.beginPath(); g.roundRect(-.21 * scale, -.21 * scale, .42 * scale, .42 * scale, .095 * scale); g.fill();
        g.globalAlpha = .2; g.strokeStyle = '#fff6df'; g.lineWidth = .022 * scale; g.stroke(); g.restore();
      }
    }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1300; i++) {
    const a = random() * TAU, r = radius * (.86 + random() * .13), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    g.strokeStyle = i % 2 ? p.light : p.turf; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(X(x), Z(z)); g.lineTo(X(x) + 2, Z(z) - 3 - random() * 5); g.stroke();
  }
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  groundTextures.set(key, texture); return texture;
}

let stripeTex = null;
let courtWallTex = null;
function courtWallTexture() {
  if (courtWallTex) return courtWallTex;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d2c4a3'; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 6; row++) {
    const y = row * 43;
    ctx.fillStyle = row % 2 ? '#d6c9ad' : '#ccbea1'; ctx.fillRect(0, y + 2, 256, 39);
    ctx.fillStyle = '#b2a58c'; ctx.fillRect(0, y, 256, 2);
    for (let x = row % 2 ? -64 : 0; x < 256; x += 128) ctx.fillRect(x, y, 2, 43);
  }
  courtWallTex = new THREE.CanvasTexture(canvas); courtWallTex.colorSpace = THREE.SRGBColorSpace;
  return courtWallTex;
}
function stripeTexture() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1420';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffb000';
  for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  stripeTex = t;
  return t;
}

let contactTex = null;
function contactTexture() {
  if (contactTex) return contactTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const fade = g.createRadialGradient(32, 32, 5, 32, 32, 31);
  fade.addColorStop(0, 'rgba(44,51,48,.34)');
  fade.addColorStop(0.48, 'rgba(44,51,48,.20)');
  fade.addColorStop(1, 'rgba(44,51,48,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 64, 64);
  contactTex = new THREE.CanvasTexture(c);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  return contactTex;
}

// ---------------- 도형 계산 ----------------
const LC = { u: 0, v: 0 };
function toLocal(s, x, z) {
  const dx = x - s.x, dz = z - s.z;
  LC.u = dx * s.c + dz * s.s;
  LC.v = -dx * s.s + dz * s.c;
  return LC;
}
function inHole(s, x, z) {
  for (const h of s.holes) { const dx = x - h.x, dz = z - h.z; if (dx * dx + dz * dz < h.r * h.r) return true; }
  return false;
}
// 윗면 높이. 발자국 밖이면 null
function topAt(s, x, z) {
  if (s.type === 'disc') {
    const dx = x - s.x, dz = z - s.z;
    const radius = s.coast ? islandRadius(s.r, Math.atan2(dz, dx), s.x, s.z) : s.r;
    if (dx * dx + dz * dz > radius * radius) return null;
    if (s.holes && inHole(s, x, z)) return null;
    return s.h;
  }
  if (s.type === 'mound') {
    const dx = x - s.x, dz = z - s.z;
    const d2 = (dx * dx + dz * dz) / (s.r * s.r);
    if (d2 > 1) return null;
    const f = 1 - d2;
    return s.base + s.H * f * Math.sqrt(f);
  }
  const l = toLocal(s, x, z);
  if (Math.abs(l.u) > s.hu || Math.abs(l.v) > s.hv) return null;
  if (s.type === 'box') return s.h;
  return s.h0 + ((l.u + s.hu) / (2 * s.hu)) * (s.h1 - s.h0);
}
// 발자국 위 가장 가까운 점
const NP = { x: 0, z: 0, inside: false, d: 0, u: 0, v: 0 };
function nearest(s, x, z) {
  if (s.type === 'disc') {
    const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
    NP.d = d;
    const radius = s.coast ? islandRadius(s.r, Math.atan2(dz, dx), s.x, s.z) : s.r;
    if (d <= radius) { NP.x = x; NP.z = z; NP.inside = true; return NP; }
    NP.x = s.x + (dx / d) * radius; NP.z = s.z + (dz / d) * radius; NP.inside = false;
    return NP;
  }
  const l = toLocal(s, x, z);
  const cu = clamp(l.u, -s.hu, s.hu), cv = clamp(l.v, -s.hv, s.hv);
  NP.inside = cu === l.u && cv === l.v;
  NP.u = l.u; NP.v = l.v;
  NP.x = s.x + cu * s.c - cv * s.s;
  NP.z = s.z + cu * s.s + cv * s.c;
  return NP;
}
function heightAtNearest(s) {
  if (s.type === 'ramp') {
    const u = clamp(NP.inside ? NP.u : toLocal(s, NP.x, NP.z).u, -s.hu, s.hu);
    return s.h0 + ((u + s.hu) / (2 * s.hu)) * (s.h1 - s.h0);
  }
  return s.h;
}

export function createArena(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------------- 공용 환경 ----------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x77accb) }, mid: { value: new THREE.Color(0xd0e5dc) }, bot: { value: new THREE.Color(0xb9d6cf) } },
    // Sky is a direction, not scenery at 600m. Keep it on the far plane so
    // the 85m rear-view camera does not clip it into a black empty backdrop.
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.65, h)) : mix(mid, bot, smoothstep(0.0, 0.65, -h)); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe1dbc9, 110, 340);

  const hemi = new THREE.HemisphereLight(0xcbdcf3, 0x9b8b71, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c4, 2.4);
  sun.position.set(-28, 42, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 5; sc.far = 110;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.shadow.blurSamples = 8;
  scene.add(sun);
  scene.add(sun.target);
  const amb = new THREE.AmbientLight(0xe9e9ef, .17);
  scene.add(amb);
  const fill = new THREE.DirectionalLight(0xc6dcf4, .7);
  fill.position.set(25, 16, -22); scene.add(fill);

  const floaters = [];
  // One sculpted island template, repeated as overlapping distant garden ridges.
  // The same authored geometry is used by both quality modes.
  const envResources = { detail: 'distant', g: new THREE.Group(), geos: [], mats: [], anim: [] };
  const distantKinds = [];
  for (let kind = 0; kind < 3; kind++) {
    const root = new THREE.Group(), distantArt = createEnvironmentArt(envResources, kind === 2 ? 'sky' : 'farm', root);
    const radius = kind === 0 ? 3.6 : kind === 1 ? 2.1 : 3.0;
    distantArt.islandEdge(0, 0, radius, 0);
    distantArt.bulb(0, -.15, 0, radius, .24, radius, 0x9fb18b, false);
    distantArt.tree(-.7, -.2, 0, kind === 1 ? 1.05 : .75, kind === 2);
    if (kind !== 1) distantArt.tree(1.1, -.8, 0, .6, kind === 2);
    if (kind === 1) distantArt.rock(.7, .3, 1.1, 2.2);
    const parts = distantArt.finish(); distantKinds.push(...parts);
  }
  for (const [i, config] of [[-47,-4,-37,1.1,0], [36,-10,-55,1.25,1], [-28,-17,-83,1.8,2], [75,-16,-15,.85,1], [-70,-21,12,.72,0], [24,-26,-112,1.1,2]].entries()) {
    const [x,y,z,scale,kind] = config, g = new THREE.Group();
    g.position.set(x,y,z); g.scale.set(scale, scale * (kind === 1 ? 1.4 : 1), scale);
    const parts = distantKinds.slice(kind * 2, kind * 2 + 2).map((source,k) => {
      const m = new THREE.Mesh(source.geometry, source.material); g.add(m);
      return [kind * 2 + k, m, new THREE.Vector3(1,1,1)];
    });
    scene.add(g); floaters.push({ g, base:y, ph:i * 1.3, parts });
  }
  const cloudMat = toon(0xeee9e5);
  const puff = new THREE.SphereGeometry(1, 12, 8);
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(puff, cloudMat);
      m.position.set((k - 2) * 2.4, Math.sin(k * 1.7) * .9, Math.cos(k * 2.3) * 1.2);
      m.scale.set(2.6 + (k % 2), 1.25 + (k % 3) * .5, 2.2 + (k % 2));
      c.add(m);
    }
    const a = (i / 10) * TAU, d = 38 + (i % 4) * 23;
    c.position.set(Math.cos(a) * d, -13 - (i % 4) * 5, Math.sin(a) * d);
    c.scale.set(1.8 + (i % 3) * 0.7, 0.8 + (i % 3) * 0.25, 1.6 + (i % 3) * 0.6);
    scene.add(c);
    clouds.push({ c, a, d, sp: 0.01 + (i % 3) * 0.006 });
  }

  // ---------------- 절전 화질: 배경 인스턴싱 ----------------
  // Six wooded islets share three sculpted templates; cloud banks share one
  // smooth puff. Low mode keeps all of that art in seven animated draws.
  let lowEnv = null;
  const _m = new THREE.Matrix4(), _s = new THREE.Matrix4();
  function buildLowEnv() {
    const kinds = distantKinds.map(m => [m.geometry, m.material]);
    const slots = [];
    const counts = distantKinds.map(() => 0);
    for (const f of floaters) for (const [k, mesh, sc] of f.parts) {
      mesh.updateMatrix();
      slots.push({ owner: f.g, k, idx: counts[k]++, L: new THREE.Matrix4().multiplyMatrices(mesh.matrix, _s.makeScale(sc.x, sc.y, sc.z)) });
    }
    const puffLow = puff;
    const cloudLowMat = cloudMat; // 불투명: 정렬/블렌딩 없이 그린다
    let nc = 0;
    for (const c of clouds) for (const p of c.c.children) {
      p.updateMatrix();
      slots.push({ owner: c.c, k: distantKinds.length, idx: nc++, L: p.matrix.clone() });
    }
    counts.push(nc);
    kinds.push([puffLow, cloudLowMat]);
    const meshes = kinds.map(([geo, mat], k) => {
      const im = new THREE.InstancedMesh(geo, mat, counts[k]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; // 인스턴스가 매 프레임 움직이므로 경계 구를 다시 계산하지 않는다
      im.visible = false;
      scene.add(im);
      return im;
    });
    lowEnv = { meshes, slots };
  }
  function writeLowEnv() {
    let last = null;
    for (const sl of lowEnv.slots) {
      if (sl.owner !== last) { sl.owner.updateMatrix(); last = sl.owner; }
      lowEnv.meshes[sl.k].setMatrixAt(sl.idx, _m.multiplyMatrices(sl.owner.matrix, sl.L));
    }
    for (const im of lowEnv.meshes) im.instanceMatrix.needsUpdate = true;
  }

  // ---------------- 스테이지 상태 ----------------
  const A = {
    group, radius: 24, spawnPoints: [], obstacles: [], lights: { hemi, sun, amb, fill }, stageId: null,
    shapes: [], solids: [], walks: [], holes: [], movers: [], nodes: [], links: [],
  };
  let st = null; // 현재 스테이지의 메시/리소스
  const G = (geo) => { st.geos.push(geo); return geo; };
  const M = (mat) => { st.mats.push(mat); return mat; };
  let mats = null, art = null;

  function addShape(s) {
    s.c = Math.cos(s.rot || 0); s.s = Math.sin(s.rot || 0);
    if (s.walk === undefined) s.walk = true;
    if (s.br === undefined) s.br = s.type === 'disc' || s.type === 'mound' ? s.r : Math.hypot(s.hu, s.hv);
    s.vx = 0; s.vz = 0; s.pad = s.pad || 0;
    A.shapes.push(s);
    if (s.walk) A.walks.push(s);
    if (s.solid) A.solids.push(s);
    return s;
  }

  function disposeStage() {
    if (!st) return;
    group.remove(st.g);
    for (const g of st.geos) g.dispose();
    for (const m of st.mats) m.dispose();
    st = null;
    A.shapes = []; A.solids = []; A.walks = []; A.holes = []; A.movers = []; A.nodes = []; A.links = [];
    A.obstacles = [];
  }

  function makeMats(id = 'farm') {
    if (!Object.hasOwn(THEMES, id)) id = 'farm';
    const p = THEMES[id];
    return {
      ground: M(new THREE.MeshStandardMaterial({ map: groundTexture(id), roughness: 1 })),
      grass: M(toon(p.grass)),
      grassDark: M(toon(p.rim)),
      rim: M(toon(p.rim)),
      dirt: M(toon(p.dirt)),
      rock: M(toon(p.rock)),
      mound: M(toon(p.grass, { side: THREE.DoubleSide })),
      wood: M(toon(0xc29a68)),
      woodDark: M(toon(0x81674e)),
      stone: M(toon(p.stone)),
      stoneTop: M(toon(p.cap)),
      brick: M(toon(0xbba27c)),
      roof: M(toon(0xbd7160)),
      white: M(toon(0xeae0c7)),
      hay: M(toon(0xd7b872)),
      hayBand: M(toon(0x947252)),
      metal: M(toon(0x7b97a7)),
      metalTop: M(toon(0xb1d7dc)),
      cap: M(toon(0xd97f78)),
      dot: M(toon(0xfff1d8)),
      holeWall: M(new THREE.MeshBasicMaterial({ color: 0x39424c, side: THREE.BackSide })),
      stripe: M(new THREE.MeshToonMaterial({ map: stripeTexture(), gradientMap: grad })),
      // forceSinglePass: 가산 합성이라 앞/뒷면 순서가 결과에 영향이 없다. 두 번 그리며 매 프레임 재질을 갱신하는 비용을 없앤다.
      glow: M(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.6), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true })),
    };
  }

  // All static props share one soft contact-shadow draw, including in low quality.
  function buildContacts() {
    if (!st.contacts.length) return;
    const mat = M(new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const shadows = new THREE.InstancedMesh(G(new THREE.PlaneGeometry(1, 1)), mat, st.contacts.length);
    const dummy = new THREE.Object3D();
    st.contacts.forEach(([x, z, y, sx, sz, rot = 0], i) => {
      dummy.position.set(x, y + 0.035, z);
      dummy.rotation.set(-Math.PI / 2, 0, rot);
      dummy.scale.set(sx, sz, 1); dummy.updateMatrix();
      shadows.setMatrixAt(i, dummy.matrix);
    });
    shadows.renderOrder = 1;
    st.g.add(shadows);
  }

  // ---------------- 지형 빌더 ----------------
  function floorTopGeo(r, holes, cx, cz) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * TAU, radius = islandRadius(r, a, cx, cz);
      const x = Math.cos(a) * radius, y = -Math.sin(a) * radius;
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    if (holes) for (const h of holes) { const p = new THREE.Path(); p.absarc(h.x - cx, -(h.z - cz), h.r, 0, TAU, true); shape.holes.push(p); }
    const geo = G(new THREE.ShapeGeometry(shape, 48));
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * r * 1.09) + 0.5, pos.getY(i) / (2 * r * 1.09) + 0.5);
    return geo;
  }

  // 떠 있는 섬: 잔디 윗면, 흙층, 아래 바위
  function island(x, z, r, h, o = {}) {
    const holes = o.holes || null;
    addShape({ type: 'disc', x, z, r, h, br: r * 1.08, coast: true, thick: o.thick || 30, holes, solid: true });
    const top = mesh(floorTopGeo(r, holes, x, z), M(new THREE.MeshStandardMaterial({ map: groundTexture(st.id, x, z, r), roughness: 1 })), st.g, x, h, z, false);
    top.name = 'walkable-island-surface';
    top.rotation.x = -Math.PI / 2;
    top.castShadow = false;
    art.islandEdge(x, z, r, h, holes || []);
    if (holes) for (const hl of holes) {
      A.holes.push({ ...hl, top: h });
      const wall = mesh(G(new THREE.CylinderGeometry(hl.r, hl.r, 5, 32, 1, true)), mats.holeWall, st.g, hl.x, h - 2.5, hl.z, false);
      wall.castShadow = false;
      const ring = mesh(G(new THREE.RingGeometry(hl.r, hl.r + 0.85, 40)), mats.stoneTop, st.g, hl.x, h + 0.025, hl.z, false);
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = false;
    }
  }

  function block(x, z, hu, hv, rot, top, bottom, side, cap, o = {}) {
    const m = new THREE.Group(); m.position.set(x, 0, z); st.g.add(m);
    if (bottom >= 0) {
      art.masonry(x, z, hu, hv, rot, top, bottom);
      st.contacts.push([x, z, bottom, hu * 2 + 1.6, hv * 2 + 1.6, rot]);
    } else {
      art.box(x, (top + bottom) / 2, z, hu * 2, top - bottom, hv * 2, 0xc5a380, .08, -rot);
      for (let u = -hu + .2; u < hu; u += .55) art.box(x + u * Math.cos(rot), top - .015, z + u * Math.sin(rot), .032, .025, hv * 2 - .08, 0x9c7f65, .008, -rot);
    }
    const s = addShape({ type: 'box', x, z, hu, hv, rot, h: top, thick: top - bottom, solid: true, walk: o.walk !== false });
    return { m, s };
  }

  function ramp(x, z, hu, hv, rot, h0, h1, bottom = 0) {
    const sh = new THREE.Shape();
    sh.moveTo(-hu, bottom); sh.lineTo(hu, bottom); sh.lineTo(hu, h1); sh.lineTo(-hu, h0); sh.closePath();
    const geo = G(new THREE.ExtrudeGeometry(sh, { depth: hv * 2, bevelEnabled: false }));
    geo.translate(0, 0, -hv);
    const m = mesh(geo, mats.wood, st.g, x, 0, z);
    m.rotation.y = -rot;
    // 디딤판 줄
    const n = Math.max(2, Math.round(hu * 1.2));
    for (let i = 0; i < n; i++) {
      const u = -hu + ((i + 0.5) / n) * hu * 2;
      const y = h0 + ((u + hu) / (2 * hu)) * (h1 - h0);
      const b = new THREE.Mesh(G(new THREE.BoxGeometry(0.16, 0.08, hv * 2 - 0.1)), mats.woodDark);
      b.position.set(u, y + 0.03, 0);
      b.rotation.z = Math.atan2(h1 - h0, hu * 2);
      m.add(b);
    }
    addShape({ type: 'ramp', x, z, hu, hv, rot, h0, h1, h: Math.max(h0, h1), thick: Math.max(h0, h1) - bottom, solid: true });
  }

  function mound(x, z, r, H, base = 0) {
    const pts = [];
    const N = 14;
    for (let i = N; i >= 0; i--) {
      const d = (r * i) / N, f = 1 - (d / r) ** 2;
      pts.push(new THREE.Vector2(d, base + H * f * Math.sqrt(f) + 0.03));
    }
    const geo = G(new THREE.LatheGeometry(pts, 48)), P = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) uv.setXY(i, (P.getX(i) + x) / (48 * 1.09) + .5, -(P.getZ(i) + z) / (48 * 1.09) + .5);
    const m = mesh(geo, mats.ground, st.g, x, 0, z, false);
    m.castShadow = false;
    addShape({ type: 'mound', x, z, r, H, base, solid: false });
  }

  // 점프 버섯: 밟으면 목표 지점(to)으로 포물선을 그리며 날아간다
  function pad(x, z, base, power, to) {
    const g = new THREE.Group();
    g.position.set(x, base, z);
    st.g.add(g);
    const cap = mesh(G(new THREE.SphereGeometry(1.15, 18, 8, 0, TAU, 0, Math.PI / 2)), mats.cap, g, 0, 0, 0);
    cap.scale.y = 0.3;
    cap.userData.dyn = true;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4, rr = i === 0 ? 0 : 0.62;
      const d = new THREE.Mesh(G(new THREE.CircleGeometry(0.2, 10)), mats.dot);
      const px = i === 0 ? 0 : Math.cos(a) * rr, pz = i === 0 ? 0 : Math.sin(a) * rr;
      const f = 1 - (px * px + pz * pz) / (1.15 * 1.15);
      d.position.set(px, Math.sqrt(Math.max(0, f)) * 1.15 * 0.3 + 0.01, pz);
      d.lookAt(px * 0.6, 2, pz * 0.6);
      g.add(d);
    }
    const ring = new THREE.Mesh(G(new THREE.RingGeometry(1.2, 1.55, 32)), mats.glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.userData.dyn = true;
    g.add(ring);
    const s = addShape({ type: 'disc', x, z, r: 1.05, h: base + 0.33, pad: power, solid: false });
    if (to) s.padTo = { x: to[0], z: to[1], y: 0 };
    st.pads.push(s);
    st.anim.push((t) => { const k = 1 + Math.sin(t * 5 + x) * 0.05; cap.scale.set(k, 0.3 / k, k); ring.scale.setScalar(1 + ((t * 0.8 + x) % 1) * 0.4); ring.material.opacity = 0.8; });
  }

  function hay(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0.75, z);
    g.rotation.y = -rot;
    st.g.add(g);
    const c = mesh(G(new THREE.CylinderGeometry(0.75, 0.75, 3.4, 18)), mats.hay, g, 0, 0, 0, false);
    c.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(G(new THREE.TorusGeometry(0.77, 0.07, 6, 20)), mats.hayBand);
      b.position.x = s * 0.9; b.rotation.y = Math.PI / 2;
      g.add(b);
      for (const radius of [0.26, 0.52]) {
        const coil = new THREE.Mesh(G(new THREE.TorusGeometry(radius, 0.028, 4, 16)), mats.hayBand);
        coil.position.x = s * 1.705; coil.rotation.y = Math.PI / 2;
        g.add(coil);
      }
    }
    st.contacts.push([x, z, 0, 4.1, 2.4, rot]);
    addShape({ type: 'box', x, z, hu: 1.7, hv: 0.78, rot, h: 1.5, thick: 1.5, solid: true });
  }

  function stone(x, z, r, top) {
    art.rock(x, z, r, top);
    st.contacts.push([x, z, 0, r * 2.8, r * 2.8]);
    addShape({ type: 'disc', x, z, r, h: top, thick: top, solid: true });
  }

  function windmill(x, z, base = 0) {
    art.windmill(x, z, base);
    st.contacts.push([x, z, base, 4.9, 4.9]);
    addShape({ type: 'disc', x, z, r: 1.8, h: base + 8, thick: 8, solid: true, walk: false });
  }

  // 두 점 사이를 오가는 발판
  function mover(ax, az, bx, bz, top, hu, hv, period, phase = 0) {
    const rot = Math.atan2(bz - az, bx - ax);
    const g = new THREE.Group();
    g.userData.dyn = true;
    st.g.add(g);
    const m = mesh(G(new THREE.BoxGeometry(hu * 2, 0.5, hv * 2)), [mats.metal, mats.metal, mats.metalTop, mats.metal, mats.metal, mats.metal], g, 0, top - 0.25, 0);
    m.rotation.y = -rot;
    const jet = new THREE.Mesh(G(new THREE.ConeGeometry(0.5, 1.2, 10, 1, true)), mats.glow);
    jet.rotation.x = Math.PI;
    jet.position.y = top - 1.1;
    g.add(jet);
    const s = addShape({ type: 'box', x: ax, z: az, hu, hv, rot, h: top, thick: 0.6, solid: true, moving: true });
    s.path = { ax, az, bx, bz, w: TAU / period, t: phase * period };
    s.mesh = g;
    A.movers.push(s);
    moveMover(s, 0);
  }
  function moveMover(s, dt) {
    const p = s.path;
    p.t += dt;
    const k = 0.5 - 0.5 * Math.cos(p.t * p.w);
    const dk = 0.5 * p.w * Math.sin(p.t * p.w);
    s.x = p.ax + (p.bx - p.ax) * k; s.z = p.az + (p.bz - p.az) * k;
    s.vx = (p.bx - p.ax) * dk; s.vz = (p.bz - p.az) * dk;
    s.mesh.position.set(s.x, 0, s.z);
  }

  function carrotPatches(list) {
    art.vegetables(list);
  }

  function posts(R, count, spread) { art.fence(R, count, spread); }

  // A single enclosed garden court. Its visible wall and collision use the
  // same 32 panels, so the edge is readable from every direction, even seated.
  // Broad masonry replaces scattered decoration; all panels batch by material.
  function gardenBoundary(kind = 'farm') {
    const count = 32, radius = A.radius, depth = kind === 'farm' ? 2.6 : 2.2, half = Math.tan(Math.PI / count) * radius + .04;
    const wallMaterial = kind === 'farm' ? M(new THREE.MeshStandardMaterial({ map: courtWallTexture(), roughness: 1 })) : mats.stone;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const rot = a + Math.PI / 2, height = kind === 'sky' ? 1.6 : kind === 'fort' ? (z < -10 ? 5 : 3.8) : (z < -10 ? 5.4 : 4.2);
      const wall = mesh(G(new THREE.BoxGeometry(half * 2, height, depth)), wallMaterial, st.g, x, height / 2, z, false);
      wall.rotation.y = -rot;
      const cap = mesh(G(new THREE.BoxGeometry(half * 2, .3, depth + .25)), mats.stoneTop, st.g, x, height + .15, z, false);
      cap.rotation.y = -rot;
      const s = addShape({ type: 'box', x, z, hu: half, hv: depth / 2, rot, h: height + .3, thick: height + .3, solid: true, walk: false });
      s.boundary = true;
      if (kind === 'fort') {
        const merlon = mesh(G(new THREE.BoxGeometry(half * .95, .65, depth)), mats.stone, st.g, x, height + .625, z, false);
        merlon.rotation.y = -rot;
      }
    }
  }

  function flag(x, z, base, color) {
    mesh(G(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6)), mats.woodDark, st.g, x, base + 1.3, z, false);
    const f = new THREE.Mesh(G(new THREE.PlaneGeometry(1.1, 0.7)), M(toon(color, { side: THREE.DoubleSide })));
    f.position.set(x + 0.55, base + 2.25, z);
    f.userData.dyn = true;
    st.g.add(f);
    st.anim.push((t) => { f.rotation.y = Math.sin(t * 3 + x) * 0.35; });
  }

  // ---------------- 스테이지 정의 ----------------
  const BUILD = {
    farm() {
      A.radius = 24;
      island(0, 0, 25, 0);
      mound(-13, 0, 5.5, 1.4);
      mound(13, 0, 5.5, 1.4);
      // 언덕 위 전망대 + 경사로
      block(4, -13, 3.8, 2.6, 0, 2.2, 0, mats.brick, mats.stoneTop);
      ramp(4, -8.35, 2.1, 1.6, -Math.PI / 2, 0, 2.2);
      pad(-4, -11, 0, 17, [3, -13]);
      pad(15.5, 7.5, 0, 17, [12, -4]);
      hay(-7, -5, 0);
      hay(7, 5, 0);
      stone(-7, 6, 1.6, 1.1);
      stone(8, -6, 1.8, 1.3);
      windmill(0, -19.5);
      carrotPatches([[-16.5, -10], [6, 16], [18.5, 2], [-3, 16.5]]);
      gardenBoundary();
      return {
        spawns: [[0, 12], [14, 2], [-2, -7], [-14.5, -2]],
        nodes: [[0, 0], [0, 12], [12, 12], [-12, 12], [17, 0], [-17, -3], [-12, -14], [10, -14], [4, -5.6], [4, -12.8], [-4, -11], [-6, -1], [6, 1], [15.5, 7.5], [19, -6], [-12, 8], [12, -8]],
        special: [[10, 2, 'pad']],
      };
    },
    fort() {
      A.radius = 25;
      // Ground extends under the wall even where the sculpted coast dips in.
      island(0, 0, 26, 0, { holes: [{ x: -13, z: 10, r: 3 }, { x: 13, z: -10, r: 3.2 }] });
      // Shallow sunken courts replace lethal black wells. Their 0.5 step is
      // below STEP, so a pilot or robot can leave from every point on the rim.
      for (const h of A.holes) {
        const floor = mesh(G(new THREE.CircleGeometry(h.r + .04, 48)), mats.stoneTop, st.g, h.x, -.5, h.z, false);
        floor.rotation.x = -Math.PI / 2;
        addShape({ type: 'disc', x: h.x, z: h.z, r: h.r + .04, h: -.5, thick: 1, solid: true });
      }
      // 가운데 요새와 양쪽 경사로
      block(0, -3, 4.5, 4.5, 0, 3.2, 0, mats.stone, mats.stoneTop);
      ramp(8.5, -3, 4.05, 3.6, Math.PI, 0, 3.2);
      ramp(-8.5, -3, 4.05, 3.6, 0, 0, 3.2);
      // 남쪽 디딤 계단: 점프로 한 단씩
      ramp(0, 5.2, 3.75, 3.6, -Math.PI / 2, 0, 3.2);
      // 벽 튕기기용 낮은 담
      block(-15, -9, 3, 0.5, 0.7, 2, 0, mats.brick, mats.stoneTop);
      block(16, 7, 3, 0.5, -0.8, 2, 0, mats.brick, mats.stoneTop);
      block(-6, 13, 2.2, 0.5, 0.25, 2, 0, mats.brick, mats.stoneTop);
      // 요새 북쪽 모서리 기둥
      stone(-3.9, -7.4, 0.55, 4.6);
      stone(3.9, -7.4, 0.55, 4.6);
      flag(-3.9, -7.4, 4.6, 0xff4d5e);
      flag(3.9, -7.4, 4.6, 0x2fb8ff);
      windmill(0, -21);
      pad(-18, 1, 0, 19, [-2, -3]);
      gardenBoundary('fort');
      return {
        spawns: [[0, 13], [16, -1], [0, -3], [-16, -2]],
        nodes: [[0, -3], [3.2, -3], [-3.2, -3], [12.7, -3], [-12.7, -3], [0, 8], [0, 14], [10, 12], [-6, 17], [-7, 5], [8, 4], [15, 1], [-15, 2], [-10, -13], [0, -13], [7, -15], [18, -4], [-18, -6], [18, 11], [-20, 8], [-18, 1], [0, 4.5]],
        special: [[20, 0, 'pad']],
      };
    },
    sky() {
      A.radius = 23;
      // One continuous floating terrace supports the whole fight. The raised
      // pavilion and three broad ramps create a centre/flank loop, with no
      // moving platform or precision jump required between starting points.
      island(0, 0, 24, 0);
      island(0, -4, 8, 2.4);
      // 남쪽 섬 → 가운데 섬 경사로
      ramp(0, 6.9, 3.2, 3.6, -Math.PI / 2, 0, 2.4);
      // 서쪽 다리
      ramp(-12, -4, 4.8, 3.6, 0, 0, 2.4);
      ramp(12, -4, 4.8, 3.6, Math.PI, 0, 2.4);
      // 동쪽은 움직이는 발판으로 연결
      // 북쪽 허공을 가로지르는 낮은 발판
      // 동/서 섬 점프 버섯: 가운데 섬으로
      pad(15, 4, 0, 18, [3.5, -3]);
      pad(-15, 4, 0, 18, [-3.5, -3]);
      hay(18.5, 3.5, 0.3);
      stone(-18.5, 4, 1.3, 1);
      carrotPatches([[0, 16, 0], [-3, -5, 2.4]]);
      flag(0, -9.2, 2.4, 0xffc21f);
      // Accessible pavilion columns and tree trunks have small matching
      // colliders; foliage remains soft and does not obstruct the flank loop.
      for (const x of [-2.7, 2.7]) addShape({ type: 'disc', x, z: -10.7, r: .34, h: 6.4, thick: 4, solid: true, walk: false });
      for (const [x, z, base] of [[-19,-4,0],[19,-3.8,0],[-4.8,-9.6,2.4],[4.7,-9.5,2.4]]) addShape({ type: 'disc', x, z, r: .32, h: base + 3.4, thick: 3.4, solid: true, walk: false });
      gardenBoundary('sky');
      return {
        spawns: [[0, 14], [17, 1], [0, -3], [-17, 1]],
        nodes: [[0, 13], [0, 9], [0, 3.2], [0, -3], [5, -5], [-5, -5], [7, -4], [-7, -4], [14.5, -4], [-14.5, -4], [16, 1], [-16, 1], [15, 4], [-15, 4], [-8, 9], [8, 9], [-15, 9], [15, 9], [-13, -14], [0, -16], [13, -14], [10.8, -4], [-10.8, -4], [0, 6.9]],
        // [노드, 노드, 종류]: 점프 (가장자리에서 건너뛰기), 버섯 (밟으면 발사)
        links: [[12, 4, 'pad'], [13, 5, 'pad']],
      };
    },
  };

  // ---------------- 질의 ----------------
  function gAt(x, z, y, noMovers, out) {
    let best = -Infinity, bs = null;
    const lim = y + STEP;
    for (const s of A.walks) {
      if (noMovers && s.moving) continue;
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz > s.br * s.br) continue;
      const h = topAt(s, x, z);
      if (h === null || h > lim || h <= best) continue;
      best = h; bs = s;
    }
    if (!bs) return null;
    if (out) { out.h = best; out.vx = bs.vx; out.vz = bs.vz; out.pad = bs.pad; out.padTo = bs.padTo || null; out.s = bs; return out; }
    return best;
  }
  const SURF = { h: 0, vx: 0, vz: 0, pad: 0, padTo: null, s: null };

  A.groundAt = (x, z, y) => gAt(x, z, y, false);
  A.surfaceAt = (x, z, y) => gAt(x, z, y, false, SURF);
  A.isVoid = (x, z) => gAt(x, z, 1e6, false) === null;

  A.pushOut = (e) => {
    let bounced = false;
    const r = e.radius, y = e.pos.y;
    for (const s of A.solids) {
      if (s.boundary) {
        if (y + STEP >= s.h || y + e.height <= 0) continue;
        // The court is the intersection of inward half-spaces. At a panel
        // seam choose the court side, never the shorter sideways box exit.
        const nx = s.s, nz = -s.c, limit = s.x * nx + s.z * nz - s.hv - r;
        const penetration = e.pos.x * nx + e.pos.z * nz - limit;
        if (penetration > 0) {
          e.pos.x -= nx * penetration; e.pos.z -= nz * penetration;
          const speed = e.vel.x * nx + e.vel.z * nz;
          if (speed > 0) { const rebound = e.state === 'launched' && speed > 10 ? 1.6 : 1; e.vel.x -= nx * speed * rebound; e.vel.z -= nz * speed * rebound; bounced ||= rebound > 1; }
        }
        continue;
      }
      const dx0 = e.pos.x - s.x, dz0 = e.pos.z - s.z;
      if (dx0 * dx0 + dz0 * dz0 > (s.br + r) * (s.br + r)) continue;
      if (s.holes && inHole(s, e.pos.x, e.pos.z)) continue;
      const n = nearest(s, e.pos.x, e.pos.z);
      let nx, nz, pen, ht;
      if (!n.inside) {
        const ddx = e.pos.x - n.x, ddz = e.pos.z - n.z, d = Math.hypot(ddx, ddz);
        if (d >= r || d < 1e-6) continue;
        ht = heightAtNearest(s);
        if (ht <= y + STEP || ht - s.thick >= y + e.height) continue;
        nx = ddx / d; nz = ddz / d; pen = r - d;
      } else {
        ht = s.type === 'ramp' ? heightAtNearest(s) : s.h;
        if (ht <= y + STEP || ht - s.thick >= y + e.height) continue;
        if (s.type === 'disc') {
          const d = n.d;
          if (d < 1e-4) { nx = 1; nz = 0; } else { nx = dx0 / d; nz = dz0 / d; }
          pen = (s.coast ? islandRadius(s.r, Math.atan2(dz0, dx0), s.x, s.z) : s.r) - d + r;
        } else {
          const du = s.hu - Math.abs(n.u), dv = s.hv - Math.abs(n.v);
          let lu = 0, lv = 0;
          if (du < dv) { lu = n.u < 0 ? -1 : 1; pen = du + r; } else { lv = n.v < 0 ? -1 : 1; pen = dv + r; }
          nx = lu * s.c - lv * s.s; nz = lu * s.s + lv * s.c;
        }
      }
      e.pos.x += nx * pen; e.pos.z += nz * pen;
      const vn = e.vel.x * nx + e.vel.z * nz;
      if (vn < 0) {
        if (e.state === 'launched' && vn < -10) { e.vel.x -= nx * vn * 1.6; e.vel.z -= nz * vn * 1.6; bounced = true; }
        else { e.vel.x -= nx * vn; e.vel.z -= nz * vn; }
      }
    }
    // 구멍 안으로 떨어진 뒤에는 옆 바닥 속으로 파고들지 않게
    for (const h of A.holes) {
      if (y + STEP >= h.top) continue;
      const dx = e.pos.x - h.x, dz = e.pos.z - h.z, d = Math.hypot(dx, dz);
      if (d > h.r + r + 1) continue;
      const lim = Math.max(0.1, h.r - r * 0.8);
      if (d > lim) { e.pos.x = h.x + (dx / d) * lim; e.pos.z = h.z + (dz / d) * lim; }
    }
    return bounced;
  };

  // 평평하고 넓은 자리인지 (움직이는 발판, 버섯 제외)
  function flatAt(x, z, clear) {
    for (const wall of A.solids) if (wall.boundary) {
      const n = nearest(wall, x, z);
      if (n.inside || Math.hypot(x - n.x, z - n.z) < clear) return null;
    }
    const s = gAt(x, z, 1e6, false, SURF);
    if (!s || s.s.moving || s.pad) return null;
    const h = s.h;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const q = gAt(x + Math.cos(a) * clear, z + Math.sin(a) * clear, 1e6, false, SURF);
      if (!q || Math.abs(q.h - h) > 0.12 || q.s.moving || q.pad) return null;
    }
    return h;
  }

  A.safePoint = (x, z, clear = 2.4) => {
    let h = flatAt(x, z, clear);
    if (h !== null) return { x, y: h, z };
    for (let rr = 1.5; rr < 30; rr += 1.5) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + rr;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        h = flatAt(px, pz, clear);
        if (h !== null) return { x: px, y: h, z: pz };
      }
    }
    const sp = A.spawnPoints[0];
    return { x: sp.x, y: sp.y, z: sp.z };
  };

  A.randomPoint = (margin = 2) => {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (A.radius - 2);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = flatAt(x, z, margin);
      if (h !== null) return { x, y: h, z };
    }
    return A.safePoint(0, 0, margin);
  };

  // ---------------- AI 길찾기 ----------------
  function walkable(a, b) {
    let y = gAt(a.x, a.z, a.y + 0.3, true);
    if (y === null) return false;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.05) return Math.abs(y - b.y) < 1.2;
    const n = Math.ceil(L / 0.7), px = (-dz / L) * 0.55, pz = (dx / L) * 0.55;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + dx * t, z = a.z + dz * t;
      const h = gAt(x, z, y, true);
      if (h === null) return false;
      const hi = gAt(x, z, 1e6, true);
      if (hi > y + STEP) return false;
      if (gAt(x + px, z + pz, y, true) === null || gAt(x - px, z - pz, y, true) === null) return false;
      y = h;
    }
    return Math.abs(y - b.y) < 1.2;
  }

  function buildNav(def) {
    const nodes = (def.nodes || []).map(([x, z]) => ({ x, z, y: gAt(x, z, 1e6, true) }));
    A.nodes = nodes.filter((n) => n.y !== null);
    const idx = new Map(nodes.map((n, i) => [i, A.nodes.indexOf(n)]));
    A.links = A.nodes.map(() => []);
    for (let i = 0; i < A.nodes.length; i++) for (let j = 0; j < A.nodes.length; j++) {
      if (i === j) continue;
      const a = A.nodes[i], b = A.nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 17) continue;
      if (walkable(a, b)) A.links[i].push({ to: j, cost: d, kind: 'walk' });
    }
    for (const [a, b, kind] of def.links || []) {
      const i = idx.get(a), j = idx.get(b);
      if (i === undefined || j === undefined || i < 0 || j < 0) continue;
      const d = Math.hypot(A.nodes[i].x - A.nodes[j].x, A.nodes[i].z - A.nodes[j].z);
      A.links[i].push({ to: j, cost: d * 1.2 + 2, kind });
    }
  }

  // from/to: {x,y,z}. 곧장 걸어갈 수 있으면 null, 아니면 다음에 향할 지점 {x, z, jump}
  A.waypoint = (from, to, mem) => {
    const gy = gAt(from.x, from.z, from.y + 0.3, false);
    const air = gy === null || from.y - gy > 0.8;
    if (mem && mem.navAir) {
      if (air && performance.now() < mem.navAirUntil) return { x: mem.navAir.x, z: mem.navAir.z };
      if (!air) mem.navAir = null;
    }
    if (air) return null;
    const f = { x: from.x, y: gy, z: from.z };
    if (walkable(f, to)) return null;
    const N = A.nodes.length;
    if (!N) return null;
    const byDist = (p) => A.nodes.map((n, i) => [Math.hypot(n.x - p.x, n.z - p.z), i]).sort((a, b) => a[0] - b[0]).slice(0, 6);
    const dist = new Float64Array(N).fill(Infinity), prev = new Int16Array(N).fill(-1), kindTo = new Array(N).fill('walk');
    for (const [d, i] of byDist(f)) if (walkable(f, A.nodes[i])) dist[i] = d;
    const goal = new Float64Array(N).fill(Infinity);
    for (const [d, i] of byDist(to)) if (walkable(A.nodes[i], to)) goal[i] = d;
    const done = new Uint8Array(N);
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const e of A.links[u]) {
        const nd = dist[u] + e.cost;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; kindTo[e.to] = e.kind; }
      }
    }
    let g = -1, gb = Infinity;
    for (let i = 0; i < N; i++) if (dist[i] + goal[i] < gb) { gb = dist[i] + goal[i]; g = i; }
    if (g < 0) return { x: to.x, z: to.z };
    const path = [];
    for (let k = g; k >= 0; k = prev[k]) path.unshift(k);
    let k = 0;
    while (k < path.length - 1 && Math.hypot(A.nodes[path[k]].x - f.x, A.nodes[path[k]].z - f.z) < 1.3) k++;
    const n = A.nodes[path[k]];
    const kind = k > 0 ? kindTo[path[k]] : 'walk';
    if (mem) {
      if (kind === 'jump' || kind === 'pad') { mem.navAir = n; mem.navAirUntil = performance.now() + 2500; }
      else if (k + 1 < path.length && kindTo[path[k + 1]] === 'pad') { mem.navAir = A.nodes[path[k + 1]]; mem.navAirUntil = performance.now() + 2500; }
    }
    if (kind === 'pad' && k > 0) return { x: n.x, z: n.z };
    return { x: n.x, z: n.z, jump: kind === 'jump' };
  };

  // ---------------- 스테이지 교체 ----------------
  A.setStage = (id) => {
    if (!BUILD[id]) id = 'farm';
    if (A.stageId === id && st) return;
    disposeStage();
    st = { id, g: new THREE.Group(), geos: [], mats: [], anim: [], pads: [], contacts: [] };
    group.add(st.g);
    mats = makeMats(id);
    art = createEnvironmentArt(st, id);
    const palette = THEMES[id];
    for (const [i, name] of ['top', 'mid', 'bot'].entries()) skyMat.uniforms[name].value.set(palette.sky[i]);
    scene.fog.color.set(palette.sky[1]);
    const def = BUILD[id]();
    art.garden(); art.finish();
    A.cameraBoxes = st.cameraBoxes || [];
    buildContacts();
    A.stageId = id;
    for (const s of st.pads) if (s.padTo) s.padTo.y = gAt(s.padTo.x, s.padTo.z, 1e6, true) ?? 0;
    A.spawnPoints = def.spawns.map(([x, z]) => new THREE.Vector3(x, gAt(x, z, 1e6, true) ?? 0, z));
    if (def.special) for (const [a, b] of def.special) { /* 표시용 예약 */ void a; void b; }
    buildNav(def);
    st.t = 0;
    applyStageQuality();
  };

  // ---------------- 화질 ----------------
  // 절전: 정적 스테이지 메시를 재질별로 합치고 배경 섬/구름을 인스턴싱한다.
  // 보이는 메시만 바꾸고 지형 도형/길찾기/스폰은 건드리지 않는다. 여러 번 불러도 안전하다.
  A.quality = 'high';
  function applyStageQuality() {
    if (!st) return;
    if (!st.batch) {
      st.batch = bakeBatch(st.g);
      st.geos.push(...st.batch.geos);
    }
    if (!st.batch) return;
    for (const o of st.batch.hidden) o.visible = false;
    for (const m of st.batch.merged) m.visible = true;
  }
  A.setQuality = (low) => {
    const q = low ? 'low' : 'high';
    if (A.quality === q) return A;
    A.quality = q;
    if (!lowEnv) buildLowEnv();
    for (const f of floaters) f.g.visible = false;
    for (const c of clouds) c.c.visible = false;
    if (lowEnv) {
      for (const im of lowEnv.meshes) im.visible = true;
      writeLowEnv();
    }
    applyStageQuality();
    return A;
  };

  A.update = (dt, time) => {
    for (const s of A.movers) moveMover(s, dt);
    if (st) { st.t += dt; for (const f of st.anim) f(st.t, dt); }
    for (const f of floaters) { f.g.position.y = f.base + Math.sin(time * 0.5 + f.ph) * 1.2; f.g.rotation.y += dt * 0.05; }
    for (const c of clouds) { c.a += dt * c.sp; c.c.position.x = Math.cos(c.a) * c.d; c.c.position.z = Math.sin(c.a) * c.d; }
    if (lowEnv) writeLowEnv();
  };

  A.setStage('farm');
  buildLowEnv();
  for (const f of floaters) f.g.visible = false;
  for (const c of clouds) c.c.visible = false;
  for (const im of lowEnv.meshes) im.visible = true;
  writeLowEnv();
  return A;
}

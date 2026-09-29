// 모델 품질 도구: 정적 파트 병합과 렌더 통계 (three.js 객체만 다룸)
import * as THREE from 'three';

const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

// parts: [{ geometry, matrix(본 좌표계 기준), color }]. 한 지오메트리로 굽는다.
// 재질 색은 정점 색으로 옮겨 서로 다른 색 파트도 한 드로우로 그린다.
export function bakeVertexColored(parts) {
  let verts = 0, idx = 0;
  for (const p of parts) {
    const g = p.geometry;
    verts += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geometry;
    const _m = p.matrix;
    _n.getNormalMatrix(_m);
    const P = g.attributes.position, N = g.attributes.normal, c = p.color;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
      if (N) _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); else _v.set(0, 1, 0);
      nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
      col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
    }
    const flip = _m.determinant() < 0;
    const n = g.index ? g.index.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, d = g.index ? g.index.getX(i + 2) : i + 2;
      index[io++] = vo + a;
      index[io++] = vo + (flip ? d : b);
      index[io++] = vo + (flip ? b : d);
    }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// 실제로 그려질 메시만 센다 (보이지 않는 조상 아래는 제외).
// 정적 수치일 뿐이며 GPU 시간이나 발열 측정이 아니다.
export function renderStats(root) {
  const s = { meshes: 0, triangles: 0, shadowCasters: 0, materials: 0 };
  const mats = new Set();
  const walk = (o) => {
    if (!o.visible) return;
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      s.meshes++;
      s.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (o.castShadow) s.shadowCasters++;
      mats.add(o.material);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  s.materials = mats.size;
  return s;
}

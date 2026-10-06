import * as THREE from 'three';

// Project onto the visible receiving triangles, not one horizontal plane. Only
// a narrow band around the collision surface is eligible; walls and floors
// above the pilot still occlude the mark through the ordinary depth test.
// The fort's visible cap is 18cm above its collision plane. Keep the receiver
// allowance fixed at 20cm, well below a separate floor, rather than lifting the
// whole marker above arbitrary scenery.
const CELL = 4, LIFT = .012, ABOVE = .20, BELOW = .08;
const caches = new WeakMap();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const edge = new THREE.Vector3(), normal = new THREE.Vector3(), inverse = new THREE.Matrix4();
const point = new THREE.Vector3();

function triangles(mesh, emit) {
  const geometry = mesh.geometry, position = geometry?.attributes.position;
  if (!position) return;
  const index = geometry.index, count = index?.count ?? position.count;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const ranges = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
  for (const range of ranges) {
    const material = materials[range.materialIndex];
    if (!material || material.transparent || !material.depthWrite || material.alphaTest > 0) continue;
    const stop = Math.min(count, range.start + range.count);
    for (let i = range.start; i + 2 < stop; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      normal.crossVectors(edge.subVectors(b, a), normal.subVectors(c, a)).normalize();
      if (normal.y < .55) continue;
      emit([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
    }
  }
}

function receivers(arena) {
  const stage = arena.group.children[0];
  let cache = caches.get(arena);
  if (cache?.group === arena.group && cache.stage === stage && cache.id === arena.stageId) return cache;
  cache = { group: arena.group, stage, id: arena.stageId, cells: new Map(), dynamic: [] };
  arena.group.updateWorldMatrix(true, true);
  arena.group.traverse(mesh => {
    // Original meshes remain under low-quality batches. Index them once in
    // both quality modes instead of duplicating their merged render geometry.
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.batch || mesh.userData.outline || mesh.userData.rrOutline) return;
    let moving = false;
    for (let parent = mesh; parent && parent !== arena.group; parent = parent.parent) if (parent.userData.dyn) moving = true;
    if (moving) { cache.dynamic.push(mesh); return; }
    triangles(mesh, tri => {
      const minX = Math.floor(Math.min(tri[0], tri[3], tri[6]) / CELL), maxX = Math.floor(Math.max(tri[0], tri[3], tri[6]) / CELL);
      const minZ = Math.floor(Math.min(tri[2], tri[5], tri[8]) / CELL), maxZ = Math.floor(Math.max(tri[2], tri[5], tri[8]) / CELL);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`;
        if (!cache.cells.has(key)) cache.cells.set(key, []);
        cache.cells.get(key).push(tri);
      }
    });
  });
  caches.set(arena, cache); return cache;
}

function clip(polygon, axis, bound, sign) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i], previous = polygon[(i + polygon.length - 1) % polygon.length];
    const now = sign * (current[axis] - bound), before = sign * (previous[axis] - bound);
    if ((now <= 0) !== (before <= 0)) {
      const t = before / (before - now);
      out.push(previous.map((v, j) => v + (current[j] - v) * t));
    }
    if (now <= 0) out.push(current);
  }
  return out;
}

function surfaceHeight(shape, x, z) {
  // Continue the selected receiver's height equation across its clipped edge.
  // Looking up each corner independently would interpolate a discontinuous
  // 1.5m platform-to-floor jump and erase the actual platform cap in between.
  if (shape.type === 'ramp') {
    const u = (x - shape.x) * shape.c + (z - shape.z) * shape.s;
    return shape.h0 + (u + shape.hu) / (2 * shape.hu) * (shape.h1 - shape.h0);
  }
  if (shape.type === 'mound') {
    const fraction = Math.max(0, 1 - ((x - shape.x) ** 2 + (z - shape.z) ** 2) / shape.r ** 2);
    return shape.base + shape.H * fraction ** 1.5;
  }
  return shape.h;
}

export function createGroundMarkerGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(768 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(768 * 2), 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0); return geometry;
}

export function projectGroundMarker(mark, { arena, root, groundHeight, size, facing }) {
  const geometry = mark.geometry;
  geometry.setDrawRange(0, 0);
  if (!arena?.group || !arena.surfaceAt || !Number.isFinite(groundHeight) || !Number.isFinite(facing) || !Number.isFinite(size) || size <= 0) return false;
  root.updateWorldMatrix(true, false);
  inverse.copy(root.matrixWorld).invert();
  const x = root.matrixWorld.elements[12], z = root.matrixWorld.elements[14], cosine = Math.cos(facing), sine = Math.sin(facing);
  const radius = size * Math.SQRT2, cache = receivers(arena), candidates = new Set();
  for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
      for (const tri of cache.cells.get(`${ix},${iz}`) || []) candidates.add(tri);
    }
  }
  for (const mesh of cache.dynamic) { mesh.updateWorldMatrix(true, false); triangles(mesh, tri => candidates.add(tri)); }
  let used = 0;
  function vertex(v) {
    if (used >= geometry.attributes.position.count) {
      // Release any uploaded buffers before replacing their attributes.
      geometry.dispose();
      for (const [name, stride] of [['position', 3], ['uv', 2]]) {
        const old = geometry.attributes[name], data = new Float32Array(old.array.length * 2);
        data.set(old.array); geometry.setAttribute(name, new THREE.BufferAttribute(data, stride).setUsage(THREE.DynamicDrawUsage));
      }
    }
    point.set(v[0], v[1] + LIFT, v[2]).applyMatrix4(inverse);
    geometry.attributes.position.setXYZ(used, point.x, point.y, point.z);
    geometry.attributes.uv.setXY(used, .5 + v[3] / (2 * size), .5 - v[4] / (2 * size)); used++;
  }
  for (const tri of candidates) {
    // Do not project onto a lower floor across a drop or onto an upper storey.
    if (Math.max(tri[1], tri[4], tri[7]) < groundHeight - .85 || Math.min(tri[1], tri[4], tri[7]) > groundHeight + .7 + ABOVE) continue;
    let polygon = [];
    for (let i = 0; i < 9; i += 3) {
      const dx = tri[i] - x, dz = tri[i + 2] - z;
      polygon.push([tri[i], tri[i + 1], tri[i + 2], dx * cosine - dz * sine, dx * sine + dz * cosine]);
    }
    for (const axis of [3, 4]) { polygon = clip(polygon, axis, size, 1); if (!polygon.length) break; polygon = clip(polygon, axis, -size, -1); }
    if (polygon.length < 3) continue;
    // Clip the receiver itself to the permitted height band. Accepting a whole
    // triangle because only one corner is near the ground would also paint the
    // higher part of a bevel or a decorative wall. Interpolation preserves the
    // actual receiver plane, including separate surfaces at a step boundary.
    const centroid = polygon.reduce((sum, v) => sum.map((n, i) => n + v[i] / polygon.length), [0, 0, 0]);
    let reference;
    for (const v of [centroid, ...polygon]) {
      const surface = arena.surfaceAt(v[0], v[2], groundHeight);
      if (surface?.s && v[1] >= surface.h - BELOW && v[1] <= surface.h + ABOVE) { reference = surface.s; break; }
    }
    polygon = polygon.map(v => {
      const height = reference ? surfaceHeight(reference, v[0], v[2]) : arena.surfaceAt(v[0], v[2], groundHeight)?.h;
      return [...v, Number.isFinite(height) ? v[1] - height : ABOVE + 1];
    });
    polygon = clip(clip(polygon, 5, ABOVE, 1), 5, -BELOW, -1);
    if (polygon.length < 3) continue;
    for (let i = 1; i < polygon.length - 1; i++) { vertex(polygon[0]); vertex(polygon[i]); vertex(polygon[i + 1]); }
  }
  mark.position.set(0, 0, 0); mark.quaternion.identity(); mark.scale.set(1, 1, 1); mark.frustumCulled = false;
  geometry.attributes.position.needsUpdate = geometry.attributes.uv.needsUpdate = true;
  geometry.setDrawRange(0, used); return used > 0;
}

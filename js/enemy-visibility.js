import * as THREE from 'three';

// CPU visibility witnesses, not a second render pass. Sample a bounded number
// of real, posed triangles and attach the bar to an unoccluded surface point.
// Sparse sampling can omit a tiny visible sliver; it must never invent a point
// above a hidden head. All caches are weak and own no GPU resources.
const geometryCaches = new WeakMap(), arenaCaches = new WeakMap();
const BLOCK_TRIANGLES = 64, SAMPLE_BUDGET = 112, MAX_RAYS = 8;
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
const edge = new THREE.Vector3(), normal = new THREE.Vector3(), hit = new THREE.Vector3();
const inverse = new THREE.Matrix4(), localRay = new THREE.Ray(), ray = new THREE.Ray();
const boneBox = new THREE.Box3();

function shown(node) {
  for (let p = node; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function solid(material) {
  return material?.visible !== false && material?.colorWrite !== false &&
    material?.depthWrite !== false && material?.opacity > .98 && !material.alphaTest;
}
function materialAt(mesh, offset) {
  if (!Array.isArray(mesh.material)) return mesh.material;
  const group = mesh.geometry.groups.find(g => offset >= g.start && offset < g.start + g.count);
  return group ? mesh.material[group.materialIndex] : null;
}
function geometryInfo(geometry) {
  const position = geometry.attributes.position, index = geometry.index;
  if (!position) return null;
  let info = geometryCaches.get(geometry);
  const skinIndex = geometry.attributes.skinIndex, skinWeight = geometry.attributes.skinWeight;
  if (info?.position === position && info.pv === position.version && info.index === index && info.iv === index?.version &&
      info.skinIndex === skinIndex && info.siv === skinIndex?.version && info.skinWeight === skinWeight && info.swv === skinWeight?.version) return info;
  const count = index?.count ?? position.count, bounds = new THREE.Box3();
  for (let i = 0; i < position.count; i++) bounds.expandByPoint(va.fromBufferAttribute(position, i));
  const size = bounds.getSize(new THREE.Vector3());
  info = { position, index, pv: position.version, iv: index?.version, skinIndex, skinWeight, siv: skinIndex?.version, swv: skinWeight?.version, count, bounds,
    area: Math.max(.001, size.x * size.y + size.y * size.z + size.z * size.x), blocks: null };
  geometryCaches.set(geometry, info); return info;
}
function vertex(mesh, offset, target, posed) {
  const geometry = mesh.geometry, index = geometry.index?.getX(offset) ?? offset;
  if (posed) mesh.getVertexPosition(index, target);
  else target.fromBufferAttribute(geometry.attributes.position, index);
  return target;
}
function blocks(mesh, info) {
  if (info.blocks) return info.blocks;
  info.blocks = [];
  // Consecutive triangles in the authored welded scenery retain small local
  // bounds. This avoids a full island raycast without introducing a scene BVH.
  for (let start = 0; start + 2 < info.count; start += BLOCK_TRIANGLES * 3) {
    const end = Math.min(info.count, start + BLOCK_TRIANGLES * 3), box = new THREE.Box3();
    for (let i = start; i < end; i++) box.expandByPoint(vertex(mesh, i, va, false));
    info.blocks.push({ start, end, box });
  }
  return info.blocks;
}
function environment(arena) {
  if (!arena?.group) return [];
  const group = arena.group, stage = group.children[0];
  let cache = arenaCaches.get(arena);
  if (cache?.group === group && cache.stage === stage && cache.id === arena.stageId && cache.quality === arena.quality) return cache.meshes;
  const meshes = [];
  group.traverse(node => {
    if (node.isMesh && !node.isSkinnedMesh && !node.userData.outline && !node.userData.rrOutline) meshes.push(node);
  });
  // Both batch and originals are retained, but only the currently rendered
  // hierarchy is queried. Dynamic props use their current matrix every call.
  arenaCaches.set(arena, { group, stage, id: arena.stageId, quality: arena.quality, meshes });
  return meshes;
}
function skinState(mesh, info) {
  // A blended vertex lies inside the union bounds of its bone-transformed
  // block. Only blocks touched by the ray need exact posed triangle tests.
  const matrices = mesh.skeleton.bones.map((bone, i) => new THREE.Matrix4().copy(mesh.bindMatrixInverse)
    .multiply(new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, i * 16)).multiply(mesh.bindMatrix));
  const bounds = new THREE.Box3();
  for (const matrix of matrices) bounds.union(boneBox.copy(info.bounds).applyMatrix4(matrix));
  return { matrices, bounds, blocks: new Map() };
}
function posedBlock(mesh, info, block, state) {
  if (state.blocks.has(block)) return state.blocks.get(block);
  if (!block.joints) {
    const joints = new Set();
    for (let offset = block.start; offset < block.end; offset++) {
      const index = info.index?.getX(offset) ?? offset;
      for (let c = 0; c < 4; c++) if (info.skinWeight.getComponent(index, c) > 0) joints.add(info.skinIndex.getComponent(index, c));
    }
    block.joints = [...joints];
  }
  const bounds = new THREE.Box3();
  for (const joint of block.joints) bounds.union(boneBox.copy(block.box).applyMatrix4(state.matrices[joint]));
  state.blocks.set(block, bounds); return bounds;
}
function bodyOccluders(game, target, camera) {
  const entities = new Set(), meshes = [], skeletons = new Set();
  for (const actor of [...(game.humans || []), ...(game.robots || []), game.player]) {
    const entity = actor?.riding || actor, root = entity?.rig?.root;
    if (!root?.parent || entity === target || entities.has(entity) || entity.dead || entity.out || entity.state === 'dead') continue;
    entities.add(entity); root.updateWorldMatrix(true, false); root.updateMatrixWorld(true);
    root.traverse(mesh => {
      if (!mesh.isMesh || !shown(mesh) || !mesh.layers.test(camera.layers) || mesh.userData.outline || mesh.userData.rrOutline ||
          mesh.userData.rrGroundMark || mesh.userData.rrPlushCoat) return;
      if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(solid)) return;
      if (mesh.isSkinnedMesh && !skeletons.has(mesh.skeleton)) { mesh.skeleton.update(); skeletons.add(mesh.skeleton); }
      meshes.push(mesh);
    });
  }
  return meshes;
}
function occluded(meshes, origin, destination, camera, stats, cutaway = false, skins = new Map()) {
  ray.set(origin, edge.subVectors(destination, origin).normalize());
  const distance = origin.distanceTo(destination);
  for (const mesh of meshes) {
    if (!shown(mesh) || !mesh.layers.test(camera.layers)) continue;
    if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(solid)) continue;
    const info = geometryInfo(mesh.geometry); if (!info) continue;
    mesh.updateWorldMatrix(true, false);
    let skin;
    if (mesh.isSkinnedMesh) {
      if (!skins.has(mesh)) skins.set(mesh, skinState(mesh, info));
      skin = skins.get(mesh);
    }
    // Instanced plants have few instances; no triangles are expanded/copied.
    const instance = mesh.isInstancedMesh ? new THREE.Matrix4() : null;
    for (let n = 0; n < (instance ? mesh.count : 1); n++) {
      if (instance) { mesh.getMatrixAt(n, instance); instance.premultiply(mesh.matrixWorld); }
      const matrix = instance || mesh.matrixWorld;
      inverse.copy(matrix).invert(); localRay.copy(ray).applyMatrix4(inverse);
      if (!localRay.intersectsBox(skin?.bounds || info.bounds)) continue;
      for (const block of blocks(mesh, info)) {
        stats.blocks++;
        if (!localRay.intersectsBox(skin ? posedBlock(mesh, info, block, skin) : block.box)) continue;
        const start = Math.max(block.start, mesh.geometry.drawRange.start);
        const end = Math.min(block.end, mesh.geometry.drawRange.start + mesh.geometry.drawRange.count);
        for (let i = start; i + 2 < end; i += 3) {
          const material = materialAt(mesh, i); if (!solid(material)) continue;
          stats.triangles++;
          vertex(mesh, i, va, !!skin); vertex(mesh, i + 1, vb, !!skin); vertex(mesh, i + 2, vc, !!skin);
          const found = material.side === THREE.BackSide ? localRay.intersectTriangle(vc, vb, va, true, hit) :
            localRay.intersectTriangle(va, vb, vc, material.side !== THREE.DoubleSide, hit);
          if (found) {
            const depth = hit.applyMatrix4(matrix).distanceTo(origin);
            // A fading surface has real holes. Treat only the fully opaque
            // part as a blocker, never resurrect the removed local cutaway.
            if (cutaway && material.userData.rrContactUniform && depth < 2.25) continue;
            if (depth < distance - .035) return true;
          }
        }
      }
    }
  }
  return false;
}

/** Main-camera only. viewport is CSS pixels; ratio is HP/armor in [0,1].
 * Optional stats is overwritten per call (samples/rays/blocks/triangles/bodyMeshes).
 * nearCutaway defaults to the live cockpit controller, not last render uniforms.
 * acceptPoint({x,y}) filters actual projected surface points before ray budgets
 * are spent, so a hidden HUD region cannot discard an otherwise visible body.
 */
export function visibleEnemyAnchor(game, camera, actor, { viewport, nearCutaway, acceptPoint, stats = {} } = {}) {
  Object.assign(stats, { samples: 0, rays: 0, blocks: 0, triangles: 0, bodyMeshes: 0 });
  const entity = actor?.riding || actor, root = entity?.rig?.root;
  if (!camera || (game.camera && camera !== game.camera) || !root?.parent || !shown(root)) return null;
  if (!actor || actor === game.player || actor.isPlayer || entity === game.player?.riding ||
      actor.dead || actor.out || actor.respawnT > 0 || actor.state === 'dead' ||
      entity.dead || entity.out || entity.state === 'dead' || entity.respawnT > 0) return null;
  const health = entity.armor ?? entity.hp, maximum = entity.maxArmor ?? entity.maxHp;
  if (Number.isFinite(health) && health <= 0) return null;
  // updateMatrixWorld invokes SkinnedMesh's attached bind-matrix refresh;
  // updateWorldMatrix alone would leave a moving root's inverse one frame old.
  camera.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false); root.updateMatrixWorld(true);
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const meshes = [], skeletons = new Set(); let area = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh || !shown(mesh) || !mesh.layers.test(camera.layers) || mesh.userData.rrGroundMark ||
        mesh.userData.outline || mesh.userData.rrOutline || mesh.userData.rrPlushCoat) return;
    if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(solid)) return;
    const info = geometryInfo(mesh.geometry); if (!info) return;
    if (mesh.isSkinnedMesh && !skeletons.has(mesh.skeleton)) { mesh.skeleton.update(); skeletons.add(mesh.skeleton); }
    meshes.push({ mesh, info }); area += info.area;
  });
  const controller = game.cockpitCamera?.contactView;
  const cutaway = nearCutaway ?? (controller?.enabled && controller.camera === camera);
  const width = viewport?.width ?? globalThis.innerWidth ?? 1, height = viewport?.height ?? globalThis.innerHeight ?? 1;
  const candidates = [];
  for (const { mesh, info } of meshes) {
    const first = mesh.geometry.drawRange.start, total = Math.floor(Math.min(info.count - first, mesh.geometry.drawRange.count) / 3);
    const sampleCount = Math.min(total, Math.max(2, Math.floor(SAMPLE_BUDGET * info.area / area)));
    for (let k = 0; k < sampleCount; k++) {
      const offset = first + Math.floor((k + .5) * total / sampleCount) * 3;
      const material = materialAt(mesh, offset); if (!solid(material)) continue;
      stats.samples++;
      vertex(mesh, offset, va, true).applyMatrix4(mesh.matrixWorld);
      vertex(mesh, offset + 1, vb, true).applyMatrix4(mesh.matrixWorld);
      vertex(mesh, offset + 2, vc, true).applyMatrix4(mesh.matrixWorld);
      normal.crossVectors(edge.subVectors(vb, va), hit.subVectors(vc, va));
      const world = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
      const facing = normal.dot(edge.subVectors(origin, world));
      if ((material.side === THREE.FrontSide && facing <= 0) || (material.side === THREE.BackSide && facing >= 0)) continue;
      // Do not attach to a removed head/face fragment or a barely surviving
      // dither speck. >=50% coverage is still on the actual fading surface.
      if (cutaway && material.userData.rrContactUniform && origin.distanceTo(world) < 1.925) continue;
      const ndc = world.clone().project(camera);
      if (![ndc.x, ndc.y, ndc.z].every(Number.isFinite) || ndc.z < -1 || ndc.z >= 1 || Math.abs(ndc.x) >= .99 || Math.abs(ndc.y) >= .99) continue;
      const x = (viewport?.left || 0) + (ndc.x + 1) * width / 2, y = (viewport?.top || 0) + (1 - ndc.y) * height / 2;
      if (acceptPoint && !acceptPoint({ x, y })) continue;
      candidates.push({ world, ndc, x, y });
    }
  }
  // Prefer upper visible body points, but keep the bar on that surface instead
  // of raising a head anchor through a wall or above the screen.
  candidates.sort((a, b) => (b.ndc.y - Math.abs(b.ndc.x) * .1) - (a.ndc.y - Math.abs(a.ndc.x) * .1));
  const obstacles = environment(game.arena), bodies = bodyOccluders(game, entity, camera), skins = new Map(), chosen = [];
  stats.bodyMeshes = bodies.length;
  while (candidates.length && chosen.length < MAX_RAYS) {
    // If the upper point is behind cover, spread the remaining probes over
    // the body instead of spending every ray along the same hidden head edge.
    let next = 0;
    if (chosen.length) {
      let best = .0025;
      next = -1;
      for (let i = 0; i < candidates.length; i++) {
        const separation = Math.min(...chosen.map(p => p.distanceToSquared(candidates[i].ndc)));
        if (separation > best) { best = separation; next = i; }
      }
      if (next < 0) break;
    }
    const candidate = candidates.splice(next, 1)[0];
    chosen.push(candidate.ndc); stats.rays++;
    if (!occluded(obstacles, origin, candidate.world, camera, stats) && !occluded(bodies, origin, candidate.world, camera, stats, cutaway, skins)) {
      return { ...candidate, entity, ratio: Number.isFinite(health / maximum) ? THREE.MathUtils.clamp(health / maximum, 0, 1) : 0 };
    }
  }
  return null;
}

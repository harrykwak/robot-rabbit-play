import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Standalone props: local +z is the service side; y=0 is ground level.
// Solid parts are baked into vertex-colored meshes; signs use small canvas faces.
// Resources are shared within a station, never between disposable instances.
const C = {
  orange: 0xe88a61, lightOrange: 0xf4b27e, darkOrange: 0xb9664c,
  cream: 0xf5e5c9, white: 0xfff6e8, green: 0x718e72, leaf: 0x91aa78,
  lime: 0xc1c88e, dark: 0x4c6557, wood: 0xb98562, edge: 0x81604e,
  soil: 0x624b3d, earth: 0x9b7356, metal: 0x82958b, steel: 0xc8d0bd,
};
const TAU = Math.PI * 2;

function mergeParts(parts) {
  let vertexCount = 0, indexCount = 0;
  for (const { geometry: g } of parts) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let offset = 0, cursor = 0;
  for (const { geometry: g, matrix, color } of parts) {
    const p = g.attributes.position, n = g.attributes.normal;
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(matrix);
      normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      const j = (offset + i) * 3;
      positions[j] = point.x; positions[j + 1] = point.y; positions[j + 2] = point.z;
      normals[j] = normal.x; normals[j + 1] = normal.y; normals[j + 2] = normal.z;
      colors[j] = color.r; colors[j + 1] = color.g; colors[j + 2] = color.b;
    }
    const count = g.index ? g.index.count : p.count;
    for (let i = 0; i < count; i++) indices[cursor++] = offset + (g.index ? g.index.getX(i) : i);
    offset += p.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeKit(root) {
  const geometries = new Set(), materials = new Set(), templates = new Map();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  materials.add(material);
  const signMaterials = new Set();
  let disposed = false;
  const template = (key, make) => {
    if (!templates.has(key)) templates.set(key, make());
    return templates.get(key);
  };
  const box = template('box', () => new THREE.BoxGeometry(1, 1, 1));
  // These spheres are petals, leaves and cup trim, never character faces.
  const sphere = template('sphere', () => new THREE.SphereGeometry(1, 12, 8));
  const cone = template('cone', () => new THREE.ConeGeometry(1, 1, 16));
  const torus = template('torus', () => new THREE.TorusGeometry(1, 0.08, 8, 24));
  function batch(parent, name) {
    const parts = [];
    function part(geometry, color, position, scale, rotation = [0, 0, 0]) {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
      parts.push({ geometry, matrix, color: new THREE.Color(color) });
    }
    const b = {
      box: (color, p, s, r) => part(box, color, p, s, r),
      roundBox: (color, p, s, r, radius = 0.09) => {
        const dims = s.map((value) => Math.abs(value));
        const edge = Math.min(radius, Math.min(...dims) * 0.49);
        const key = `rounded-box:${dims.join(':')}:${edge}`;
        part(template(key, () => new RoundedBoxGeometry(...dims, 2, edge)), color, p,
          s.map((value) => Math.sign(value) || 1), r);
      },
      sphere: (color, p, s, r) => part(sphere, color, p, s, r),
      cone: (color, p, s, r) => part(cone, color, p, s, r),
      ring: (color, p, s, r) => part(torus, color, p, s, r),
      cylinder(color, p, top, bottom, height, rotation, segments = 16) {
        const key = `cylinder:${top}:${bottom}:${segments}`;
        const geometry = template(key, () => new THREE.CylinderGeometry(top, bottom, 1, segments));
        part(geometry, color, p, [1, height, 1], rotation);
      },
      finish() {
        const geometry = mergeParts(parts);
        geometries.add(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        parts.length = 0;
        return mesh;
      },
    };
    return b;
  }
  function sign(parent, name, label, detail, position, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.max(128, Math.round(canvas.width * height / width));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Canvas mocks in headless tests expose harmless no-op methods. Keep all
      // drawing calls optional so the model still builds with partial contexts.
      const call = (method, ...args) => { if (typeof ctx[method] === 'function') ctx[method](...args); };
      ctx.fillStyle = '#526957';
      call('fillRect', 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e8b27e';
      call('beginPath');
      if (typeof ctx.roundRect === 'function') call('roundRect', 12, 12, 1000, canvas.height - 24, 20);
      else call('rect', 12, 12, 1000, canvas.height - 24);
      call('fill');
      ctx.fillStyle = '#fff3dc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(canvas.height * (detail ? .36 : .58))}px 'Trebuchet MS', sans-serif`;
      call('fillText', label, 512, canvas.height * (detail ? .37 : .5), 930);
      if (detail) {
        ctx.fillStyle = '#fff8eb';
        ctx.font = `600 ${Math.round(canvas.height * .23)}px 'Trebuchet MS', sans-serif`;
        call('fillText', detail, 512, canvas.height * .76, 930);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    signMaterials.add(faceMaterial);
    const geometry = new THREE.PlaneGeometry(width, height);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, faceMaterial);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = false;
    parent.add(mesh);
  }
  return {
    batch,
    sign,
    releaseTemplates() {
      for (const g of templates.values()) g.dispose();
      templates.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const m of signMaterials) { m.map?.dispose(); m.dispose(); }
      for (const g of templates.values()) g.dispose();
      geometries.clear(); materials.clear(); signMaterials.clear(); templates.clear();
    },
  };
}

function carrot(b, x, y, z, size = 1, lean = 0) {
  // Cone tip points into the soil; the crown and orange shoulder remain exposed.
  b.cone(C.orange, [x, y, z], [0.17 * size, 0.58 * size, 0.17 * size], [0, 0, Math.PI]);
  b.sphere(C.lightOrange, [x, y + 0.24 * size, z], [0.16 * size, 0.10 * size, 0.16 * size]);
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5;
    b.sphere(i % 2 ? C.leaf : C.green,
      [x + Math.cos(angle) * 0.14 * size, y + 0.48 * size, z + Math.sin(angle) * 0.14 * size],
      [0.068 * size, 0.31 * size, 0.075 * size],
      [Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45 + lean]);
  }
}

function buildShop(root, kit) {
  const b = kit.batch(root, 'shop-static');
  b.roundBox(C.green, [0, 0.10, 0], [5, 0.20, 3.1], undefined, 0.08);
  b.roundBox(C.cream, [0, 0.23, 0.1], [4.75, 0.06, 2.8], undefined, 0.08);
  b.roundBox(C.wood, [0, 0.91, 0.05], [4.4, 1.3, 1.65], undefined, 0.10);
  b.roundBox(C.orange, [0, 0.96, 0.90], [4.3, 1.13, 0.10], undefined, 0.08);
  for (let i = -4; i <= 4; i++) b.roundBox(C.darkOrange, [i * 0.47, 0.96, 0.957], [0.025, 1.08, 0.02], undefined, 0.01);
  b.box(C.dark, [0, 1.64, 0.12], [4.85, 0.14, 2]);
  b.box(C.cream, [0, 1.73, 0.12], [4.88, 0.06, 2.04]);
  b.box(C.cream, [0, 0.37, 0.975], [4.48, 0.12, 0.12]);
  for (const x of [-2.15, 2.15]) {
    b.cylinder(C.green, [x, 1.65, -1.12], 0.09, 0.09, 2.95);
    b.sphere(C.lightOrange, [x, 3.16, -1.12], [0.14, 0.14, 0.14]);
  }
  // Ten cream/orange canvas strips, pitched toward the service side.
  for (let i = 0; i < 10; i++) {
    const x = -2.25 + i * 0.5, color = i % 2 ? C.orange : C.cream;
    b.box(color, [x, 3.08, 0], [0.50, 0.12, 3.1], [0.10, 0, 0]);
    b.box(color, [x, 2.85, 1.51], [0.50, 0.28, 0.12]);
    b.sphere(color, [x, 2.72, 1.51], [0.25, 0.09, 0.065]);
  }
  b.roundBox(C.dark, [0, 2.88, 1.59], [3.85, 0.62, 0.09], undefined, 0.10);
  b.roundBox(C.lime, [0, 3.20, 1.59], [3.95, 0.06, 0.12], undefined, 0.03);
  b.box(C.dark, [0.84, 1.02, 0.997], [1.65, 0.73, 0.09]);
  b.roundBox(C.lime, [0.84, 1.42, 1.01], [1.73, 0.05, 0.09], undefined, 0.02);
  // Front carrot insignia and a pair of tumblers at the serving counter.
  b.cone(C.cream, [-1.21, 0.91, 1.01], [0.23, 0.76, 0.07], [0, 0, Math.PI + 0.28]);
  for (let i = -1; i <= 1; i++) b.box(C.lime, [-1.11 + i * 0.11, 1.35, 1.01], [0.09, 0.32, 0.055], [0, 0, i * -0.35]);
  for (const x of [-1.55, -0.99]) {
    b.cylinder(C.white, [x, 1.92, 0.60], 0.17, 0.12, 0.33);
    b.cylinder(C.orange, [x, 2.09, 0.60], 0.15, 0.15, 0.024);
    b.cylinder(C.green, [x + 0.04, 2.23, 0.60], 0.022, 0.022, 0.28, [0, 0, -0.14], 8);
  }
  // Tiny flower pots frame the counter ends while leaving its center clear.
  for (const x of [-2.12, 2.12]) {
    b.cylinder(C.darkOrange, [x, 0.39, 1.20], 0.18, 0.22, 0.25, undefined, 20);
    b.cylinder(C.soil, [x, 0.52, 1.20], 0.17, 0.17, 0.025, undefined, 20);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3;
      b.sphere(C.leaf, [x + Math.cos(a) * 0.13, 0.68, 1.20 + Math.sin(a) * 0.13],
        [0.10, 0.20, 0.08], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]);
      b.sphere(i ? C.lightOrange : C.cream, [x + Math.cos(a) * 0.13, 0.86, 1.20 + Math.sin(a) * 0.13], [0.075, 0.075, 0.075]);
    }
  }
  // Self-service dispenser with a bright juice tank and protruding front tap.
  b.box(C.green, [1.32, 1.86, -0.28], [0.93, 0.20, 0.92]);
  b.cylinder(C.orange, [1.32, 2.24, -0.28], 0.37, 0.37, 0.62);
  for (const y of [1.96, 2.56]) b.cylinder(C.cream, [1.32, y, -0.28], 0.42, 0.42, 0.095);
  b.box(C.lightOrange, [1.22, 2.28, 0.075], [0.12, 0.40, 0.015]);
  b.cylinder(C.steel, [1.32, 2.01, 0.27], 0.08, 0.08, 0.50, [Math.PI / 2, 0, 0]);
  b.cylinder(C.dark, [1.32, 1.94, 0.52], 0.085, 0.065, 0.16);
  b.box(C.green, [1.32, 2.13, 0.38], [0.12, 0.19, 0.10], [0.15, 0, 0]);
  b.cylinder(C.cream, [1.32, 1.785, 0.56], 0.25, 0.25, 0.035);
  // Giant roof drink: flared orange cup, cream rims, carrot logo and bent straw.
  b.cylinder(C.dark, [0, 3.23, -0.49], 0.79, 0.85, 0.12, undefined, 24);
  b.cylinder(C.orange, [0, 3.90, -0.49], 0.83, 0.62, 1.32, undefined, 24);
  b.cylinder(C.cream, [0, 3.30, -0.49], 0.64, 0.64, 0.10, undefined, 24);
  b.cylinder(C.cream, [0, 4.56, -0.49], 0.89, 0.89, 0.14, undefined, 24);
  b.cylinder(C.lightOrange, [0, 4.65, -0.49], 0.80, 0.80, 0.045, undefined, 24);
  b.sphere(C.cream, [0, 3.99, 0.275], [0.42, 0.43, 0.065]);
  b.cone(C.orange, [0, 3.92, 0.35], [0.16, 0.43, 0.04], [0, 0, Math.PI - 0.27]);
  for (let i = -1; i <= 1; i++) b.box(C.green, [-0.03 + i * 0.07, 4.17, 0.35], [0.065, 0.18, 0.035], [0, 0, i * -0.4]);
  b.cylinder(C.green, [0.34, 4.96, -0.48], 0.07, 0.07, 0.69, [0, 0, -0.12], 12);
  b.cylinder(C.cream, [0.37, 5.13, -0.48], 0.075, 0.075, 0.12, [0, 0, -0.12], 12);
  b.sphere(C.green, [0.38, 5.29, -0.48], [0.071, 0.071, 0.071]);
  b.cylinder(C.green, [0.64, 5.29, -0.48], 0.07, 0.07, 0.53, [0, 0, Math.PI / 2], 12);
  b.finish();
  kit.sign(root, 'shop-name-sign', 'CARROT BAR', '', [0, 2.88, 1.643], 3.46, 0.50);
  kit.sign(root, 'shop-price-sign', '20 AP', '', [0.84, 1.03, 1.052], 1.43, 0.54);
  const flowBatch = kit.batch(root, 'shop-pour');
  flowBatch.cylinder(C.lightOrange, [0, 0, 0], 0.029, 0.035, 0.14, undefined, 8);
  const flow = flowBatch.finish();
  flow.position.set(1.32, 1.82, 0.52);
  flow.castShadow = false;
  flow.visible = false;
  return (time, progress, active) => {
    flow.visible = active;
    flow.scale.x = flow.scale.z = 0.85 + 0.15 * Math.sin(time * 18);
  };
}

function buildFarm(root, kit) {
  const b = kit.batch(root, 'farm-static');
  b.box(C.edge, [0, 0.10, 0], [5, 0.20, 5]);
  b.box(C.soil, [0, 0.22, 0], [4.70, 0.12, 4.70]);
  for (const x of [-2.42, 2.42]) b.box(C.wood, [x, 0.25, 0], [0.16, 0.22, 5]);
  for (const z of [-2.42, 2.42]) b.box(C.wood, [0, 0.25, z], [4.84, 0.22, 0.16]);
  for (const x of [-1.67, -0.55, 0.57, 1.69]) {
    b.box(C.earth, [x, 0.30, 0.83], [0.68, 0.13, 2.72]);
    for (let i = 0; i < 4; i++) {
      carrot(b, x + (i % 2 ? 0.055 : -0.045), 0.37, -0.16 + i * 0.64, 0.82 + (i % 3) * 0.045);
    }
  }
  // Back work area; the grinder body is centered at local z=-1.
  b.box(C.cream, [0.40, 0.33, -1.42], [3.75, 0.08, 1.47]);
  for (const x of [0.22, 1.42]) for (const z of [-1.42, -0.63]) {
    b.box(C.green, [x, 0.86, z], [0.11, 1.08, 0.11]);
  }
  b.roundBox(C.wood, [0.82, 1.42, -1.03], [1.68, 0.16, 1.21], undefined, 0.09);
  b.roundBox(C.green, [0.82, 1.70, -1], [1.04, 0.51, 0.75], undefined, 0.12);
  b.cylinder(C.steel, [0.82, 1.76, -1], 0.29, 0.29, 1.16, [0, 0, Math.PI / 2]);
  // Four flared hopper walls leave a real opening through which carrots fall.
  b.box(C.steel, [0.82, 2.19, -1.35], [0.99, 0.47, 0.07], [0.31, 0, 0]);
  b.box(C.steel, [0.82, 2.19, -0.65], [0.99, 0.47, 0.07], [-0.31, 0, 0]);
  b.box(C.metal, [0.40, 2.19, -1], [0.07, 0.47, 0.70], [0, 0, -0.30]);
  b.box(C.metal, [1.24, 2.19, -1], [0.07, 0.47, 0.70], [0, 0, 0.30]);
  b.box(C.dark, [0.82, 1.995, -1], [0.64, 0.03, 0.43]);
  // Chute is open and orange pulp can be seen along its face.
  b.box(C.steel, [0.82, 1.23, -0.30], [0.48, 0.06, 0.90], [0.50, 0, 0]);
  for (const x of [0.57, 1.07]) b.box(C.green, [x, 1.29, -0.30], [0.06, 0.17, 0.90], [0.50, 0, 0]);
  b.box(C.orange, [0.82, 1.267, -0.32], [0.33, 0.015, 0.71], [0.50, 0, 0]);
  // Open cream pail with metal hoops: the juice is visible from front and above.
  b.cylinder(C.cream, [0.82, 0.46, 0.10], 0.48, 0.39, 0.12);
  for (const y of [0.50, 0.97]) b.ring(C.steel, [0.82, y, 0.10], [0.49, 0.49, 0.49], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    b.box(C.cream, [0.82 + Math.cos(a) * 0.46, 0.73, 0.10 + Math.sin(a) * 0.46],
      [0.055, 0.48, 0.055]);
  }
  b.roundBox(C.dark, [-1.39, 1.64, -1.28], [1.64, 0.97, 0.12], undefined, 0.08);
  for (const x of [-2.03, -0.75]) b.box(C.wood, [x, 0.90, -1.32], [0.10, 1.45, 0.10]);
  b.box(C.lime, [-1.39, 2.15, -1.28], [1.74, 0.07, 0.15]);
  // A little harvested carrot crate makes the rear work area feel stocked.
  b.box(C.edge, [-0.40, 0.47, -1.87], [0.86, 0.23, 0.47]);
  b.box(C.wood, [-0.40, 0.59, -2.12], [0.92, 0.23, 0.07]);
  for (const x of [-0.66, -0.40, -0.14]) carrot(b, x, 0.63, -1.87, 0.50);
  b.finish();
  kit.sign(root, 'grinder-instruction-sign', 'CARROT PRESS', 'FREE', [-1.39, 1.64, -1.208], 1.48, 0.84);

  const crank = new THREE.Group();
  crank.name = 'grinder-crank';
  crank.position.set(1.44, 1.76, -1);
  root.add(crank);
  const gear = kit.batch(crank, 'crank-and-gear');
  gear.cylinder(C.dark, [0, 0, 0], 0.30, 0.30, 0.14, [0, 0, Math.PI / 2], 20);
  gear.ring(C.steel, [0.084, 0, 0], [0.24, 0.24, 0.24], [0, Math.PI / 2, 0]);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    gear.box(C.metal, [0, Math.cos(a) * 0.32, Math.sin(a) * 0.32], [0.17, 0.10, 0.11], [a, 0, 0]);
  }
  gear.cylinder(C.lightOrange, [0.18, 0, 0], 0.11, 0.11, 0.32, [0, 0, Math.PI / 2]);
  gear.box(C.orange, [0.32, 0.30, 0], [0.12, 0.70, 0.13]);
  gear.cylinder(C.dark, [0.49, 0.63, 0], 0.09, 0.09, 0.39, [0, 0, Math.PI / 2]);
  gear.sphere(C.wood, [0.69, 0.63, 0], [0.12, 0.13, 0.13]);
  gear.finish();

  const fillBatch = kit.batch(root, 'farm-juice-level');
  fillBatch.cylinder(C.orange, [0, 0.5, 0], 0.43, 0.37, 1);
  fillBatch.cylinder(C.lightOrange, [0, 1.005, 0], 0.435, 0.435, 0.01);
  const fill = fillBatch.finish();
  fill.position.set(0.82, 0.51, 0.10);
  const meterBatch = kit.batch(root, 'farm-progress');
  meterBatch.box(C.lime, [0.5, 0, 0], [1, 0.075, 0.025]);
  const meter = meterBatch.finish();
  meter.position.set(-2.065, 1.66, -1.195);
  meter.castShadow = false;

  const falling = [];
  for (let i = 0; i < 2; i++) {
    const carrotBatch = kit.batch(root, `feeding-carrot-${i}`);
    carrot(carrotBatch, 0, 0, 0, 0.70);
    const mesh = carrotBatch.finish();
    mesh.visible = false;
    falling.push(mesh);
  }
  const pulp = [];
  for (let i = 0; i < 3; i++) {
    const pulpBatch = kit.batch(root, `pulp-${i}`);
    pulpBatch.sphere(i % 2 ? C.lightOrange : C.orange, [0, 0, 0], [0.045, 0.075, 0.045]);
    const mesh = pulpBatch.finish();
    mesh.castShadow = false;
    mesh.visible = false;
    pulp.push(mesh);
  }
  let lastTime, phase = 0;
  return (time, progress, active) => {
    // Delta is bounded after a paused/background tab; idle calls do not turn it.
    const dt = lastTime === undefined ? 0 : Math.max(0, Math.min(0.10, time - lastTime));
    lastTime = time;
    if (active) phase = (phase + dt * 1.8) % 1;
    crank.rotation.x = -phase * TAU;
    fill.scale.y = 0.035 + progress * 0.40;
    meter.scale.x = Math.max(0.001, progress * 1.35);
    falling.forEach((mesh, i) => {
      const p = (phase + i * 0.5) % 1;
      mesh.visible = active && p < 0.84;
      mesh.position.set(0.82 + (i ? 0.12 : -0.12), 2.88 - p * 0.92, -1);
      mesh.rotation.set(0.12 * Math.sin(p * TAU), p * 0.4, (i ? 1 : -1) * 0.12);
      mesh.scale.setScalar(1 - Math.max(0, p - 0.6) * 3);
    });
    pulp.forEach((mesh, i) => {
      const p = (phase * 2 + i / 3) % 1;
      mesh.visible = active;
      mesh.position.set(0.82 + Math.sin(i * 2.4) * 0.10, 1.13 - p * 0.36, 0.02 + p * 0.11);
    });
  };
}

/**
 * @param {'shop'|'farm'} kind
 * @returns {{root: THREE.Group, animate: Function, dispose: Function}}
 * animate expects elapsed seconds and normalized progress (0..1).
 * Parent owns placement and interaction; active controls pouring/grinding only.
 */
export function createJuiceStationModel(kind) {
  if (kind !== 'shop' && kind !== 'farm') throw new RangeError(`Unknown juice station kind: ${kind}`);
  const root = new THREE.Group();
  root.name = `juice-station-${kind}`;
  const kit = makeKit(root);
  let update;
  try {
    update = kind === 'shop' ? buildShop(root, kit) : buildFarm(root, kit);
    kit.releaseTemplates();
  } catch (error) {
    kit.dispose();
    throw error;
  }
  let disposed = false;
  const animate = (time, progress = 0, active = false) => {
    if (disposed) return;
    const seconds = Number.isFinite(time) ? time : 0;
    const amount = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    update(seconds, amount, Boolean(active));
  };
  animate(0);
  return {
    root,
    animate,
    dispose() {
      if (disposed) return;
      disposed = true;
      kit.dispose();
      update = null;
    },
  };
}

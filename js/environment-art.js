// Hand-built miniature garden art. No collision or navigation lives here.
// Pieces are welded into vertex-coloured draws; dynamic assemblies have their
// own builder so the windmill, mushrooms and ferries never enter a static batch.
import * as THREE from 'three';
const TAU = Math.PI * 2;
const sphereTemplates = new Map();
// Shared by the visible coast and arena's radial footprint queries.
export const islandRadius = (r, a, x = 0, z = 0) => r * (1 + .038 * Math.sin(a * 3 + x * .07) + .025 * Math.sin(a * 5 + z * .05) + .014 * Math.cos(a * 7));
const PAL = {
  farm: { leaf: 0x639568, tips: 0xa4bb75, bloom: 0xeeb9a3, earth: 0xb78867, rock: 0x857773, trim: 0xf3dfb7, wall: 0xe6cc9f, roof: 0xad6150 },
  fort: { leaf: 0x758b60, tips: 0xb8bd7b, bloom: 0xe7ae91, earth: 0xbc9273, rock: 0x947c78, trim: 0xf4dfb6, wall: 0xc79776, roof: 0x9d615a },
  sky: { leaf: 0x80a8a1, tips: 0xbacbb9, bloom: 0xe9b5ca, earth: 0xba9f9a, rock: 0x8c879f, trim: 0xf3e4d0, wall: 0xdbcece, roof: 0x9285af },
};

function rounded(w, h, d, radius = 0.12) {
  // Thin rails, lattice and masonry joints are silhouette lines at gameplay
  // distance. Their old bevel tessellation cost more than the cottage itself.
  if (Math.min(w, h, d) < .26) return new THREE.BoxGeometry(w, h, d);
  const r = Math.min(radius, w / 2 - .001, h / 2 - .001, d / 2 - .001);
  const x = w / 2 - r, y = h / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-x, -y - r); s.lineTo(x, -y - r);
  s.quadraticCurveTo(x + r, -y - r, x + r, -y); s.lineTo(x + r, y);
  s.quadraticCurveTo(x + r, y + r, x, y + r); s.lineTo(-x, y + r);
  s.quadraticCurveTo(-x - r, y + r, -x - r, y); s.lineTo(-x - r, -y);
  s.quadraticCurveTo(-x - r, -y - r, -x, -y - r);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2 + r); return g;
}

export function createEnvironmentArt(st, id, parent = st.g) {
  const p = PAL[id], pieces = new Map(), distant = st.detail === 'distant';
  const transform = new THREE.Object3D(), color = new THREE.Color();
  function add(geo, tint, x = 0, y = 0, z = 0, scale = [1, 1, 1], rotation = [0, 0, 0], cast = true, variation = 0) {
    transform.position.set(x, y, z); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
    geo.applyMatrix4(transform.matrix);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    // Preserve small camera-only occlusion bounds before welding the art. These
    // never affect movement/navigation and avoid raycasting entire island draws.
    if (cast && !distant) {
      g.computeBoundingBox(); const size = g.boundingBox.getSize(new THREE.Vector3());
      if (size.x > .45 && size.y > .45 && size.z > .3) {
        (st.cameraBoxes ||= []).push({ node: parent, localBox: g.boundingBox.clone() });
      }
    }
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    color.set(tint);
    for (let i = 0; i < pos.count; i++) {
      // A gentle brushed pigment variation, coherent in world space.
      const k = 1 + variation * (.5 * Math.sin(pos.getX(i) * 2.1 + pos.getZ(i) * 1.7) + .5 * Math.sin(pos.getY(i) * 2.3));
      cols[i * 3] = color.r * k; cols[i * 3 + 1] = color.g * k; cols[i * 3 + 2] = color.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (!pieces.has(cast)) pieces.set(cast, []);
    pieces.get(cast).push(g);
  }
  const box = (x, y, z, w, h, d, tint, r = .12, rot = 0, cast = true) => add(rounded(w, h, d, r), tint, x, y, z, [1, 1, 1], [0, rot, 0], cast);
  function bulb(x, y, z, sx, sy, sz, tint, cast = true, phase = 0, miniature = false) {
    const small = Math.max(sx, sy, sz) < .6;
    const width = miniature ? 6 : small ? 8 : distant ? 12 : 18, height = miniature ? 4 : small ? 5 : distant ? 8 : 11, key = width + ':' + height;
    if (!sphereTemplates.has(key)) sphereTemplates.set(key, new THREE.SphereGeometry(1, width, height));
    const g = sphereTemplates.get(key).clone(), a = g.attributes.position;
    for (let i = 0; i < (small ? 0 : a.count); i++) {
      const xx = a.getX(i), yy = a.getY(i), zz = a.getZ(i);
      const k = 1 + .055 * Math.sin(xx * 5 + phase) * Math.sin(zz * 4 + yy * 3);
      a.setXYZ(i, xx * k, yy * k, zz * k);
    }
    if (!small) g.computeVertexNormals(); add(g, tint, x, y, z, [sx, sy, sz], [0, phase, 0], cast, .035);
  }
  const lathe = (x, y, z, profile, tint, cast = true, seg = 40) => add(new THREE.LatheGeometry((profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile).map(([r, h]) => new THREE.Vector2(r, h)), seg), tint, x, y, z, [1, 1, 1], [0, 0, 0], cast, .05);
  function tube(points, radius, tint, cast = true) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a => new THREE.Vector3(...a))), Math.max(8, points.length * 5), radius, 6, false), tint, 0, 0, 0, [1, 1, 1], [0, 0, 0], cast);
  }
  function disk(x, y, z, radius, tint, cast = false) { add(new THREE.CircleGeometry(radius, 40), tint, x, y, z, [1, 1, 1], [-Math.PI / 2, 0, 0], cast); }
  function arch(x, y, z, width, height, depth, tint, rot = 0, filled = false) {
    const s = new THREE.Shape(), w = width / 2, spring = height - w;
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, spring); s.absarc(0, spring, w, 0, Math.PI, false); s.lineTo(-w, 0);
    if (!filled) {
      const hole = new THREE.Path(), inner = Math.max(.1, w - .16);
      hole.moveTo(-inner, 0); hole.lineTo(-inner, spring); hole.absarc(0, spring, inner, Math.PI, 0, true); hole.lineTo(inner, 0); hole.closePath(); s.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, bevelSize: .035, bevelThickness: .035, curveSegments: 16 });
    g.translate(0, 0, -depth / 2); add(g, tint, x, y, z, [1, 1, 1], [0, rot, 0]);
  }
  function flowers(x, z, y = 0, size = 1, tint = p.bloom) {
    // Two sculpted corollas in a planted clump. A continuous five-lobed cup
    // replaces fifteen separate petal spheres and three tiny tube curves.
    for (let k = 0; k < 2; k++) {
      const a = k * 2.4, xx = x + Math.cos(a) * .28 * size, zz = z + Math.sin(a) * .28 * size, h = (.32 + k * .09) * size;
      bulb(xx, y + .1 * size, zz, .32 * size, .1 * size, .2 * size, p.leaf, false, a, true);
      add(new THREE.CylinderGeometry(.018 * size, .027 * size, h, 4), p.leaf, xx, y + h / 2, zz, [1, 1, 1], [0, 0, -.08], false);
      const coords = [0, .065, 0], indices = [], segments = 20;
      for (let j = 0; j < segments; j++) { const b = j / segments * TAU, radius = .2 * (.82 + .18 * Math.cos(b * 5)); coords.push(Math.cos(b) * radius, .025 + .025 * Math.cos(b * 5), Math.sin(b) * radius); }
      for (let j = 0; j < segments; j++) indices.push(0, 1 + (j + 1) % segments, 1 + j);
      const bloom = new THREE.BufferGeometry(); bloom.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3)); bloom.setIndex(indices); bloom.computeVertexNormals();
      add(bloom, tint, xx, y + h, zz, [size, size, size], [0, a, 0], false);
      bulb(xx, y + h + .065 * size, zz, .055 * size, .04 * size, .055 * size, 0xe5ba66, false, 0, true);
    }
  }
  function grass(x, z, y = 0, s = 1) {
    for (let k = 0; k < 4; k++) {
      const a = k * 2.4;
      const shape = new THREE.Shape(); shape.moveTo(-.065 * s, 0); shape.quadraticCurveTo(-.1 * s, .32 * s, .22 * s, .58 * s); shape.quadraticCurveTo(.1 * s, .28 * s, .065 * s, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false, curveSegments: 2 });
      add(g, k % 2 ? p.tips : p.leaf, x, y, z, [1, 1, 1], [0, a, 0], false);
    }
  }
  function tree(x, z, y = 0, s = 1, blossom = false) {
    // Trunks sit behind the fall boundary: no invisible collision in the fight space.
    tube([[x, y, z], [x - .15 * s, y + 1.3 * s, z], [x + .18 * s, y + 3 * s, z]], .21 * s, 0x9d795b);
    for (const sign of [-1, 1]) tube([[x, y + 1.4 * s, z], [x + sign * .65 * s, y + 2.2 * s, z], [x + sign * 1.1 * s, y + 2.65 * s, z + .12]], .11 * s, 0x9d795b);
    const canopy = blossom ? p.bloom : p.leaf;
    bulb(x, y + 3.5 * s, z, 1.6 * s, 1.45 * s, 1.3 * s, canopy, true, x);
    bulb(x - 1.05 * s, y + 2.95 * s, z + .2 * s, 1.05 * s, .95 * s, 1.02 * s, canopy, true, z);
    bulb(x + 1.05 * s, y + 3.05 * s, z - .05 * s, 1.1 * s, 1.1 * s, 1.12 * s, blossom ? 0xf3d0d9 : p.tips, true, x + z);
    bulb(x - .25 * s, y + 4.25 * s, z - .1 * s, .95 * s, .65 * s, .85 * s, blossom ? 0xf1ccd5 : p.tips, true, 2);
  }
  function islandEdge(x, z, r, h, holes = []) {
    // A soft scalloped grass lip over carved sediment shelves. Only the lower
    // silhouette varies: the playable upper surface keeps its exact radius.
    const profiles = [
      [[r, h - .04], [r, h - .22], [r * .996, h - .42], [r * .985, h - .64]],
      [[r * .985, h - .58], [r * .99, h - .85], [r * .975, h - 1.2], [r * .947, h - 1.7], [r * .9, h - 2.3]],
      [[r * .905, h - 2.25], [r * .945, h - 2.65], [r * .93, h - 3.3], [r * .9, h - 4.2], [r * .85, h - 5.4], [r * .65, h - 6.7], [r * .48, h - 8], [r * .26, h - 9.1], [0, h - 9.6]],
    ];
    profiles.forEach((profile, k) => {
      const deep = r > 12 ? 1.8 : r < 4 ? .4 : .72;
      const g = new THREE.LatheGeometry([...profile].reverse().map(([rr, yy]) => new THREE.Vector2(rr, k === 2 ? h - 2.25 + (yy - h + 2.25) * deep : yy)), distant ? 32 : r < 5 ? 40 : 72), a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const angle = Math.atan2(a.getZ(i), a.getX(i)), yy = a.getY(i), amount = k === 0 ? .08 : k === 1 ? .18 : .48;
        const coast = islandRadius(1, angle, x, z);
        a.setX(i, a.getX(i) * coast); a.setZ(i, a.getZ(i) * coast);
        a.setY(i, yy + Math.sin(angle * 5 + x) * Math.sin(angle * 3 + z) * amount);
        if (k > 0) { const rr = 1 + (k === 2 ? .04 : .012) * Math.sin(angle * 7 + yy * .5) + .018 * Math.sin(angle * 3 + x); a.setX(i, a.getX(i) * rr); a.setZ(i, a.getZ(i) * rr); }
      }
      g.computeVertexNormals(); add(g, [p.leaf, p.earth, p.rock][k], x, 0, z, [1, 1, 1], [0, 0, 0], false, .12);
    });
    for (const hole of holes) {
      add(new THREE.TorusGeometry(hole.r + .28, .28, 8, 48), p.trim, hole.x, h - .05, hole.z, [1, 1, 1], [Math.PI / 2, 0, 0], false);
    }
    // Sparse trailing vines on the rear edge, never in front of fighters.
    for (let i = 0; i < (distant || r < 5 ? 0 : 5); i++) {
      const a = Math.PI * 1.1 + i * .1, xx = x + Math.cos(a) * (r - .02), zz = z + Math.sin(a) * (r - .02);
      tube([[xx, h - .1, zz], [xx * .99, h - 1.2, zz], [xx * .97, h - 2.5 - i % 3 * .4, zz * .98]], .045, p.leaf, false);
      for (let j = 0; j < 3; j++) bulb(xx + Math.sin(j) * .2, h - .6 - j * .55, zz, .16, .23, .08, p.leaf, false, j);
    }
  }
  function ledge(x, z, radius = 3.1, y = -.06) {
    islandEdge(x, z, radius, y);
    bulb(x, y - .2, z, radius, .26, radius, p.tips, false, x);
  }
  function shrub(x, z, y = 0, s = 1, blossom = false) {
    for (let k = 0; k < 3; k++) bulb(x + (k - 1) * .48 * s, y + (.32 + (k % 2) * .18) * s, z + Math.sin(k * 2) * .18, .7 * s, .45 * s, .65 * s, k === 1 ? p.tips : p.leaf, true, x + k);
    if (blossom) { flowers(x - .3, z + .4, y + .25 * s, .9 * s); flowers(x + .5, z + .35, y + .2 * s, .75 * s, 0xf1d6a5); }
  }
  function cottage(x, z) {
    // A garden annex behind the gameplay fence, seated on a joined soil shelf.
    ledge(x, z, 4.2, -.09);
    box(x, 1.45, z, 4.25, 2.9, 3.15, p.wall, .22);
    box(x, .2, z, 4.45, .4, 3.35, 0xbf9a79, .12);
    const roof = new THREE.Shape();
    roof.moveTo(-2.55, 0); roof.quadraticCurveTo(-1.45, .65, 0, 2.05); roof.quadraticCurveTo(1.45, .65, 2.55, 0); roof.lineTo(2.25, -.18); roof.lineTo(-2.25, -.18); roof.closePath();
    const geo = new THREE.ExtrudeGeometry(roof, { depth: 3.65, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -1.82); add(geo, p.roof, x, 2.85, z);
    for (const sign of [-1, 1]) {
      tube([[x + sign * 2.55, 2.85, z + 1.88], [x + sign * 1.4, 3.63, z + 1.88], [x, 4.94, z + 1.88]], .095, p.trim);
      for (let k = 1; k <= 4; k++) {
        const xx = sign * (.3 + k * .44), yy = 4.65 - k * .4;
        tube([[x + xx, yy, z - 1.78], [x + xx + sign * .08, yy - .08, z], [x + xx, yy, z + 1.78]], .038, 0xc78369);
      }
    }
    box(x - 1.22, 4.12, z - .5, .54, 1.85, .6, 0xb2866a, .07);
    box(x - 1.22, 5.04, z - .5, .73, .17, .78, p.trim, .055);
    arch(x - .72, .22, z + 1.64, .92, 1.86, .13, 0x8b7560, 0, true);
    arch(x - .72, .16, z + 1.75, 1.17, 2.05, .13, p.trim);
    bulb(x - .4, 1.03, z + 1.85, .07, .07, .07, 0xddbb79);
    for (const wx of [x + .99, x - .95]) {
      const wy = wx > x ? 1.24 : 3.26;
      arch(wx, wy, z + 1.67, .73, wx > x ? .98 : .68, .1, 0x7da1a4, 0, true);
      arch(wx, wy - .05, z + 1.76, .96, wx > x ? 1.12 : .85, .09, p.trim);
      box(wx, wy + .37, z + 1.84, .04, .6, .05, p.trim, .01);
      if (wx > x) {
        for (const sign of [-1, 1]) box(wx + sign * .55, wy + .42, z + 1.74, .27, .98, .09, 0x8da085, .04, sign * .16);
        box(wx, wy - .04, z + 1.88, 1.25, .24, .4, 0xb78b67, .055);
        flowers(wx - .28, z + 1.96, wy + .03, .8); flowers(wx + .28, z + 1.96, wy + .03, .8);
      }
    }
    // Cream stepping stones and low planting form a little enclosed courtyard.
    for (let k = 0; k < 3; k++) box(x - .7 + Math.sin(k) * .16, .01, z + 2.12 + k * .48, .82, .05, .4, p.trim, .025);
    shrub(x - 2.45, z + 1, 0, .85, true); shrub(x + 2.45, z + 1, 0, 1.1, true);
    tree(x + 1.7, z - 2.4, -.1, .85);
    for (let k = 0; k < 4; k++) { box(x - 2.8 + k * .55, .36, z + 2.7, .14, .72, .16, p.trim, .04); box(x + 1 + k * .55, .36, z + 2.7, .14, .72, .16, p.trim, .04); }
    box(x - 1.98, .45, z + 2.7, 1.8, .12, .12, p.trim, .045); box(x + 1.82, .45, z + 2.7, 1.8, .12, .12, p.trim, .045);
  }
  function windmill(x, z, base = 0) {
    lathe(x, base, z, [[0, 0], [1.64, 0], [1.65, .22], [1.52, .38], [1.45, 2.5], [1.22, 4.8], [1.15, 5.9], [0, 5.9]], p.wall);
    for (const y of [.3, 2.55, 5.7]) lathe(x, base + y, z, [[1.5 - y * .055, 0], [1.57 - y * .055, .04], [1.57 - y * .055, .18], [1.5 - y * .055, .22]], p.trim);
    lathe(x, base + 5.85, z, [[0, 2.35], [.18, 2.2], [.55, 1.72], [1.1, .95], [1.68, .24], [1.76, .1], [1.73, 0]], p.roof);
    for (let k = 0; k < 4; k++) lathe(x, base + 6.04 + k * .43, z, [[1.6 - k * .3, 0], [1.61 - k * .3, .04], [1.57 - k * .3, .08]], 0xc58167);
    arch(x, base + .08, z + 1.54, .83, 1.72, .13, 0x786654, 0, true);
    arch(x, base + .06, z + 1.64, 1.05, 1.86, .12, p.trim);
    for (let k = -2; k <= 2; k++) box(x + k * .135, base + .7, z + 1.63, .022, 1.15, .025, 0xb5916c, .009);
    bulb(x + .23, base + .83, z + 1.72, .07, .07, .06, 0xdbb66c);
    box(x, base + .06, z + 1.78, 1.12, .12, .48, p.trim, .05);
    for (const [wx, wz, rot] of [[x, z + 1.27, 0], [x - 1.3, z, -Math.PI / 2]]) {
      arch(wx, base + 3.05, wz, .69, 1.05, .1, 0x668b93, rot, true);
      arch(wx, base + 3, wz + .035, .88, 1.18, .12, p.trim, rot);
    }
    box(x, base + 3.55, z + 1.39, .055, .83, .04, p.trim, .012);
    box(x, base + 3.48, z + 1.4, .64, .05, .04, p.trim, .012);
    box(x, base + 2.98, z + 1.45, 1.02, .14, .35, 0xa97b5d, .05);
    flowers(x - .23, z + 1.5, base + 3.02, .65); flowers(x + .23, z + 1.5, base + 3.02, .65, 0xead19e);
    // Small curved porch hood and hand-cut brackets.
    tube([[x - .65, base + 2.04, z + 1.54], [x, base + 2.24, z + 1.87], [x + .65, base + 2.04, z + 1.54]], .16, p.roof);
    const blades = new THREE.Group(); blades.position.set(x, base + 5.45, z + 1.77); blades.userData.dyn = true; parent.add(blades);
    const rotor = createEnvironmentArt(st, id, blades);
    // Latticed sail frames instead of four featureless paddles.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      const part = (xx, yy, w, h, d, tint) => rotor.add(rounded(w, h, d, .045), tint, xx * c - yy * s, xx * s + yy * c, 0, [1, 1, 1], [0, 0, a]);
      part(0, 1.9, .12, 3.8, .12, 0x987354);
      part(.44, 2.35, .7, 2.5, .055, 0xf0ddba);
      for (const xx of [.1, .8]) part(xx, 2.35, .055, 2.6, .1, 0xa58160);
      for (let k = 0; k < 6; k++) part(.44, 1.12 + k * .49, .76, .045, .11, 0xa58160);
    }
    rotor.bulb(0, 0, .13, .31, .31, .2, 0x947453); rotor.finish();
    st.anim.push((t, dt) => { blades.rotation.z -= dt * .65; });
  }
  function masonry(x, z, hu, hv, rot, top, bottom) {
    const h = top - bottom, c = Math.cos(rot), s = Math.sin(rot);
    const at = (u, v, y, w, hh, d, tint, r = .08) => box(x + u * c - v * s, y, z + u * s + v * c, w, hh, d, tint, r, -rot);
    at(0, 0, bottom + h / 2, hu * 2, h, hv * 2, p.wall, Math.min(.18, h * .12));
    at(0, 0, top - .07, hu * 2, .14, hv * 2, p.trim, .05);
    // Individual rounded blocks on the vertical faces; combat surface stays flat.
    for (let row = 0; row < Math.floor(h / .65); row++) {
      const yy = bottom + .33 + row * .65;
      for (let u = -hu + .44 + (row % 2) * .4; u < hu - .2; u += .88) {
        at(u, hv - .012, yy, Math.min(.8, 2 * (hu - Math.abs(u))), .58, .065, row % 2 ? p.wall : 0xd8ae89, .035);
        at(u, -hv + .012, yy, Math.min(.8, 2 * (hu - Math.abs(u))), .58, .065, p.wall, .035);
      }
    }
    if (hu > 4 && hv > 4) {
      for (const u of [-3.3, 0, 3.3]) {
        const xx = x + u * c - hv * s, zz = z + u * s + hv * c;
        arch(xx, bottom + .32, zz + .045, 1.45, 2.05, .04, 0x94765f, -rot, true);
        arch(xx, bottom + .27, zz + .1, 1.75, 2.25, .1, p.trim, -rot);
      }
      // Crenellation carving is restricted to the side wall; no new barriers on
      // the existing walkable roof or ramp entrances.
      for (let u = -hu + .35; u <= hu - .3; u += 1.16) {
        at(u, -hv + .035, top - .24, .7, .46, .22, p.trim, .08);
        at(u, hv - .035, top - .24, .7, .46, .22, p.trim, .08);
      }
      for (const u of [-2.4, 2.4]) { at(u, hv + .085, top - .7, .55, .85, .06, u < 0 ? 0xba786b : 0x7f9fa1, .025); at(u, hv + .13, top - .5, .12, .32, .035, p.trim, .014); }
    } else if (hv < .7) {
      for (let u = -hu + .25; u < hu; u += .85) at(u, 0, top - .15, .56, .3, hv * 2, p.trim, .065);
      for (const u of [-hu + .3, hu - .3]) flowers(x + u * c - (hv + .25) * s, z + u * s + (hv + .25) * c, bottom, .8);
    }
  }
  function rock(x, z, r, top) {
    if (r < .7 && top > 3) {
      lathe(x, 0, z, [[0, 0], [r, 0], [r, .25], [r * .85, .35], [r * .85, top - .4], [r, top - .35], [r, top], [0, top]], p.trim);
      return;
    }
    const g = new THREE.SphereGeometry(1, 20, 12), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const yy = a.getY(i); a.setY(i, Math.max(-.86, Math.min(.79, yy))); }
    g.computeVertexNormals(); add(g, p.rock, x, top * .51, z, [r, top / 1.65, r], [0, x, 0], true, .12);
    bulb(x - r * .2, top * .88, z, r * .58, top * .06, r * .55, p.tips, false, x);
  }
  function vegetables(list) {
    for (const [x, z, y = 0] of list) {
      box(x, y + .025, z, 3.8, .05, 2.65, 0x9c765a, .02, 0, false);
      for (let row = 0; row < 3; row++) {
        box(x, y + .05, z - .8 + row * .8, 3.65, .075, .48, 0xaf8865, .03, 0, false);
        for (let k = 0; k < 6; k++) {
          const xx = x - 1.45 + k * .58, zz = z - .8 + row * .8;
          bulb(xx, y + .13, zz, .14, .15, .14, 0xd79154, false, 0, true);
          for (let j = 0; j < 3; j++) bulb(xx + Math.cos(j * 2.1) * .09, y + .36, zz + Math.sin(j * 2.1) * .09, .075, .25, .055, j === 1 ? p.tips : p.leaf, false, j, true);
        }
      }
      for (const sign of [-1, 1]) box(x, y + .12, z + sign * 1.35, 3.95, .2, .16, 0xc6a47a, .06);
      flowers(x - 2, z + .8, y, .7); flowers(x + 2, z - .8, y, .7, 0xe7c679);
    }
  }
  function fence(R, count, spread) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = Math.PI + (i / (count - 1) - .5) * spread, radius = islandRadius(R, Math.PI / 2 - a) - .6, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
      box(x, .46, z, .2, .92, .22, 0xc8ac81, .07); bulb(x, .96, z, .14, .1, .14, p.trim);
      pts.push([x, z]);
    }
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], angle = -Math.atan2(bz - az, bx - ax);
      for (const y of [.35, .72]) box((ax + bx) / 2, y, (az + bz) / 2, Math.hypot(bx - ax, bz - az), .12, .12, p.trim, .045, angle);
    }
  }
  function garden() {
    if (id === 'farm') {
      cottage(-6.5, -25);
      // Four composed garden corners; broad centre and station approaches open.
      for (const [x, z, s] of [[-20.5, -14, 1.25], [18.5, -18, 1.05], [-10, -23.5, 1.15], [10, -23, 1.3]]) { ledge(x, z, 3.1, -.08); tree(x, z, -.06, s); shrub(x - 1.1, z + 1, 0, 1.1, true); shrub(x + 1.3, z, 0, .9); }
      for (const [x, z] of [[-16, -18], [-18, -16], [-21, -10], [15, -19], [13, -21], [20, -13], [7, -22], [-15, 17], [17, 15]]) shrub(x, z, 0, 1.05, true);
      for (const [x, z] of [[-19, -7], [-20, -5], [-21, -2], [18, -15], [15, -18], [11, -19], [-6, -19], [-8, -18], [-17, 12], [-15, 15], [16, 13]]) { flowers(x, z, 0, 1.3); grass(x + .65, z + .25); }
      for (let k = 0; k < 10; k++) { flowers(-18 + k * .75, -2.1 - k * .22, 0, .9, k % 2 ? 0xe7c88e : p.bloom); grass(15 + k * .45, 3.7 - k * .1, 0, .75); }
    } else if (id === 'fort') {
      cottage(7, -26);
      for (const [x, z, s] of [[-20, -17, 1.05], [20, -16, 1.1], [-8, -24, .95], [9, -24, 1.1]]) { ledge(x, z, 3); tree(x, z, -.05, s); shrub(x, z + 1, 0, 1, true); }
      for (const [x, z] of [[-16, -18], [-18, -14], [16, -18], [18, -14], [-11, -20], [14, 15]]) shrub(x, z, 0, 1.2, true);
      for (const [x, z] of [[-16, -17], [-18, -15], [15, -16], [17, -14], [-20, 0], [-20, 3], [20, 10], [-10, 17]]) { flowers(x, z); grass(x + .55, z + .2); }
    } else {
      for (const [x, z, y, s] of [[-19, -4, -.05, .8], [19, -3.8, -.05, .9], [-4.8, -9.6, 2.3, .85], [4.7, -9.5, 2.3, .8]]) { ledge(x, z, 1.9, y); tree(x, z, y, s, true); shrub(x, z + .8, y, .65, true); }
      ledge(0, -10.9, 3.5, 2.34);
      // The pavilion shelf is an ornamental garden behind this low railing.
      // Its visible boundary follows the walkable coast and leaves the ferry
      // below it free to keep travelling along the original route.
      const rail = [];
      for (let k = 0; k < 13; k++) {
        const a = -Math.PI / 2 + (k / 12 - .5) * 1.5, r = islandRadius(7.5, a, 0, -3) - .13;
        const x = Math.cos(a) * r, z = -3 + Math.sin(a) * r;
        box(x, 2.8, z, .1, .8, .1, p.trim, .025); rail.push([x, 3.05, z]);
      }
      tube(rail, .05, p.trim);
      // Pavilion crowns the *rear* of the central island. Its span is beyond
      // the existing fall edge, leaving the flag, landing and station clear.
      arch(0, 2.4, -10.7, 5.4, 5.3, .35, p.trim);
      arch(0, 2.4, -11.3, 5.4, 5.3, .25, p.wall);
      tube([[-2.9, 7, -10.7], [-1.4, 8.15, -10.7], [0, 8.6, -10.7], [1.4, 8.15, -10.7], [2.9, 7, -10.7]], .22, p.roof);
      for (const sign of [-1, 1]) {
        lathe(sign * 2.7, 2.4, -10.7, [[.34, 0], [.34, .2], [.2, .3], [.2, 3.7], [.34, 3.8], [.34, 4]], p.trim);
        flowers(sign * 2.7, -10.55, 2.5, 1.15);
      }
      for (const [x, z, y] of [[-20, 0, 0], [-19, -1, 0], [20, .5, 0], [18.5, -1, 0], [-4, -8, 2.4], [4, -8, 2.4], [-4.5, 16, 0], [4.5, 15, 0]]) { flowers(x, z, y, .85); grass(x + .4, z, y, .8); }
    }
  }
  function finish() {
    const result = [];
    for (const [cast, geos] of pieces) {
      const n = geos.reduce((n, g) => n + g.attributes.position.count, 0), g = new THREE.BufferGeometry();
      for (const attr of ['position', 'normal', 'color']) {
        const a = new Float32Array(n * 3); let offset = 0;
        for (const source of geos) { a.set(source.attributes[attr].array, offset); offset += source.attributes[attr].array.length; }
        g.setAttribute(attr, new THREE.BufferAttribute(a, 3));
      }
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
      st.geos.push(g); st.mats.push(mat);
      const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true;
      m.userData.cameraProxied = true;
      m.name = `storybook-${id}-${cast ? 'sculpture' : 'planting'}`;
      parent.add(m); result.push(m); for (const source of geos) source.dispose();
    }
    pieces.clear(); return result;
  }
  return { add, box, bulb, lathe, tube, disk, arch, flowers, grass, tree, islandEdge, ledge, shrub, windmill, masonry, rock, vegetables, fence, garden, finish };
}

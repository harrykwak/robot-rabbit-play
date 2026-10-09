import * as THREE from 'three';

// A continuous valley surrounds the combat island in every direction. This is
// scenery only: the visible cliff edge, not a hidden fence, ends the safe floor.
export function createLandscape(scene) {
  const group = new THREE.Group(); group.name = 'distant-valley';
  const materials = [];
  for (let layer = 0; layer < 3; layer++) {
    const vertices = [], colors = [], indices = [], steps = 192;
    const color = new THREE.Color();
    for (let row = 0; row < 3; row++) for (let i = 0; i <= steps; i++) {
      const a = i / steps * Math.PI * 2;
      const wave = Math.sin(a * 7 + layer) * 11 + Math.sin(a * 13 - layer) * 5 + Math.cos(a * 3) * 15;
      const radius = [54 + layer * 65, 108 + layer * 84, 215 + layer * 85][row];
      const y = row === 1 ? 1 + layer * 6 + wave : -58;
      vertices.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      color.setHSL(.29 + layer * .04, .18 - layer * .025, .43 + layer * .09 + (row === 1 ? .08 : 0));
      colors.push(color.r, color.g, color.b);
      if (row < 2 && i < steps) { const n = row * (steps + 1) + i; indices.push(n, n + steps + 1, n + 1, n + 1, n + steps + 1, n + steps + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
    materials.push(material); const ridge = new THREE.Mesh(geometry, material); ridge.matrixAutoUpdate = false; group.add(ridge);
  }
  const floorMaterial = new THREE.MeshBasicMaterial({color:0x8bafaa}); materials.push(floorMaterial);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(550,96),floorMaterial);
  floor.position.y=-58; floor.rotation.x=-Math.PI/2; floor.updateMatrix(); floor.matrixAutoUpdate=false; group.add(floor);
  scene.add(group);
  return { group, setStage(id) { for(const m of materials) m.color.set(id === 'sky' ? 0xd9d5ee : id === 'fort' ? 0xf0ddbf : 0xffffff); } };
}

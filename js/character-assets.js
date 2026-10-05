// Authored prototypes keep the existing synchronous combat-rig API.
// Templates own geometry/textures; each spawned rig owns its cloned materials.
import * as THREE from 'three';
import { attachRobotCombat } from './robot-combat.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { attachRobotPresentation } from './robot-presentation.js';
import { attachCostumeMotion } from './costume-motion.js';

const JOINTS = ['hips', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR',
  'handL', 'handR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'earL', 'earR'];
const ROBOT_NODES = ['fistL', 'fistR', 'cockpit', 'viewpoint', 'chestCore',
  'eyeL', 'eyeR', 'thrusterL', 'thrusterR'];
const DEFINITIONS = {
  rabbit: { file: 'rabbit-pilot.glb', root: 'rr_rabbit_pilot', height: 1.9, radius: .45 },
  titan: { file: 'titan-plush.glb', root: 'rr_titan', height: 5.5, radius: 1.45 },
  bolt: { file: 'bolt-plush.glb', root: 'rr_titan', height: 5.5, radius: 1.25 },
  cannon: { file: 'cannon-plush.glb', root: 'rr_titan', height: 5.5, radius: 1.45 },
  hammer: { file: 'hammer-plush.glb', root: 'rr_titan', height: 5.5, radius: 1.55 },
};
const directory = new URL('../assets/characters/', import.meta.url);
const templates = new Map();
const status = Object.fromEntries([...Object.keys(DEFINITIONS), 'blink'].map(key => [key, { state: 'idle' }]));
let pendingLoad, blinkTexture = null;

export function characterAssetStatus() {
  return Object.fromEntries(Object.entries(status).map(([key, value]) => [key, { ...value }]));
}

async function timedLoad(load, manager, timeoutMs) {
  let timer;
  try {
    return await Promise.race([load(), new Promise((resolve, reject) => {
      timer = setTimeout(() => { manager.abort(); reject(new Error('Asset load timed out')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function loadEmbeddedGlb(url, manager) {
  // These GLBs contain their images. Consume the download completely before
  // parsing, avoiding an extra progress stream around a binary response.
  const response = await fetch(url, { signal: manager.abortController.signal });
  if (!response.ok) throw new Error(`Character asset HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  return new GLTFLoader(manager).parseAsync(bytes, new URL('.', url).href);
}

/** Call once before creating menu or game models. A failed asset stays explicit. */
export function preloadCharacterAssets({ timeoutMs = 15000 } = {}) {
  if (pendingLoad) return pendingLoad;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid character asset timeout');
  pendingLoad = (async () => {
    await Promise.all(Object.entries(DEFINITIONS).map(async ([kind, definition]) => {
      const url = new URL(definition.file, directory).href;
      const manager = new THREE.LoadingManager();
      status[kind] = { state: 'loading', url };
      try {
        const gltf = await timedLoad(() => loadEmbeddedGlb(url, manager), manager, timeoutMs);
        validateTemplate(gltf.scene, kind);
        templates.set(kind, gltf.scene);
        status[kind] = { state: 'ready', url };
      } catch (error) {
        status[kind] = { state: 'failed', url, error: error.message };
        console.error(`[character-assets] ${kind} could not load; using the existing model.`, error);
      }
    }).concat((async () => {
      const url = new URL('pilot-face-blink.png', directory).href;
      const manager = new THREE.LoadingManager();
      status.blink = { state: 'loading', url };
      try {
        blinkTexture = await timedLoad(() => new THREE.TextureLoader(manager).loadAsync(url), manager, timeoutMs);
        blinkTexture.flipY = false;
        blinkTexture.colorSpace = THREE.SRGBColorSpace;
        status.blink = { state: 'ready', url };
      } catch (error) {
        status.blink = { state: 'failed', url, error: error.message };
        console.error('[character-assets] Pilot blink texture could not load; keeping the open-eye texture.', error);
      }
    })()));
    return characterAssetStatus();
  })();
  return pendingLoad;
}

function namedNodes(scene, kind) {
  const definition = DEFINITIONS[kind];
  if (!definition) throw new Error(`Unknown character asset: ${kind}`);
  const required = [definition.root, ...JOINTS, ...(kind !== 'rabbit' ? ROBOT_NODES : [])];
  const names = new Set([...required, ...(kind !== 'rabbit' ? ['bellyCover'] : [])]), nodes = new Map();
  scene.traverse(node => {
    if (!names.has(node.name)) return;
    if (nodes.has(node.name)) throw new Error(`Duplicate ${kind} rig node: ${node.name}`);
    nodes.set(node.name, node);
  });
  for (const name of required) if (!nodes.has(name)) throw new Error(`Missing ${kind} rig node: ${name}`);
  return nodes;
}

function firstMesh(node) {
  let mesh;
  node.traverse(child => { if (!mesh && child.isMesh) mesh = child; });
  return mesh;
}

function validateTemplate(scene, kind) {
  if (!scene?.isObject3D) throw new Error(`Invalid ${kind} scene`);
  const nodes = namedNodes(scene, kind);
  // applyRig writes absolute joint rotations. Rest rotations must be baked into
  // the child meshes, not into the named animation pivots.
  for (const name of JOINTS) {
    const joint = nodes.get(name);
    if (Math.abs(joint.quaternion.w) < 1 - 1e-6 || joint.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-6) {
      throw new Error(`Bake the rest rotation/scale of ${kind}.${name} before export`);
    }
  }
  if (kind !== 'rabbit') for (const name of ['eyeL', 'eyeR', 'chestCore']) {
    const mesh = firstMesh(nodes.get(name));
    if (!mesh?.material?.emissive || Array.isArray(mesh.material)) throw new Error(`${kind}.${name} needs one emissive mesh material`);
  }
  if (kind !== 'rabbit') scene.traverse(node => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material.name === 'rabbit-fringe-mask') {
      if (!(material.alphaTest > 0 && material.alphaTest <= 1) || material.transparent || !material.depthWrite) {
        throw new Error('titan.rabbit-fringe-mask needs MASK alphaTest with depth writing');
      }
    }
  });
  return nodes;
}

/** Also used by the authoring preview: a template is never attached or mutated. */
export function cloneCharacterRig(template, kind, { blink = null } = {}) {
  validateTemplate(template, kind);
  const definition = DEFINITIONS[kind], root = cloneSkeleton(template);
  const nodes = namedNodes(root, kind), materials = new Map(), meshes = [], skeletons = new Set();
  function ownMaterial(source) {
    if (!materials.has(source)) {
      const material = source.clone();
      // Coverage produced sparkling white fringe in the actual MSAA Edge view.
      // Keep plain MASK cutoff/depth writing on owned materials only.
      if (kind === 'titan' && material.name === 'rabbit-fringe-mask') material.alphaToCoverage = false;
      materials.set(source, material);
    }
    return materials.get(source);
  }
  root.traverse(node => {
    if (!node.isMesh) return;
    node.material = Array.isArray(node.material) ? node.material.map(ownMaterial) : ownMaterial(node.material);
    node.castShadow = !node.userData.rrPlushCoat;
    node.receiveShadow = true;
    meshes.push(node);
    if (node.isSkinnedMesh) {
      skeletons.add(node.skeleton);
      // Continuous rabbit limbs and neck bend beyond their rest bounds. Keep
      // them visible at screen edges without recalculating bounds every frame.
      node.frustumCulled = false;
    }
  });
  const ownedMaterials = new Set(materials.values());
  if (kind !== 'rabbit') for (const name of ['eyeL', 'eyeR', 'chestCore']) {
    // Blender may use one glow material for all three parts. Runtime eye/core
    // intensity is independent, so each dynamic mesh needs its own instance.
    const mesh = firstMesh(nodes.get(name));
    mesh.material = mesh.material.clone();
    ownedMaterials.add(mesh.material);
  }
  const rig = { root, meshes, height: definition.height, radius: definition.radius,
    design: 'authored-rabbit-prototype', asset: kind, low: false };
  for (const name of JOINTS) rig[name] = nodes.get(name);
  const flashMaterials = [...ownedMaterials].filter(material => material.emissive);
  const restEmissive = flashMaterials.map(material => material.emissive.clone());
  const flashColor = new THREE.Color(1, .95, .85);
  rig.setFlash = value => {
    const strength = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
    flashMaterials.forEach((material, i) => material.emissive.copy(restEmissive[i]).lerp(flashColor, strength));
  };
  // These prototypes use the same budgeted geometry in both modes. In
  // particular, a quality change must not unhide damaged parts or a cockpit mask.
  rig.setLow = low => { rig.low = !!low; };
  root.userData.rrModel = { setLow: rig.setLow };
  root.userData.rrCharacterAsset = kind;
  rig.setQuality = low => root.traverse(node => node.userData.rrModel?.setLow(low));
  let disposed = false;
  rig.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const material of ownedMaterials) material.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    // Geometry and textures belong to the retained asset templates.
  };

  if (kind !== 'rabbit') {
    for (const name of ROBOT_NODES) rig[name] = nodes.get(name);
    rig.type = kind;
    rig.eyes = ['eyeL', 'eyeR'].map(name => firstMesh(nodes.get(name)));
    rig.chestCore = firstMesh(nodes.get('chestCore'));
    rig.thrusters = [rig.thrusterL, rig.thrusterR];
    rig.laserOrigin = root.getObjectByName('laserOrigin') || null;
    rig.muzzles = [];
    if (rig.laserOrigin) rig.muzzles.push(rig.laserOrigin);
    root.traverse(node => { if (/^muzzle-[LR][0-2]$/.test(node.name)) rig.muzzles.push(node); });
    rig.weapon = root.getObjectByName('weapon') || null;
    root.traverse(node => { if (/^heel-thruster-/.test(node.name)) rig.thrusters.push(node); });
    for (const side of ['L', 'R']) rig['wrist' + side] = root.getObjectByName('wrist' + side) || null;
    if (rig.wristL && rig.wristR) attachRobotPresentation(rig, kind);
    attachRobotCombat(rig, kind);
    rig.eyeIntensity = .08;
    rig.coreIntensity = .24;
    // Optional on the furry Titan. Authored cockpit children are decoration;
    // only a runtime attachment (the boarded pilot root) opens the cover.
    rig.bellyCover = nodes.get('bellyCover') || null;
    const cockpitChildren = new Set(rig.cockpit.children);
    let lastFaceTime = null;
    attachCostumeMotion(rig);
    if (rig.bellyCover) rig.bellyCover.rotation.x = 0;
    root.updateMatrixWorld(true);
    const view = root.worldToLocal(rig.viewpoint.getWorldPosition(new THREE.Vector3()));
    rig.eyeHeight = view.y;
    rig.eyeForward = Math.max(0, view.z);
    const eyeScale = rig.eyes.map(eye => eye.scale.y);
    rig.animateFace = time => {
      if (!Number.isFinite(time)) return;
      rig.animateCostume?.(time);
      const dt = lastFaceTime === null ? 0 : THREE.MathUtils.clamp(time - lastFaceTime, 0, .1);
      lastFaceTime = time;
      const t = ((time % 4.7) + 4.7) % 4.7;
      const blinkAmount = t < .18 ? Math.sin(t / .18 * Math.PI) ** 2 : 0;
      rig.eyes.forEach((eye, i) => { eye.scale.y = eyeScale[i] * (1 - blinkAmount * .94); });
      if (rig.bellyCover) {
        const occupied = rig.cockpit.children.some(child => !cockpitChildren.has(child));
        const target = occupied ? 1.30 : 0;
        const angle = THREE.MathUtils.lerp(rig.bellyCover.rotation.x, target, 1 - Math.exp(-dt * 10));
        rig.bellyCover.rotation.x = Math.abs(target - angle) < 1e-4 ? target : angle;
      }
    };
    rig.makeFist = () => {
      const projectile = new THREE.Group();
      const fist = cloneSkeleton(rig.fistR);
      fist.visible = true;
      // Preserve authored offsets under an independent projectile transform.
      projectile.add(fist);
      projectile.scale.copy(rig.fistR.getWorldScale(new THREE.Vector3()));
      return projectile;
    };
  } else {
    const faces = [...ownedMaterials].filter(material => material.name === 'face-paint' && material.map);
    const openMaps = faces.map(material => material.map);
    rig.animateFace = time => {
      if (!blink || !Number.isFinite(time)) return;
      const closed = ((time % 4.1) + 4.1) % 4.1 < .13;
      faces.forEach((material, i) => { material.map = closed ? blink : openMaps[i]; });
    };
  }
  return rig;
}

/** Synchronous; null tells models.js to use its existing procedural model. */
export function createCharacterAssetRig(kind) {
  const template = templates.get(kind);
  return template ? cloneCharacterRig(template, kind, { blink: blinkTexture }) : null;
}

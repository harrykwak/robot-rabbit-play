import * as THREE from 'three';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (lo, hi, n) => { const t = clamp((n - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const identity = new THREE.Quaternion();
const PALM = new THREE.Vector3(-.27, 0, 0);
const HAMMER_ACTIONS = new Set(['hs1', 'hs2']);

// Optional authored chains/sockets. The same pose-only function runs on the
// authoritative fighter and replicas; no clock or network fields are involved.
export function attachRobotCombat(rig, type) {
  if (rig.presentCombat) return rig.presentCombat;
  const find = name => rig.root.getObjectByName(name);
  const ears = ['L', 'R'].map(side => [0, 1, 2].map(i => find(`combat-ear-${side}-${i}`)));
  const earRest = ears.map(chain => chain.map(bone => bone?.quaternion.clone()));
  const earPivots = ['L', 'R'].map(side => find(`ear${side}`));
  const earTips = ['L', 'R'].map(side => find(`earStrike${side}`));
  const earDirection = new THREE.Vector3(), earTarget = new THREE.Vector3(), earSweep = new THREE.Vector3(), earTurn = new THREE.Euler();
  const grip = find('hammerGripSupport');
  const weapon = find('weapon'), weaponRest = weapon?.quaternion.clone();
  const supportAxis = weapon && grip ? weapon.worldToLocal(grip.getWorldPosition(new THREE.Vector3())).normalize() : null;
  const hammerDown = [new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, .8, -.8)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, -.8, .8))];
  const hammerCarry = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, .8, -1.0));
  const hammerUp = [new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.8, -1.3, -1.4)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, -.8, .8))];
  const delta = new THREE.Quaternion(), target = new THREE.Vector3(), end = new THREE.Vector3();
  const from = new THREE.Vector3(), toward = new THREE.Vector3(), inverse = new THREE.Matrix4();
  let hadGrip = false;
  function palmPosition(out) { rig.handL.updateWorldMatrix(true, false); return out.copy(PALM).applyMatrix4(rig.handL.matrixWorld); }
  const present = (pose, action, broken = 0) => {
    if (!pose || !Number.isFinite(pose.ex)) return;
    if (type === 'cannon') for (let side = 0; side < 2; side++) {
      if (ears[side].some(bone => !bone) || !earPivots[side] || !earTips[side]) continue;
      const attacking = action === 'blaster' && !(broken & 4);
      const amount = attacking ? smooth(0, .30, Math.abs(pose.ex)) : 0;
      const phase = smooth(-.45, 1.45, pose.ex);
      const follow = attacking ? smooth(.75, 1.45, pose.ex) : 0;
      const pivot = earPivots[side]; pivot.quaternion.identity();
      ears[side].forEach((bone, i) => {
        // Both ears stay curved. Only the left sweeps; the right curls in front
        // of the cheek as a guard, and has no primary attack contact volume.
        const curl = side ? [.20, .55, .65][i] : [.12, .36, .45][i] * (1 - amount * .65)
          + (attacking ? 1.4 * smooth(.60, 1.10, pose.ex) * [0, .5, 1][i] : 0);
        earTurn.set(curl, 0, (side ? -1 : 1) * [.04, .08, .12][i]);
        delta.setFromEuler(earTurn);
        bone.quaternion.copy(earRest[side][i]).multiply(delta);
      });
      pivot.updateWorldMatrix(true, true);
      earDirection.copy(earTips[side].getWorldPosition(end)); pivot.worldToLocal(earDirection).normalize();
      if (side) earTarget.set(-.65, .55, .15).normalize().lerp(earSweep.set(-.55, .4, .45).normalize(), amount).normalize();
      else {
        const yaw = 1.10 - phase * 1.50;
        earTarget.set(.55, .65, .25).normalize().lerp(earSweep.set(Math.sin(yaw), .10 - .55 * follow, Math.cos(yaw)).normalize(), amount).normalize();
      }
      pivot.quaternion.setFromUnitVectors(earDirection, earTarget);
      if (!side && attacking) {
        // Lead the root section forward above the forehead before curling the
        // two distal sections downward. A single tip-alignment rotation cannot
        // control the path of this wide ear between its base and tip.
        const yaw = 1.10 - phase * 1.50;
        ears[side].forEach((bone, i) => {
          earTarget.set(Math.sin(yaw), [.65, .05, -.08][i], Math.cos(yaw)).normalize();
          earSweep.set(...[[-.25, .22, .95], [-.15, -1, .16], [0, -1, .05]][i]).normalize();
          earTarget.lerp(earSweep, follow).normalize().transformDirection(rig.root.matrixWorld);
          bone.parent.updateWorldMatrix(true, false);
          toward.copy(bone.getWorldPosition(end)).add(earTarget);
          bone.parent.worldToLocal(toward).sub(bone.position).normalize();
          earDirection.set(0, 1, 0).applyQuaternion(bone.quaternion).normalize();
          delta.setFromUnitVectors(earDirection, toward).slerp(identity, 1 - amount);
          bone.quaternion.premultiply(delta).normalize();
        });
      }
    }
    if (type !== 'hammer' || !grip || !rig.armL || !rig.foreL || !rig.handL) return;
    if (weaponRest) weapon.quaternion.copy(weaponRest);
    rig.armR.rotation.set(pose.arx, pose.ary, pose.arz);
    rig.foreR.rotation.x = clamp(pose.frx, -1.25, .35);
    // Reset our own adjustment before each solve, including cancellation. Damage
    // offsets are removed/reapplied by the caller around this deterministic pass.
    if (hadGrip || HAMMER_ACTIONS.has(action) || action === null || action === undefined) {
      rig.armL.rotation.set(pose.alx, pose.aly, pose.alz);
      rig.foreL.rotation.set(clamp(pose.flx, -1.25, .35), 0, 0);
    }
    hadGrip = false; rig.combatGripError = null;
    // Also hold with two hands in guard/idle. A broken arm is free to dangle.
    if ((action && !HAMMER_ACTIONS.has(action)) || (broken & 3)) return;
    // Slerp a front-of-body arc instead of interpolating Euler angles through
    // the chest. Long separated grips allow the original short arm lengths.
    const raised = action ? smooth(1.1, 2.8, -pose.arx) : 0;
    // The right hand anchors the shaft while the left lifts the mallet. Tilt
    // the resting carry slightly upward, but retain the full low downstroke.
    const carrying = action ? 1 - smooth(.1, .4, pose.tx) : 1;
    rig.armL.quaternion.copy(hammerDown[0]).slerp(hammerCarry, carrying).slerp(hammerUp[0], raised);
    rig.armR.quaternion.copy(hammerDown[1]).slerp(hammerUp[1], raised);
    rig.foreR.rotation.set(-.15, 0, 0); rig.foreL.rotation.set(-.15, 0, 0);
    if (supportAxis) {
      weapon.parent.updateWorldMatrix(true, false);
      toward.copy(palmPosition(end));
      // Aim along the front palm surface, not the uncorrected hand center
      // behind it. This keeps the long shaft outside the torso during the arc.
      rig.torso.worldToLocal(toward); toward.z = Math.max(toward.z, .78); rig.torso.localToWorld(toward);
      weapon.parent.worldToLocal(toward).sub(weapon.position).normalize();
      weapon.quaternion.setFromUnitVectors(supportAxis, toward);
    }
    grip.getWorldPosition(target);
    const armStart = rig.armL.quaternion.clone();
    for (let iteration = 0; iteration < 14; iteration++) {
      if (palmPosition(end).distanceToSquared(target) < 1e-6) break;
      for (const joint of [rig.foreL, rig.armL]) {
        joint.parent.updateWorldMatrix(true, false); inverse.copy(joint.parent.matrixWorld).invert();
        from.copy(palmPosition(end)).applyMatrix4(inverse).sub(joint.position);
        toward.copy(target).applyMatrix4(inverse).sub(joint.position);
        if (from.lengthSq() < 1e-10 || toward.lengthSq() < 1e-10) continue;
        delta.setFromUnitVectors(from.normalize(), toward.normalize());
        const angle = identity.angleTo(delta);
        if (angle > .35) delta.slerp(identity, 1 - .35 / angle);
        joint.quaternion.premultiply(delta).normalize();
        const start = joint === rig.armL ? armStart : identity, limit = joint === rig.armL ? 1.4 : 1.35;
        const total = start.angleTo(joint.quaternion);
        if (total > limit) joint.quaternion.copy(start.clone().slerp(joint.quaternion, limit / total));
      }
    }
    hadGrip = true; rig.combatGripError = palmPosition(end).distanceTo(target);
  };
  rig.presentCombat = present;
  return present;
}

function visible(node) {
  for (let current = node; current; current = current.parent) if (!current.visible) return false;
  return true; // First-person layer masking never changes combat availability.
}
function point(node, offset = [0, 0, 0]) {
  node.updateWorldMatrix(true, false);
  return new THREE.Vector3(...offset).applyMatrix4(node.matrixWorld);
}
// Contact names come only from the local action table, never from peer inputs.
// Old assets retain bounded limb-origin fallbacks, not the former distant box.
export function robotContactSegments(rig, contact) {
  const find = name => rig[name] || rig.root.getObjectByName(name);
  const make = (node, radius, a, b = a) => node && visible(node) ? [{ a: point(node, a), b: point(node, b), radius }] : [];
  if (/^fist[LR]$/.test(contact)) return make(find(contact) || find(contact.replace('fist', 'hand')), .62);
  if (/^foot[LR]$/.test(contact)) return make(find(contact), .48, [0, -.03, .08], [0, -.03, .48]);
  if (contact === 'ears') return ['L', 'R'].flatMap(side => make(find(`earStrike${side}`) || find(`ear${side}`), .56));
  if (/^ear[LR]$/.test(contact)) return make(find(`earStrike${contact.at(-1)}`) || find(contact), .56);
  if (contact === 'hammer') {
    const authored = find('hammerStrike');
    if (authored) return make(authored, .50, [-1.02, 0, 0], [1.02, 0, 0]);
    const weapon = find('weapon');
    if (weapon) return make(weapon, .70, [0, -.8, 0]);
    return make(find('fistR') || find('handR'), .62);
  }
  return [];
}

// Clip the swept span to the active part of this simulation tick. A long frame
// cannot skip a short hit window, or include the whole windup/recovery path.
export function sweptRobotContacts(before, after, fromTime, toTime, hit) {
  if (!(toTime > fromTime) || toTime < hit.t0 || fromTime > hit.t1 || before.length !== after.length) return [];
  const low = clamp((hit.t0 - fromTime) / (toTime - fromTime), 0, 1);
  const high = clamp((hit.t1 - fromTime) / (toTime - fromTime), 0, 1);
  const result = [];
  after.forEach((end, i) => {
    const start = before[i], radius = end.radius;
    const a = start.a.clone().lerp(end.a, low), b = start.b.clone().lerp(end.b, low);
    const c = start.a.clone().lerp(end.a, high), d = start.b.clone().lerp(end.b, high);
    result.push({ a, b, radius }, { a: c, b: d, radius }, { a, b: c, radius }, { a: b, b: d, radius },
      { a: a.clone().add(b).multiplyScalar(.5), b: c.clone().add(d).multiplyScalar(.5), radius });
  });
  return result;
}

// Closest points of two finite segments (including point-like fists).
export function contactAgainstTarget(segments, target) {
  const r = Math.min(target.radius, target.height / 2);
  const start = new THREE.Vector3(target.pos.x, target.pos.y + r, target.pos.z);
  const finish = new THREE.Vector3(target.pos.x, target.pos.y + target.height - r, target.pos.z);
  for (const segment of segments) {
    const d1 = segment.b.clone().sub(segment.a), d2 = finish.clone().sub(start), diff = segment.a.clone().sub(start);
    const a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(diff); let s = 0, t = 0;
    if (a <= 1e-12) t = e > 1e-12 ? clamp(f / e, 0, 1) : 0;
    else {
      const c = d1.dot(diff);
      if (e <= 1e-12) s = clamp(-c / a, 0, 1);
      else {
        const b = d1.dot(d2), denominator = a * e - b * b;
        if (denominator > 1e-12) s = clamp((b * f - c * e) / denominator, 0, 1);
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    const onStrike = segment.a.clone().addScaledVector(d1, s), onTarget = start.clone().addScaledVector(d2, t);
    if (onStrike.distanceToSquared(onTarget) <= (segment.radius + target.radius) ** 2) return onStrike.add(onTarget).multiplyScalar(.5);
  }
  return null;
}

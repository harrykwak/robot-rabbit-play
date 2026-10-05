// Cosmetic lengths derived from already-replicated action and pose values.
// No clock, damage, hit-volume, input authority or protocol fields are added.
const smooth = (lo, hi, value) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
// Existing roles share controls, but show their weight through their gait.
export const ROBOT_GAITS = Object.freeze({
  titan: Object.freeze({cadence: 1, stride: .62, swing: .45, lean: .18, sway: .09}),
  bolt: Object.freeze({cadence: 1.23, stride: .80, swing: .65, lean: .28, sway: .07}),
  cannon: Object.freeze({cadence: .93, stride: .54, swing: .25, lean: .12, sway: .05}),
  hammer: Object.freeze({cadence: .79, stride: .58, swing: .38, lean: .14, sway: .13}),
});
// Grounded ready poses blend out as locomotion starts. The host serializes the
// resulting ordinary pose, so replicas need no idle timer or extra state.
export const ROBOT_READY_POSES = Object.freeze({
  titan: Object.freeze({ alx: -1.1, arx: -1.1, flx: -1.18, frx: -1.18, alz: -.18, arz: .18, ty: -.1 }),
  bolt: Object.freeze({ alx: -.85, arx: -.85, flx: -1.18, frx: -1.18, alz: -.08, arz: .08,
    llx: -.1, slx: .25, lrx: -.65, srx: .9, ty: -.08, tx: .12 }),
  hammer: Object.freeze({ alx: -1.1, arx: -1.1, flx: -.15, frx: -.15, alz: -1.5, arz: 1.5, ty: -.65 }),
});
export function applyRobotReadyPose(type, pose, movement = 0) {
  const ready = ROBOT_READY_POSES[type];
  if (!ready || !Number.isFinite(movement)) return pose;
  const weight = 1 - smooth(.02, .35, movement);
  for (const [key, value] of Object.entries(ready)) pose[key] += (value - pose[key]) * weight;
  return pose;
}
export function robotArmLengths(type, pose, action, broken = 0) {
  const lengths = [1, 1];
  if (type !== 'titan' || !pose || !['tp1', 'tp2'].includes(action)) return lengths;
  const left = action === 'tp1', arm = left ? pose.alx : pose.arx, fore = left ? pose.flx : pose.frx;
  if (!Number.isFinite(arm) || !Number.isFinite(fore) || (broken & (left ? 1 : 2))) return lengths;
  // Limit stretch to the straight-punch silhouette. Returning to a bent arm,
  // cancelling the action, damage, rocket fire and all other roles reset to 1.
  const amount = smooth(.95, 1.50, -arm) * (1 - smooth(.08, .60, Math.abs(fore)));
  lengths[left ? 0 : 1] = 1 + 2 * amount;
  return lengths;
}

export function attachRobotPresentation(rig, type) {
  const sides = ['L', 'R'];
  const rest = sides.map(side => ({fore: rig['fore' + side].scale.y, wrist: rig['wrist' + side]?.scale.y}));
  // The old long-limb guard folds an elbow nearly 120 degrees. Short, broad
  // plush limbs need a shallower bend to retain their rounded joint volume.
  // Both host and replica apply this from the same original pose values.
  rig.adjustPose = pose => {
    rig.foreL.rotation.x = Math.max(-1.25, Math.min(.35, pose.flx));
    rig.foreR.rotation.x = Math.max(-1.25, Math.min(.35, pose.frx));
    rig.shinL.rotation.x = Math.max(-.15, Math.min(1.30, pose.slx));
    rig.shinR.rotation.x = Math.max(-.15, Math.min(1.30, pose.srx));
  };
  rig.presentMotion = (pose, action, broken = 0) => {
    const lengths = robotArmLengths(type, pose, action, broken);
    sides.forEach((side, i) => {
      const wrist = rig['wrist' + side];
      if (!wrist) return;
      rig['fore' + side].scale.y = rest[i].fore * lengths[i];
      wrist.scale.y = rest[i].wrist / lengths[i];
    });
  };
}

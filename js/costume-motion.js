import { Quaternion, Vector3 } from 'three';

const SCARF_BONES = ['costume-bolt-scarf-0', 'costume-bolt-scarf-1', 'costume-bolt-scarf-2'];
const LIMITS = [.10, .16, .20];
const AXIS = new Vector3(1, 0, 0);
const noMotion = () => {};

// Presentation only: no frame delta, gameplay state, input or network fields.
// Repeated attachment captures the original rest pose only once per rig.
export function attachCostumeMotion(rig) {
  if (!rig || typeof rig !== 'object') return noMotion;
  if (typeof rig.animateCostume === 'function') return rig.animateCostume;
  const bones = SCARF_BONES.map(name => rig.root?.getObjectByName?.(name));
  if (bones.some(bone => !bone?.isBone)) {
    rig.animateCostume = noMotion;
    return noMotion;
  }
  const rest = bones.map(bone => bone.quaternion.clone()), additive = new Quaternion();
  const animate = time => {
    if (!Number.isFinite(time)) return;
    // A shared 20-second period also bounds trigonometry for very large times.
    const phase = (((time % 20) + 20) % 20) * Math.PI / 10;
    bones.forEach((bone, i) => {
      const angle = LIMITS[i] * (.7 * Math.sin(phase * 5 - i * .7) + .3 * Math.sin(phase * 9 - i * 1.1));
      additive.setFromAxisAngle(AXIS, angle);
      bone.quaternion.copy(rest[i]).multiply(additive);
    });
  };
  rig.animateCostume = animate;
  return animate;
}

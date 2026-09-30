// Perspective framing uses visual bounds (including ears), not collision height.
// This module has no DOM or Three dependency; viewport sizes are CSS pixels.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const CAMERA_PITCH = 0.72;
const sin = Math.sin(CAMERA_PITCH), cos = Math.cos(CAMERA_PITCH);
const SIDES = [-1, 1];

export function cameraViewport(width, height, touch = false, viewOffsetY = 0, fov = 50) {
  const portrait = height > width;
  // Portrait HUD stacks player, timer, then opponents through y=140.
  const top = touch ? (portrait ? 146 : 62) : 86;
  const bottom = height - (touch ? Math.min(portrait ? 184 : 92, height * 0.27) : 48);
  return { width, height, aspect: width / height, tan: Math.tan(fov * Math.PI / 360),
    top, bottom, center: 1 - (top + bottom) / height,
    halfY: (bottom - top) / height, halfX: 0.86, offset: 2 * viewOffsetY / height };
}

// Bounds deliberately exclude shadows, floor markers and attack effects.
export function cameraSubject(entity, out = {}) {
  const robot = entity.kind === 'robot';
  out.x = entity.pos.x; out.y = entity.pos.y; out.z = entity.pos.z;
  out.height = robot ? (entity.type === 'bolt' ? 8.1 : 7.6) : 2.3;
  out.radius = robot ? (entity.type === 'hammer' ? 3.6 : 2.15) : 0.7;
  return out;
}

// Solve each corner against the actual perspective frustum. The camera's
// fixed pitch and portrait projection shift are both included in the solve.
export function fitSubject(view, center, subject) {
  const lift = view.center - view.offset;
  let distance = 0;
  for (const x of SIDES) {
    for (let y = 0; y < 2; y++) {
      for (const z of SIDES) {
        const dx = subject.x + x * subject.radius - center.x;
        const dy = subject.y + (y ? subject.height : -0.25) - center.y;
        const dz = subject.z + z * subject.radius - center.z;
        const depth = dy * sin + dz * cos;
        const up = dy * cos - dz * sin + lift * view.tan * depth;
        distance = Math.max(distance, depth + Math.abs(dx) / (view.tan * view.aspect * view.halfX),
          depth + Math.abs(up) / (view.tan * view.halfY));
      }
    }
  }
  return distance;
}

export function frameCombat(view, player, nearby = [], lead = { x: 0, z: 0 }, arenaRadius = 28, out = {}) {
  const mounted = player.height > 4;
  const playerWeight = mounted ? 6 : 2;
  const playerCenterY = player.y + player.height * 0.5;
  let x = player.x * playerWeight, y = playerCenterY * playerWeight, z = player.z * playerWeight, weight = playerWeight;
  for (const e of nearby) {
    // Influence tapers to zero at the selection boundary, avoiding zoom pumps.
    const w = 2 * threatWeight(player, e);
    x += e.x * w; y += (e.y + e.height * 0.5) * w; z += e.z * w; weight += w;
  }
  x = x / weight + lead.x; z = z / weight + lead.z;
  // Only a small inward bias at the rim: never pin the camera to the island
  // while the player is jumping, crossing platforms or being knocked away.
  const r = Math.hypot(x, z), rim = Math.max(1, arenaRadius - 3);
  if (r > rim) { const inward = Math.min(1.5, r - rim); x -= x / r * inward; z -= z / r * inward; }
  out.x = x; out.y = y / weight; out.z = z;
  if (mounted) {
    // Large robots need most of a short landscape screen. Keep their center
    // close to the pilot rather than widening to cover the whole robot crowd.
    out.x = clamp(out.x, player.x - 0.6, player.x + 0.6);
    out.y = clamp(out.y, playerCenterY - 0.4, playerCenterY + 0.4);
    out.z = clamp(out.z, player.z - 0.6, player.z + 0.6);
  }
  const pixels = view.width < 1000 ? 82 : 98;
  const base = view.height * cos * 2.2 / (2 * view.tan * pixels) + 0.75;
  const essential = fitSubject(view, out, player);
  let context = Math.max(base, essential);
  for (const e of nearby) {
    const relevance = threatWeight(player, e);
    context = Math.max(context, base + (fitSubject(view, out, e) - base) * relevance);
  }
  // Farther opponents can leave the frame; the local fighter never does.
  const solo = mounted ? fitSubject(view, { x: player.x, y: playerCenterY, z: player.z }, player) : essential;
  const contextLimit = Math.max(base, solo) * (mounted ? 1.08 : 1.65);
  out.distance = Math.max(essential, Math.min(context, contextLimit));
  return out;
}

function threatWeight(player, enemy) {
  return clamp((12 - Math.hypot(enemy.x - player.x, enemy.z - player.z)) / 4, 0, 1)
    * clamp((12 - Math.abs(enemy.y - player.y)) / 6, 0, 1);
}

export function cameraAim(view, center, distance, out = {}) {
  const shift = (view.offset - view.center) * view.tan * distance;
  out.x = center.x; out.y = center.y + cos * shift; out.z = center.z - sin * shift;
  return out;
}

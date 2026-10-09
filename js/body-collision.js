// Deterministic cylinder contacts shared by all actors. Resolve a small crowd
// iteratively; a spawn at exactly the same point still has a stable normal.
export function separateBodies(actors, constrain, iterations = 8) {
  for (let pass = 0; pass < iterations; pass++) {
    let deepest = 0;
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i], b = actors[j];
      if (a.pos.y + a.height <= b.pos.y + .12 || b.pos.y + b.height <= a.pos.y + .12) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      const reach = a.radius + b.radius + .06, penetration = reach - d;
      if (penetration <= .0001) continue;
      const angle = ((i * 7 + j * 13) % 16) * Math.PI / 8;
      const nx = d > .00001 ? dx / d : Math.cos(angle), nz = d > .00001 ? dz / d : Math.sin(angle);
      const wa = a.kind === b.kind ? .5 : a.kind === 'robot' ? .12 : .88;
      a.pos.x -= nx * penetration * wa; a.pos.z -= nz * penetration * wa;
      b.pos.x += nx * penetration * (1 - wa); b.pos.z += nz * penetration * (1 - wa);
      // Remove only closing speed: no artificial bounce or tangential sticking.
      const closing = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (closing < 0) {
        a.vel.x += nx * closing * wa; a.vel.z += nz * closing * wa;
        b.vel.x -= nx * closing * (1 - wa); b.vel.z -= nz * closing * (1 - wa);
      }
      deepest = Math.max(deepest, penetration);
    }
    // A pair push must never push its neighbour through a prop or a wall.
    let movedByProp = false;
    if (constrain) for (const actor of actors) {
      const x=actor.pos.x,z=actor.pos.z;
      constrain(actor);
      movedByProp ||= Math.abs(actor.pos.x-x)+Math.abs(actor.pos.z-z)>.0001;
    }
    if (deepest < .001 && !movedByProp) break;
  }
}

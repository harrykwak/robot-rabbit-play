// A seated pilot is 55% size and enclosed by the robot's opaque shell. Its
// clothing pieces need normal shading, but duplicating every piece into the
// world shadow map adds no readable ground silhouette. Preserve exact flags
// for ejection, including meshes detached by a quality bake.
const records = new WeakMap();
export function syncPilotShadows(pilot, quality) {
  const mounted = !!pilot.riding;
  let record = records.get(pilot);
  if (record?.mounted === mounted && record.quality === quality) return;
  if (record) for (const [mesh, cast] of record.flags) mesh.castShadow = cast;
  if (!mounted) { records.delete(pilot); return; }
  record = { mounted, quality, flags: new Map() };
  pilot.rig.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    record.flags.set(mesh, mesh.castShadow); mesh.castShadow = false;
  });
  records.set(pilot, record);
}

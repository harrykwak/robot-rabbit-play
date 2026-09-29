// 절차적 포즈 시스템: 모든 관절 값을 하나의 객체로 다루고 보간한다
export const KEYS = ['hy', 'hx', 'hz', 'hry', 'tx', 'ty', 'tz', 'nx', 'ny', 'alx', 'aly', 'alz', 'arx', 'ary', 'arz', 'flx', 'frx', 'llx', 'llz', 'lrx', 'lrz', 'slx', 'srx', 'ex'];

export function makePose(src) {
  const o = {};
  for (const k of KEYS) o[k] = src && src[k] !== undefined ? src[k] : 0;
  return o;
}

// cur 를 target 쪽으로 a(0~1) 만큼 이동
export function blendInto(cur, target, a) {
  for (const k of KEYS) {
    const t = target[k] || 0;
    cur[k] += (t - cur[k]) * a;
  }
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

// frames: [[time, poseObj], ...] 시간순. out 에 샘플링 결과를 쓴다
export function sample(frames, t, out) {
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1][0] <= t) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b[0] - a[0];
  const u = span > 0 ? easeOut(Math.min(1, Math.max(0, (t - a[0]) / span))) : 1;
  for (const k of KEYS) {
    const va = a[1][k] || 0;
    const vb = b[1][k] || 0;
    out[k] = va + (vb - va) * u;
  }
  return out;
}

// 포즈를 리그에 적용. s: 높이 오프셋 스케일
export function applyRig(rig, p, restHipsY, s) {
  rig.hips.position.y = restHipsY + p.hy * s;
  rig.hips.rotation.set(p.hx, p.hry, p.hz);
  rig.torso.rotation.set(p.tx, p.ty, p.tz);
  rig.head.rotation.set(p.nx, p.ny, 0);
  rig.armL.rotation.set(p.alx, p.aly, p.alz);
  rig.armR.rotation.set(p.arx, p.ary, p.arz);
  rig.foreL.rotation.x = p.flx;
  rig.foreR.rotation.x = p.frx;
  rig.legL.rotation.set(p.llx, 0, p.llz);
  rig.legR.rotation.set(p.lrx, 0, p.lrz);
  rig.shinL.rotation.x = p.slx;
  rig.shinR.rotation.x = p.srx;
  if (rig.earL) {
    rig.earL.rotation.x = p.ex;
    rig.earR.rotation.x = p.ex;
  }
}

// 자주 쓰는 포즈
export const P = {
  stance: { hy: -0.06, tx: 0.12, ty: -0.22, alx: -1.0, flx: -1.75, alz: 0.18, arx: -0.8, frx: -1.9, arz: -0.2, llx: -0.25, lrx: 0.2, slx: 0.35, srx: 0.25 },
  guard: { hy: -0.14, tx: 0.3, ty: 0, nx: 0.2, alx: -1.35, flx: -2.0, alz: -0.25, arx: -1.35, frx: -2.0, arz: 0.25, llx: -0.45, lrx: 0.35, slx: 0.8, srx: 0.5 },
  jump: { tx: -0.1, alx: -0.4, alz: 0.9, flx: -0.8, arx: -0.4, arz: -0.9, frx: -0.8, llx: -0.9, slx: 1.3, lrx: 0.2, srx: 0.6 },
  fall: { tx: 0.05, alx: -0.2, alz: 1.2, flx: -0.4, arx: -0.2, arz: -1.2, frx: -0.4, llx: -0.3, slx: 0.5, lrx: 0.3, srx: 0.8 },
  hurt: { hy: -0.05, tx: -0.45, nx: -0.4, alx: 0.5, alz: 0.6, flx: -0.6, arx: 0.4, arz: -0.7, frx: -0.5, llx: 0.3, lrx: -0.2, slx: 0.3, srx: 0.4 },
  launched: { tx: -0.8, nx: -0.5, alx: 0.4, alz: 1.6, flx: -0.2, arx: 0.3, arz: -1.6, frx: -0.2, llx: -0.6, slx: 0.4, lrx: 0.5, srx: 0.9 },
  down: { hy: -0.62, hx: -1.45, tx: 0, nx: 0.3, alx: -2.6, alz: 0.4, arx: -2.6, arz: -0.4, llx: 0.15, lrx: 0.05, slx: 0.2 },
  summon: { tx: -0.15, nx: -0.35, arx: -2.9, arz: -0.1, frx: -0.2, alx: -0.3, alz: 0.4, flx: -0.8, llx: -0.2, lrx: 0.3, slx: 0.3 },
  board: { hy: -0.1, tx: 0.2, nx: -0.4, alx: -2.2, flx: -0.8, alz: 0.3, arx: -2.2, frx: -0.8, arz: -0.3, llx: -0.3, slx: 0.6, lrx: 0.4, srx: 0.3 },
  pilot: { hy: 0, hx: 0, tx: 0.15, alx: -1.2, flx: -0.6, arx: -1.2, frx: -0.6, llx: -1.5, slx: 1.5, lrx: -1.5, srx: 1.5 },
  victory: { tx: -0.1, nx: -0.2, arx: -3.0, arz: -0.2, frx: -0.2, alx: -0.2, alz: 0.3, flx: -1.2 },
};


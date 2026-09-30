// 로봇 에너지(당근쥬스)와 부위 파괴 규칙: three.js 없이 테스트할 수 있는 순수 함수
import { RULES, ROBOT_STATS } from './data.js';

export const PARTS = ['armL', 'armR', 'head', 'legs'];
export const PART_BIT = { armL: 1, armR: 2, head: 4, legs: 8 };
export const PART_ALL = 15;
export const PART_NAME = { armL: '왼팔', armR: '오른팔', head: '머리', legs: '다리' };
// 부서졌을 때 불이익 (토스트 문구)
export const PART_EFFECT = {
  armL: '왼팔 스킬 봉인 · 기본 공격 약화',
  armR: '오른팔 스킬 봉인 · 기본 공격 약화',
  head: '조준 약화 · 쥬스 소모 증가',
  legs: '이동 감소 · 대시 불가',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const isBroken = (mask, part) => (mask & PART_BIT[part]) !== 0;

// 부위 최대 내구도: 로봇 전체 내구도(maxArmor)의 일정 비율
export function partMaxHp(maxArmor) {
  const o = {};
  for (const k of PARTS) o[k] = Math.max(1, Math.round(maxArmor * RULES.partHp[k]));
  return o;
}

export function brokenMask(parts) {
  let m = 0;
  for (const k of PARTS) if (parts[k] <= 0) m |= PART_BIT[k];
  return m;
}

// 월드 좌표의 타격 지점 → 로봇 기준 좌우(side, +면 왼팔 쪽)와 높이 비율(h: 0 발끝 ~ 1 머리 꼭대기)
// 로봇 루트는 rotation.y = facing 이라 로컬 +x(왼팔) = 월드 (cos f, 0, -sin f)
export function localHit(px, py, pz, facing, height, ax, ay, az, out = {}) {
  const dx = ax - px, dz = az - pz;
  out.side = dx * Math.cos(facing) - dz * Math.sin(facing);
  out.h = (ay - py) / height;
  return out;
}

// 맞은 부위: 낮으면 다리(70%, 나머지는 그쪽 팔), 높으면 머리, 옆이면 그쪽 팔. 몸통 정면은 머리 30% / 양팔 35% 씩
export function pickPart(side, h, radius, rnd = Math.random()) {
  const edge = radius * 0.35;
  const arm = side > edge ? 'armL' : side < -edge ? 'armR' : null;
  if (h < RULES.partLegsBelow) return rnd < 0.7 || !arm ? 'legs' : arm;
  if (h > RULES.partHeadAbove) return 'head';
  if (arm) return arm;
  return rnd < 0.3 ? 'head' : rnd < 0.65 ? 'armL' : 'armR';
}

// 부위에 피해를 준다. 이번 피해로 새로 부서졌으면 true
export function damagePart(parts, part, dmg) {
  if (!(part in parts) || parts[part] <= 0 || !(dmg > 0)) return false;
  parts[part] = Math.max(0, parts[part] - dmg);
  return parts[part] === 0;
}

// 스킬 슬롯(1: 스킬 1, 2: 스킬 2)이 쓰는 부위
export function skillPart(type, slot) {
  const s = ROBOT_STATS[type] && ROBOT_STATS[type].skills[slot];
  return (s && s.part) || null;
}

// 머리가 부서지면 쥬스 효율이 떨어진다
export function juiceCost(base, mask) {
  return base * (mask & PART_BIT.head ? RULES.juiceHeadMul : 1);
}

export function skillJuice(type, slot, mask) {
  const s = ROBOT_STATS[type] && ROBOT_STATS[type].skills[slot];
  return juiceCost((s && s.juice) || 0, mask);
}

// 스킬을 못 쓰는 이유: '' 사용 가능, 'part' 필요한 부위 파괴, 'juice' 쥬스 부족(바닥나면 모든 스킬 봉인), 'cd' 쿨다운
export function skillBlock(type, slot, cd, juice, mask) {
  const p = skillPart(type, slot);
  if (p && isBroken(mask, p)) return 'part';
  if (juice <= 0 || juice < skillJuice(type, slot, mask)) return 'juice';
  if (cd > 0) return 'cd';
  return '';
}

// 쥬스 변화: 탑승 중(전투)에는 천천히 줄고, 빈 로봇은 천천히 다시 찬다
export function stepJuice(juice, max, dt, riding, fighting, mask) {
  if (riding) { if (fighting) juice -= RULES.juiceDrain * dt * (mask & PART_BIT.head ? RULES.juiceHeadMul : 1); }
  else juice += RULES.juiceIdleRegen * dt;
  return clamp(juice, 0, max);
}

// 부위/쥬스 상태에 따른 성능. out 을 재사용한다 (매 틱 호출)
export function robotMods(mask, juice, out = {}) {
  const empty = juice <= 0;
  const legs = (mask & PART_BIT.legs) !== 0;
  const head = (mask & PART_BIT.head) !== 0;
  out.empty = empty;
  out.speed = (legs ? RULES.partLegsSpeed : 1) * (empty ? RULES.juiceEmptySpeed : 1);
  out.jump = legs ? RULES.partLegsJump : 1;
  out.dash = !legs && !empty;
  out.skills = !empty;
  out.dmg = empty ? RULES.juiceEmptyDmg : 1;
  out.aimCone = head ? RULES.partHeadAim : 1;    // 자동 조준 원뿔(1 - cos) 배율
  out.aimRange = head ? RULES.partHeadRange : 1;
  return out;
}

// 기본 콤보 기술 (콤보 피해 배율을 받는다)
export const COMBO_MOVES = new Set(['tp1', 'tp2', 'bk1', 'bk2', 'bk3', 'blaster', 'hs1', 'hs2']);

// 기본 콤보 피해 배율: 콤보에 쓰는 부위(skills[0].parts)가 부서질 때마다 감소
export function comboDamageMul(type, mask) {
  const s = ROBOT_STATS[type] && ROBOT_STATS[type].skills[0];
  const list = (s && s.parts) || [];
  let n = 0;
  for (const p of list) if (isBroken(mask, p)) n++;
  return Math.max(RULES.partComboMin, 1 - n * RULES.partComboLoss);
}





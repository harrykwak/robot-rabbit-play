// 오프라인 솔로 챌린지(캠페인) 진행 로직. DOM/게임 엔티티에 의존하지 않는 순수 모듈.
// 저장소는 getItem/setItem을 가진 어댑터(localStorage 등)를 주입받는다.

export const PROGRESS_VERSION = 1;
export const STORAGE_KEY = 'rr-campaign';

const FIGHTERS = 4;          // 플레이어 1 + CPU 3
const MAX_DMG = 100000;
const MAX_COUNT = 1e6;       // 도전/클리어 횟수 상한
const MAX_RAW = 32 * 1024;   // 저장 문자열 최대 길이

// 조건: { stat, op, value }. stat은 결과의 숫자 필드, op는 '>=' 또는 '<='.
const c = (stat, op, value) => ({ stat, op, value });

const RAW_MISSIONS = [
  {
    id: 'farm-debut', title: '당근 농장 첫 출격', stage: 'farm', diff: 0, stock: 3,
    brief: '익숙한 섬에서 몸을 풀자. 끝까지 버텨 2위 안에 들면 성공.',
    goalText: '2위 이내로 마치기',
    goal: [c('rank', '<=', 2)],
    medals: [
      { id: 'ko2', text: 'KO 2회 이상', when: [c('kos', '>=', 2)] },
      { id: 'nofall', text: '한 번도 떨어지지 않기', when: [c('falls', '<=', 0)] },
    ],
  },
  {
    id: 'fort-raid', title: '풍차 요새 기습', stage: 'fort', diff: 0, stock: 3,
    brief: '요새 경사로를 타고 올라가 상대를 밀어내자. 순위보다 KO가 중요하다.',
    goalText: 'KO 2회 이상',
    goal: [c('kos', '>=', 2)],
    medals: [
      { id: 'dmg150', text: '피해량 150 이상', when: [c('dmg', '>=', 150)] },
      { id: 'win', text: '1위 달성', when: [c('rank', '<=', 1)] },
    ],
  },
  {
    id: 'sky-walk', title: '구름 위 줄타기', stage: 'sky', diff: 1, stock: 3,
    brief: '움직이는 발판 위에서는 한 발만 삐끗해도 끝. 떨어지지 않는 게 먼저다.',
    goalText: '낙하 1회 이하, 3위 이내',
    goal: [c('falls', '<=', 1), c('rank', '<=', 3)],
    medals: [
      { id: 'nofall', text: '한 번도 떨어지지 않기', when: [c('falls', '<=', 0)] },
      { id: 'ko3', text: 'KO 3회 이상', when: [c('kos', '>=', 3)] },
    ],
  },
  {
    id: 'farm-duel', title: '농장 챔피언전', stage: 'farm', diff: 1, stock: 2,
    brief: '목숨은 두 개뿐. 강해진 CPU 사이에서 끝까지 살아남아 우승하자.',
    goalText: '1위 달성',
    goal: [c('rank', '<=', 1)],
    medals: [
      { id: 'perfect', text: '목숨을 하나도 잃지 않기', when: [c('stock', '>=', 2)] },
      { id: 'dmg200', text: '피해량 200 이상', when: [c('dmg', '>=', 200)] },
    ],
  },
  {
    id: 'fort-siege', title: '요새 함락 작전', stage: 'fort', diff: 2, stock: 3,
    brief: '어려움 CPU가 요새를 지킨다. 공격적으로 KO를 쌓으면서 상위권을 지키자.',
    goalText: 'KO 3회 이상, 2위 이내',
    goal: [c('kos', '>=', 3), c('rank', '<=', 2)],
    medals: [
      { id: 'ko5', text: 'KO 5회 이상', when: [c('kos', '>=', 5)] },
      { id: 'fall1', text: '낙하 1회 이하', when: [c('falls', '<=', 1)] },
    ],
  },
  {
    id: 'sky-final', title: '구름 정원 결전', stage: 'sky', diff: 2, stock: 5,
    brief: '마지막 무대. 긴 승부 끝에 구름 정원의 주인이 되어라.',
    goalText: '1위 달성',
    goal: [c('rank', '<=', 1)],
    medals: [
      { id: 'stock3', text: '목숨 3개 이상 남기기', when: [c('stock', '>=', 3)] },
      { id: 'ko6', text: 'KO 6회 이상', when: [c('kos', '>=', 6)] },
    ],
  },
];

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

export const MISSIONS = deepFreeze(RAW_MISSIONS.map((m, index) => ({
  ...m,
  index,
  config: { stage: m.stage, diff: m.diff, stock: m.stock },
  maxStars: 1 + m.medals.length,
})));

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
const STATS = ['rank', 'kos', 'falls', 'dmg', 'stock'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const count = (v) => (intIn(v, 0, MAX_COUNT) ? v : 0);
const getMission = (id) => (typeof id === 'string' ? BY_ID.get(id) || null : null);

// 결과를 미션 설정 기준으로 검증하고 숫자만 뽑아낸 사본을 돌려준다. 잘못되면 null.
function cleanResult(mission, r) {
  if (!isObj(r)) return null;
  const out = {};
  for (const k of STATS) {
    if (!own(r, k)) return null;
    out[k] = r[k];
  }
  const s = mission.stock;
  if (!intIn(out.rank, 1, FIGHTERS)) return null;
  if (!intIn(out.stock, 0, s)) return null;
  if (!intIn(out.falls, 0, s)) return null;
  if (out.stock + out.falls !== s) return null;              // 낙하 1회 = 목숨 1개
  if (!intIn(out.kos, 0, (FIGHTERS - 1) * s)) return null;   // CPU 목숨 총합을 넘을 수 없음
  if (!intIn(out.dmg, 0, MAX_DMG)) return null;
  return out;
}

const pass = (conds, r) => conds.every((q) => (q.op === '<=' ? r[q.stat] <= q.value : r[q.stat] >= q.value));

function score(mission, r) {
  const cleared = pass(mission.goal, r);
  const medals = cleared ? mission.medals.filter((m) => pass(m.when, r)).map((m) => m.id) : [];
  return { cleared, stars: cleared ? 1 + medals.length : 0, medals };
}

// a가 b보다 좋은 기록이면 true. 별 → 순위 → KO → 낙하 → 피해량 순.
function better(a, b) {
  if (a.stars !== b.stars) return a.stars > b.stars;
  if (a.rank !== b.rank) return a.rank < b.rank;
  if (a.kos !== b.kos) return a.kos > b.kos;
  if (a.falls !== b.falls) return a.falls < b.falls;
  return a.dmg > b.dmg;
}

const emptyRecord = () => ({ attempts: 0, clears: 0, best: null, bestStars: 0, medals: [] });

// 저장된 기록 하나를 정규화한다. 별/메달은 저장값을 믿지 않고 best 수치로 다시 계산한다.
function normalizeRecord(mission, v) {
  if (!isObj(v)) return emptyRecord();
  const rec = emptyRecord();
  rec.attempts = count(v.attempts);
  const best = cleanResult(mission, v.best);
  const sc = best && score(mission, best);
  if (sc && sc.cleared) {
    rec.best = best;
    rec.bestStars = sc.stars;
    rec.medals = sc.medals;
    rec.clears = Math.max(1, count(v.clears));
  }
  rec.attempts = Math.max(rec.attempts, rec.clears);
  return rec;
}

export function normalizeProgress(value) {
  const src = isObj(value) && value.version === PROGRESS_VERSION && isObj(value.missions) ? value.missions : null;
  const missions = {};
  let prevCleared = true;
  for (const m of MISSIONS) {
    // 앞 미션을 깨지 못했다면 뒤 미션 기록은 잠금 상태로 초기화한다(조작/손상 데이터로 인한 잠금 해제 방지).
    const rec = prevCleared && src && own(src, m.id) ? normalizeRecord(m, src[m.id]) : emptyRecord();
    missions[m.id] = rec;
    prevCleared = rec.clears > 0;
  }
  return { version: PROGRESS_VERSION, missions };
}

export function isUnlocked(progress, missionId) {
  const m = getMission(missionId);
  if (!m) return false;
  if (m.index === 0) return true;
  const p = normalizeProgress(progress);
  return p.missions[MISSIONS[m.index - 1].id].clears > 0;
}

// UI용 요약 목록.
export function missionStatus(progress) {
  const p = normalizeProgress(progress);
  return MISSIONS.map((m, i) => {
    const rec = p.missions[m.id];
    return {
      id: m.id,
      unlocked: i === 0 || p.missions[MISSIONS[i - 1].id].clears > 0,
      cleared: rec.clears > 0,
      bestStars: rec.bestStars,
      maxStars: m.maxStars,
      medals: rec.medals.slice(),
      attempts: rec.attempts,
    };
  });
}

const invalid = (reason) => ({ valid: false, reason, cleared: false, stars: 0, result: null, goals: [], medals: [] });

export function evaluateMission(missionId, result) {
  const m = getMission(missionId);
  if (!m) return invalid('unknown-mission');
  if (isObj(result) && result.autoplay === true) return invalid('autoplay');
  const r = cleanResult(m, result);
  if (!r) return invalid('invalid-result');
  const sc = score(m, r);
  return {
    valid: true,
    reason: null,
    cleared: sc.cleared,
    stars: sc.stars,
    result: r,
    goals: m.goal.map((q) => ({ stat: q.stat, op: q.op, value: q.value, met: pass([q], r) })),
    medals: m.medals.map((md) => ({ id: md.id, text: md.text, earned: sc.medals.includes(md.id) })),
  };
}

// 입력 progress를 바꾸지 않고 새 progress를 돌려준다.
export function recordResult(progress, missionId, result) {
  const base = normalizeProgress(progress);
  const reject = (reason) => ({ accepted: false, reason, progress: base, evaluation: null, newBest: false, unlocked: null });
  const m = getMission(missionId);
  if (!m) return reject('unknown-mission');
  if (!isUnlocked(base, m.id)) return reject('locked');
  const ev = evaluateMission(m.id, result);
  if (!ev.valid) return reject(ev.reason);

  const prev = base.missions[m.id];
  const rec = { ...prev, medals: prev.medals.slice(), best: prev.best && { ...prev.best } };
  rec.attempts = Math.min(MAX_COUNT, rec.attempts + 1);
  let newBest = false;
  let unlocked = null;
  if (ev.cleared) {
    rec.clears = Math.min(MAX_COUNT, rec.clears + 1);
    if (!prev.best || better({ ...ev.result, stars: ev.stars }, { ...prev.best, stars: prev.bestStars })) {
      newBest = true;
      rec.best = { ...ev.result };
      rec.bestStars = ev.stars;
      rec.medals = ev.medals.filter((x) => x.earned).map((x) => x.id);
    }
    const next = MISSIONS[m.index + 1];
    if (prev.clears === 0 && next) unlocked = next.id;
  }
  const missions = { ...base.missions, [m.id]: rec };
  return { accepted: true, reason: null, progress: { version: PROGRESS_VERSION, missions }, evaluation: ev, newBest, unlocked };
}

export function loadProgress(storage) {
  try {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
    if (typeof raw !== 'string' || raw.length > MAX_RAW) return normalizeProgress(null);
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return normalizeProgress(null);
  }
}

export function saveProgress(storage, progress) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

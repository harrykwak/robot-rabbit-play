// 액션 정의: 포즈 키프레임, 히트 판정, 전진, 이벤트
// hit: t0~t1 동안 활성. fwd/up/side: 공격자 기준 오프셋, r: 반경
// dmg, kb(수평 넉백), lift(수직), stun, power(0~3 연출 강도), launch(띄우기)
// every: 다단히트 간격(초). radial: 넉백 방향을 방사형으로 섞는 비율
// 사람 액션 추가 필드
//   next/nextH: J/K 로 이어지는 다음 기술 ('LAUNCH' 는 파일럿 띄우기 기술, 'AIR' 는 다음 공중 콤보)
//   air: 공중 기술 (중력 감소), hang: 시작 시 위 속도, floatT: 중력 감소 시간, dive: [수평, 수직] 급강하 속도
//   land: 착지하면 발생하는 이벤트 후 종료, hop: 'hop' 이벤트 때 위로 뛰는 속도, iv: [t0, t1] 무적
//   armor: 슈퍼 아머, hold: [고정 시각, 최대 충전] 강공격 키를 누르고 있는 동안 모으기
//   hit.spike: 아래로 내리꽂기 (바닥에서 튕김), hit.chase: 맞히면 추격 점프 가능, hit.air: 공중 띄우기 타격
//   hit.grab: 잡기 (가드 무시, 공격자 뒤로 던짐). dodge: 방어용 회피기. counter: [t0, t1] 반격 자세. hopBack: hop 때 뒤로 뛰는 속도
import { P } from './poses.js';

const S = P.stance;
const TUCK = { llx: -1.0, slx: 1.5, lrx: -0.5, srx: 1.3 };
const CROUCH = { hy: -0.3, tx: 0.4, arx: -0.4, frx: -1.8, alx: -1.0, flx: -1.9, llx: -0.8, slx: 1.2, lrx: 0.4, srx: 0.9 };

export const HUMAN_ACTS = {
  jab1: {
    dur: 0.27, chain: 0.12, next: 'jab2', nextH: 'LAUNCH',
    frames: [
      [0, S],
      [0.05, { hy: -0.08, tx: 0.2, ty: -0.6, alx: -1.62, alz: 0.06, flx: -0.05, arx: -0.95, frx: -2.1, arz: -0.25, llx: -0.45, lrx: 0.35, slx: 0.3, srx: 0.4 }],
      [0.14, { hy: -0.08, tx: 0.2, ty: -0.55, alx: -1.55, flx: -0.12, arx: -0.95, frx: -2.1, arz: -0.25, llx: -0.45, lrx: 0.35, slx: 0.3, srx: 0.4 }],
      [0.27, S],
    ],
    hits: [{ t0: 0.035, t1: 0.1, fwd: 0.95, up: 1.05, r: 0.6, dmg: 5, kb: 3.5, lift: 1, stun: 0.34, power: 0, snd: 'punch' }],
    lunge: [0, 0.08, 5.5],
  },
  jab2: {
    dur: 0.3, chain: 0.13, next: 'kick3', nextH: 'LAUNCH',
    frames: [
      [0, { ty: -0.4, alx: -1.2, flx: -1.5, arx: -0.8, frx: -2 }],
      [0.05, { hy: -0.1, tx: 0.22, ty: 0.7, arx: -1.62, arz: -0.05, frx: -0.04, alx: -1.0, flx: -2.0, alz: 0.3, llx: -0.5, lrx: 0.45, slx: 0.35, srx: 0.5 }],
      [0.15, { hy: -0.1, tx: 0.22, ty: 0.62, arx: -1.55, frx: -0.1, alx: -1.0, flx: -2.0, alz: 0.3, llx: -0.5, lrx: 0.45, slx: 0.35, srx: 0.5 }],
      [0.3, S],
    ],
    hits: [{ t0: 0.035, t1: 0.1, fwd: 1.0, up: 1.05, r: 0.62, dmg: 6, kb: 4, lift: 1, stun: 0.36, power: 0, snd: 'punch' }],
    lunge: [0, 0.08, 6],
  },
  kick3: {
    dur: 0.5, chain: 0.4, next: null,
    frames: [
      [0, { ty: 0.5, tx: 0.1, lrx: -0.4, srx: 1.4 }],
      [0.09, { hy: 0.02, tx: -0.35, ty: -0.2, lrx: -1.75, srx: 0.05, llx: 0.15, slx: 0.25, alx: -0.5, alz: 0.7, flx: -1.2, arx: -0.3, arz: -0.8, frx: -1.2 }],
      [0.22, { hy: 0.02, tx: -0.35, ty: -0.2, lrx: -1.7, srx: 0.1, llx: 0.15, slx: 0.25, alx: -0.5, alz: 0.7, flx: -1.2, arx: -0.3, arz: -0.8, frx: -1.2 }],
      [0.5, S],
    ],
    hits: [{ t0: 0.08, t1: 0.17, fwd: 1.15, up: 1.0, r: 0.75, dmg: 10, kb: 13, lift: 8, launch: true, power: 1, snd: 'kick', chase: true }],
    lunge: [0.02, 0.12, 7],
  },
  heavy: {
    dur: 0.62, chain: 0.62,
    frames: [
      [0, S],
      [0.19, { hy: -0.26, tx: 0.45, ty: 0.7, arx: 0.75, frx: -1.7, arz: -0.2, alx: -1.2, flx: -1.9, llx: -0.75, slx: 1.05, lrx: 0.35, srx: 0.8 }],
      [0.26, { hy: 0.06, tx: -0.4, ty: -0.35, nx: -0.3, arx: -2.7, frx: -0.25, arz: -0.1, alx: -0.3, alz: 0.4, flx: -1.2, llx: -0.2, slx: 0.2, lrx: 0.45, srx: 0.3 }],
      [0.4, { hy: 0.04, tx: -0.35, ty: -0.3, arx: -2.65, frx: -0.3, alx: -0.3, alz: 0.4, flx: -1.2, llx: -0.2, slx: 0.2, lrx: 0.45, srx: 0.3 }],
      [0.62, S],
    ],
    hits: [{ t0: 0.2, t1: 0.3, fwd: 0.95, up: 1.3, r: 0.8, dmg: 15, kb: 7, lift: 15, launch: true, power: 1, guardBreak: true, snd: 'heavy' }],
    lunge: [0.16, 0.27, 9],
    events: [[0.0, 'whiffHeavy']],
  },
  airKick: {
    dur: 0.55, chain: 0.55, air: true,
    frames: [
      [0, { tx: 0.35, hy: 0.05, lrx: -1.35, srx: 0.05, llx: -0.4, slx: 1.5, alx: -0.5, alz: 1.0, arx: -0.5, arz: -1.0, flx: -1, frx: -1 }],
      [0.55, { tx: 0.35, lrx: -1.3, srx: 0.1, llx: -0.4, slx: 1.5, alx: -0.5, alz: 1.0, arx: -0.5, arz: -1.0 }],
    ],
    hits: [{ t0: 0.02, t1: 0.55, fwd: 0.65, up: 0.25, r: 0.75, dmg: 9, kb: 9, lift: 7, launch: true, power: 1, snd: 'kick', bounce: true }],
    events: [[0.0, 'diveStart']],
  },
  tackle: {
    dur: 0.5, chain: 0.5,
    frames: [
      [0, { hy: -0.18, tx: 0.65, alx: -1.45, flx: -0.3, arx: -1.45, frx: -0.3, alz: -0.25, arz: 0.25, llx: -0.8, slx: 0.8, lrx: 0.6, srx: 0.8 }],
      [0.3, { hy: -0.18, tx: 0.65, alx: -1.45, flx: -0.3, arx: -1.45, frx: -0.3, alz: -0.25, arz: 0.25, llx: -0.8, slx: 0.8, lrx: 0.6, srx: 0.8 }],
      [0.5, S],
    ],
    hits: [{ t0: 0.03, t1: 0.28, fwd: 0.75, up: 0.9, r: 0.72, dmg: 8, kb: 12, lift: 8, launch: true, power: 1, snd: 'heavy' }],
    lunge: [0, 0.28, 15],
  },
  summon: {
    dur: 1.0, chain: 1.0,
    frames: [[0, S], [0.22, P.summon], [0.8, P.summon], [1.0, { ...P.summon, arx: -2.2 }]],
    events: [[0.18, 'remoteOut'], [0.42, 'remoteBeep'], [0.72, 'summonCall']],
  },

  // ---------- 공중 콤보 (공통) ----------
  air1: {
    dur: 0.34, chain: 0.15, next: 'AIR', air: true, hang: 3.4, floatT: 0.3,
    frames: [
      [0, { tx: 0.1, ...TUCK, alx: -1.0, flx: -1.8, arx: -0.8, frx: -1.9 }],
      [0.05, { tx: 0.2, ty: -0.6, ...TUCK, alx: -1.62, flx: -0.05, arx: -0.95, frx: -2.1, arz: -0.25 }],
      [0.16, { tx: 0.2, ty: -0.55, ...TUCK, alx: -1.55, flx: -0.1, arx: -0.95, frx: -2.1, arz: -0.25 }],
      [0.34, { tx: 0.1, ...TUCK, alx: -1.0, flx: -1.8, arx: -0.8, frx: -1.9 }],
    ],
    hits: [{ t0: 0.04, t1: 0.13, fwd: 0.95, up: 0.85, r: 0.78, dmg: 6, kb: 2.5, lift: 7, launch: true, air: true, power: 1, snd: 'punch' }],
  },
  air2: {
    dur: 0.36, chain: 0.16, next: 'AIR', air: true, hang: 3.4, floatT: 0.3,
    frames: [
      [0, { tx: 0.1, ...TUCK }],
      [0.06, { tx: -0.3, ty: -0.2, lrx: -1.65, srx: 0.08, llx: 0.1, slx: 0.8, alz: 0.8, arz: -0.8, flx: -1.2, frx: -1.2 }],
      [0.18, { tx: -0.3, ty: -0.2, lrx: -1.6, srx: 0.1, llx: 0.1, slx: 0.8, alz: 0.8, arz: -0.8, flx: -1.2, frx: -1.2 }],
      [0.36, { tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.05, t1: 0.14, fwd: 1.05, up: 0.7, r: 0.8, dmg: 7, kb: 3, lift: 7.4, launch: true, air: true, power: 1, snd: 'kick' }],
  },
  airSpike: {
    dur: 0.5, chain: 0.5, air: true, hang: 4, floatT: 0.25,
    frames: [
      [0, { tx: -0.35, nx: -0.2, alx: -2.9, arx: -2.9, flx: -0.3, frx: -0.3, ...TUCK }],
      [0.12, { tx: 0.75, nx: 0.3, alx: -0.8, arx: -0.8, flx: -0.2, frx: -0.2, llx: -0.3, slx: 0.6, lrx: 0.2, srx: 0.6 }],
      [0.5, { tx: 0.5, alx: -0.8, arx: -0.8, llx: -0.3, slx: 0.6, lrx: 0.2, srx: 0.6 }],
    ],
    hits: [{ t0: 0.09, t1: 0.2, fwd: 0.9, up: 0.4, r: 0.95, dmg: 10, kb: 6, lift: 0, spike: true, power: 2, snd: 'heavy' }],
  },

  // ---------- 리코: 파워 복서 ----------
  ricoCharge: {
    dur: 0.72, chain: 0.72, armor: true, hold: [0.16, 1.1],
    frames: [
      [0, S],
      [0.16, { hy: -0.26, tx: 0.45, ty: 0.9, arx: 0.75, frx: -1.7, arz: -0.2, alx: -1.2, flx: -1.9, llx: -0.75, slx: 1.05, lrx: 0.35, srx: 0.8 }],
      [0.24, { hy: -0.12, tx: 0.35, ty: -0.75, arx: -1.62, frx: -0.02, arz: -0.05, alx: -0.9, flx: -2.0, alz: 0.3, llx: -0.75, lrx: 0.6, slx: 0.55, srx: 0.35 }],
      [0.46, { hy: -0.12, tx: 0.35, ty: -0.7, arx: -1.58, frx: -0.05, alx: -0.9, flx: -2.0, alz: 0.3, llx: -0.75, lrx: 0.6, slx: 0.55, srx: 0.35 }],
      [0.72, S],
    ],
    hits: [{ t0: 0.19, t1: 0.3, fwd: 1.05, up: 1.1, r: 0.85, dmg: 12, kb: 15, lift: 6, launch: true, power: 2, guardBreak: true, snd: 'heavy' }],
    lunge: [0.17, 0.27, 11],
    events: [[0.0, 'whiffHeavy']],
  },
  ricoUpper: {
    dur: 0.55, chain: 0.5, armor: true, hop: 11,
    frames: [
      [0, CROUCH],
      [0.1, { hy: 0.1, tx: -0.35, ty: -0.3, nx: -0.3, arx: -2.9, frx: -0.2, alx: -0.5, alz: 0.4, flx: -1.4, llx: -0.2, slx: 0.3, lrx: 0.5, srx: 0.6 }],
      [0.4, { hy: 0.1, tx: -0.3, ty: -0.3, arx: -2.85, frx: -0.2, alx: -0.5, alz: 0.4, flx: -1.4, ...TUCK }],
      [0.55, { tx: 0.1, ...TUCK, alx: -1.0, flx: -1.8, arx: -0.8, frx: -1.9 }],
    ],
    hits: [{ t0: 0.06, t1: 0.17, fwd: 0.9, up: 1.3, r: 0.85, dmg: 11, kb: 2.5, lift: 16, launch: true, chase: true, power: 2, snd: 'heavy' }],
    events: [[0.08, 'hop']],
  },
  ricoRush: {
    dur: 0.64, chain: 0.64, armor: true,
    frames: [
      [0, S],
      [0.06, { hy: -0.1, tx: 0.3, ty: -0.6, alx: -1.62, flx: -0.05, arx: -0.95, frx: -2.1, llx: -0.6, lrx: 0.45, slx: 0.4, srx: 0.4 }],
      [0.18, { hy: -0.1, tx: 0.3, ty: 0.5, alx: -1.0, flx: -1.9, arx: 0.4, frx: -1.8, llx: -0.6, lrx: 0.45, slx: 0.4, srx: 0.4 }],
      [0.27, { hy: -0.15, tx: 0.4, ty: -0.8, arx: -1.62, frx: -0.02, alx: -0.9, flx: -2.0, alz: 0.3, llx: -0.8, lrx: 0.6, slx: 0.6, srx: 0.35 }],
      [0.46, { hy: -0.15, tx: 0.4, ty: -0.75, arx: -1.58, frx: -0.05, alx: -0.9, flx: -2.0, alz: 0.3, llx: -0.8, lrx: 0.6, slx: 0.6, srx: 0.35 }],
      [0.64, S],
    ],
    hits: [
      { t0: 0.05, t1: 0.13, fwd: 1.0, up: 1.05, r: 0.75, dmg: 7, kb: 5, lift: 2, stun: 0.45, power: 1, snd: 'punch' },
      { t0: 0.26, t1: 0.36, fwd: 1.1, up: 1.05, r: 0.85, dmg: 10, kb: 17, lift: 8, launch: true, power: 2, snd: 'heavy' },
    ],
    lunge: [0, 0.34, 13],
  },
  ricoMeteor: {
    dur: 0.9, chain: 0.9, air: true, dive: [9, -20], land: 'meteorLand',
    frames: [
      [0, { tx: -0.3, arx: -2.8, alx: -1.2, flx: -1.5, frx: -0.3, ...TUCK }],
      [0.1, { tx: 0.65, nx: 0.3, arx: -1.0, frx: -0.1, alx: -0.8, flx: -1.6, llx: -0.5, slx: 0.9, lrx: 0.1, srx: 0.5 }],
      [0.9, { tx: 0.65, arx: -1.0, frx: -0.1, alx: -0.8, flx: -1.6, llx: -0.5, slx: 0.9, lrx: 0.1, srx: 0.5 }],
    ],
    hits: [{ t0: 0.04, t1: 0.9, fwd: 0.85, up: 0.5, r: 0.85, dmg: 9, kb: 5, lift: 0, spike: true, power: 2, snd: 'heavy' }],
  },

  // ---------- 미미: 기동형 ----------
  mimiBoomerang: {
    dur: 0.45, chain: 0.45,
    frames: [
      [0, S],
      [0.1, { hy: -0.1, tx: -0.1, ty: 0.7, arx: 0.6, arz: -0.4, frx: -1.2, alx: -1.2, flx: -1.5, llx: -0.4, lrx: 0.3, slx: 0.4, srx: 0.3 }],
      [0.18, { hy: -0.12, tx: 0.35, ty: -0.6, arx: -1.5, arz: -0.2, frx: -0.1, alx: -0.6, alz: 0.4, flx: -1.4, llx: -0.6, lrx: 0.45, slx: 0.4, srx: 0.4 }],
      [0.45, S],
    ],
    events: [[0.16, 'boomerang']],
  },
  mimiHop: {
    dur: 0.55, chain: 0.5, hop: 10,
    frames: [
      [0, CROUCH],
      [0.1, { hy: 0.1, tx: -0.4, lrx: -2.4, srx: 0.1, llx: 0.3, slx: 0.8, alz: 1.0, arz: -1.0, flx: -1, frx: -1 }],
      [0.38, { hy: 0.1, tx: -0.35, lrx: -2.3, srx: 0.2, llx: 0.3, slx: 0.8, alz: 1.0, arz: -1.0, flx: -1, frx: -1 }],
      [0.55, { tx: 0.1, ...TUCK, alz: 0.6, arz: -0.6 }],
    ],
    hits: [{ t0: 0.07, t1: 0.18, fwd: 0.8, up: 1.2, r: 0.82, dmg: 9, kb: 2, lift: 15.5, launch: true, chase: true, power: 2, snd: 'kick' }],
    events: [[0.06, 'hop']],
  },
  mimiRoll: {
    dur: 0.72, chain: 0.72, iv: [0, 0.38],
    frames: [
      [0, { hy: -0.45, tx: 0.8, nx: 0.5, alx: -2, arx: -2, llx: -1.6, slx: 2.2, lrx: -1.6, srx: 2.2 }],
      [0.34, { hy: -0.45, hx: 6.283, tx: 0.8, nx: 0.5, alx: -2, arx: -2, llx: -1.6, slx: 2.2, lrx: -1.6, srx: 2.2 }],
      [0.42, { hx: 6.283, tx: -0.3, lrx: -2.3, srx: 0.1, llx: 0.2, slx: 0.6, alz: 0.9, arz: -0.9 }],
      [0.58, { hx: 6.283, tx: -0.3, lrx: -2.2, srx: 0.15, llx: 0.2, slx: 0.6, alz: 0.9, arz: -0.9 }],
      [0.72, { ...S, hx: 6.283 }],
    ],
    hits: [{ t0: 0.4, t1: 0.5, fwd: 0.8, up: 1.1, r: 0.85, dmg: 10, kb: 4, lift: 14, launch: true, chase: true, power: 2, snd: 'kick' }],
    lunge: [0, 0.36, 14],
  },
  mimiStamp: {
    dur: 1.0, chain: 1.0, air: true, dive: [0, -26], land: 'stampLand',
    frames: [
      [0, { hy: 0.1, tx: -0.3, llx: -1.2, slx: 1.4, lrx: -1.2, srx: 1.4, alz: 1.4, arz: -1.4 }],
      [0.12, { tx: 0.3, llx: -1.5, slx: 0.2, lrx: -1.5, srx: 0.2, alx: -0.5, alz: 1.2, arx: -0.5, arz: -1.2, ex: -0.8 }],
      [1.0, { tx: 0.3, llx: -1.5, slx: 0.2, lrx: -1.5, srx: 0.2, alx: -0.5, alz: 1.2, arx: -0.5, arz: -1.2 }],
    ],
    hits: [{ t0: 0.04, t1: 1.0, fwd: 0, up: 0.1, r: 0.95, dmg: 7, kb: 3, lift: 0, spike: true, power: 1, snd: 'kick' }],
  },

  // ---------- 준: 카운터형 ----------
  junSweep: {
    dur: 0.6, chain: 0.6,
    frames: [
      [0, S],
      [0.08, { hy: -0.55, tx: 0.5, llx: -1.6, slx: 2.3, lrx: -1.45, srx: 0.05, alx: -0.5, alz: 0.6, arx: -0.4, arz: -0.6 }],
      [0.28, { hy: -0.55, hry: 3.3, tx: 0.5, llx: -1.6, slx: 2.3, lrx: -1.45, srx: 0.05, alx: -0.5, alz: 0.6, arx: -0.4, arz: -0.6 }],
      [0.44, { hy: -0.5, hry: 6.283, tx: 0.45, llx: -1.5, slx: 2.2, lrx: -0.8, srx: 0.8, alz: 0.4, arz: -0.4 }],
      [0.6, { ...S, hry: 6.283 }],
    ],
    hits: [{ t0: 0.08, t1: 0.34, fwd: 0.4, up: 0.3, r: 1.35, radial: 0.6, dmg: 9, kb: 5, lift: 6, launch: true, power: 1, guardBreak: true, snd: 'kick' }],
  },
  junKnee: {
    dur: 0.52, chain: 0.48, hop: 7,
    frames: [
      [0, S],
      [0.08, { hy: 0.05, tx: 0.25, lrx: -1.7, srx: 2.2, llx: 0.2, slx: 0.4, alx: -1.2, flx: -1.6, arx: -1.2, frx: -1.6 }],
      [0.35, { hy: 0.05, tx: 0.2, lrx: -1.6, srx: 2.1, llx: 0.2, slx: 0.4, alx: -1.2, flx: -1.6, arx: -1.2, frx: -1.6 }],
      [0.52, { tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.06, t1: 0.16, fwd: 0.7, up: 1.0, r: 0.78, dmg: 10, kb: 2, lift: 16, launch: true, chase: true, power: 2, snd: 'kick' }],
    lunge: [0, 0.1, 6],
    events: [[0.06, 'hop']],
  },
  junSlide: {
    dur: 0.66, chain: 0.66,
    frames: [
      [0, { hy: -0.3, tx: 0.3, llx: -0.8, slx: 1.2 }],
      [0.08, { hy: -0.6, hx: -0.9, tx: -0.3, lrx: -1.4, srx: 0.1, llx: -0.3, slx: 1.6, alx: 0.4, alz: 0.9, arx: 0.3, arz: -0.9 }],
      [0.42, { hy: -0.6, hx: -0.9, tx: -0.3, lrx: -1.4, srx: 0.1, llx: -0.3, slx: 1.6, alx: 0.4, alz: 0.9, arx: 0.3, arz: -0.9 }],
      [0.66, S],
    ],
    hits: [{ t0: 0.06, t1: 0.42, fwd: 0.9, up: 0.25, r: 0.82, dmg: 9, kb: 6, lift: 7, launch: true, power: 1, guardBreak: true, snd: 'kick' }],
    lunge: [0.02, 0.4, 16],
  },
  junAxe: {
    dur: 0.55, chain: 0.55, air: true, hang: 4.5, floatT: 0.3,
    frames: [
      [0, { tx: -0.4, lrx: -2.8, srx: 0.05, llx: 0.2, slx: 0.5, alz: 0.8, arz: -0.8 }],
      [0.18, { tx: 0.45, lrx: -0.3, srx: 0.1, llx: 0.1, slx: 0.5, alz: 0.8, arz: -0.8 }],
      [0.55, { tx: 0.35, lrx: -0.3, srx: 0.2, llx: 0.1, slx: 0.5, alz: 0.8, arz: -0.8 }],
    ],
    hits: [{ t0: 0.11, t1: 0.24, fwd: 0.95, up: 0.35, r: 0.95, dmg: 12, kb: 5, lift: 0, spike: true, power: 2, guardBreak: true, snd: 'heavy' }],
  },

  // ---------- 소라: 공중전 킥복서 ----------
  soraSpin: {
    dur: 0.8, chain: 0.8,
    frames: [
      [0, S],
      [0.08, { hy: 0.05, tx: -0.2, lrx: -1.6, srx: 0.05, llx: 0.1, slx: 0.3, alz: 1.2, arz: -1.2 }],
      [0.34, { hy: 0.05, hry: 6.283, tx: -0.2, lrx: -1.6, srx: 0.05, llx: 0.1, slx: 0.3, alz: 1.2, arz: -1.2 }],
      [0.6, { hy: 0.05, hry: 12.566, tx: -0.2, lrx: -1.65, srx: 0.05, llx: 0.1, slx: 0.3, alz: 1.2, arz: -1.2 }],
      [0.8, { ...S, hry: 12.566 }],
    ],
    hits: [
      { t0: 0.08, t1: 0.54, fwd: 0.3, up: 1.0, r: 1.55, radial: 0.2, dmg: 4, kb: 0.6, lift: 2, stun: 0.4, every: 0.12, power: 1, snd: 'kick' },
      { t0: 0.55, t1: 0.64, fwd: 0.3, up: 1.0, r: 1.7, radial: 1, dmg: 8, kb: 14, lift: 9, launch: true, power: 2, snd: 'heavy' },
    ],
    lunge: [0.05, 0.5, 3],
  },
  soraFlip: {
    dur: 0.6, chain: 0.55, hop: 12,
    frames: [
      [0, CROUCH],
      [0.1, { hx: -1.6, tx: -0.3, lrx: -2.4, srx: 0.1, llx: -0.6, slx: 1.4, alz: 1.0, arz: -1.0 }],
      [0.36, { hx: -6.283, tx: 0.3, ...TUCK, alz: 0.8, arz: -0.8 }],
      [0.6, { hx: -6.283, tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.06, t1: 0.18, fwd: 0.75, up: 1.3, r: 0.85, dmg: 10, kb: 2, lift: 16.5, launch: true, chase: true, power: 2, snd: 'kick' }],
    events: [[0.05, 'hop']],
  },
  soraKnee: {
    dur: 0.56, chain: 0.56, hop: 5,
    frames: [
      [0, { hy: -0.2, tx: 0.4, llx: -0.6, slx: 1.0 }],
      [0.06, { tx: 0.3, lrx: -1.7, srx: 2.2, llx: 0.4, slx: 0.8, alx: 0.8, arx: 0.8, alz: 0.4, arz: -0.4 }],
      [0.34, { tx: 0.3, lrx: -1.65, srx: 2.1, llx: 0.4, slx: 0.8, alx: 0.8, arx: 0.8, alz: 0.4, arz: -0.4 }],
      [0.56, S],
    ],
    hits: [{ t0: 0.04, t1: 0.3, fwd: 0.85, up: 1.0, r: 0.82, dmg: 11, kb: 17, lift: 9, launch: true, power: 2, snd: 'heavy' }],
    lunge: [0.02, 0.3, 19],
    events: [[0.02, 'hop']],
  },
  soraSwallow: {
    dur: 0.8, chain: 0.8, air: true, hang: 3.2, floatT: 0.7,
    frames: [
      [0, { tx: -0.1, lrx: -1.6, srx: 0.05, llx: 0.3, slx: 1.2, alz: 1.3, arz: -1.3 }],
      [0.33, { hry: 6.283, tx: -0.1, lrx: -1.6, srx: 0.05, llx: 0.3, slx: 1.2, alz: 1.3, arz: -1.3 }],
      [0.66, { hry: 12.566, tx: -0.1, lrx: -1.65, srx: 0.05, llx: 0.3, slx: 1.2, alz: 1.3, arz: -1.3 }],
      [0.8, { hry: 12.566, tx: 0.1, ...TUCK }],
    ],
    hits: [
      { t0: 0.05, t1: 0.6, fwd: 0, up: 0.6, r: 1.45, radial: 1, dmg: 4, kb: 2, lift: 6.5, launch: true, air: true, every: 0.12, power: 1, snd: 'kick' },
      { t0: 0.62, t1: 0.7, fwd: 0, up: 0.6, r: 1.6, radial: 1, dmg: 8, kb: 15, lift: 6, launch: true, power: 2, snd: 'heavy' },
    ],
  },
  // ---------- 도리: 탱커 가디언 ----------
  doriBash: {
    dur: 0.62, chain: 0.6, armor: true,
    frames: [
      [0, S],
      [0.1, { hy: -0.2, tx: 0.55, ty: -0.35, alx: -1.5, alz: -0.35, flx: -1.6, arx: -0.6, frx: -1.6, llx: -0.9, slx: 0.9, lrx: 0.5, srx: 0.8 }],
      [0.4, { hy: -0.2, tx: 0.55, ty: -0.35, alx: -1.5, alz: -0.35, flx: -1.6, arx: -0.6, frx: -1.6, llx: -0.9, slx: 0.9, lrx: 0.5, srx: 0.8 }],
      [0.62, S],
    ],
    hits: [{ t0: 0.1, t1: 0.36, fwd: 0.85, up: 1.0, r: 0.85, dmg: 11, kb: 16, lift: 7, launch: true, power: 2, guardBreak: true, snd: 'heavy' }],
    lunge: [0.08, 0.36, 13],
    events: [[0.0, 'whiffHeavy']],
  },
  doriLift: {
    dur: 0.56, chain: 0.5, armor: true, hop: 9,
    frames: [
      [0, CROUCH],
      [0.1, { hy: 0.1, tx: -0.3, alx: -2.8, alz: -0.2, flx: -0.4, arx: -2.4, frx: -0.4, llx: -0.2, slx: 0.3, lrx: 0.5, srx: 0.6 }],
      [0.4, { hy: 0.1, tx: -0.3, alx: -2.8, flx: -0.4, arx: -2.4, frx: -0.4, ...TUCK }],
      [0.56, { tx: 0.1, ...TUCK, alx: -1.2, flx: -1.6 }],
    ],
    hits: [{ t0: 0.06, t1: 0.18, fwd: 0.85, up: 1.2, r: 0.9, dmg: 10, kb: 2.5, lift: 15.5, launch: true, chase: true, power: 2, snd: 'heavy' }],
    events: [[0.06, 'hop']],
  },
  doriDrop: {
    dur: 0.9, chain: 0.9, air: true, dive: [4, -24], land: 'doriLand',
    frames: [
      [0, { tx: -0.3, alx: -2.6, arx: -2.6, ...TUCK }],
      [0.12, { tx: 0.5, alx: -1.4, alz: -0.3, flx: -1.5, arx: -1.0, frx: -1.4, llx: -1.2, slx: 1.3, lrx: -1.2, srx: 1.3 }],
      [0.9, { tx: 0.5, alx: -1.4, alz: -0.3, flx: -1.5, arx: -1.0, frx: -1.4, llx: -1.2, slx: 1.3, lrx: -1.2, srx: 1.3 }],
    ],
    hits: [{ t0: 0.04, t1: 0.9, fwd: 0.4, up: 0.3, r: 0.95, dmg: 8, kb: 5, lift: 0, spike: true, power: 2, snd: 'heavy' }],
  },

  // ---------- 하루: 슈터 견제 ----------
  haruShot: {
    dur: 0.36, chain: 0.3,
    frames: [
      [0, S],
      [0.06, { hy: -0.05, ty: -0.3, alx: -1.57, alz: -0.1, flx: -0.05, arx: -1.5, arz: 0.25, frx: -1.2, llx: -0.4, lrx: 0.3, slx: 0.4, srx: 0.3 }],
      [0.22, { hy: -0.05, ty: -0.3, alx: -1.57, alz: -0.1, flx: -0.05, arx: -0.9, arz: 0.1, frx: -0.6, llx: -0.4, lrx: 0.3, slx: 0.4, srx: 0.3 }],
      [0.36, S],
    ],
    events: [[0.11, 'sling']],
  },
  haruKick: {
    dur: 0.52, chain: 0.46, hop: 9,
    frames: [
      [0, CROUCH],
      [0.08, { hy: 0.1, tx: -0.35, lrx: -2.3, srx: 0.1, llx: 0.3, slx: 0.8, alz: 1.0, arz: -1.0, flx: -1, frx: -1 }],
      [0.36, { hy: 0.1, tx: -0.3, lrx: -2.2, srx: 0.2, llx: 0.3, slx: 0.8, alz: 1.0, arz: -1.0, flx: -1, frx: -1 }],
      [0.52, { tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.06, t1: 0.17, fwd: 0.8, up: 1.15, r: 0.8, dmg: 9, kb: 2, lift: 15, launch: true, chase: true, power: 2, snd: 'kick' }],
    events: [[0.05, 'hop']],
  },
  haruVolley: {
    dur: 0.46, chain: 0.4,
    frames: [
      [0, { hy: -0.3, tx: 0.3, llx: -0.8, slx: 1.2 }],
      [0.08, { hy: -0.2, ty: -0.3, alx: -1.57, flx: -0.05, arx: -1.4, arz: 0.3, frx: -1.2, llx: -0.6, lrx: 0.4, slx: 0.8, srx: 0.5 }],
      [0.34, { hy: -0.2, ty: 0.3, alx: -1.57, flx: -0.05, arx: -0.8, frx: -0.5, llx: -0.6, lrx: 0.4, slx: 0.8, srx: 0.5 }],
      [0.46, S],
    ],
    events: [[0.1, 'slingFan']],
  },
  haruAirShot: {
    dur: 0.46, chain: 0.4, air: true, hang: 5, floatT: 0.4,
    frames: [
      [0, { tx: 0.4, nx: 0.4, alx: -1.0, flx: -0.05, arx: -0.8, frx: -1.0, ...TUCK }],
      [0.3, { tx: 0.45, nx: 0.4, alx: -1.0, flx: -0.05, arx: -0.4, frx: -0.4, ...TUCK }],
      [0.46, { tx: 0.1, ...TUCK }],
    ],
    events: [[0.1, 'slingDown']],
  },

  // ---------- 타로: 그래플러 ----------
  taroGrab: {
    dur: 0.6, chain: 0.56,
    frames: [
      [0, S],
      [0.08, { hy: -0.2, tx: 0.5, alx: -1.5, alz: -0.3, flx: -0.4, arx: -1.5, arz: 0.3, frx: -0.4, llx: -0.7, slx: 0.9, lrx: 0.4, srx: 0.7 }],
      [0.2, { hy: -0.1, tx: -0.6, nx: -0.4, alx: -2.9, flx: -0.5, arx: -2.9, frx: -0.5, llx: -0.2, slx: 0.4, lrx: 0.3, srx: 0.4 }],
      [0.42, { hy: -0.15, tx: -0.5, alx: -2.6, flx: -0.6, arx: -2.6, frx: -0.6, llx: -0.3, slx: 0.5, lrx: 0.3, srx: 0.5 }],
      [0.6, S],
    ],
    hits: [{ t0: 0.07, t1: 0.16, fwd: 0.75, up: 1.0, r: 0.7, dmg: 13, kb: 9, lift: 13, launch: true, chase: true, grab: true, guardBreak: true, power: 2, snd: 'heavy' }],
    lunge: [0.02, 0.1, 6],
  },
  taroLift: {
    dur: 0.56, chain: 0.5, armor: true, hop: 8,
    frames: [
      [0, CROUCH],
      [0.1, { hy: 0.1, tx: -0.4, alx: -2.9, flx: -0.4, arx: -2.9, frx: -0.4, llx: -0.2, slx: 0.3, lrx: 0.4, srx: 0.5 }],
      [0.4, { hy: 0.1, tx: -0.35, alx: -2.8, flx: -0.4, arx: -2.8, frx: -0.4, ...TUCK }],
      [0.56, { tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.06, t1: 0.18, fwd: 0.8, up: 1.2, r: 0.85, dmg: 11, kb: 2, lift: 15.5, launch: true, chase: true, power: 2, snd: 'heavy' }],
    events: [[0.06, 'hop']],
  },
  taroDashGrab: {
    dur: 0.66, chain: 0.62,
    frames: [
      [0, { hy: -0.25, tx: 0.7, alx: -1.5, alz: -0.3, flx: -0.3, arx: -1.5, arz: 0.3, frx: -0.3, llx: -0.8, slx: 0.8, lrx: 0.6, srx: 0.8 }],
      [0.28, { hy: -0.25, tx: 0.7, alx: -1.5, alz: -0.3, flx: -0.3, arx: -1.5, arz: 0.3, frx: -0.3, llx: -0.8, slx: 0.8, lrx: 0.6, srx: 0.8 }],
      [0.4, { hy: -0.1, tx: -0.6, nx: -0.4, alx: -2.9, flx: -0.5, arx: -2.9, frx: -0.5, llx: -0.2, slx: 0.4, lrx: 0.3, srx: 0.4 }],
      [0.66, S],
    ],
    hits: [{ t0: 0.04, t1: 0.3, fwd: 0.8, up: 1.0, r: 0.75, dmg: 12, kb: 10, lift: 12, launch: true, chase: true, grab: true, guardBreak: true, power: 2, snd: 'heavy' }],
    lunge: [0, 0.3, 14],
  },
  taroPress: {
    dur: 0.9, chain: 0.9, air: true, dive: [6, -22], land: 'pressLand',
    frames: [
      [0, { tx: -0.2, alz: 1.4, arz: -1.4, llx: -0.6, slx: 0.8, lrx: -0.6, srx: 0.8 }],
      [0.12, { hx: 0.9, tx: 0.4, alz: 1.5, arz: -1.5, alx: -0.3, arx: -0.3, llx: -0.2, slx: 0.3, lrx: -0.2, srx: 0.3 }],
      [0.9, { hx: 0.9, tx: 0.4, alz: 1.5, arz: -1.5, alx: -0.3, arx: -0.3, llx: -0.2, slx: 0.3, lrx: -0.2, srx: 0.3 }],
    ],
    hits: [{ t0: 0.04, t1: 0.9, fwd: 0.5, up: 0.3, r: 1.0, dmg: 9, kb: 5, lift: 0, spike: true, power: 2, snd: 'heavy' }],
  },
  // 버티기 반격이 발동했을 때의 되받아치기 모션 (판정은 game.counterStrike 가 처리)
  taroCounter: {
    dur: 0.42, chain: 0.4,
    frames: [
      [0, { hy: -0.2, tx: 0.5, alx: -1.5, flx: -0.4, arx: -1.5, frx: -0.4, llx: -0.7, slx: 0.9, lrx: 0.4, srx: 0.7 }],
      [0.14, { hy: -0.1, tx: -0.6, nx: -0.4, alx: -2.9, flx: -0.5, arx: -2.9, frx: -0.5, llx: -0.2, slx: 0.4, lrx: 0.3, srx: 0.4 }],
      [0.42, S],
    ],
  },

  // ---------- 루나: 컨트롤러 ----------
  lunaTrap: {
    dur: 0.4, chain: 0.34,
    frames: [
      [0, S],
      [0.1, { hy: -0.25, tx: 0.6, nx: 0.3, arx: -0.9, frx: -0.3, alx: -0.6, flx: -1.2, llx: -0.8, slx: 1.1, lrx: 0.4, srx: 0.8 }],
      [0.28, { hy: -0.25, tx: 0.6, nx: 0.3, arx: -0.7, frx: -0.2, alx: -0.6, flx: -1.2, llx: -0.8, slx: 1.1, lrx: 0.4, srx: 0.8 }],
      [0.4, S],
    ],
    events: [[0.14, 'trap']],
  },
  lunaRise: {
    dur: 0.56, chain: 0.5, hop: 11,
    frames: [
      [0, CROUCH],
      [0.1, { hy: 0.1, tx: -0.2, alx: -2.9, arx: -2.9, alz: 0.3, arz: -0.3, ...TUCK }],
      [0.4, { hy: 0.1, hry: 6.283, tx: -0.2, alx: -2.9, arx: -2.9, alz: 0.3, arz: -0.3, ...TUCK }],
      [0.56, { hry: 6.283, tx: 0.1, ...TUCK }],
    ],
    hits: [{ t0: 0.06, t1: 0.2, fwd: 0.6, up: 1.3, r: 1.0, radial: 0.5, dmg: 9, kb: 2, lift: 15.5, launch: true, chase: true, power: 2, snd: 'kick' }],
    events: [[0.06, 'hop']],
  },
  lunaDrop: {
    dur: 0.44, chain: 0.4, air: true, hang: 4.5, floatT: 0.4,
    frames: [
      [0, { tx: 0.3, nx: 0.4, arx: -0.6, frx: -0.2, ...TUCK }],
      [0.2, { tx: 0.45, nx: 0.5, arx: 0.2, frx: -0.1, ...TUCK }],
      [0.44, { tx: 0.1, ...TUCK }],
    ],
    events: [[0.12, 'trapDrop']],
  },

  // ---------- 스킬 2: 방어 기술 ----------
  // guard/parry 는 state 'guard' 로 처리하고, 나머지는 짧은 무적/반격 기술
  rollDodge: {
    dur: 0.4, chain: 0.4, iv: [0, 0.3], dodge: true,
    frames: [
      [0, { hy: -0.45, tx: 0.8, nx: 0.5, alx: -2, arx: -2, llx: -1.6, slx: 2.2, lrx: -1.6, srx: 2.2 }],
      [0.3, { hy: -0.45, hx: 6.283, tx: 0.8, nx: 0.5, alx: -2, arx: -2, llx: -1.6, slx: 2.2, lrx: -1.6, srx: 2.2 }],
      [0.4, { ...S, hx: 6.283 }],
    ],
    lunge: [0, 0.3, 15],
  },
  backFlip: {
    dur: 0.42, chain: 0.3, iv: [0, 0.34], hop: 10.5, hopBack: 7.5, dodge: true,
    frames: [
      [0, CROUCH],
      [0.08, { hx: 1.4, tx: -0.3, ...TUCK, alz: 1.0, arz: -1.0 }],
      [0.34, { hx: 6.283, tx: 0.2, ...TUCK, alz: 0.8, arz: -0.8 }],
      [0.42, { hx: 6.283, tx: 0.1, ...TUCK }],
    ],
    events: [[0.02, 'hop']],
  },
  smokeStep: {
    dur: 0.36, chain: 0.3, iv: [0, 0.24], dodge: true,
    frames: [
      [0, { hy: -0.2, tx: -0.4, nx: -0.2, alx: -1.2, flx: -1.6, arx: -1.2, frx: -1.6, llx: 0.3, slx: 0.5, lrx: -0.5, srx: 0.8 }],
      [0.24, { hy: -0.2, tx: -0.3, alx: -1.0, flx: -1.5, arx: -1.0, frx: -1.5, llx: 0.2, slx: 0.4, lrx: -0.4, srx: 0.7 }],
      [0.36, S],
    ],
    lunge: [0, 0.22, -15],
    events: [[0.0, 'smoke']],
  },
  barrierCast: {
    dur: 0.24, chain: 0.2,
    frames: [
      [0, S],
      [0.08, { hy: -0.2, tx: 0.2, alx: -1.8, alz: -0.6, flx: -0.3, arx: -1.8, arz: 0.6, frx: -0.3, llx: -0.5, slx: 0.7, lrx: 0.4, srx: 0.5 }],
      [0.24, P.guard],
    ],
    events: [[0.02, 'barrier']],
  },
  brace: {
    dur: 0.62, chain: 0.62, counter: [0, 0.5],
    frames: [
      [0, S],
      [0.06, { hy: -0.32, tx: 0.35, nx: 0.25, alx: -1.3, alz: -0.4, flx: -1.9, arx: -1.3, arz: 0.4, frx: -1.9, llx: -0.9, llz: 0.25, slx: 1.2, lrx: 0.5, lrz: -0.25, srx: 1.0 }],
      [0.5, { hy: -0.32, tx: 0.35, nx: 0.25, alx: -1.3, alz: -0.4, flx: -1.9, arx: -1.3, arz: 0.4, frx: -1.9, llx: -0.9, llz: 0.25, slx: 1.2, lrx: 0.5, lrz: -0.25, srx: 1.0 }],
      [0.62, S],
    ],
    events: [[0.0, 'brace']],
  },
  blinkStep: {
    dur: 0.22, chain: 0.16, iv: [0, 0.22], dodge: true,
    frames: [
      [0, { hy: -0.1, tx: 0.2, alz: 1.2, arz: -1.2 }],
      [0.22, S],
    ],
    events: [[0.0, 'blink']],
  },
  // 브레이크 버스트: 연속 피격 중 스킬 2 로 탈출
  burst: {
    dur: 0.3, chain: 0.26, iv: [0, 0.3],
    frames: [
      [0, { hy: -0.1, tx: -0.3, alx: -0.4, alz: 1.5, arx: -0.4, arz: -1.5, llx: -0.3, slx: 0.4, lrx: 0.3, srx: 0.4 }],
      [0.3, S],
    ],
  },
};

// ---------------- 타이밍 다듬기 ----------------
// 전체 타임라인(키프레임, 판정, 전진, 이벤트)을 k 배로 줄인다. 전진 거리는 유지되도록 속도를 1/k 배
function quicken(def, k) {
  def.dur *= k;
  def.chain *= k;
  def.frames = def.frames.map(([t, p]) => [t * k, p]);
  if (def.hits) def.hits = def.hits.map((h) => ({ ...h, t0: h.t0 * k, t1: h.t1 * k, every: h.every ? h.every * k : h.every }));
  if (def.lunge) def.lunge = [def.lunge[0] * k, def.lunge[1] * k, def.lunge[2] / k];
  if (def.events) def.events = def.events.map(([t, e]) => [t * k, e]);
  if (def.iv) def.iv = [def.iv[0] * k, def.iv[1] * k];
  if (def.hold) def.hold = [def.hold[0] * k, def.hold[1]];
  if (def.counter) def.counter = [def.counter[0] * k, def.counter[1] * k];
}
// 무겁게 느껴지던 기술의 선딜/후딜을 줄인다 (60Hz 고정 스텝 기준 1~5 프레임)
const QUICK = {
  kick3: 0.86, heavy: 0.85, tackle: 0.86, summon: 0.78, airKick: 0.9, airSpike: 0.88, air1: 0.94, air2: 0.94,
  ricoCharge: 0.88, ricoUpper: 0.92, ricoRush: 0.88, mimiHop: 0.92, mimiRoll: 0.88, mimiBoomerang: 0.9,
  junSweep: 0.88, junKnee: 0.92, junSlide: 0.88, junAxe: 0.9, soraSpin: 0.9, soraFlip: 0.92, soraKnee: 0.88, soraSwallow: 0.92,
};
for (const [k, v] of Object.entries(QUICK)) if (HUMAN_ACTS[k]) quicken(HUMAN_ACTS[k], v);

// ---------------- 로봇 ----------------
const RS = { hy: -0.1, tx: 0.1, alx: -0.5, flx: -1.1, alz: 0.22, arx: -0.5, frx: -1.1, arz: -0.22, llx: -0.2, lrx: 0.15, slx: 0.3, srx: 0.25 };
export const ROBOT_STANCE = RS;

export const ROBOT_ACTS = {
  // --- 캐럿 타이탄 ---
  tp1: {
    dur: 0.42, chain: 0.2, next: 'tp2',
    frames: [
      [0, RS],
      [0.09, { hy: -0.12, tx: 0.25, ty: -0.65, alx: -1.62, alz: 0.05, flx: -0.04, arx: -0.9, frx: -1.9, arz: -0.3, llx: -0.5, lrx: 0.4, slx: 0.4, srx: 0.45 }],
      [0.22, { hy: -0.12, tx: 0.25, ty: -0.6, alx: -1.58, flx: -0.08, arx: -0.9, frx: -1.9, arz: -0.3, llx: -0.5, lrx: 0.4, slx: 0.4, srx: 0.45 }],
      [0.42, RS],
    ],
    hits: [{ t0: 0.07, t1: 0.17, fwd: 3.3, up: 3.0, r: 1.9, dmg: 13, kb: 12, lift: 6, stun: 0.5, power: 2, snd: 'robotPunch' }],
    lunge: [0, 0.12, 9],
  },
  tp2: {
    dur: 0.68, chain: 0.6,
    frames: [
      [0, { ty: -0.6, alx: -1.3, flx: -0.5 }],
      [0.13, { hy: -0.1, ty: -0.7, tx: 0.05, arx: 0.6, frx: -1.8, arz: -0.3, alx: -1.3, flx: -1.4 }],
      [0.22, { hy: -0.22, ty: 0.75, tx: 0.32, arx: -1.66, frx: -0.02, arz: -0.05, alx: -0.8, flx: -2, alz: 0.4, llx: -0.65, lrx: 0.55, slx: 0.5, srx: 0.3 }],
      [0.42, { hy: -0.22, ty: 0.7, tx: 0.3, arx: -1.6, frx: -0.05, alx: -0.8, flx: -2, alz: 0.4, llx: -0.65, lrx: 0.55, slx: 0.5, srx: 0.3 }],
      [0.68, RS],
    ],
    hits: [{ t0: 0.18, t1: 0.29, fwd: 3.5, up: 3.0, r: 2.1, dmg: 18, kb: 27, lift: 13, launch: true, power: 3, snd: 'robotHeavy' }],
    lunge: [0.14, 0.26, 12],
  },
  rocket: {
    dur: 0.75, chain: 0.75,
    frames: [
      [0, RS],
      [0.16, { ty: -0.6, tx: 0, hy: -0.15, arx: 0.5, frx: -1.8, alx: -1.2, flx: -1.5, llx: -0.4, lrx: 0.4, slx: 0.5, srx: 0.5 }],
      [0.24, { ty: 0.6, tx: 0.25, hy: -0.2, arx: -1.62, frx: 0, alx: -0.9, flx: -1.8, llx: -0.6, lrx: 0.6, slx: 0.6, srx: 0.3 }],
      [0.6, { ty: 0.55, tx: 0.2, hy: -0.2, arx: -1.6, frx: 0, alx: -0.9, flx: -1.8, llx: -0.6, lrx: 0.6, slx: 0.6, srx: 0.3 }],
      [0.75, RS],
    ],
    events: [[0.0, 'charge'], [0.23, 'rocketFist']],
  },
  stomp: {
    dur: 1.25, chain: 1.25, special: 'stomp',
    frames: [
      [0, RS],
      [0.14, { hy: -0.55, tx: 0.45, llx: -0.8, lrx: -0.8, slx: 1.3, srx: 1.3, alx: 0.4, arx: 0.4, alz: 0.4, arz: -0.4 }],
      [0.35, { hy: 0, tx: -0.25, llx: -0.5, lrx: 0.2, slx: 0.7, srx: 1.0, alx: -2.9, arx: -2.9, alz: 0.35, arz: -0.35, flx: -0.4, frx: -0.4, ex: 0.5 }],
      [0.8, { hy: 0, tx: -0.2, llx: -0.5, lrx: 0.2, slx: 0.7, srx: 1.0, alx: -3.0, arx: -3.0, alz: 0.3, arz: -0.3, flx: -0.3, frx: -0.3, ex: 0.6 }],
      [0.86, { hy: -0.62, tx: 0.7, nx: 0.3, alx: -0.7, arx: -0.7, flx: -0.2, frx: -0.2, alz: 0.1, arz: -0.1, llx: -1.1, slx: 1.5, lrx: 0.6, srx: 1.3, ex: -0.4 }],
      [1.1, { hy: -0.62, tx: 0.7, alx: -0.7, arx: -0.7, llx: -1.1, slx: 1.5, lrx: 0.6, srx: 1.3 }],
      [1.25, RS],
    ],
    events: [[0.0, 'ultimate'], [0.15, 'stompJump']],
  },

  // --- 볼트 헤어 ---
  bk1: {
    dur: 0.3, chain: 0.13, next: 'bk2',
    frames: [
      [0, RS],
      [0.06, { tx: -0.25, lrx: -1.55, srx: 0.08, llx: 0.1, slx: 0.2, alx: -0.4, alz: 0.55, arx: -0.4, arz: -0.55, flx: -1.2, frx: -1.2 }],
      [0.16, { tx: -0.25, lrx: -1.5, srx: 0.1, llx: 0.1, slx: 0.2, alz: 0.55, arz: -0.55, flx: -1.2, frx: -1.2 }],
      [0.3, RS],
    ],
    hits: [{ t0: 0.04, t1: 0.13, fwd: 3.0, up: 2.4, r: 1.8, dmg: 9, kb: 9, lift: 4, stun: 0.45, power: 2, snd: 'robotPunch' }],
    lunge: [0, 0.1, 10],
  },
  bk2: {
    dur: 0.3, chain: 0.13, next: 'bk3',
    frames: [
      [0, { lrx: -0.5 }],
      [0.06, { tx: -0.25, llx: -1.55, slx: 0.08, lrx: 0.1, srx: 0.2, alz: 0.55, arz: -0.55, flx: -1.2, frx: -1.2 }],
      [0.16, { tx: -0.25, llx: -1.5, slx: 0.1, lrx: 0.1, srx: 0.2, alz: 0.55, arz: -0.55, flx: -1.2, frx: -1.2 }],
      [0.3, RS],
    ],
    hits: [{ t0: 0.04, t1: 0.13, fwd: 3.0, up: 2.4, r: 1.8, dmg: 9, kb: 9, lift: 4, stun: 0.45, power: 2, snd: 'robotPunch' }],
    lunge: [0, 0.1, 10],
  },
  bk3: {
    dur: 0.6, chain: 0.6,
    frames: [
      [0, RS],
      [0.1, { hy: 0.35, hry: 3.14, tx: -0.3, lrx: -1.6, srx: 0.05, llx: 0.2, slx: 0.9, alz: 1.0, arz: -1.0 }],
      [0.2, { hy: 0.35, hry: 6.283, tx: -0.3, lrx: -1.6, srx: 0.05, llx: 0.2, slx: 0.9, alz: 1.0, arz: -1.0 }],
      [0.6, { ...RS, hry: 6.283 }],
    ],
    hits: [{ t0: 0.08, t1: 0.22, fwd: 2.6, up: 2.6, r: 2.4, dmg: 15, kb: 25, lift: 13, launch: true, power: 3, snd: 'robotHeavy', radial: 0.4 }],
    lunge: [0, 0.15, 8],
  },
  drill: {
    dur: 0.82, chain: 0.82,
    frames: [
      [0, { hy: -0.25, tx: 0.8, nx: 0.35, ex: 1.45, alx: 0.7, arx: 0.7, alz: 0.3, arz: -0.3, llx: 0.4, lrx: 0.6, slx: 0.7, srx: 0.7 }],
      [0.7, { hy: -0.25, tx: 0.8, nx: 0.35, ex: 1.5, alx: 0.7, arx: 0.7, alz: 0.3, arz: -0.3, llx: 0.4, lrx: 0.6, slx: 0.7, srx: 0.7 }],
      [0.82, RS],
    ],
    hits: [
      { t0: 0.05, t1: 0.6, fwd: 2.6, up: 3.6, r: 2.0, dmg: 4, kb: 26, lift: 2, stun: 0.35, power: 2, every: 0.08, snd: 'robotPunch' },
      { t0: 0.6, t1: 0.72, fwd: 2.8, up: 3.4, r: 2.4, dmg: 10, kb: 27, lift: 13, launch: true, power: 3, snd: 'robotHeavy' },
    ],
    lunge: [0.04, 0.62, 30],
    events: [[0.0, 'spin'], [0.02, 'dashFx']],
    boost: true,
  },
  tornado: {
    dur: 1.4, chain: 1.4, spin: 17, steer: 7,
    frames: [
      [0, { hy: 0.1, tx: -0.1, alz: 1.45, arz: -1.45, flx: 0, frx: 0, lrx: -1.25, srx: 0.05, llx: 0.1, slx: 0.4 }],
      [1.3, { hy: 0.1, tx: -0.1, alz: 1.45, arz: -1.45, lrx: -1.25, srx: 0.05, llx: 0.1, slx: 0.4 }],
      [1.4, RS],
    ],
    hits: [
      { t0: 0.1, t1: 1.15, fwd: 0, up: 2.4, r: 4.3, dmg: 4, kb: 2, lift: 5, stun: 0.3, power: 2, every: 0.14, radial: 1, snd: 'robotPunch' },
      { t0: 1.15, t1: 1.25, fwd: 0, up: 2.4, r: 4.8, dmg: 12, kb: 26, lift: 14, launch: true, power: 3, radial: 1, snd: 'robotHeavy' },
    ],
    events: [[0.0, 'ultimate'], [0.05, 'spin'], [0.7, 'spin']],
  },

  // --- 문 캐논 ---
  blaster: {
    dur: 0.5, chain: 0.42, next: 'blaster',
    frames: [
      [0, RS],
      [0.05, { tx: 0.1, alx: -1.57, arx: -1.57, flx: -0.02, frx: -0.02, alz: -0.05, arz: 0.05, llx: -0.4, lrx: 0.35, slx: 0.4, srx: 0.4 }],
      [0.42, { tx: 0.1, alx: -1.57, arx: -1.57, flx: -0.02, frx: -0.02, alz: -0.05, arz: 0.05, llx: -0.4, lrx: 0.35, slx: 0.4, srx: 0.4 }],
      [0.5, RS],
    ],
    events: [[0.05, 'shotR'], [0.19, 'shotL'], [0.33, 'shotR']],
  },
  missiles: {
    dur: 0.95, chain: 0.95,
    frames: [
      [0, RS],
      [0.12, { tx: -0.22, nx: -0.2, alz: 0.4, arz: -0.4, alx: -0.2, arx: -0.2, hy: -0.15, llx: -0.4, lrx: 0.4, slx: 0.5, srx: 0.5 }],
      [0.8, { tx: -0.22, nx: -0.2, alz: 0.4, arz: -0.4, alx: -0.2, arx: -0.2, hy: -0.15, llx: -0.4, lrx: 0.4, slx: 0.5, srx: 0.5 }],
      [0.95, RS],
    ],
    events: [[0.12, 'missile'], [0.21, 'missile'], [0.3, 'missile'], [0.39, 'missile'], [0.48, 'missile'], [0.57, 'missile']],
  },
  laser: {
    dur: 2.7, chain: 2.7, special: 'laser',
    frames: [
      [0, RS],
      [0.6, { tx: -0.35, nx: -0.4, hy: -0.3, alx: -0.4, arx: -0.4, alz: 0.7, arz: -0.7, llx: -0.5, lrx: 0.5, slx: 0.6, srx: 0.6, ex: 0.7 }],
      [0.82, { tx: 0.12, nx: 0.12, hy: -0.4, alx: 0.35, arx: 0.35, alz: 0.9, arz: -0.9, flx: -0.3, frx: -0.3, llx: -0.65, lrx: 0.65, slx: 0.85, srx: 0.85, ex: 0.9 }],
      [2.5, { tx: 0.12, nx: 0.12, hy: -0.4, alx: 0.35, arx: 0.35, alz: 0.9, arz: -0.9, flx: -0.3, frx: -0.3, llx: -0.65, lrx: 0.65, slx: 0.85, srx: 0.85, ex: 0.9 }],
      [2.7, RS],
    ],
    events: [[0.0, 'ultimate'], [0.05, 'charge'], [0.82, 'laserOn'], [2.45, 'laserOff']],
  },

  // --- 해머 버니 ---
  hs1: {
    dur: 0.72, chain: 0.34, next: 'hs2',
    frames: [
      [0, RS],
      [0.2, { hy: -0.2, ty: -1.2, tx: 0.05, arz: -1.45, arx: -0.5, frx: -0.2, alx: -0.9, flx: -1.4, llx: -0.4, lrx: 0.4, slx: 0.5, srx: 0.5 }],
      [0.31, { hy: -0.28, ty: 1.15, tx: 0.25, arz: -1.4, arx: -1.25, frx: -0.1, alx: -0.6, flx: -1.4, llx: -0.6, lrx: 0.5, slx: 0.6, srx: 0.5 }],
      [0.45, { hy: -0.28, ty: 1.1, tx: 0.25, arz: -1.35, arx: -1.2, frx: -0.1, alx: -0.6, flx: -1.4, llx: -0.6, lrx: 0.5, slx: 0.6, srx: 0.5 }],
      [0.72, RS],
    ],
    hits: [{ t0: 0.22, t1: 0.34, fwd: 2.9, up: 2.2, r: 3.7, dmg: 16, kb: 21, lift: 9, launch: true, power: 2, snd: 'robotHeavy', radial: 0.5 }],
    lunge: [0.18, 0.3, 8],
  },
  hs2: {
    dur: 0.9, chain: 0.9,
    frames: [
      [0, { ty: 0.8, arz: -1.2, arx: -1.0 }],
      [0.27, { hy: 0.05, tx: -0.4, arx: -3.1, frx: -0.35, arz: -0.1, alx: -2.8, flx: -0.45, alz: 0.1, llx: -0.3, lrx: 0.3, slx: 0.3, srx: 0.3, ex: 0.4 }],
      [0.37, { hy: -0.45, tx: 0.65, arx: -1.15, frx: 0, alx: -1.05, flx: -0.1, llx: -0.7, slx: 0.9, lrx: 0.55, srx: 0.7, ex: -0.3 }],
      [0.6, { hy: -0.45, tx: 0.65, arx: -1.1, frx: 0, alx: -1.0, flx: -0.1, llx: -0.7, slx: 0.9, lrx: 0.55, srx: 0.7 }],
      [0.9, RS],
    ],
    hits: [{ t0: 0.33, t1: 0.42, fwd: 4.4, up: 0.8, r: 2.6, dmg: 22, kb: 14, lift: 19, launch: true, power: 3, snd: 'robotHeavy' }],
    lunge: [0.25, 0.35, 6],
    events: [[0.35, 'smash']],
  },
  hspin: {
    dur: 2.0, chain: 2.0, spin: 13, steer: 6.5,
    frames: [
      [0, { hy: -0.15, tx: 0.1, arz: -1.5, arx: -0.35, frx: -0.05, alz: 1.2, alx: -0.3, llx: -0.3, lrx: 0.3, slx: 0.4, srx: 0.4 }],
      [1.85, { hy: -0.15, tx: 0.1, arz: -1.5, arx: -0.35, frx: -0.05, alz: 1.2, alx: -0.3, llx: -0.3, lrx: 0.3, slx: 0.4, srx: 0.4 }],
      [2.0, RS],
    ],
    hits: [{ t0: 0.12, t1: 1.9, fwd: 0, up: 2.0, r: 5.3, dmg: 8, kb: 17, lift: 8, launch: true, power: 2, every: 0.24, radial: 1, snd: 'robotHeavy' }],
    events: [[0.0, 'spin'], [0.6, 'spin'], [1.2, 'spin']],
  },
  megaSlam: {
    dur: 1.6, chain: 1.6,
    frames: [
      [0, RS],
      [0.55, { hy: 0.1, tx: -0.5, nx: -0.35, arx: -3.1, alx: -3.1, frx: -0.2, flx: -0.2, alz: 0.1, arz: -0.1, llx: -0.3, lrx: 0.3, slx: 0.3, srx: 0.3, ex: 0.6 }],
      [0.7, { hy: 0.12, tx: -0.55, nx: -0.35, arx: -3.15, alx: -3.15, frx: -0.2, flx: -0.2, alz: 0.1, arz: -0.1, llx: -0.3, lrx: 0.3, slx: 0.3, srx: 0.3, ex: 0.7 }],
      [0.78, { hy: -0.6, tx: 0.8, nx: 0.2, arx: -1.1, alx: -1.1, frx: 0, flx: 0, llx: -0.85, slx: 1.15, lrx: 0.65, srx: 0.85, ex: -0.5 }],
      [1.3, { hy: -0.6, tx: 0.8, arx: -1.1, alx: -1.1, llx: -0.85, slx: 1.15, lrx: 0.65, srx: 0.85 }],
      [1.6, RS],
    ],
    events: [[0.0, 'ultimate'], [0.1, 'charge'], [0.77, 'megaSlam']],
  },
};

// 로봇 기본 콤보와 스킬도 조금 더 빠르게
const RQUICK = { tp1: 0.9, tp2: 0.86, bk3: 0.9, hs1: 0.86, hs2: 0.86, rocket: 0.9, missiles: 0.92, stomp: 0.92, megaSlam: 0.92, drill: 0.94 };
for (const [k, v] of Object.entries(RQUICK)) if (ROBOT_ACTS[k]) quicken(ROBOT_ACTS[k], v);

export const ROBOT_MOVES = {
  titan: { combo: 'tp1', k: 'rocket', l: 'stomp' },
  bolt: { combo: 'bk1', k: 'drill', l: 'tornado' },
  cannon: { combo: 'blaster', k: 'missiles', l: 'laser' },
  hammer: { combo: 'hs1', k: 'hspin', l: 'megaSlam' },
};

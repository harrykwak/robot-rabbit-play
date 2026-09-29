// 로봇 래빗 (Robot Rabbit) — 절차적 WebAudio 사운드 엔진
// 에셋 파일 없이 모든 효과음과 음악을 실시간으로 합성한다.
// 신호 흐름:
//   효과음 voice -> (panner) -> sfxBus ─┐
//   음악 track  -> musicBus -> duck ────┼-> master(gain) -> DynamicsCompressor -> destination
//   reverb send -> Convolver -> verbOut ┘
// 타격감: sub-bass 사인 피치 드롭 + 노이즈 크랙 + WaveShaper 디스토션 + 음악 ducking.

// ───────────────────────── 상태 ─────────────────────────
let ctx = null;
let master, comp, sfxBus, musicBus, duckGain, verbIn;
let noiseBuf = null;
const curveCache = new Map();

let masterVol = 0.8;
let musicVol = 0.45;

const MAX_VOICES = 24;      // 동시 효과음 수 제한
const RETRIGGER_GAP = 0.018; // 같은 이름 연타 최소 간격(초)
let voices = 0;
const lastPlay = Object.create(null);
let curVol = 1;              // 현재 빌드 중인 voice 볼륨 (ducking 강도에 사용)

// 음악
let curKind = null;  // 원하는 음악 종류 (unlock 전이면 대기)
let curTrack = null; // 재생 중 track
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

// ───────────────────────── 유틸 ─────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const nyq = () => ctx.sampleRate * 0.45;
const fq = (f) => clamp(f, 10, nyq());

function debug(e) {
  if (globalThis.__AUDIO_DEBUG) console.warn('[audio]', e);
}

// ───────────────────────── 초기화 ─────────────────────────
function build() {
  master = ctx.createGain();
  master.gain.value = masterVol;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  master.connect(comp);
  comp.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.7; // 레이어가 두꺼우므로 헤드룸 확보
  sfxBus.connect(master);

  duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  duckGain.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicVol;
  musicBus.connect(duckGain);

  // 재사용 화이트 노이즈 버퍼 (2초)
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

  // 간단한 리버브: 지수 감쇠 노이즈 임펄스 응답
  const irLen = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  verbIn = ctx.createGain();
  verbIn.gain.value = 1;
  const verbLp = ctx.createBiquadFilter();
  verbLp.type = 'lowpass';
  verbLp.frequency.value = 5000;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verbIn.connect(conv);
  conv.connect(verbLp);
  verbLp.connect(verbOut);
  verbOut.connect(master);

  // iOS 언락용 무음 버퍼
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
  } catch (e) { debug(e); }
}

function onState() {
  try {
    if (ctx && ctx.state === 'running' && curKind && !curTrack) launchTrack(curKind);
  } catch (e) { debug(e); }
}

// ───────────────────────── 공개 API ─────────────────────────
export function unlock() {
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
      build();
      ctx.onstatechange = onState;
    }
    if (ctx.state !== 'running' && ctx.state !== 'closed' && ctx.resume) {
      const pr = ctx.resume();
      if (pr && pr.then) pr.then(onState, debug);
    }
    onState();
  } catch (e) { debug(e); }
}

export function isUnlocked() {
  return !!ctx && ctx.state === 'running';
}

// A background mobile tab must not keep playing; the next gesture resumes it.
export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(debug);
}

export function setVolume(m, mu) {
  if (typeof m === 'number' && Number.isFinite(m)) masterVol = clamp(m, 0, 1);
  if (typeof mu === 'number' && Number.isFinite(mu)) musicVol = clamp(mu, 0, 1);
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(masterVol, now, 0.03);
    musicBus.gain.setTargetAtTime(musicVol, now, 0.03);
  } catch (e) { debug(e); }
}

// 타격 계열은 매번 피치를 살짝 흔들어 기계적인 반복감을 줄인다
const JITTER = new Set(['whiff', 'punch', 'kick', 'heavy', 'block', 'land', 'grab', 'dash',
  'robotStep', 'robotPunch', 'robotHeavy', 'shockwave']);

export function sfx(name, opts = {}) {
  try {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (typeof fn !== 'function') return;
    if (voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const last = lastPlay[name];
    if (last !== undefined && now - last < RETRIGGER_GAP && now >= last) return;
    const o = opts || {};
    const vol = clamp(num(o.vol, 1), 0, 2);
    if (vol <= 0.001) return;
    let p = clamp(num(o.pitch, 1), 0.25, 4);
    if (JITTER.has(name)) p *= 1 + (Math.random() - 0.5) * 0.06;
    const pan = clamp(num(o.pan, 0), -1, 1);
    lastPlay[name] = now;

    const vg = ctx.createGain();
    vg.gain.value = vol;
    let pn = null;
    if (pan !== 0 && ctx.createStereoPanner) {
      pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      vg.connect(pn);
      pn.connect(sfxBus);
    } else {
      vg.connect(sfxBus);
    }
    curVol = Math.min(1, vol);
    const t = now + 0.004;
    const dur = num(fn(t, vg, p), 0.5);
    voices++;
    setTimeout(() => {
      voices = Math.max(0, voices - 1);
      try { vg.disconnect(); if (pn) pn.disconnect(); } catch { /* ignore */ }
    }, (dur + 0.3) * 1000);
  } catch (e) { debug(e); }
}

// ───────────────────────── 합성 헬퍼 ─────────────────────────
// 엔벨로프: 0 -> g (a초, 선형 또는 지수) -> hold -> 지수 감쇠 d초. 종료 시각 반환
function env(param, t, a, g, d, hold = 0, expA = false) {
  const pk = Math.max(g, 0.0002);
  a = Math.max(a, 0.0005);
  param.setValueAtTime(0.0001, t);
  if (expA) param.exponentialRampToValueAtTime(pk, t + a);
  else param.linearRampToValueAtTime(pk, t + a);
  if (hold > 0) param.setValueAtTime(pk, t + a + hold);
  param.exponentialRampToValueAtTime(0.0001, t + a + hold + Math.max(d, 0.005));
  return t + a + hold + Math.max(d, 0.005);
}

// 오실레이터 한 개. o: {type,f,f2,glide,a,d,hold,g,detune,vib,vibDepth,vibDelay,expA,send}
function tone(dst, t, o) {
  const { type = 'sine', f = 440, f2 = 0, a = 0.002, d = 0.2, hold = 0, g = 0.5 } = o;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(fq(f), t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(fq(f2), t + (o.glide ?? a + hold + d));
  if (o.detune) osc.detune.value = o.detune;
  const gn = ctx.createGain();
  const end = env(gn.gain, t, a, g, d, hold, o.expA) + 0.02;
  osc.connect(gn);
  gn.connect(dst);
  if (o.send) gn.connect(o.send);
  if (o.vib) {
    // 비브라토는 detune(cent) 에 걸어서 피치 스윕과 독립적으로 동작
    const l = ctx.createOscillator();
    l.frequency.value = o.vib;
    const lg = ctx.createGain();
    const depth = o.vibDepth ?? 20;
    if (o.vibDelay) {
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(depth, t + o.vibDelay);
    } else lg.gain.value = depth;
    l.connect(lg);
    lg.connect(osc.detune);
    l.start(t);
    l.stop(end);
  }
  osc.start(t);
  osc.stop(end);
  return end;
}

// 필터된 노이즈. o: {type,f,f2,glide,q,a,d,hold,g,expA}
function noise(dst, t, o) {
  const { type = 'bandpass', f = 1000, f2 = 0, q = 1, a = 0.001, d = 0.1, hold = 0, g = 0.5 } = o;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(fq(f), t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(fq(f2), t + (o.glide ?? a + hold + d));
  const gn = ctx.createGain();
  const end = env(gn.gain, t, a, g, d, hold, o.expA) + 0.02;
  src.connect(flt);
  flt.connect(gn);
  gn.connect(dst);
  src.start(t, Math.random() * 1.5);
  src.stop(end);
  return end;
}

function filt(dst, type, f, q = 0.7, t = null, f2 = 0, glide = 0.1) {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.Q.value = q;
  if (t != null) {
    n.frequency.setValueAtTime(fq(f), t);
    if (f2) n.frequency.exponentialRampToValueAtTime(fq(f2), t + glide);
  } else n.frequency.value = fq(f);
  n.connect(dst);
  return n;
}

// tanh 소프트 클리핑 WaveShaper (k 클수록 거칠게)
function shaper(dst, k = 8) {
  let curve = curveCache.get(k);
  if (!curve) {
    const n = 1024;
    curve = new Float32Array(n);
    const nk = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / nk;
    }
    curveCache.set(k, curve);
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '2x';
  ws.connect(dst);
  return ws;
}

function send(o, amt) {
  const g = ctx.createGain();
  g.gain.value = amt;
  o.connect(g);
  g.connect(verbIn);
}

// 효과음이 크게 터질 때 음악을 잠깐 눌러 타격을 부각
function duck(t, amt, dur) {
  if (!duckGain) return;
  const g = duckGain.gain;
  const lvl = clamp(1 - amt * curVol * 0.85, 0.1, 1);
  g.cancelScheduledValues(t);
  g.setTargetAtTime(lvl, t, 0.006);
  g.setTargetAtTime(1, t + 0.05, Math.max(0.02, dur * 0.4));
}

// ── 타격 레이어 ──
// 서브 베이스 쿵: 사인 피치 급강하
function thump(dst, t, f0, f1, d, g) {
  return tone(dst, t, { type: 'sine', f: f0, f2: f1, glide: d * 0.45, a: 0.001, hold: 0.012, d, g });
}
// 디스토션 바디: 중저역에 찌그러진 질감
function body(dst, t, f0, f1, d, g, k = 8, type = 'triangle') {
  const lp = filt(dst, 'lowpass', 2600, 0.8);
  const sh = shaper(lp, k);
  return tone(sh, t, { type, f: f0, f2: f1, glide: d * 0.6, a: 0.001, d, g });
}
// 노이즈 크랙: 아주 짧은 고역 트랜지언트
function crack(dst, t, f, d, g) {
  noise(dst, t, { type: 'bandpass', f, q: 0.9, a: 0.0006, d, g });
  noise(dst, t, { type: 'highpass', f: f * 2, a: 0.0005, d: d * 0.5, g: g * 0.5 });
}
// 어택 클릭
function click(dst, t, g) {
  tone(dst, t, { type: 'square', f: 2200, f2: 600, glide: 0.01, a: 0.0005, d: 0.012, g });
}
// 금속성 부분음 (비정수배 배음)
function metal(dst, t, partials, d, g, p = 1) {
  const hp = filt(dst, 'highpass', 200);
  partials.forEach((f, i) => {
    tone(hp, t, { type: i === 1 ? 'square' : 'triangle', f: f * p, a: 0.0008, d: d * (1 - i * 0.12), g: i === 1 ? g * 0.35 : g });
  });
}
// 음표 시퀀스 [midi, 시작(초), 길이(초)]
function seq(dst, t, p, notes, type, g, extra = {}) {
  let end = t;
  for (const [m, s, l] of notes) {
    end = Math.max(end, tone(dst, t + s, { type, f: mtof(m) * p, a: 0.005, hold: l * 0.6, d: l * 0.5 + 0.05, g, ...extra }));
  }
  return end - t;
}
function chord(dst, t, p, midis, type, g, hold, d, extra = {}) {
  for (const m of midis) tone(dst, t, { type, f: mtof(m) * p, a: 0.004, hold, d, g, ...extra });
}

// ───────────────────────── 효과음 정의 ─────────────────────────
// 각 빌더: (t, out, pitch) => 대략적인 길이(초)
const SFX = Object.create(null);

// ── 인간 전투 ──
SFX.whiff = (t, o, p) => {
  noise(o, t, { type: 'bandpass', f: 500 * p, f2: 3200 * p, q: 1.8, a: 0.035, d: 0.11, g: 0.55 });
  noise(o, t, { type: 'highpass', f: 4000 * p, a: 0.02, d: 0.06, g: 0.12 });
  return 0.2;
};
SFX.punch = (t, o, p) => {
  thump(o, t, 170 * p, 48 * p, 0.14, 0.95);
  body(o, t, 320 * p, 90 * p, 0.07, 0.35, 6);
  crack(o, t, 2600 * p, 0.035, 0.6);
  click(o, t, 0.25);
  duck(t, 0.25, 0.15);
  return 0.22;
};
SFX.kick = (t, o, p) => {
  thump(o, t, 150 * p, 42 * p, 0.2, 1.05);
  body(o, t, 260 * p, 70 * p, 0.1, 0.42, 8);
  crack(o, t, 1800 * p, 0.05, 0.65);
  noise(o, t, { type: 'lowpass', f: 900 * p, a: 0.001, d: 0.09, g: 0.35 });
  click(o, t, 0.3);
  duck(t, 0.35, 0.2);
  return 0.3;
};
SFX.heavy = (t, o, p) => {
  thump(o, t, 130 * p, 30 * p, 0.42, 1.25);
  thump(o, t + 0.004, 65 * p, 28 * p, 0.5, 0.6);
  body(o, t, 200 * p, 45 * p, 0.22, 0.55, 14, 'square');
  crack(o, t, 1400 * p, 0.08, 0.8);
  noise(o, t, { type: 'lowpass', f: 2400 * p, f2: 200 * p, a: 0.001, d: 0.3, g: 0.5 });
  click(o, t, 0.35);
  send(o, 0.12);
  duck(t, 0.55, 0.35);
  return 0.6;
};
SFX.block = (t, o, p) => {
  metal(o, t, [820, 1235, 1960, 2780, 3510], 0.24, 0.16, p);
  crack(o, t, 4200 * p, 0.03, 0.5);
  thump(o, t, 240 * p, 90 * p, 0.08, 0.45);
  duck(t, 0.2, 0.12);
  return 0.32;
};
SFX.jump = (t, o, p) => {
  const lp = filt(o, 'lowpass', 3000);
  tone(lp, t, { type: 'square', f: 240 * p, f2: 720 * p, glide: 0.1, a: 0.003, d: 0.12, g: 0.13 });
  noise(o, t, { type: 'bandpass', f: 800 * p, f2: 2000 * p, a: 0.02, d: 0.1, g: 0.15 });
  return 0.18;
};
SFX.land = (t, o, p) => {
  thump(o, t, 110 * p, 40 * p, 0.12, 0.7);
  noise(o, t, { type: 'lowpass', f: 700 * p, a: 0.001, d: 0.09, g: 0.45 });
  return 0.2;
};
SFX.dash = (t, o, p) => {
  noise(o, t, { type: 'bandpass', f: 300 * p, f2: 2600 * p, q: 1.2, a: 0.02, d: 0.22, g: 0.6 });
  noise(o, t, { type: 'highpass', f: 5000 * p, a: 0.01, d: 0.08, g: 0.15 });
  tone(o, t, { type: 'sine', f: 200 * p, f2: 80 * p, a: 0.003, d: 0.15, g: 0.25 });
  return 0.3;
};
SFX.grab = (t, o, p) => {
  noise(o, t, { type: 'bandpass', f: 1200 * p, q: 2, a: 0.001, d: 0.05, g: 0.5 });
  tone(o, t, { type: 'triangle', f: 380 * p, f2: 200 * p, a: 0.002, d: 0.08, g: 0.35 });
  thump(o, t, 140 * p, 70 * p, 0.06, 0.4);
  return 0.14;
};
SFX.throw = (t, o, p) => {
  noise(o, t, { type: 'bandpass', f: 250 * p, f2: 1800 * p, q: 1.3, a: 0.06, d: 0.25, g: 0.6 });
  tone(o, t, { type: 'sine', f: 160 * p, f2: 420 * p, a: 0.02, d: 0.2, g: 0.2 });
  return 0.35;
};

// ── 게이지 / 호출 ──
SFX.gaugeFull = (t, o, p) => {
  [84, 88, 91, 96].forEach((m, i) => {
    const tt = t + i * 0.055;
    tone(o, tt, { type: 'triangle', f: mtof(m) * p, a: 0.003, d: 0.35, g: 0.22 });
    tone(o, tt, { type: 'square', f: mtof(m) * 2 * p, a: 0.003, d: 0.2, g: 0.035 });
  });
  noise(o, t, { type: 'highpass', f: 6000, a: 0.1, d: 0.4, g: 0.08 });
  send(o, 0.2);
  return 0.75;
};
SFX.remote = (t, o, p) => {
  const lp = filt(o, 'lowpass', 5000);
  tone(lp, t, { type: 'square', f: 1320 * p, a: 0.002, hold: 0.06, d: 0.02, g: 0.16 });
  tone(lp, t + 0.13, { type: 'square', f: 1760 * p, a: 0.002, hold: 0.06, d: 0.02, g: 0.16 });
  tone(o, t + 0.26, { type: 'sine', f: 2200 * p, f2: 3300 * p, a: 0.003, d: 0.14, g: 0.14, vib: 30, vibDepth: 60 });
  return 0.45;
};
SFX.incoming = (t, o, p) => {
  tone(o, t, { type: 'sine', f: 2600 * p, f2: 260 * p, glide: 1.55, a: 0.05, hold: 1.3, d: 0.25, g: 0.28, vib: 7, vibDepth: 30 });
  tone(o, t, { type: 'triangle', f: 1300 * p, f2: 130 * p, glide: 1.55, a: 0.05, hold: 1.3, d: 0.25, g: 0.1 });
  noise(o, t, { type: 'bandpass', f: 3000 * p, f2: 400 * p, glide: 1.6, q: 3, a: 0.3, hold: 1.0, d: 0.3, g: 0.12 });
  return 1.7;
};
SFX.robotLand = (t, o, p) => {
  thump(o, t, 95 * p, 20 * p, 1.2, 1.4);
  thump(o, t + 0.006, 48 * p, 18 * p, 1.4, 0.8);
  body(o, t, 140 * p, 30 * p, 0.5, 0.6, 20, 'square');
  crack(o, t, 900 * p, 0.12, 0.9);
  click(o, t, 0.4);
  noise(o, t, { type: 'lowpass', f: 3000 * p, f2: 60, glide: 1.2, a: 0.002, d: 1.4, g: 1.0 });
  noise(o, t, { type: 'bandpass', f: 200 * p, q: 0.8, a: 0.01, hold: 0.3, d: 1.1, g: 0.5 }); // 땅울림
  for (let i = 0; i < 5; i++) crack(o, t + rnd(0.08, 0.5), rnd(1500, 4000) * p, 0.025, rnd(0.12, 0.25)); // 파편
  send(o, 0.35);
  duck(t, 0.85, 0.9);
  return 1.7;
};

// ── 탑승 ──
SFX.boardTick = (t, o, p) => {
  tone(o, t, { type: 'square', f: 1500 * p, a: 0.001, d: 0.035, g: 0.1 });
  tone(o, t, { type: 'sine', f: 3000 * p, a: 0.001, d: 0.03, g: 0.08 });
  return 0.06;
};
SFX.boardCancel = (t, o, p) => {
  const lp = filt(o, 'lowpass', 1600);
  for (const s of [0, 0.14]) {
    tone(lp, t + s, { type: 'square', f: 150 * p, a: 0.003, hold: 0.1, d: 0.03, g: 0.18 });
    tone(lp, t + s, { type: 'sawtooth', f: 159 * p, a: 0.003, hold: 0.1, d: 0.03, g: 0.14 });
  }
  return 0.35;
};
SFX.boardDone = (t, o, p) => {
  // 상승 스윕
  const sw = filt(o, 'lowpass', 400, 4, t, 6000, 0.55);
  tone(sw, t, { type: 'sawtooth', f: 180 * p, f2: 1800 * p, glide: 0.55, a: 0.05, hold: 0.45, d: 0.08, g: 0.18 });
  tone(sw, t, { type: 'square', f: 90 * p, f2: 900 * p, glide: 0.55, a: 0.05, hold: 0.45, d: 0.08, g: 0.08 });
  noise(o, t, { type: 'highpass', f: 3000, a: 0.5, d: 0.04, g: 0.3, expA: true });
  // 코드 히트
  const t2 = t + 0.55;
  const lp = filt(o, 'lowpass', 6000, 0.8, t2, 1800, 0.9);
  chord(lp, t2, p, [48, 55, 60, 64, 67, 72], 'sawtooth', 0.07, 0.25, 0.8);
  chord(lp, t2, p, [60, 67, 76], 'square', 0.035, 0.25, 0.8);
  thump(o, t2, 120 * p, 35 * p, 0.5, 1.1);
  crack(o, t2, 2000 * p, 0.06, 0.6);
  noise(o, t2, { type: 'highpass', f: 7000, a: 0.005, d: 0.8, g: 0.12 });
  send(o, 0.3);
  duck(t2, 0.6, 0.6);
  return 1.6;
};

// ── 로봇 ──
SFX.robotStep = (t, o, p) => {
  thump(o, t, 75 * p, 28 * p, 0.28, 1.1);
  body(o, t, 160 * p, 50 * p, 0.12, 0.4, 10);
  const bp = filt(o, 'bandpass', 1200 * p, 1.2);
  tone(bp, t + 0.02, { type: 'sawtooth', f: 520 * p, f2: 300 * p, glide: 0.1, a: 0.005, hold: 0.04, d: 0.06, g: 0.1 }); // 서보
  metal(o, t, [410, 655, 980], 0.12, 0.08, p);
  noise(o, t, { type: 'lowpass', f: 500 * p, a: 0.001, d: 0.15, g: 0.4 });
  duck(t, 0.3, 0.2);
  return 0.38;
};
SFX.robotPunch = (t, o, p) => {
  thump(o, t, 115 * p, 26 * p, 0.5, 1.35);
  thump(o, t + 0.004, 58 * p, 24 * p, 0.6, 0.7);
  body(o, t, 220 * p, 50 * p, 0.28, 0.6, 16, 'square');
  metal(o, t, [311, 587, 911, 1433, 2210], 0.45, 0.12, p);
  crack(o, t, 1800 * p, 0.07, 0.9);
  noise(o, t, { type: 'lowpass', f: 3000 * p, f2: 150, a: 0.001, d: 0.35, g: 0.6 });
  click(o, t, 0.4);
  send(o, 0.15);
  duck(t, 0.6, 0.4);
  return 0.75;
};
SFX.robotHeavy = (t, o, p) => {
  thump(o, t, 100 * p, 20 * p, 0.8, 1.5);
  thump(o, t + 0.005, 50 * p, 18 * p, 0.9, 0.8);
  body(o, t, 180 * p, 35 * p, 0.4, 0.7, 22, 'square');
  metal(o, t, [233, 440, 697, 1103, 1690], 0.7, 0.13, p);
  crack(o, t, 1200 * p, 0.1, 1.0);
  noise(o, t, { type: 'lowpass', f: 4000 * p, f2: 80, glide: 0.6, a: 0.001, d: 0.7, g: 0.8 });
  click(o, t, 0.45);
  send(o, 0.5);
  duck(t, 0.8, 0.6);
  return 1.4;
};
SFX.rocket = (t, o, p) => {
  thump(o, t, 90 * p, 40 * p, 0.2, 0.8);
  crack(o, t, 2500 * p, 0.04, 0.4);
  const sh = shaper(o, 5);
  noise(sh, t, { type: 'bandpass', f: 400 * p, f2: 1600 * p, q: 0.7, a: 0.03, hold: 0.25, d: 0.35, g: 0.7 });
  const lp = filt(o, 'lowpass', 1800);
  tone(shaper(lp, 6), t, { type: 'sawtooth', f: 70 * p, f2: 150 * p, a: 0.02, hold: 0.2, d: 0.3, g: 0.25 });
  noise(o, t, { type: 'highpass', f: 3000 * p, a: 0.05, d: 0.5, g: 0.15 });
  return 0.8;
};
SFX.missile = (t, o, p) => {
  noise(o, t, { type: 'highpass', f: 2500 * p, f2: 6500 * p, a: 0.01, hold: 0.1, d: 0.25, g: 0.35 });
  tone(o, t, { type: 'sine', f: 700 * p, f2: 1900 * p, glide: 0.2, a: 0.004, d: 0.22, g: 0.12 });
  thump(o, t, 200 * p, 90 * p, 0.06, 0.35);
  return 0.45;
};
SFX.laser = (t, o, p) => {
  tone(o, t, { type: 'sine', f: 400 * p, f2: 1600 * p, glide: 0.15, a: 0.01, hold: 0.1, d: 0.05, g: 0.12 }); // 차지
  const t2 = t + 0.15;
  const lp = filt(o, 'lowpass', 4000, 1.5);
  tone(lp, t2, { type: 'sawtooth', f: 900 * p, a: 0.004, hold: 0.6, d: 0.25, g: 0.16, vib: 38, vibDepth: 60 });
  tone(lp, t2, { type: 'square', f: 1805 * p, a: 0.004, hold: 0.6, d: 0.25, g: 0.06, vib: 45, vibDepth: 80 });
  tone(o, t2, { type: 'sine', f: 110 * p, a: 0.004, hold: 0.6, d: 0.3, g: 0.35 });
  noise(o, t2, { type: 'bandpass', f: 3500 * p, q: 2, a: 0.004, hold: 0.6, d: 0.25, g: 0.15 });
  crack(o, t2, 3000 * p, 0.03, 0.5);
  thump(o, t2, 160 * p, 60 * p, 0.12, 0.6);
  duck(t2, 0.35, 0.8);
  return 1.05;
};
SFX.charge = (t, o, p) => {
  const lp = filt(o, 'lowpass', 300, 3, t, 4000, 0.8);
  tone(lp, t, { type: 'sawtooth', f: 110 * p, f2: 880 * p, glide: 0.8, a: 0.7, d: 0.1, g: 0.14, vib: 12, vibDepth: 40, expA: true });
  tone(o, t, { type: 'sine', f: 220 * p, f2: 1760 * p, glide: 0.8, a: 0.7, d: 0.1, g: 0.15, expA: true });
  noise(o, t, { type: 'highpass', f: 4000, a: 0.7, d: 0.1, g: 0.08, expA: true });
  return 0.85;
};
SFX.shockwave = (t, o, p) => {
  thump(o, t, 85 * p, 22 * p, 0.8, 1.4);
  body(o, t, 150 * p, 35 * p, 0.35, 0.6, 18, 'square');
  noise(o, t, { type: 'lowpass', f: 3500 * p, f2: 90, glide: 0.6, a: 0.002, d: 0.75, g: 0.9 });
  crack(o, t, 1000 * p, 0.1, 0.8);
  noise(o, t, { type: 'bandpass', f: 300 * p, f2: 120 * p, q: 1, a: 0.01, hold: 0.2, d: 0.6, g: 0.4 });
  click(o, t, 0.4);
  send(o, 0.35);
  duck(t, 0.75, 0.6);
  return 1.1;
};
SFX.explosion = (t, o, p) => {
  const sh = shaper(o, 4);
  noise(sh, t, { type: 'lowpass', f: 5000 * p, f2: 100, glide: 1.3, a: 0.002, d: 1.4, g: 1.1 });
  thump(o, t, 70 * p, 20 * p, 1.0, 1.4);
  body(o, t, 110 * p, 30 * p, 0.6, 0.5, 25, 'square');
  crack(o, t, 1500 * p, 0.08, 0.9);
  for (let i = 0; i < 7; i++) crack(o, t + rnd(0.05, 0.65), rnd(1500, 4500) * p, 0.03, rnd(0.2, 0.4)); // 잔폭발
  send(o, 0.45);
  duck(t, 0.85, 0.9);
  return 1.7;
};
SFX.eject = (t, o, p) => {
  tone(o, t, { type: 'sine', f: 260 * p, f2: 980 * p, glide: 0.05, a: 0.001, d: 0.07, g: 0.5 });
  crack(o, t, 3000 * p, 0.02, 0.4);
  noise(o, t + 0.05, { type: 'bandpass', f: 600 * p, f2: 3000 * p, q: 1.2, a: 0.05, d: 0.35, g: 0.45 });
  tone(o, t + 0.05, { type: 'triangle', f: 400 * p, f2: 1400 * p, a: 0.05, d: 0.3, g: 0.1 });
  return 0.5;
};
SFX.spin = (t, o, p) => {
  const lp = filt(o, 'lowpass', 2500, 2);
  tone(lp, t, { type: 'sawtooth', f: 95 * p, a: 0.05, hold: 0.55, d: 0.2, g: 0.2, vib: 28, vibDepth: 300 });
  tone(o, t, { type: 'square', f: 700 * p, f2: 1400 * p, glide: 0.8, a: 0.05, hold: 0.55, d: 0.2, g: 0.045, vib: 30, vibDepth: 100 });
  noise(o, t, { type: 'bandpass', f: 1800 * p, q: 3, a: 0.05, hold: 0.55, d: 0.2, g: 0.2 });
  return 0.85;
};
SFX.ultimate = (t, o, p) => {
  // 리버스 스웰 -> 거대 히트 + 단조 코드 스팅어
  noise(o, t, { type: 'highpass', f: 2000, a: 0.5, d: 0.03, g: 0.4, expA: true });
  const up = filt(o, 'lowpass', 2500);
  tone(up, t, { type: 'sawtooth', f: 110 * p, f2: 880 * p, glide: 0.5, a: 0.5, d: 0.04, g: 0.12, expA: true });
  const t2 = t + 0.52;
  thump(o, t2, 110 * p, 24 * p, 0.9, 1.4);
  body(o, t2, 160 * p, 40 * p, 0.35, 0.5, 16, 'square');
  crack(o, t2, 1500 * p, 0.08, 0.9);
  const lp = filt(o, 'lowpass', 5000, 1, t2, 1200, 1.2);
  chord(lp, t2, p, [38, 50, 57, 62, 65, 69], 'sawtooth', 0.075, 0.35, 1.0, { vib: 5, vibDepth: 8, vibDelay: 0.3 });
  chord(lp, t2, p, [62, 74], 'square', 0.03, 0.35, 1.0);
  noise(o, t2, { type: 'highpass', f: 6000, a: 0.005, d: 1.2, g: 0.12 });
  send(o, 0.5);
  duck(t2, 0.8, 1.2);
  return 2.1;
};

// ── 경기 이벤트 ──
SFX.ko = (t, o, p) => {
  thump(o, t, 105 * p, 22 * p, 1.0, 1.5);
  thump(o, t + 0.005, 52 * p, 20 * p, 1.1, 0.8);
  body(o, t, 180 * p, 35 * p, 0.45, 0.7, 22, 'square');
  crack(o, t, 1300 * p, 0.1, 1.0);
  click(o, t, 0.45);
  noise(o, t, { type: 'lowpass', f: 3000 * p, f2: 80, glide: 0.8, a: 0.002, d: 0.9, g: 0.8 });
  noise(o, t + 0.12, { type: 'highpass', f: 3500, q: 0.7, a: 0.9, d: 0.04, g: 0.45, expA: true }); // 리버스 심벌
  crack(o, t + 1.06, 5000, 0.03, 0.2);
  send(o, 0.5);
  duck(t, 0.9, 1.2);
  return 1.6;
};
SFX.fall = (t, o, p) => {
  tone(o, t, { type: 'triangle', f: 1100 * p, f2: 90 * p, glide: 1.2, a: 0.02, hold: 0.9, d: 0.3, g: 0.25, vib: 6, vibDepth: 40 });
  tone(o, t, { type: 'square', f: 550 * p, f2: 45 * p, glide: 1.2, a: 0.02, hold: 0.9, d: 0.3, g: 0.05 });
  noise(o, t, { type: 'bandpass', f: 1500 * p, f2: 300 * p, q: 1, a: 0.1, hold: 0.8, d: 0.3, g: 0.1 });
  return 1.3;
};
SFX.respawn = (t, o, p) => {
  [72, 76, 79, 84, 88].forEach((m, i) => {
    tone(o, t + i * 0.05, { type: 'sine', f: mtof(m) * p, a: 0.003, d: 0.3, g: 0.18 });
    tone(o, t + i * 0.05, { type: 'triangle', f: mtof(m) * 2 * p, a: 0.003, d: 0.15, g: 0.05 });
  });
  noise(o, t, { type: 'highpass', f: 5000, a: 0.25, d: 0.35, g: 0.1 });
  send(o, 0.2);
  return 0.8;
};

// ── UI / 진행 ──
SFX.ui = (t, o, p) => {
  tone(o, t, { type: 'square', f: 1800 * p, a: 0.001, d: 0.025, g: 0.1 });
  tone(o, t, { type: 'triangle', f: 3600 * p, a: 0.001, d: 0.02, g: 0.05 });
  return 0.05;
};
SFX.confirm = (t, o, p) => {
  tone(o, t, { type: 'triangle', f: 880 * p, a: 0.002, d: 0.08, g: 0.25 });
  tone(o, t, { type: 'square', f: 880 * p, a: 0.002, d: 0.06, g: 0.04 });
  tone(o, t + 0.07, { type: 'triangle', f: 1320 * p, a: 0.002, d: 0.15, g: 0.25 });
  tone(o, t + 0.07, { type: 'square', f: 1320 * p, a: 0.002, d: 0.1, g: 0.04 });
  return 0.25;
};
SFX.back = (t, o, p) => {
  tone(o, t, { type: 'triangle', f: 740 * p, a: 0.002, d: 0.07, g: 0.22 });
  tone(o, t + 0.07, { type: 'triangle', f: 494 * p, a: 0.002, d: 0.12, g: 0.22 });
  return 0.22;
};
SFX.countdown = (t, o, p) => {
  tone(o, t, { type: 'square', f: 880 * p, a: 0.002, hold: 0.12, d: 0.08, g: 0.13 });
  tone(o, t, { type: 'sine', f: 880 * p, a: 0.002, hold: 0.12, d: 0.1, g: 0.2 });
  return 0.25;
};
SFX.go = (t, o, p) => {
  tone(o, t, { type: 'square', f: 1760 * p, a: 0.002, hold: 0.15, d: 0.3, g: 0.12 });
  chord(o, t, p, [72, 76, 79, 84], 'triangle', 0.12, 0.2, 0.5);
  thump(o, t, 140 * p, 50 * p, 0.2, 0.7);
  crack(o, t, 3000 * p, 0.04, 0.4);
  send(o, 0.2);
  return 0.8;
};
SFX.victory = (t, o, p) => {
  const lp = filt(o, 'lowpass', 4500);
  const mel = [[67, 0, 0.12], [72, 0.13, 0.12], [76, 0.26, 0.12], [79, 0.39, 0.28], [76, 0.72, 0.12], [84, 0.85, 0.7]];
  seq(lp, t, p, mel, 'square', 0.11);
  seq(o, t, p, mel.map(([m, s, l]) => [m - 12, s, l]), 'triangle', 0.14);
  chord(lp, t + 0.85, p, [60, 64, 67, 72], 'sawtooth', 0.05, 0.4, 0.6, { vib: 5, vibDepth: 10, vibDelay: 0.2 });
  thump(o, t + 0.39, 130 * p, 45 * p, 0.2, 0.6);
  thump(o, t + 0.85, 120 * p, 40 * p, 0.35, 0.8);
  noise(o, t + 0.85, { type: 'highpass', f: 6000, a: 0.003, d: 0.8, g: 0.12 });
  send(o, 0.25);
  return 1.9;
};
SFX.defeat = (t, o, p) => {
  const notes = [[67, 0, 0.26], [66, 0.3, 0.26], [65, 0.6, 0.26], [64, 0.9, 0.9]];
  for (const [m, s, l] of notes) {
    const long = l > 0.5;
    tone(o, t + s, { type: 'triangle', f: mtof(m) * p, a: 0.01, hold: l * 0.6, d: l * 0.5, g: 0.22, vib: long ? 5 : 0, vibDepth: 25, vibDelay: 0.25 });
    tone(o, t + s, { type: 'square', f: mtof(m - 24) * p, a: 0.01, hold: l * 0.6, d: l * 0.5, g: 0.05 });
  }
  send(o, 0.25);
  return 2.1;
};

// ───────────────────────── 음악 ─────────────────────────
const N = null;
// 멜로디: [16분음표 스텝, midi, 길이(스텝)] — 4마디 64스텝
const BATTLE_MEL = [
  [0, 69, 2], [3, 72, 1], [4, 76, 2], [6, 74, 2], [8, 72, 2], [10, 69, 2], [12, 67, 2], [14, 69, 2],
  [16, 69, 2], [19, 72, 1], [20, 77, 2], [22, 76, 2], [24, 72, 4], [28, 69, 4],
  [32, 67, 2], [35, 72, 1], [36, 76, 2], [38, 79, 2], [40, 76, 2], [42, 74, 2], [44, 72, 4],
  [48, 71, 2], [50, 74, 2], [52, 79, 2], [54, 74, 2], [56, 71, 2], [58, 74, 2], [60, 76, 4],
];
const MENU_MEL = [
  [0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4],
  [16, 69, 2], [18, 72, 2], [20, 76, 4], [24, 74, 2], [26, 72, 2], [28, 69, 4],
  [32, 77, 2], [34, 76, 2], [36, 74, 2], [38, 72, 2], [40, 69, 4], [44, 72, 4],
  [48, 71, 2], [50, 74, 2], [52, 79, 4], [56, 77, 2], [58, 74, 2], [60, 71, 4],
];
function melMap(list, tr = 0) {
  const m = Object.create(null);
  for (const [s, n, l] of list) (m[s] ||= []).push([n + tr, l]);
  return m;
}

// 드럼 문자열: x=히트, X=악센트 하이햇, o=오픈 하이햇
const SONGS = {
  menu: {
    bpm: 112,
    chords: [[36, 'M'], [33, 'm'], [29, 'M'], [31, 'M']], // C Am F G
    kick: 'x.........x.....', snare: '....x.......x...', fill: null, hat: '..x...x...x...x.',
    bass: [0, N, N, 12, N, N, 7, N, 0, N, N, 12, N, N, 7, N], bassCut: 500, bassDist: 0, bassLen: 2.5,
    arp: [0, N, 1, N, 2, N, 3, N, 4, N, 3, N, 2, N, 1, N], arpType: 'triangle', arpGain: 0.07,
    mel: melMap(MENU_MEL), leadType: 'triangle', leadGain: 0.14, dbl: 'odd', crash: false, drumGain: 0.7,
  },
  battle: {
    bpm: 150,
    chords: [[33, 'm'], [29, 'M'], [36, 'M'], [31, 'M']], // Am F C G
    kick: 'x.....x.x.....x.', snare: '....x.......x...', fill: '....x...x.x.xxxx', hat: 'x.X.x.X.x.X.x.Xo',
    bass: [0, N, 0, N, 12, N, 0, N, 0, N, 0, 12, N, 0, 12, N], bassCut: 700, bassDist: 0, bassLen: 1.6,
    arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1], arpType: 'square', arpGain: 0.045,
    mel: melMap(BATTLE_MEL), leadType: 'square', leadGain: 0.11, dbl: 'odd', crash: true, drumGain: 1,
  },
  robot: {
    bpm: 164,
    chords: [[35, 'm'], [31, 'M'], [38, 'M'], [33, 'M']], // Bm G D A (+2 전조)
    kick: 'x...x...x...x.x.', snare: '....x.......x...', fill: '....x..x..x.xxxx', hat: 'xXxXxXxXxXxXxXxo',
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12], bassCut: 900, bassDist: 3, bassLen: 0.9,
    arp: [0, 2, 3, 4, 3, 2, 4, 5, 0, 2, 3, 4, 5, 4, 3, 2], arpType: 'sawtooth', arpGain: 0.04,
    mel: melMap(BATTLE_MEL, 2), leadType: 'sawtooth', leadGain: 0.1, dbl: 'always', crash: true, drumGain: 1.1,
  },
};

// ── 음악용 악기 ──
function mKick(dst, t, g) {
  thump(dst, t, 160, 44, 0.26, g);
  tone(dst, t, { type: 'square', f: 1800, f2: 500, glide: 0.008, a: 0.0005, d: 0.008, g: g * 0.08 });
}
function mSnare(dst, t, g) {
  noise(dst, t, { type: 'bandpass', f: 2000, q: 0.7, a: 0.001, d: 0.14, g });
  noise(dst, t, { type: 'highpass', f: 5000, a: 0.001, d: 0.06, g: g * 0.4 });
  tone(dst, t, { type: 'triangle', f: 220, f2: 160, glide: 0.05, a: 0.001, d: 0.07, g: g * 0.8 });
}
function mHat(dst, t, g, open) {
  noise(dst, t, { type: 'highpass', f: 8000, q: 0.8, a: 0.0008, d: open ? 0.14 : 0.035, g });
}
function mCrash(dst, t, g) {
  noise(dst, t, { type: 'highpass', f: 5000, q: 0.5, a: 0.002, d: 1.1, g });
  noise(dst, t, { type: 'bandpass', f: 9000, q: 1, a: 0.002, d: 0.6, g: g * 0.5 });
}
function mBass(tr, t, midi, dur, g) {
  const s = tr.song;
  const f = mtof(midi);
  const gn = ctx.createGain();
  const end = env(gn.gain, t, 0.004, g, dur * 0.5, dur * 0.5) + 0.02;
  gn.connect(tr.out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 5;
  lp.frequency.setValueAtTime(fq(s.bassCut * 3.5), t);
  lp.frequency.exponentialRampToValueAtTime(fq(s.bassCut), t + Math.max(0.03, dur * 0.7));
  lp.connect(gn);
  const into = s.bassDist ? shaper(lp, s.bassDist) : lp;
  for (const det of [0, 9]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = det;
    osc.connect(into);
    osc.start(t);
    osc.stop(end);
  }
  tone(tr.out, t, { type: 'sine', f: f, a: 0.004, hold: dur * 0.5, d: dur * 0.5, g: g * 0.8 }); // 서브 보강
}
function mPluck(tr, t, midi, type, g) {
  const lp = filt(tr.out, 'lowpass', 2600, 1, t, 900, 0.1);
  tone(lp, t, { type, f: mtof(midi), a: 0.002, d: 0.12, g, send: tr.send });
}
function mLead(tr, t, midi, dur, type, g) {
  const lp = filt(tr.out, 'lowpass', 3200, 1);
  const hold = dur * 0.7;
  const d = dur * 0.35 + 0.04;
  const vib = dur > 0.25 ? 5.5 : 0;
  tone(lp, t, { type, f: mtof(midi), a: 0.01, hold, d, g, send: tr.send, vib, vibDepth: 15, vibDelay: 0.15 });
  tone(lp, t, { type: 'sawtooth', f: mtof(midi), detune: 7, a: 0.01, hold, d, g: g * 0.35, send: tr.send });
}

function scheduleStep(tr, t) {
  const s = tr.song;
  const n = s.chords.length;
  const st = tr.step % 16;
  const bar = Math.floor(tr.step / 16) % n;
  const loop = Math.floor(tr.step / (16 * n));
  const gs = tr.step % (16 * n);
  const [root, q] = s.chords[bar];
  const out = tr.out;
  const dg = s.drumGain;

  // 드럼
  if (s.kick[st] === 'x') mKick(out, t, 0.85 * dg);
  const sn = bar === n - 1 && s.fill ? s.fill : s.snare;
  if (sn[st] === 'x') mSnare(out, t, (sn === s.fill && st > 12 ? 0.32 : 0.42) * dg);
  const h = s.hat[st];
  if (h === 'x') mHat(out, t, 0.08 * dg, false);
  else if (h === 'X') mHat(out, t, 0.13 * dg, false);
  else if (h === 'o') mHat(out, t, 0.11 * dg, true);
  if (s.crash && st === 0 && bar === 0) mCrash(out, t, 0.15 * dg);

  // 베이스
  const b = s.bass[st];
  if (b != null) mBass(tr, t, root + b, tr.stepDur * s.bassLen, 0.2);

  // 아르페지오
  const ai = s.arp[st];
  if (ai != null) {
    const tri = q === 'm' ? [0, 3, 7] : [0, 4, 7];
    const tones = [tri[0], tri[1], tri[2], 12, 12 + tri[1], 12 + tri[2]];
    mPluck(tr, t, root + 36 + tones[ai % tones.length], s.arpType, s.arpGain);
  }

  // 멜로디
  const notes = s.mel[gs];
  if (notes) {
    const dbl = s.dbl === 'always' || (s.dbl === 'odd' && loop % 2 === 1);
    for (const [m, l] of notes) {
      mLead(tr, t, m, l * tr.stepDur, s.leadType, s.leadGain);
      if (dbl) tone(tr.out, t, { type: 'sine', f: mtof(m + 12), a: 0.01, hold: l * tr.stepDur * 0.7, d: 0.1, g: s.leadGain * 0.45, send: tr.send });
    }
  }
}

function tick(tr) {
  try {
    if (!ctx || ctx.state !== 'running' || tr !== curTrack) return;
    const now = ctx.currentTime;
    // 탭 비활성 등으로 타이머가 밀렸으면 몰아서 재생하지 않고 다시 맞춘다
    if (tr.next < now - 0.25) tr.next = now + 0.05;
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.2 : LOOKAHEAD;
    let guard = 0;
    while (tr.next < now + ahead && guard++ < 64) {
      scheduleStep(tr, tr.next);
      tr.next += tr.stepDur;
      tr.step++;
    }
  } catch (e) { debug(e); }
}

function launchTrack(kind) {
  const s = SONGS[kind];
  if (!s || !ctx) return;
  const now = ctx.currentTime;
  const prev = curTrack;
  fadeOutTrack(prev, 0.5);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(1, now + 0.35);
  out.connect(musicBus);

  // 트랙 전용 피드백 딜레이 (리드/아르페지오 공간감)
  const stepDur = 60 / s.bpm / 4;
  const sendIn = ctx.createGain();
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = stepDur * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 2800;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  sendIn.connect(delay);
  delay.connect(dlp);
  dlp.connect(fb);
  fb.connect(delay);
  dlp.connect(wet);
  wet.connect(out);

  const tr = {
    kind, song: s, stepDur, step: 0, out, send: sendIn,
    nodes: [out, sendIn, delay, fb, dlp, wet],
    // 이전 트랙이 있으면 그 그리드에 이어 붙여 박자가 끊기지 않게
    next: prev ? Math.max(prev.next, now + 0.03) : now + 0.06,
    timer: null,
  };
  curTrack = tr;
  tr.timer = setInterval(() => tick(tr), TICK_MS);
  tick(tr);
}

function fadeOutTrack(tr, dur) {
  if (!tr || !ctx) return;
  clearInterval(tr.timer);
  tr.timer = null;
  try {
    const now = ctx.currentTime;
    const g = tr.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0, now + dur);
  } catch (e) { debug(e); }
  setTimeout(() => {
    for (const n of tr.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
  }, (dur + 1.5) * 1000);
}

export function startMusic(kind) {
  try {
    if (!SONGS[kind] || kind === curKind) return;
    curKind = kind;
    if (!isUnlocked()) return; // unlock 되면 onState 에서 시작
    launchTrack(kind);
  } catch (e) { debug(e); }
}

export function stopMusic() {
  try {
    curKind = null;
    fadeOutTrack(curTrack, 0.6);
    curTrack = null;
  } catch (e) { debug(e); }
}

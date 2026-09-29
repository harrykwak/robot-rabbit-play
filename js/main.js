// 진입점: 렌더러, 화면 전환, 메뉴
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createArena } from './arena.js';
import { createRobot, createHuman, ROBOT_INFO, setModelQuality, applyModelQuality } from './models.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { PILOTS, ROBOT_ORDER, ROBOT_STATS, COMMON_MOVES, STAGES } from './data.js';
import * as input from './input.js';
import * as audio from './audio.js';
import { createTouchControls } from './touch.js';
import { normalizePreferences, touchEnabled, qualityProfile } from './preferences.js';
import { controlLabel, formatControls } from './control-labels.js';
import { FixedClock, RenderBudget, FrameStats, Interpolator } from './frame-budget.js';
import { MISSIONS, loadProgress, saveProgress, missionStatus, isUnlocked, recordResult } from './campaign.js';
import { PeerLobby } from './peer-lobby.js';
import { PeerSession } from './peer-session.js';
import { initInstallUI } from './install.js';

const touchMedia = matchMedia('(pointer: coarse)');
const hasTouch = () => touchMedia.matches || navigator.maxTouchPoints > 0;
let savedPreferences;
try { savedPreferences = JSON.parse(localStorage.getItem('rr-mobile') || 'null'); } catch { /* optional storage */ }
const preferences = normalizePreferences(savedPreferences, matchMedia('(prefers-reduced-motion: reduce)').matches);
if (new URLSearchParams(location.search).get('touch') === '1') preferences.touch = 'on';
let mobileControls = touchEnabled(preferences, hasTouch());
let profile = qualityProfile(preferences, hasTouch(), devicePixelRatio, innerWidth, innerHeight);
let contextLost = false;
let renderDirty = true;
let shownSpectating = false;
const simulationClock = new FixedClock();
const renderBudget = new RenderBudget();
// 시뮬레이션은 60Hz 고정, 화면은 두 틱 사이를 보간해 그린다 (30/60/120Hz 어느 화면에서도 끊김 없이)
const interp = new Interpolator(THREE);
const interpTargets = [];
setModelQuality(profile.low);
const savePreferences = () => { try { localStorage.setItem('rr-mobile', JSON.stringify(preferences)); } catch { /* session settings still work */ } };

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default' });
renderer.info.autoReset = false;
renderer.setPixelRatio(profile.dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = profile.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 900);
camera.position.set(0, 22, 30);
camera.lookAt(0, 0, 0);

// Mobile low quality renders directly. Allocate HDR/bloom buffers only on demand.
let composer = null;
function syncPostprocessing() {
  if (!profile.bloom && composer) {
    for (const pass of composer.passes) pass.dispose?.();
    composer.dispose(); composer = null;
  } else if (profile.bloom && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 1.0));
    composer.addPass(new OutputPass());
  }
}

const arena = createArena(scene);
const fx = new FX(scene, camera, document.getElementById('overlay'));
const ui = new UI(camera);
ui.robotInfo = ROBOT_INFO;
const game = new Game({ scene, camera, fx, ui, arena });
game.robotInfo = ROBOT_INFO;
game.reducedMotion = preferences.reducedMotion;
fx.reducedMotion = preferences.reducedMotion;
const touch = createTouchControls({ onPause: () => { if (mode === 'game') pauseGame(); } });
touch.setEnabled(mobileControls);
touch.setActive(false);
touch.setHandedness(preferences.leftHanded);
touch.setScale(preferences.scale);
document.documentElement.classList.toggle('touch-mode', mobileControls);

let viewWidth = innerWidth, viewHeight = innerHeight, viewDpr = profile.dpr;
let resizePending = false;
function resizeView() {
  renderDirty = true;
  const next = qualityProfile(renderBudget.thermal >= 2 ? { quality: 'low' } : preferences,
    hasTouch(), devicePixelRatio, innerWidth, innerHeight);
  profile.dpr = next.dpr * Math.min(renderBudget.scale, renderBudget.thermal >= 2 ? .75 : 1);
  camera.aspect = innerWidth / innerHeight;
  // Shift the portrait battlefield above the two thumbs without changing world coordinates.
  if (mobileControls && innerHeight > innerWidth && mode === 'game') {
    const reserve = Math.min(260, innerHeight * 0.32);
    camera.setViewOffset(innerWidth, innerHeight, 0, reserve * 0.5, innerWidth, innerHeight);
  } else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  // setDrawingBufferSize avoids setPixelRatio's extra resize at the previous dimensions.
  if (viewWidth !== innerWidth || viewHeight !== innerHeight || viewDpr !== profile.dpr) {
    renderer.setDrawingBufferSize(innerWidth, innerHeight, profile.dpr);
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    if (composer) {
      if (viewDpr !== profile.dpr) composer.setPixelRatio(profile.dpr);
      composer.setSize(innerWidth, innerHeight);
    }
    viewWidth = innerWidth; viewHeight = innerHeight; viewDpr = profile.dpr;
  }
}
function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => { resizePending = false; resizeView(); });
}
addEventListener('resize', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);

// ---------------- 화면 ----------------
const screens = ['title', 'help', 'settings', 'select', 'campaign', 'peers', 'pause', 'result', 'mobile-help'];
const hud = document.getElementById('hud');
const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
let mode = 'menu';
let cur = 'title';           // 지금 보이는 화면
const installUI = initInstallUI({ isInMatch: () => mode === 'game' || mode === 'paused' || cur === 'peers' });
const subStack = [];          // 조작법/설정에서 돌아갈 화면
function show(id) {
  installUI.refresh();
  document.querySelector('#pause [data-action="restart"]').textContent = peerSession?.active ? '친구 대기실로' : '다시 시작';
  document.querySelector('#result [data-action="toSelect"]').textContent = peerSession?.active ? '친구 대기실' : '캐릭터 선택';
  frameStats.reset();
  cur = id;
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  touch.setActive(mode === 'game' && !id && !contextLost);
  document.documentElement.classList.toggle('in-match', mode === 'game' && !id);
  $('mission-hud').classList.toggle('hidden', mode !== 'game' || !!id || !activeMission);
  $('finish-spectating').classList.add('hidden');
  shownSpectating = false;
  window.NativeGame?.setPlaying(mode === 'game' && !id);
  resizeView();
}
function focusFirst(id) {
  const first = document.querySelector('#' + id + ' .btn.big') || document.querySelector('#' + id + ' .btn');
  if (first) first.focus({ preventScroll: true });
}
const cfg = { pilot: 0, robot: 'titan', diff: 1, stock: 3, stage: 'farm' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('rr-cfg') || '{}')); } catch { /* 저장값 무시 */ }
if (!ROBOT_ORDER.includes(cfg.robot)) cfg.robot = 'titan';
if (!STAGES.some((st) => st.id === cfg.stage)) cfg.stage = 'farm';
if (!(cfg.pilot >= 0 && cfg.pilot < PILOTS.length)) cfg.pilot = 0;
if (!Number.isInteger(cfg.pilot)) cfg.pilot = 0;
if (![0, 1, 2].includes(cfg.diff)) cfg.diff = 1;
if (![2, 3, 5].includes(cfg.stock)) cfg.stock = 3;
cfg.autoplay = new URLSearchParams(location.search).has('auto');
let campaignStorage;
try { campaignStorage = localStorage; } catch { /* Session-only progress when storage is unavailable. */ }
let campaignProgress = loadProgress(campaignStorage);
let activeMission = null;
let nextMission = null;
let freeConfig = null;
let choosingCampaignPilot = false;
let peerSession;
const peerLobby = new PeerLobby({
  onMessage: message => peerSession?.receive(message),
  onDisconnect: () => peerSession?.abort(undefined, false),
  onStart: config => peerSession.start(config),
});
peerSession = new PeerSession({ game, lobby: peerLobby,
  startGame: (config, role) => {
    clearMission(); startMatch(true, config);
    if (role === 'guest') {
      game.humans[0].isPlayer = false; game.humans[0].remote = true; game.humans[1].isPlayer = true;
      game.player = game.humans[1];
      ui.reset(); for (const h of game.humans) ui.addFighter(h);
      touch.update(game.player);
    }
  },
  showResult: res => game.onEnd(res),
  paused: note => { pauseGame(true); $('peer-pause-note').textContent = note; },
  resumed: () => resume(true),
  aborted: reason => { toMenu('peers'); peerLobby.status(reason, true); },
});

function openPeers() {
  if (peerSession.active) { peerSession.returnToLobby(); return; }
  clearMission(); toMenu('peers');
}

function clearMission() {
  activeMission = null; nextMission = null;
  if (freeConfig) { Object.assign(cfg, freeConfig); freeConfig = null; }
}
function renderCampaign() {
  const statuses = missionStatus(campaignProgress);
  const stars = statuses.reduce((n, s) => n + s.bestStars, 0);
  $('campaign-progress').textContent = `${statuses.filter(s => s.cleared).length} / 6 클리어 · ${stars} / 18 ★`;
  $('campaign-pilot').textContent = `${PILOTS[cfg.pilot].name} · ${ROBOT_INFO[cfg.robot].name}`;
  const list = $('mission-list'); list.replaceChildren();
  for (const mission of MISSIONS) {
    const status = statuses[mission.index];
    const card = document.createElement('article');
    card.className = 'mission-card' + (status.unlocked ? '' : ' locked') + (status.cleared ? ' cleared' : '');
    const no = el('span', 'mission-number', String(mission.index + 1).padStart(2, '0'));
    const heading = el('h3', '', mission.title);
    const detail = el('p', 'mission-goal', mission.goalText);
    const meta = el('p', 'mission-meta', `${STAGES.find(s => s.id === mission.stage).name} · ${['쉬움', '보통', '어려움'][mission.diff]} · 목숨 ${mission.stock}`);
    const medals = el('p', 'mission-medals', status.cleared ? '★'.repeat(status.bestStars) + '☆'.repeat(3 - status.bestStars) : mission.medals.map(m => m.text).join(' / '));
    const button = el('button', 'btn' + (status.unlocked ? ' big' : ''), status.unlocked ? (status.cleared ? '다시 도전' : '출격') : '이전 도전 클리어');
    button.type = 'button'; button.disabled = !status.unlocked;
    button.setAttribute('aria-label', `${mission.title} ${status.unlocked ? '출격' : '잠김'}`);
    button.onclick = () => { audio.unlock(); launchMission(mission.id); };
    card.append(no, heading, detail, meta, medals, button); list.appendChild(card);
  }
}
function launchMission(id) {
  if (!isUnlocked(campaignProgress, id)) return;
  const mission = MISSIONS.find(m => m.id === id);
  if (!freeConfig) freeConfig = { stage: cfg.stage, diff: cfg.diff, stock: cfg.stock };
  activeMission = mission; nextMission = null;
  Object.assign(cfg, mission.config);
  $('mission-hud').textContent = `${mission.index + 1}. ${mission.goalText}`;
  startMatch();
}
function openCampaign() { clearMission(); choosingCampaignPilot = false; toMenu('campaign'); renderCampaign(); }
function confirmSelection() { if (choosingCampaignPilot) openCampaign(); else startMatch(); }

// 메뉴 배경: 무대 위에 로봇/파일럿 전시
const showcase = new THREE.Group();
scene.add(showcase);
let previewRobot = null, previewHuman = null, previewKey = '';
function buildPreview() {
  const key = cfg.robot + cfg.pilot;
  if (key === previewKey) return;
  previewKey = key;
  if (previewRobot) { showcase.remove(previewRobot.root); previewRobot.dispose(); }
  if (previewHuman) { showcase.remove(previewHuman.root); previewHuman.dispose(); }
  const p = PILOTS[cfg.pilot];
  previewRobot = createRobot(cfg.robot, { team: p.color });
  previewHuman = createHuman(p);
  previewRobot.root.position.set(0, 0, 0);
  previewHuman.root.position.set(3.4, 0, 1.6);
  previewHuman.root.rotation.y = -0.5;
  showcase.add(previewRobot.root, previewHuman.root);
  previewRobot.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  for (const e of previewRobot.eyes) e.material.emissiveIntensity = 2.5;
}

function renderPilots() {
  const list = document.getElementById('pilot-list');
  list.innerHTML = '';
  PILOTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'pilot' + (i === cfg.pilot ? ' on' : '');
    b.setAttribute('aria-pressed', String(i === cfg.pilot));
    b.style.setProperty('--c', hex(p.color));
    b.innerHTML = '<span class="pilot-face"></span><span class="pilot-txt"><span class="pilot-name"></span><span class="pilot-desc"></span><span class="pilot-skills"></span></span><span class="pilot-role"></span>';
    b.querySelector('.pilot-face').style.background = hex(p.color);
    b.querySelector('.pilot-name').textContent = p.name;
    b.querySelector('.pilot-desc').textContent = p.desc;
    const role = roleOf(p), skills = [p.skill1?.name, p.skill2?.name].filter(Boolean);
    b.querySelector('.pilot-role').textContent = role;
    for (const s of skills) b.querySelector('.pilot-skills').appendChild(el('span', 'ps', s));
    b.setAttribute('aria-label', p.name + ', ' + role + (skills.length ? ', 스킬 ' + skills.join(', ') : ''));
    b.onclick = () => { cfg.pilot = i; audio.sfx('ui'); renderSelect(); };
    list.appendChild(b);
  });
}
// 클래스 · 세부 역할 (cls/sub 가 없으면 role 문자열)
function roleOf(p) { return p.cls ? p.cls + (p.sub ? ' · ' + p.sub : '') : p.role || ''; }
// 파일럿 스킬 1/2 요약 줄: [키] 이름 · 쿨다운
function pilotSkillRows(p) {
  const ul = el('ul', 'skill-desc pilot-skill-rows');
  const rows = [['hvy', '스킬 1', p.skill1], ['grd', '스킬 2', p.skill2]];
  for (const [action, slot, s] of rows) {
    if (!s) continue;
    const li = el('li');
    li.appendChild(el('b', '', controlLabel(action) === slot ? slot : slot + ' ' + controlLabel(action)));
    const hold = s.kind === 'guard' || s.kind === 'parry';
    li.appendChild(document.createTextNode(' ' + s.name + (hold ? ' (누르고 있기)' : s.cd ? ' (' + s.cd + '초)' : '')));
    ul.appendChild(li);
  }
  return ul;
}
function renderRobots() {
  const el = document.getElementById('robot-list');
  el.innerHTML = '';
  for (const t of ROBOT_ORDER) {
    const info = ROBOT_INFO[t];
    const b = document.createElement('button');
    b.className = 'robot-card' + (t === cfg.robot ? ' on' : '');
    b.setAttribute('aria-pressed', String(t === cfg.robot));
    b.style.setProperty('--c', '#' + info.color.toString(16).padStart(6, '0'));
    b.innerHTML = '<span class="rc-name"></span><span class="rc-tag"></span>';
    b.querySelector('.rc-name').textContent = info.name;
    b.querySelector('.rc-tag').textContent = ROBOT_STATS[t].tag;
    b.onclick = () => { cfg.robot = t; audio.sfx('ui'); renderSelect(); };
    el.appendChild(b);
  }
}
function renderDetail() {
  const t = cfg.robot, info = ROBOT_INFO[t], st = ROBOT_STATS[t];
  const el = document.getElementById('robot-detail');
  el.innerHTML = '';
  el.style.setProperty('--c', '#' + info.color.toString(16).padStart(6, '0'));
  const h3 = document.createElement('h3'); h3.textContent = info.name; el.appendChild(h3);
  const p = document.createElement('p'); p.textContent = info.desc; el.appendChild(p);
  el.appendChild(statBars(st.bars, { power: '파워', speed: '스피드', range: '사거리', armor: '내구도' }));
  const ul = document.createElement('ul');
  ul.className = 'skill-desc';
  for (const s of st.skills) {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = robotKey(s.key);
    li.appendChild(b);
    li.appendChild(document.createTextNode(' ' + s.name + ' — ' + s.desc));
    ul.appendChild(li);
  }
  el.appendChild(ul);
}
// 로봇 스킬 표기 J/K/L 을 현재 키로
const ROBOT_KEY = { J: 'atk', K: 'hvy', L: 'grd' };
const robotKey = (k) => (ROBOT_KEY[k] ? controlLabel(ROBOT_KEY[k]) : k);

function statBars(vals, names) {
  const wrap = document.createElement('div');
  wrap.className = 'stats';
  for (const k of Object.keys(names)) {
    const row = document.createElement('div');
    row.className = 'stat';
    row.innerHTML = '<span class="stat-l"></span><div class="sbar" role="meter" aria-valuemin="0" aria-valuemax="5"><i></i></div>';
    row.querySelector('.stat-l').textContent = names[k];
    const v = (vals && vals[k]) || 0;
    const bar = row.querySelector('.sbar');
    bar.setAttribute('aria-valuenow', v);
    bar.setAttribute('aria-label', names[k] + ' ' + v + '/5');
    row.querySelector('i').style.width = v * 20 + '%';
    wrap.appendChild(row);
  }
  return wrap;
}
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
// 기술 목록: [입력] 이름 — 설명
function moveList(moves, cls = 'move-list') {
  const ul = el('ul', cls);
  for (const m of moves || []) {
    const li = el('li');
    li.appendChild(el('b', 'mv-in', formatControls(m.input)));
    li.appendChild(el('span', 'mv-name', m.name));
    if (m.desc) li.appendChild(el('span', 'mv-desc', m.desc));
    ul.appendChild(li);
  }
  return ul;
}
function renderPilotDetail() {
  const p = PILOTS[cfg.pilot];
  const d = $('pilot-detail');
  d.innerHTML = '';
  d.style.setProperty('--c', hex(p.color));
  const h = el('h3');
  h.appendChild(el('span', '', p.name));
  if (roleOf(p)) h.appendChild(el('span', 'pd-role', roleOf(p)));
  d.appendChild(h);
  d.appendChild(el('p', '', p.desc));
  d.appendChild(pilotSkillRows(p));
  d.appendChild(statBars(p.stats, { power: '파워', speed: '스피드', air: '공중', tech: '기술' }));
  if (p.traits && p.traits.length) {
    const ul = el('ul', 'traits');
    for (const t of p.traits) ul.appendChild(el('li', '', t));
    d.appendChild(ul);
  }
  d.appendChild(moveList(p.moves));
}
function renderStages() {
  const seg = $('seg-stage');
  if (!seg.childElementCount) {
    for (const st of STAGES) {
      const b = el('button', '', st.name);
      b.dataset.v = st.id;
      b.onclick = () => { cfg.stage = st.id; audio.sfx('ui'); renderSelect(); };
      seg.appendChild(b);
    }
  }
  const st = STAGES.find((x) => x.id === cfg.stage) || STAGES[0];
  $('stage-desc').textContent = st ? st.desc : '';
}
function renderSelect() {
  renderPilots(); renderRobots(); renderDetail(); renderPilotDetail(); renderStages(); buildPreview();
  for (const [id, key] of [['seg-diff', 'diff'], ['seg-stock', 'stock'], ['seg-stage', 'stage']]) {
    for (const b of document.querySelectorAll('#' + id + ' button')) {
      const on = key === 'stage' ? b.dataset.v === cfg.stage : Number(b.dataset.v) === cfg[key];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  try { localStorage.setItem('rr-cfg', JSON.stringify({ pilot: cfg.pilot, robot: cfg.robot, diff: cfg.diff, stock: cfg.stock, stage: cfg.stage })); } catch { /* 저장 실패 무시 */ }
}
for (const [id, key] of [['seg-diff', 'diff'], ['seg-stock', 'stock']]) {
  for (const b of document.querySelectorAll('#' + id + ' button')) b.onclick = () => { cfg[key] = Number(b.dataset.v); audio.sfx('ui'); renderSelect(); };
}

// ---------------- 조작법 ----------------
const BARRIER_TEXT = '게이지 MAX 에서 호출하면 배리어가 펼쳐져 주변 적을 밀어내고, 로봇이 착지해 탑승할 때까지 공격을 막아줍니다. 맞는 중에도 호출할 수 있습니다.';
const HELP_TABS = [['basic', '기본 조작'], ['combo', '공통 콤보'], ['pilot', '파일럿별 기술'], ['robot', '로봇 조작']];
let helpTab = 'basic';
function keyRows(rows) {
  const g = el('div', 'help-grid');
  for (const [k, desc] of rows) {
    const kc = el('div');
    for (const part of String(k).split('|')) kc.appendChild(el('kbd', '', formatControls(part)));
    g.appendChild(kc);
    g.appendChild(el('div', '', formatControls(desc)));
  }
  return g;
}
function note(txt, cls = 'help-note') { return el('p', cls, txt); }
function renderHelp() {
  const tabs = $('help-tabs');
  if (!tabs.childElementCount) {
    for (const [id, name] of HELP_TABS) {
      const b = el('button', 'tab', name);
      b.setAttribute('role', 'tab');
      b.id = 'ht-' + id;
      b.dataset.tab = id;
      b.setAttribute('aria-controls', 'help-body');
      b.onclick = () => { helpTab = id; audio.sfx('ui'); renderHelp(); };
      tabs.appendChild(b);
    }
    // 좌우 방향키로 탭 이동
    tabs.addEventListener('keydown', (e) => {
      const i = HELP_TABS.findIndex(([id]) => id === helpTab);
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % HELP_TABS.length;
      else if (e.key === 'ArrowLeft') n = (i + HELP_TABS.length - 1) % HELP_TABS.length;
      if (n < 0) return;
      e.preventDefault();
      helpTab = HELP_TABS[n][0];
      renderHelp();
      $('ht-' + helpTab).focus();
    });
  }
  for (const b of tabs.children) {
    const on = b.dataset.tab === helpTab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  const body = $('help-body');
  body.setAttribute('aria-labelledby', 'ht-' + helpTab);
  body.innerHTML = '';
  body.scrollTop = 0;
  if (helpTab === 'basic') {
    body.appendChild(keyRows([
      ['{move}', '이동'],
      ['{atk}', '공격: 연타하면 콤보 · 공중에서 공중 콤보 · 대시 중 태클'],
      ['{hvy}', '스킬 1: 파일럿 대표 공격 기술 (쿨다운)'],
      ['{grd}', '스킬 2: 파일럿 방어 기술 (가드·구르기·배리어·반격 등, 쿨다운)'],
      ['{jump}', '점프 · 띄운 직후 {atk} 버튼으로도 따라 뛰어요'],
      ['{dash}', '대시 (짧은 무적)'],
      ['{act}', '호출 (게이지 MAX) · 로봇 옆에서 누르고 있으면 탑승 · 타고 있을 때 길게 하차'],
      ['{pause}', '일시정지'],
      ...(mobileControls ? [] : [['F1', '게임 중 키 안내 켜기/끄기']]),
    ]));
    body.appendChild(note('브레이크 버스트 — 연속으로 맞아 콤보에 갇히면 스킬 2 버튼이 BREAK 로 반짝입니다. {grd} 를 누르면 스킬 2 쿨다운을 쓰고 주변을 밀어내며 빠져나옵니다.'.replace(/\{grd\}/g, controlLabel('grd')), 'help-note hl'));
    body.appendChild(note('쓰러졌을 때는 아무 버튼이나 누르거나 스틱을 밀면 바로 일어납니다. 일어난 직후 잠깐 무적이에요.'));
    if (mobileControls) body.appendChild(note('터치: 큰 버튼은 공격, 옆의 작은 두 버튼은 스킬 1·2 예요. 호출 버튼은 당근 게이지가 가득 차면 나타나고, 로봇 옆에서는 탑승, 타고 있으면 하차 버튼으로 바뀝니다. 오른쪽 화면(또는 공격 버튼)을 위로 튕기면 점프, 옆·아래로 밀면 대시예요.', 'help-note hl'));
    body.appendChild(note('호출 배리어 — ' + BARRIER_TEXT, 'help-note hl'));
    body.appendChild(note('당근 게이지는 시간이 지나거나, 때리거나, 맞거나, 콤보를 이어가면 찹니다. 적이 로봇에 타고 있으면 더 빨리 찹니다.'));
    body.appendChild(note('빈 로봇은 누구나 탈 수 있습니다. 주인은 0.8초, 다른 사람은 2.2초가 걸리니 적 로봇이 떨어지면 달려가서 방해하거나 빼앗으세요. 탑승하려는 사람을 때리면 탑승이 취소됩니다.'));
    body.appendChild(note('게임패드: 왼쪽 스틱 이동, A 점프, X 공격, Y 스킬 1, B 스킬 2, RB 대시, LB 호출/탑승/하차, Start 일시정지'));
  } else if (helpTab === 'combo') {
    body.appendChild(moveList(COMMON_MOVES, 'move-list big'));
    body.appendChild(note('타수가 이어지는 동안 화면 왼쪽에 콤보 수가 표시됩니다. 콤보가 길어질수록 한 타의 피해는 조금씩 줄어들지만 게이지는 더 많이 찹니다.'));
  } else if (helpTab === 'pilot') {
    const grid = el('div', 'pilot-help');
    for (const p of PILOTS) {
      const c = el('section', 'ph-card');
      c.style.setProperty('--c', hex(p.color));
      const h = el('h3');
      h.appendChild(el('span', '', p.name));
      if (roleOf(p)) h.appendChild(el('span', 'pd-role', roleOf(p)));
      c.appendChild(h);
      c.appendChild(el('p', 'ph-desc', p.desc));
      c.appendChild(pilotSkillRows(p));
      if (p.traits) { const ul = el('ul', 'traits'); for (const t of p.traits) ul.appendChild(el('li', '', t)); c.appendChild(ul); }
      c.appendChild(moveList(p.moves));
      grid.appendChild(c);
    }
    body.appendChild(grid);
  } else {
    body.appendChild(keyRows([
      ['{move}', '이동'],
      ['{atk}', '기본 콤보 (연타)'],
      ['{hvy}', '스킬 1 (쿨다운)'],
      ['{grd}', '스킬 2 · 필살기 (쿨다운)'],
      ['{jump}', '점프'],
      ['{dash}', '부스트 대시'],
      ['{act}', '길게 누르면 하차'],
    ]));
    const grid = el('div', 'robot-help');
    for (const t of ROBOT_ORDER) {
      const info = ROBOT_INFO[t], st = ROBOT_STATS[t];
      const c = el('section', 'ph-card');
      c.style.setProperty('--c', hex(info.color));
      const h = el('h3');
      h.appendChild(el('span', '', info.name));
      h.appendChild(el('span', 'pd-role', st.tag));
      c.appendChild(h);
      c.appendChild(moveList(st.skills.map((s) => ({ input: robotKey(s.key), name: s.name, desc: s.desc + (s.cd ? ' (' + s.cd + '초)' : '') }))));
      grid.appendChild(c);
    }
    body.appendChild(grid);
    body.appendChild(note('로봇 내구도는 시간이 지나거나 맞으면 줄어들고, 0 이 되면 폭발하며 튕겨 나옵니다. 파일럿마다 탑승 보너스가 있습니다 (파일럿별 기술 탭 참고).'));
  }
}

// ---------------- 설정 ----------------
const volCfg = { m: 0.8, mu: 0.45 };
try { Object.assign(volCfg, JSON.parse(localStorage.getItem('rr-audio') || '{}')); } catch { /* 저장값 무시 */ }
audio.setVolume && audio.setVolume(volCfg.m, volCfg.mu);
let capturing = null; // { action, slot }
function setStatus(t) { $('keys-status').textContent = t; }
function renderKeys() {
  const grid = $('keys-grid');
  const binds = input.getBinds();
  grid.innerHTML = '';
  for (const a of input.ACTIONS) {
    const lab = el('span', 'k-name', input.ACTION_NAMES[a]);
    lab.id = 'kn-' + a;
    grid.appendChild(lab);
    for (const slot of [0, 1]) {
      const b = el('button', 'k-slot');
      const wait = capturing && capturing.action === a && capturing.slot === slot;
      b.textContent = wait ? '키 입력…' : binds[a][slot] ? input.keyLabel(binds[a][slot]) : '—';
      b.classList.toggle('wait', !!wait);
      b.classList.toggle('empty', !binds[a][slot]);
      b.setAttribute('aria-label', input.ACTION_NAMES[a] + ' ' + (slot ? '보조' : '주') + ' 키: ' + (binds[a][slot] ? input.keyLabel(binds[a][slot]) : '없음') + (wait ? ', 새 키를 누르세요' : ''));
      b.dataset.a = a;
      b.dataset.slot = slot;
      b.onclick = () => startCapture(a, slot);
      grid.appendChild(b);
    }
  }
}
function startCapture(a, slot) {
  audio.sfx('ui');
  capturing = { action: a, slot };
  renderKeys();
  setStatus(input.ACTION_NAMES[a] + ': 새 키를 누르세요 (Esc 취소, Del 비우기)');
  input.captureNext((code) => {
    const c = capturing;
    capturing = null;
    if (!code) setStatus('취소했습니다');
    else if (code === 'Delete' || code === 'Backspace') {
      setStatus(input.setBind(c.action, c.slot, null) ? input.ACTION_NAMES[c.action] + ' 칸을 비웠습니다' : '동작마다 키가 하나는 있어야 합니다');
    } else {
      const before = input.getBinds();
      const owner = input.ACTIONS.find((x) => (x !== c.action || before[x].indexOf(code) !== c.slot) && before[x].includes(code));
      if (input.setBind(c.action, c.slot, code)) {
        setStatus(input.ACTION_NAMES[c.action] + ' = ' + input.keyLabel(code) + (owner && owner !== c.action ? ' (' + input.ACTION_NAMES[owner] + ' 키와 맞바꿈)' : ''));
        audio.sfx('confirm');
      } else setStatus(input.keyLabel(code) + ' 키는 ' + (owner ? input.ACTION_NAMES[owner] + ' 의 유일한 키라서 바꿀 수 없습니다. 먼저 그 동작에 다른 키를 넣어 주세요' : '쓸 수 없습니다'));
    }
    renderKeys();
    const btn = document.querySelector('.k-slot[data-a="' + c.action + '"][data-slot="' + c.slot + '"]');
    if (btn) btn.focus({ preventScroll: true });
  });
}
function renderSettings() {
  renderKeys();
  setStatus('');
  const vm = $('vol-master'), vu = $('vol-music');
  vm.value = Math.round(volCfg.m * 100); vu.value = Math.round(volCfg.mu * 100);
  $('vol-master-v').textContent = vm.value; $('vol-music-v').textContent = vu.value;
  $('opt-hint').checked = hintDefaultOpen();
  $('opt-touch').value = preferences.touch;
  $('opt-quality').value = preferences.quality;
  $('opt-fps').value = preferences.frameRate;
  $('opt-diagnostics').checked = preferences.diagnostics;
  $('opt-left-handed').checked = preferences.leftHanded;
  $('opt-touch-scale').value = Math.round(preferences.scale * 100);
  $('opt-touch-scale-v').textContent = Math.round(preferences.scale * 100) + '%';
  $('opt-reduce-motion').checked = preferences.reducedMotion;
  $('quality-note').textContent = profile.low ? '현재: 절전' : '현재: 높음';
}
function applyPreferences() {
  mobileControls = touchEnabled(preferences, hasTouch());
  document.documentElement.classList.toggle('touch-mode', mobileControls);
  touch.setEnabled(mobileControls);
  touch.setHandedness(preferences.leftHanded);
  touch.setScale(preferences.scale);
  touch.setActive(mode === 'game' && !cur && !contextLost);
  game.reducedMotion = preferences.reducedMotion;
  fx.reducedMotion = preferences.reducedMotion;
  ui.reducedMotion = preferences.reducedMotion;
  ui.skillKey = '#';
  $('performance-hud').classList.toggle('hidden', !(preferences.diagnostics || new URLSearchParams(location.search).has('stats')));
  applyRenderQuality();
  renderKeyHints();
}
function applyRenderQuality() {
  profile = qualityProfile(preferences, hasTouch(), devicePixelRatio, innerWidth, innerHeight);
  if (renderBudget.thermal >= 2) profile = qualityProfile({ quality: 'low' }, true, 1, innerWidth, innerHeight);
  profile.dpr *= Math.min(renderBudget.scale, renderBudget.thermal >= 2 ? .75 : 1);
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.needsUpdate = true;
  fx.setQuality(profile.low);
  arena.setQuality?.(profile.low);
  setModelQuality(profile.low);
  applyModelQuality(scene, profile.low);
  renderBudget.reset();
  resizeView();
  syncPostprocessing();
}
for (const id of ['opt-touch', 'opt-quality', 'opt-fps', 'opt-diagnostics', 'opt-left-handed', 'opt-touch-scale', 'opt-reduce-motion']) {
  $(id).addEventListener('change', () => {
    preferences.touch = $('opt-touch').value;
    preferences.quality = $('opt-quality').value;
    // 프레임 설정을 직접 바꾸면 자동 30 전환을 다시 시험한다
    if (preferences.frameRate !== $('opt-fps').value) renderBudget.capped = false;
    preferences.frameRate = $('opt-fps').value;
    preferences.diagnostics = $('opt-diagnostics').checked;
    preferences.leftHanded = $('opt-left-handed').checked;
    preferences.scale = Number($('opt-touch-scale').value) / 100;
    preferences.reducedMotion = $('opt-reduce-motion').checked;
    savePreferences(); applyPreferences(); renderSettings();
  });
}
$('opt-touch-scale').addEventListener('input', () => { $('opt-touch-scale-v').textContent = $('opt-touch-scale').value + '%'; });
touchMedia.addEventListener('change', applyPreferences);
function onVol() {
  volCfg.m = Number($('vol-master').value) / 100;
  volCfg.mu = Number($('vol-music').value) / 100;
  $('vol-master-v').textContent = $('vol-master').value;
  $('vol-music-v').textContent = $('vol-music').value;
  audio.setVolume && audio.setVolume(volCfg.m, volCfg.mu);
  try { localStorage.setItem('rr-audio', JSON.stringify(volCfg)); } catch { /* 저장 실패 무시 */ }
}
$('vol-master').addEventListener('input', onVol);
$('vol-music').addEventListener('input', onVol);
$('vol-master').addEventListener('change', () => audio.sfx('ui'));
$('keys-reset').onclick = () => { input.cancelCapture(); capturing = null; input.resetBinds(); setStatus('기본 키로 되돌렸습니다'); audio.sfx('confirm'); };
$('opt-hint').addEventListener('change', (e) => { hintSt.on = e.target.checked; saveHint(); applyHint(e.target.checked); });

// ---------------- 게임 중 키 안내 ----------------
// 처음 3판은 기본으로 펼치고, 직접 켜고 끄면 그 선택을 기억한다
const hintSt = { n: 0, on: null };
try { Object.assign(hintSt, JSON.parse(localStorage.getItem('rr-hint') || '{}')); } catch { /* 저장값 무시 */ }
function saveHint() { try { localStorage.setItem('rr-hint', JSON.stringify(hintSt)); } catch { /* 저장 실패 무시 */ } }
function hintDefaultOpen() { return typeof hintSt.on === 'boolean' ? hintSt.on : hintSt.n < 3; }
function applyHint(open) {
  $('keyhint').classList.toggle('collapsed', !open);
  $('kh-toggle').setAttribute('aria-expanded', String(open));
}
function toggleHint() {
  const open = $('keyhint').classList.contains('collapsed');
  hintSt.on = open;
  saveHint();
  applyHint(open);
}
$('kh-toggle').onclick = (e) => { e.stopPropagation(); toggleHint(); $('kh-toggle').blur(); };
function fillDl(dl, rows) {
  dl.innerHTML = '';
  for (const [k, name] of rows) {
    const dt = el('dt');
    for (const part of k.split('|')) dt.appendChild(el('kbd', '', formatControls(part)));
    dl.appendChild(dt);
    dl.appendChild(el('dd', '', name));
  }
}
function renderKeyHints() {
  fillDl($('kh-human'), [
    ['{move}', '이동'], ['{atk}', '공격 · 연타 콤보'], ['{atk}|{atk}|{hvy}', '띄우기'], ['{hvy}', '스킬 1'], ['{grd}', '스킬 2'],
    ['{jump}', '점프'], ['{dash}', '대시'], ['{act}', '호출 · 길게 탑승'],
  ]);
  fillDl($('kh-robot'), [
    ['{move}', '이동'], ['{atk}', '콤보'], ['{hvy}', '스킬 1'], ['{grd}', '스킬 2'], ['{jump}', '점프'], ['{dash}', '부스트'], ['{act}', '길게 하차'],
  ]);
  fillDl($('pause-keys'), [
    ['{move}', '이동'], ['{atk}', '공격 · 콤보 / 로봇 콤보'], ['{hvy}', '스킬 1'], ['{grd}', '스킬 2'],
    ['{jump}', '점프'], ['{dash}', '대시'], ['{act}', '호출 · 탑승 · 하차'], ['{pause}', '일시정지'], ['F1', '키 안내'],
  ]);
  $('title-hint').textContent = input.fmtKeys('{move} 이동 · {atk} 공격 · {hvy} 스킬 1 · {grd} 스킬 2 · {jump} 점프 · {dash} 대시 · {act} 호출. 주먹으로 게이지를 채워 호출하면 배리어가 지켜 주는 동안 토끼 로봇이 떨어집니다. 먼저 올라타세요.');
  if (mobileControls) $('title-hint').textContent = '터치로 바로 플레이 · 왼손 이동, 오른손 공격! 당근 게이지가 차면 호출 버튼이 나타나요. 로봇 가까이에서 탑승을 길게 누르세요.';
}
function refreshKeysUI() {
  renderKeyHints();
  if (cur === 'help') renderHelp();
  if (cur === 'settings') renderKeys();
  if (cur === 'select') { renderDetail(); renderPilotDetail(); }
}
addEventListener('rr-keys-changed', refreshKeysUI);

// 조작법/설정: 타이틀에서도 일시정지에서도 열리고, 돌아가면 이전 화면으로
function openSub(id) {
  if (cur === id) return;
  if (cur && cur !== 'help' && cur !== 'settings') subStack.length = 0;
  subStack.push(cur || (mode === 'paused' ? 'pause' : 'title'));
  if (id === 'help') renderHelp();
  if (id === 'settings') renderSettings();
  show(id);
  if (id === 'help') { const t = $('ht-' + helpTab); if (t) t.focus({ preventScroll: true }); } else focusFirst(id);
}
function back() {
  input.cancelCapture();
  capturing = null;
  const prev = subStack.pop() || (mode === 'paused' ? 'pause' : 'title');
  show(prev);
  focusFirst(prev);
}

// 스테이지: arena.setStage 가 있을 때만
function applyStage(id) {
  if (arena.setStage) arena.setStage(id);
  arena.setQuality?.(profile.low);
}

function toMenu(screen) {
  if (screen !== 'peers' && peerLobby.link) {
    peerSession.clear(); peerLobby.disconnect();
  }
  if (screen === 'title' || screen === 'select') clearMission();
  input.resetInputs();
  if (mode === 'game' || mode === 'paused' || mode === 'result') game.clear();
  // 메뉴 전시대는 농장 섬 한가운데에 선다
  applyStage('farm');
  mode = 'menu';
  hud.classList.add('hidden');
  showcase.visible = true;
  hud.classList.remove('riding');
  subStack.length = 0;
  input.cancelCapture();
  capturing = null;
  show(screen);
  audio.startMusic('menu');
  if (screen === 'select') renderSelect();
  $('select').querySelector('.opt-row').classList.toggle('hidden', choosingCampaignPilot);
  $('stage-desc').classList.toggle('hidden', choosingCampaignPilot);
  $('select-start').textContent = choosingCampaignPilot ? '선택 완료 · 도전으로' : '난투 시작';
  focusFirst(screen);
}

function startMatch(skipGuide = false, peerConfig = null) {
  if (contextLost) return;
  if (mobileControls && !preferences.touchGuideSeen && !skipGuide && !cfg.autoplay) {
    show('mobile-help');
    focusFirst('mobile-help');
    return;
  }
  input.resetInputs();
  simulationClock.reset();
  renderBudget.scale = 1;
  applyPreferences();
  mode = 'game';
  subStack.length = 0;
  show(null);
  hud.classList.remove('hidden');
  showcase.visible = false;
  applyStage((peerConfig || cfg).stage);
  applyHint(hintDefaultOpen());
  hintSt.n++;
  saveHint();
  game.start(peerConfig || cfg);
  uiElapsed = 0;
  touch.update(game.player);
  canvas.focus && canvas.focus();
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
}

game.onEnd = (res) => {
  peerSession.localResult();
  mode = 'result';
  const win = res[0].h === game.player;
  const playerRank = res.findIndex(r => r.h === game.player);
  const playerResult = res[playerRank];
  const message = $('result-message');
  nextMission = null;
  if (activeMission && !cfg.autoplay) {
    const outcome = recordResult(campaignProgress, activeMission.id, {
      rank: playerRank + 1, kos: playerResult.kos, falls: playerResult.falls,
      dmg: playerResult.dmg, stock: Math.max(0, playerResult.stock), autoplay: false,
    });
    if (outcome.accepted) {
      campaignProgress = outcome.progress;
      const saved = saveProgress(campaignStorage, campaignProgress);
      message.textContent = outcome.evaluation.cleared
        ? `${'★'.repeat(outcome.evaluation.stars)} 도전 성공! ${activeMission.title}${outcome.newBest ? ' · 최고 기록' : ''}`
        : `다시 도전해 보세요 · 목표: ${activeMission.goalText}`;
      if (!saved) message.textContent += ' · 저장할 수 없어 이번 실행 동안만 기록됩니다';
      if (outcome.evaluation.cleared) nextMission = MISSIONS[activeMission.index + 1]?.id || null;
      if (outcome.evaluation.cleared && !nextMission) message.textContent += ' · 모든 도전을 완주했어요!';
    } else message.textContent = '이번 경기는 기록에 반영되지 않았어요.';
  } else message.textContent = peerSession.active ? '친구 대전을 마쳤어요. 대기실에서 준비하면 다시 함께 할 수 있어요.'
    : win ? '멋진 승부였어요! 다른 로봇과 무대에도 도전해 보세요.' : '방어 스킬로 버티고, 당근이 차면 로봇을 호출해 보세요.';
  $('next-mission').classList.toggle('hidden', !nextMission);
  document.getElementById('result-title').textContent = win ? '승리!' : res.findIndex((r) => r.h === game.player) + 1 + '위';
  const tbl = document.createElement('table');
  tbl.className = 'res';
  tbl.innerHTML = '<thead><tr><th>순위</th><th>파일럿</th><th>남은 목숨</th><th>KO</th><th>낙하</th><th>피해량</th></tr></thead>';
  const tb = document.createElement('tbody');
  res.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.h === game.player) tr.className = 'me';
    const cells = [i + 1, r.name, Math.max(0, r.stock), r.kos, r.falls, r.dmg];
    cells.forEach((v, j) => { const td = document.createElement('td'); td.textContent = v; if (j === 0) td.className = 'rank'; if (j === 1) td.style.color = '#' + r.color.toString(16).padStart(6, '0'); tr.appendChild(td); });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  const host = document.getElementById('result-table');
  host.innerHTML = '';
  host.appendChild(tbl);
  show('result');
  document.querySelector('#result .btn.big').focus({ preventScroll: true });
  audio.startMusic('menu');
};

const actions = {
  toPeers: openPeers,
  toCampaign: openCampaign,
  chooseCampaignPilot: () => { choosingCampaignPilot = true; toMenu('select'); },
  nextMission: () => { if (nextMission) launchMission(nextMission); },
  finishSpectating: () => { if (mode === 'game' && game.player?.out) game.endMatch('player-out'); },
  toSelect: () => { if (peerSession.active) { openPeers(); return; } choosingCampaignPilot = false; toMenu('select'); },
  toHelp: () => openSub('help'),
  toSettings: () => openSub('settings'),
  back,
  toTitle: () => toMenu('title'),
  startMatch: () => startMatch(),
  confirmSelection,
  quickStart: () => { clearMission(); cfg.diff = 0; cfg.stock = 3; startMatch(); },
  beginTouchMatch: () => { preferences.touchGuideSeen = true; savePreferences(); startMatch(true); },
  cancelTouchStart: () => activeMission ? openCampaign() : toMenu('select'),
  resume,
  restart: () => peerSession.active ? openPeers() : startMatch(),
};
function resume(fromPeer = false) {
  if (contextLost) return;
  if (peerSession.active && !fromPeer) { peerSession.setPaused(false); return; }
  $('peer-pause-note').textContent = '';
  input.resetInputs();
  simulationClock.reset();
  touch.reset();
  audio.unlock();
  input.cancelCapture();
  capturing = null;
  subStack.length = 0;
  mode = 'game';
  show(null);
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
}
function pauseGame(fromPeer = false) {
  if (mode !== 'game') return;
  if (peerSession.active && !fromPeer) { peerSession.setPaused(true); return; }
  input.resetInputs();
  simulationClock.reset();
  mode = 'paused';
  subStack.length = 0;
  show('pause');
  focusFirst('pause');
}
document.addEventListener('click', (e) => {
  audio.unlock();
  const b = e.target.closest('[data-action]');
  if (!b) return;
  audio.sfx(b.dataset.action === 'toTitle' || b.dataset.action === 'back' ? 'back' : 'confirm');
  actions[b.dataset.action]();
});
addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'F1') {
    e.preventDefault();
    if (mode === 'game') toggleHint();
    return;
  }
  // 선택 화면에서 Enter 로 바로 시작
  if (mode === 'menu' && e.code === 'Enter' && !document.getElementById('select').classList.contains('hidden') && !(document.activeElement instanceof HTMLButtonElement)) confirmSelection();
});
addEventListener('pointerdown', () => audio.unlock());
$('game-menu-btn').addEventListener('click', pauseGame);
$('reload-game').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    input.resetInputs(); touch.reset(); pauseGame(); audio.suspend();
  }
});
addEventListener('pagehide', () => { input.resetInputs(); touch.reset(); pauseGame(); audio.suspend(); });
matchMedia('(orientation: portrait)').addEventListener('change', () => { input.resetInputs(); touch.reset(); pauseGame(); });
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); contextLost = true;
  pauseGame(); touch.setActive(false); input.resetInputs(); audio.suspend();
  $('runtime-message').textContent = '화면 연결이 잠시 끊겼어요. 복구를 기다리거나 새로 열어 주세요.';
  $('runtime-notice').classList.remove('hidden');
});
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false; applyPreferences();
  $('runtime-notice').classList.add('hidden');
});
addEventListener('rr-native-pause', () => { input.resetInputs(); touch.reset(); pauseGame(); audio.suspend(); simulationClock.reset(); });
addEventListener('rr-native-resume', () => { input.resetInputs(); touch.reset(); pauseGame(); simulationClock.reset(); renderDirty = true; });
addEventListener('rr-native-back', () => {
  if (mode === 'game') pauseGame();
  else if (cur === 'help' || cur === 'settings') back();
  else if (mode === 'paused') resume();
  else if (cur !== 'title') toMenu('title');
  else window.NativeGame?.close();
});
addEventListener('rr-thermal', (event) => {
  const status = event.detail?.status;
  if (!Number.isInteger(status) || status < 0 || status > 6) return;
  if (renderBudget.thermal === status) return;
  renderBudget.thermal = status;
  $('thermal-note').textContent = status >= 2 ? '기기가 뜨거워져 절전 화면으로 전환했어요.' : '';
  applyRenderQuality();
});

// ---------------- 루프 ----------------
let menuT = 0;
let lastMenuFrame = null, lastRenderFrame = null;
let uiElapsed = 0;
const frameStats = new FrameStats($('performance-hud'));
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  const cpuStart = performance.now();
  if (document.hidden || contextLost) {
    simulationClock.reset(); interp.reset(); lastMenuFrame = lastRenderFrame = null;
    input.endFrame(); return;
  }
  if (mode === 'game') {
    // Poll and consume once per simulation tick. Catch-up ticks cannot repeat taps.
    simulationClock.advance(now, dt => {
      interp.capture(collectInterpTargets());
      touch.update(game.player);
      input.poll();
      if (input.intents.pause && game.phase !== 'end') pauseGame();
      else { if (peerSession.active) peerSession.update(dt, input.intents); else game.update(dt, false); uiElapsed += dt; }
      input.endFrame();
      return mode === 'game';
    });
  } else {
    simulationClock.reset(); interp.reset();
    input.poll();
    if (input.intents.pause) {
      if (cur === 'help' || cur === 'settings') back();
      else if (mode === 'paused') resume();
      else if (cur === 'select') toMenu('title');
    }
    input.endFrame();
  }
  const target = renderBudget.fps(mode, preferences.frameRate, hasTouch());
  if (!renderBudget.due(now, target, renderDirty)) return;
  renderDirty = false;
  const interpolating = mode === 'game';
  if (interpolating) { interp.apply(simulationClock.alpha); camera.updateMatrixWorld(); }
  if (mode === 'game') {
    const spectating = !peerSession.active && !!game.player?.out && game.phase === 'fight';
    if (spectating !== shownSpectating) { shownSpectating = spectating; $('finish-spectating').classList.toggle('hidden', !spectating); }
  }
  if (uiElapsed > 0 && mode !== 'menu') { ui.update(game, uiElapsed); uiElapsed = 0; }
  if (mode === 'menu') {
    const dt = lastMenuFrame === null ? 0 : Math.min(.1, (now - lastMenuFrame) / 1000);
    lastMenuFrame = now;
    menuT += dt;
    arena.update(dt, menuT);
    fx.update(dt, dt);
    const sel = !document.getElementById('select').classList.contains('hidden');
    if (previewRobot) {
      previewRobot.root.rotation.y = sel ? -0.5 + Math.sin(menuT * 0.6) * 0.35 : menuT * 0.3;
      previewRobot.earL.rotation.x = Math.sin(menuT * 2) * 0.15;
      previewRobot.earR.rotation.x = Math.sin(menuT * 2 + 0.6) * 0.15;
      previewRobot.hips.position.y += 0;
      previewRobot.armL.rotation.x = -0.4 + Math.sin(menuT * 1.4) * 0.08;
      previewRobot.armR.rotation.x = -0.4 - Math.sin(menuT * 1.4) * 0.08;
      if (previewRobot.chestCore) previewRobot.chestCore.material.emissiveIntensity = 1.8 + Math.sin(menuT * 5) * 0.8;
      previewHuman.armR.rotation.x = -2.6 + Math.sin(menuT * 3) * 0.2;
    }
    if (sel) {
      const wide = innerWidth / innerHeight;
      // 선택 화면: 오른쪽 절반에 로봇이 보이도록
      camera.position.set(-6.5 * Math.min(1.4, wide / 1.4), 5.2, 15);
      camera.lookAt(-2.2 * Math.min(1.4, wide / 1.4), 3.1, 0);
    } else {
      const a = menuT * 0.12;
      camera.position.set(Math.sin(a) * 17, 7 + Math.sin(menuT * 0.3) * 1, Math.cos(a) * 17);
      camera.lookAt(0, 3.4, 0);
      // 로봇이 로고 오른쪽에 보이도록 시선을 비튼다
      camera.rotateY(innerWidth / innerHeight > 1 ? 0.42 : 0);
    }
  } else lastMenuFrame = null;
  fx.beforeRender();
  updateShadows();
  renderer.info.reset();
  if (composer) composer.render();
  else renderer.render(scene, camera);
  if (interpolating) interp.restore();
  if (interpolating) camera.updateMatrixWorld();
  frameStats.record(now, performance.now() - cpuStart, renderer.info.render.calls, renderer.info.render.triangles,
    { mode, target, dpr: profile.dpr, thermal: renderBudget.thermal });
  if (mode === 'game' && lastRenderFrame !== null) {
    const change = renderBudget.observe(now - lastRenderFrame, now, target, preferences.quality !== 'high', preferences.frameRate === 'auto', profile.dpr > 1.05);
    if (change === 'scale') applyRenderQuality();
    else if (change === 'fps') renderBudget.reset();
  }
  lastRenderFrame = mode === 'game' ? now : null;
}
// 움직이는 루트 오브젝트만 보간한다. 뼈 포즈는 틱 단위로 두어도 눈에 띄지 않고 비용이 크다.
function collectInterpTargets() {
  const list = interpTargets;
  list.length = 0;
  list.push(camera);
  for (const h of game.humans) if (h.rig.root.parent === scene) list.push(h.rig.root);
  for (const r of game.robots) { list.push(r.rig.root); if (r.ring) list.push(r.ring); }
  for (const p of game.projectiles) if (p.mesh) list.push(p.mesh);
  for (const c of game.carrots) if (c.mesh) list.push(c.mesh);
  for (const s of game.shields) if (s.mesh) list.push(s.mesh);
  return list;
}

// 그림자: 정지 화면(일시정지/결과)에서는 다시 그리지 않는다. 경기와 메뉴에서는 캐릭터가 움직이므로 매 렌더 갱신.
renderer.shadowMap.autoUpdate = false;
function updateShadows() {
  if (!renderer.shadowMap.enabled) return;
  if (mode === 'game' || mode === 'menu') renderer.shadowMap.needsUpdate = true;
}

buildPreview();
applyPreferences();
renderKeyHints();
applyHint(hintDefaultOpen());
toMenu('title');
document.getElementById('loading').classList.add('done');
frame();
window.NativeGame?.ready();

// 디버그/QA 용 핸들
window.__rr = { game, cfg, startMatch, toMenu, fx, THREE, input };

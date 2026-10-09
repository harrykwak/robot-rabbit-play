import { hydrateIcons } from './ui-icons.js';
import { portraitImg } from './ui-portraits.js';
import { PILOTS, STAGES, ROBOT_STATS } from './data.js';
import { missionStatus } from './campaign.js';

const tips = ['당근 게이지가 가득 차면 로봇을 호출!', '상대를 무대 밖으로 밀어내면 K.O.!', '로봇의 주스가 부족하면 보급 지점을 찾아요.', '연속 공격으로 상대를 띄우고 공중 콤보!'];
let tipIndex = 0;
let readOnline = () => false;
const onlineStatus = document.getElementById('title-online-status');
// RoomLobby replaces this status text whenever its asynchronous probe settles.
new MutationObserver(() => onlineStatus.classList.toggle('is-online', !!readOnline()))
  .observe(onlineStatus, { childList: true });
function rotateTip() {
  for (const id of ['title-hint', 'loading-tip']) {
    const el = document.getElementById(id);
    if (el && !el.closest('.hidden,.done,.load-failed')) el.textContent = tips[tipIndex % tips.length];
  }
  tipIndex++;
}
rotateTip();
setInterval(rotateTip, 6500);

/** Refresh on menu entry so campaign results and loadout changes are always real. */
export function renderLobby(cfg, progress, robotInfo, getOnline = () => false) {
  readOnline = getOnline;
  const pilot = PILOTS[cfg.pilot], robot = robotInfo[cfg.robot];
  const stars = missionStatus(progress).reduce((sum, item) => sum + item.bestStars, 0);
  const portrait = document.getElementById('title-portrait');
  if (portrait.dataset.pilot !== pilot.id) {
    portrait.replaceChildren(portraitImg('pilot', pilot.id));
    portrait.dataset.pilot = pilot.id;
  }
  document.getElementById('title-pilot').textContent = pilot.name;
  document.getElementById('title-class').textContent = pilot.cls;
  document.getElementById('title-duo').textContent = `${robot.name} × ${pilot.name}`;
  document.getElementById('title-robot-type').textContent = ROBOT_STATS[cfg.robot].tag;
  document.getElementById('title-rules').textContent = `${(STAGES.find(stage => stage.id === cfg.stage) || STAGES[0]).name} · ${['쉬움','보통','어려움'][cfg.diff]} · 목숨 ${cfg.stock}`;
  document.querySelectorAll('[data-lobby-stars]').forEach(el => { el.textContent = `★ ${stars}/18`; });
  onlineStatus.classList.toggle('is-online', !!readOnline());
  for (const id of ['title','solo','friends']) hydrateIcons(document.getElementById(id));
}

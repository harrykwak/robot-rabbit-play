import { STAGES } from './data.js';
import { ROBOT_INFO } from './models.js';
import { portraitImg } from './ui-portraits.js';

let panel, timer, observer;
export function hideMatchIntro() {
  clearTimeout(timer);
  if (panel) panel.hidden = true;
  if (typeof document !== 'undefined') document.documentElement.classList.remove('vs-active');
}

/** Presentation only: countdown, simulation and online input keep their own clocks. */
export function showMatchIntro(game, cfg) {
  hideMatchIntro();
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'vs-intro';
    panel.setAttribute('aria-label', '대전 선수 소개'); panel.hidden = true;
    document.getElementById('hud').append(panel);
    const skip = () => { if (!panel.hidden) hideMatchIntro(); };
    // Do not consume or cancel the event; the same key/tap still reaches gameplay.
    addEventListener('pointerdown', skip, { passive: true });
    addEventListener('keydown', skip);
    observer = new MutationObserver(() => {
      if (!panel.hidden && !document.documentElement.classList.contains('in-match')) hideMatchIntro();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  panel.replaceChildren();
  const stage = document.createElement('div'); stage.className = 'vs-stage rr-ribbon';
  stage.textContent = STAGES.find(s => s.id === cfg.stage)?.name || '난투'; panel.append(stage);
  const row = document.createElement('div'); row.className = 'vs-fighters';
  game.humans.forEach((h, i) => {
    const card = document.createElement('article'); card.className = 'vs-fighter' + (h.isPlayer ? ' is-me' : '');
    card.style.setProperty('--fighter', '#' + h.color.toString(16).padStart(6, '0'));
    card.style.setProperty('--i', i);
    const who = document.createElement('span'); who.className = 'vs-player'; who.textContent = h.isPlayer ? '나' : h.remote ? '플레이어' : 'CPU';
    const name = document.createElement('strong'); name.textContent = h.name;
    const bot = document.createElement('span'); bot.className = 'vs-robot'; bot.textContent = ROBOT_INFO[h.robotType]?.name || h.robotType;
    card.append(who, portraitImg('pilot', h.P.id, 'full', 'vs-portrait'), name, bot); row.append(card);
  });
  const emblem = document.createElement('b'); emblem.className = 'vs-emblem'; emblem.textContent = 'VS';
  const tip = document.createElement('p'); tip.className = 'vs-tip'; tip.textContent = '마지막까지 살아남아라! · 터치 / 아무 키로 건너뛰기';
  panel.append(row, emblem, tip); panel.hidden = false;
  document.documentElement.classList.add('vs-active');
  const reduced = document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // FIGHT calls hideMatchIntro too: the existing 1.65 s countdown always wins.
  timer = setTimeout(hideMatchIntro, reduced ? 800 : 1800);
}

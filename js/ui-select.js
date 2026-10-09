import { portraitImg } from './ui-portraits.js';
import { icon } from './ui-icons.js';
import { ICONS, skillIcon } from './touch-icons.js';

const node = (tag, cls, text) => {
  const e = document.createElement(tag); e.className = cls || '';
  if (text != null) e.textContent = text;
  return e;
};
const badgeColors = { '브루저': '#ee6357', '어쌔신': '#ab70ef', '파이터': '#3caff4', '탱커': '#4cc78e', '슈터': '#eeaa3d', '그래플러': '#db8249', '컨트롤러': '#aa7af0' };

let categoryJumps;
export function syncCategoryJumps(pilot, robotType, robot) {
  if (!categoryJumps) {
    const options = document.querySelector('#select .selection-options');
    const nav = options.querySelector('.selection-jumps');
    const buttons = [...nav.querySelectorAll('button')];
    const headings = ['pilot', 'robot'].map(kind => document.getElementById(kind + '-heading'));
    const activate = kind => buttons.forEach(button => {
      const active = button.dataset.choiceJump === kind;
      button.classList.toggle('is-current', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      const top = index === 0 ? 0 : options.scrollTop + headings[index].getBoundingClientRect().top
        - options.getBoundingClientRect().top - nav.offsetHeight - 2;
      options.scrollTo({ top, behavior: document.documentElement.classList.contains('reduce-motion') ? 'instant' : 'smooth' });
    }));
    // Heading crossings drive the current section; no scroll listener or frame loop.
    const observer = new IntersectionObserver(() => {
      const root = options.getBoundingClientRect();
      if (!root.height) return;
      const robotTop = headings[1].getBoundingClientRect().top;
      activate(options.scrollTop > 0 && robotTop < root.bottom ? 'robot' : 'pilot');
    }, { root: options, rootMargin: '-54px 0px 0px 0px', threshold: [0, 1] });
    headings.forEach(heading => observer.observe(heading));
    categoryJumps = { buttons, observer };
  }
  [[pilot.id, pilot.name, 'pilot', '파일럿'], [robotType, robot.name, 'robot', '로봇']].forEach(([id, name, kind, label], index) => {
    const button = categoryJumps.buttons[index];
    // Keep the jump buttons mounted so focused navigation survives selection changes.
    if (button.dataset.portrait === id) return;
    button.dataset.portrait = id;
    button.replaceChildren(portraitImg(kind, id, 'bust', 'selection-jump-portrait'), node('span', '', `${label} · ${name}`));
    button.setAttribute('aria-label', `${label} 목록으로 이동, 현재 선택 ${name}`);
  });
}

export function characterTile({ kind, id, name, role, color, selected, onSelect, label }) {
  const b = node('button', (kind === 'pilot' ? 'pilot' : 'robot-card') + (selected ? ' on' : ''));
  b.type = 'button'; b.setAttribute('aria-pressed', String(selected));
  b.setAttribute('aria-label', label || `${name}, ${role}`);
  b.style.setProperty('--c', color);
  b.append(portraitImg(kind, id, 'bust', kind === 'pilot' ? 'pilot-face' : 'rc-face'));
  const copy = node('span', 'choice-copy');
  copy.append(node('span', 'choice-name', name));
  const badge = node('span', 'rr-badge choice-role', role);
  badge.style.setProperty('--bg', badgeColors[role] || color);
  copy.append(badge); b.append(copy);
  const check = node('span', 'choice-check'); check.append(icon('check')); check.setAttribute('aria-hidden', 'true'); b.append(check);
  b.onclick = onSelect; return b;
}

export function skillRows(skills) {
  const ul = node('ul', 'skill-desc');
  skills.forEach((s, i) => {
    const li = node('li', 'select-skill');
    const glyph = node('span', 'select-skill-icon'); glyph.innerHTML = ICONS[skillIcon(i + 1, s)]; glyph.setAttribute('aria-hidden', 'true');
    const text = node('span', 'select-skill-copy');
    const title = node('span', 'select-skill-title');
    title.append(node('b', '', s.name), node('span', 'skill-cd', s.cd ? `${s.cd}초` : '기본'));
    text.append(title, node('span', 'select-skill-effect', s.desc || ''));
    li.append(glyph, text); ul.append(li);
  });
  return ul;
}

export function campaignLoadout(host, pilot, type, robot) {
  host.replaceChildren(portraitImg('pilot', pilot.id), portraitImg('robot', type));
  const copy = node('span', 'campaign-loadout-copy');
  copy.append(node('small', '', '나의 출격 조합'), node('strong', '', `${pilot.name} × ${robot.name}`)); host.append(copy);
}

export function campaignCard(mission, status, stage, onStart) {
  const card = node('article', 'mission-card' + (!status.unlocked ? ' locked' : '') + (status.cleared ? ' cleared' : ''));
  card.dataset.stage = mission.stage;
  const top = node('div', 'mission-card-top');
  top.append(node('span', 'mission-number', String(mission.index + 1).padStart(2, '0')));
  const slots = node('div', 'mission-stars'); slots.setAttribute('aria-label', `별 ${status.bestStars} / 3`);
  for (let i = 0; i < 3; i++) { const star = node('span', i < status.bestStars ? 'earned' : ''); star.append(icon(i < status.bestStars ? 'star' : 'star-empty')); slots.append(star); }
  top.append(slots); card.append(top, node('h3', '', mission.title));
  const goal = node('p', 'mission-goal'); goal.append(icon('target'), node('span', '', mission.goalText)); card.append(goal);
  const meta = node('div', 'mission-meta');
  for (const [name, value] of [['map', stage.name], ['swords', ['쉬움', '보통', '어려움'][mission.diff]], ['heart', `목숨 ${mission.stock}`]]) {
    const chip = node('span', 'mission-chip'); chip.append(icon(name), document.createTextNode(value)); meta.append(chip);
  }
  card.append(meta);
  const medals = node('ul', 'mission-medals');
  mission.medals.forEach(m => { const li = node('li', status.medals.includes(m.id) ? 'earned' : ''); li.append(icon(status.medals.includes(m.id) ? 'star' : 'star-empty'), document.createTextNode(m.text)); medals.append(li); }); card.append(medals);
  const button = node('button', 'btn' + (status.unlocked ? ' big rr-shine' : ' rr-grey'), status.unlocked ? (status.cleared ? '다시 도전' : '출격') : '이전 도전 클리어');
  button.type = 'button'; button.disabled = !status.unlocked;
  button.setAttribute('aria-label', `${mission.title} ${status.unlocked ? '출격' : '잠김'}`);
  if (!status.unlocked) button.prepend(icon('lock'));
  button.onclick = onStart; card.append(button); return card;
}

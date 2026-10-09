import { PILOTS } from './data.js';
import { portraitImg } from './ui-portraits.js';
import { icon, hydrateIcons } from './ui-icons.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// All numbers and honors come from the completed match, in Game.results() order.
export function renderResult(res, player, { stars = null, nextMission = null, campaign = false } = {}) {
  const rank = res.findIndex(r => r.h === player), mine = res[rank];
  if (!mine) return;
  const win = rank === 0;
  const mvp = [...res].sort((a, b) => b.kos - a.kos || b.dmg - a.dmg)[0];
  const hasMvp = res.some(r => r.kos > 0 || r.dmg > 0);
  $('result-title').textContent = win ? '승리!' : `${rank + 1}위`;
  $('result-title').className = `rr-ribbon ${win ? '' : 'rr-blue'}`;
  $('result-title').prepend(icon(win ? 'trophy' : 'flag'));
  $('result-rank').textContent = `최종 ${rank + 1}위`;
  $('result-kos').textContent = mine.kos;
  $('result-damage').textContent = mine.dmg;
  $('result-stock').textContent = Math.max(0, mine.stock);
  const podium = $('result-podium'); podium.replaceChildren();
  res.forEach((r, i) => {
    const card = el('li', `result-fighter rr-enter-rise${r.h === player ? ' is-me' : ''}${i === 0 ? ' is-first' : ''}`);
    card.style.setProperty('--i', i);
    card.style.setProperty('--fighter-color', typeof r.color === 'number' ? '#' + r.color.toString(16).padStart(6, '0') : '#7ccbff');
    const place = el('div', 'fighter-place', `${i + 1}위`);
    place.prepend(icon(i < 3 ? `medal-${i + 1}` : 'flag')); card.append(place);
    const art = el('div', 'fighter-art');
    art.append(portraitImg('pilot', r.h?.P?.id || PILOTS.find(p => p.name === r.h?.P?.name)?.id || PILOTS[0].id, 'full'));
    card.append(art);
    const info = el('div', 'fighter-info');
    const name = el('h3', 'fighter-name', r.name);
    if (r.h === player) name.append(el('span', 'result-you', '나'));
    info.append(name);
    const stats = el('dl', 'fighter-stats');
    for (const [label, value] of [['KO', r.kos], ['피해', r.dmg], ['목숨', Math.max(0, r.stock)]]) {
      const stat = el('div', ''); stat.append(el('dt', '', label), el('dd', '', value)); stats.append(stat);
    }
    info.append(stats); card.append(info);
    if (hasMvp && r === mvp) { const badge = el('span', 'fighter-mvp rr-badge', 'MVP'); badge.prepend(icon('crown')); card.append(badge); }
    podium.append(card);
  });
  const starRow = $('result-stars'); starRow.replaceChildren(); starRow.hidden = stars === null;
  if (stars !== null) {
    starRow.setAttribute('aria-label', `이번 도전 별 ${stars} / 3개`);
    for (let i = 0; i < 3; i++) { const star = icon(i < stars ? 'star' : 'star-empty', `rr-ic${i < stars ? ' earned' : ''}`); star.style.setProperty('--i', i); starRow.append(star); }
  }
  $('next-mission').classList.toggle('hidden', !nextMission);
  const restart = document.querySelector('#result [data-action=restart]');
  restart.classList.toggle('big', !nextMission);
  restart.textContent = campaign ? '다시 도전' : '한 판 더';
  document.querySelector('#result [data-action=toCampaign]').classList.toggle('hidden', !campaign);
  const table = el('table', 'res');
  table.innerHTML = '<caption>전체 경기 순위</caption><thead><tr><th scope="col">순위</th><th scope="col">파일럿</th><th scope="col">남은 목숨</th><th scope="col">KO</th><th scope="col">낙하</th><th scope="col">피해량</th></tr></thead>';
  const body = document.createElement('tbody');
  res.forEach((r, i) => {
    const tr = el('tr', r.h === player ? 'me' : '');
    [i + 1, r.name, Math.max(0, r.stock), r.kos, r.falls, r.dmg].forEach((value, j) => {
      const cell = el(j === 1 ? 'th' : 'td', j === 0 ? 'rank' : '', value);
      if (j === 1) { cell.scope = 'row'; if (r.h === player) cell.append(el('span', 'result-you', '나')); }
      tr.append(cell);
    }); body.append(tr);
  });
  table.append(body); $('result-table').replaceChildren(table);
  document.querySelector('.result-records').open = false;
  document.querySelector('.result-scroll').scrollTop = 0;
}

export function initModalIcons() {
  for (const id of ['pause', 'mobile-help']) hydrateIcons($(id));
}

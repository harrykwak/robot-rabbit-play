// 터치 버튼 아이콘 (인라인 SVG). 흰 면 + 굵고 둥근 잉크 외곽선.
// Authoring shorthand: .f = filled face, .l = outlined action trail, .k = ink detail.
// Explicit attributes also render correctly outside the in-game button CSS.
const svg = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">' + body
  .replaceAll('class="f"', 'fill="#fff6e3" stroke="#1b1036" stroke-width="2.4"')
  .replaceAll('class="l"', 'fill="none" stroke="#1b1036" stroke-width="5.2"')
  .replaceAll('class="k"', 'fill="none" stroke="#1b1036" stroke-width="2"')
  // Action trails get a white core surrounded by a substantial ink outline.
  + (body.match(/<(?:path|circle) class="l"[^>]*\/>/g) || []).map(mark => mark.replace('class="l"', 'fill="none" stroke="#fff6e3" stroke-width="2.4"')).join('')
  + '</svg>';
export const ICONS = {
  supply: svg('<path class="f" d="M12 3h8v7l6 5v14H6V15l6-5z"/><path class="k" d="M12 7h8M7 18h18M7 25h18M13 21h6"/>'),
  fist: svg('<path class="l" d="M4 7l2 2M3 16h2M4 24l2-2"/><path class="f" d="M12 23c-5-1-7-5-5-8 1-3 4-3 6-2V8c0-6 14-6 16 0 2 7 0 14-6 17v4H12z"/><path class="f" d="M11 23h14v7H11z"/><path class="k" d="M13 13v4l4 2M19 7h4"/>'),
  kick: svg('<path class="l" d="M3 12h2M3 18h2"/><path class="f" d="M10 4h10v13l7 3c3 2 3 5 2 9H8V17h2z"/><path class="k" d="M12 10h5M12 14h5M9 25h20"/>'),
  shot: svg('<path class="l" d="M4 27l8-8M3 20l5-5M11 29l4-4"/><circle class="f" cx="20" cy="12" r="7"/><path class="k" d="M17 9.5a3.5 3.5 0 0 1 3-1.5"/>'),
  slam: svg('<path class="l" d="M5 28h22M4 21l3 3M28 21l-3 3"/><path class="f" d="M12 3h8v10h6L16 24 6 13h6z"/>'),
  spin: svg('<path class="l" d="M16 5a11 11 0 1 1-10.4 7.4"/><path class="f" d="M1.5 9.5l5 5.5 4.5-6z"/><circle class="f" cx="16" cy="16" r="4.5"/>'),
  dash: svg('<path class="l" d="M3 10h3M3 16h2M3 22h3"/><path class="f" d="M10 11h8V5L29 16 18 27v-6h-8z"/>'),
  shield: svg('<path class="f" d="M16 3l12 4v8c0 7-5 12-12 15C9 27 4 22 4 15V7z"/><path class="k" d="M16 8v16M10 14h12"/>'),
  roll: svg('<path class="l" d="M25 12a10 10 0 1 0 1 7"/><path class="f" d="M28 4v10h-10z"/><circle class="f" cx="15" cy="16" r="4"/>'),
  barrier: svg('<circle class="l" cx="16" cy="16" r="12"/><path class="f" d="M16 8l6 5-6 12-6-12z"/><path class="k" d="M13 13h6"/>'),
  smoke: svg('<circle class="f" cx="7.5" cy="8" r="3"/><circle class="f" cx="14" cy="4.8" r="2"/><path class="f" d="M8 26a5 5 0 0 1 .5-10 7 7 0 0 1 13.5-2.5 5.5 5.5 0 0 1 3 12.5z"/>'),
  blink: svg('<path class="f" d="M14 3l4 10 11 4-11 4-4 9-4-9-8-4 8-4z"/><path class="l" d="M26 4v5M23.5 6.5h5"/>'),
  jump: svg('<path class="l" d="M8 28h16"/><path class="f" d="M16 3l11 11h-6v8H11v-8H5z"/>'),
  // 특수 칸: 호출(로봇 머리 + 신호) / 탑승(위로 올라타기) / 하차(아래로 내리기)
  call: svg('<path class="l" d="M4 12a11 11 0 0 0 0 12M28 12a11 11 0 0 1 0 12"/><rect class="f" x="10" y="2" width="5" height="11" rx="2.5"/><rect class="f" x="18" y="2" width="5" height="11" rx="2.5"/><rect class="f" x="8" y="11" width="17" height="17" rx="6"/><path class="k" d="M13 17v3M20 17v3M14 24h5"/>'),
  board: svg('<path class="l" d="M6 28h20"/><path class="f" d="M16 3l9.5 9.5H20V23h-8V12.5H6.5z"/>'),
  exit: svg('<path class="l" d="M6 28h20"/><path class="f" d="M12 3h8v10.5h5.5L16 23l-9.5-9.5H12z"/>'),
};

// 스킬 이름/종류로 아이콘을 고른다. 모르는 이름은 칸 기본값(1: 주먹 충격, 2: 방패)
const KINDS = { guard: 'shield', parry: 'shield', brace: 'shield', roll: 'roll', flip: 'roll', barrier: 'barrier', smoke: 'smoke', blink: 'blink' };
const NAMES = [
  [/배리어|방어막/, 'barrier'], [/연막/, 'smoke'], [/순간이동|텔레포트|블링크/, 'blink'],
  [/롤|구르|플립|공중제비/, 'roll'], [/가드|반격|버티/, 'shield'],
  [/스톰프|슬램|내려찍|드롭|프레스/, 'slam'], [/회오리|토네이도|스핀|회전/, 'spin'],
  [/새총|미사일|블래스터|레이저|부메랑|발사|사격/, 'shot'], [/돌진|대시|러시|태클/, 'dash'], [/킥|스윕|차기/, 'kick'],
];
export function skillIcon(slot, info) {
  if (info?.icon && ICONS[info.icon]) return info.icon;
  if (info?.kind && KINDS[info.kind]) return KINDS[info.kind];
  const name = String(info?.name || '');
  for (const [re, key] of NAMES) if (re.test(name)) return key;
  return slot === 2 ? 'shield' : 'fist';
}

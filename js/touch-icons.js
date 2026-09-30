// 터치 버튼 아이콘 (인라인 SVG). 흰 면 + 잉크 외곽선 만화풍, 모양은 css/mobile.css 의 .touch-icon 규칙이 칠한다
//   .f 채운 면(흰색 + 잉크 선) / .l 흰 굵은 선(동작선) / .k 잉크 세부 선
const svg = (body) => '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' + body + '</svg>';
export const ICONS = {
  fist: svg('<path class="l" d="M4 7l3 3M2 16h4M4 25l3-3"/><path class="f" d="M11 9h11a5 5 0 0 1 5 5v5a6 6 0 0 1-6 6h-6a5 5 0 0 1-5-5v-8a3 3 0 0 1 1-3z"/><path class="k" d="M16 9v5M21 9.5v4.5M10 17h5"/>'),
  kick: svg('<path class="l" d="M2 12h4M2 18h4"/><path class="f" d="M9 4h7v10l9 3.5a3.5 3.5 0 0 1 2.5 3.3V26H9z"/><path class="k" d="M9 22h18.5"/>'),
  shot: svg('<path class="l" d="M4 27l8-8M3 20l5-5M11 29l4-4"/><circle class="f" cx="20" cy="12" r="7"/><path class="k" d="M17 9.5a3.5 3.5 0 0 1 3-1.5"/>'),
  slam: svg('<path class="l" d="M4 28h24M5 23l3 2M27 23l-3 2"/><path class="f" d="M12.5 3h7v9h5L16 22l-8.5-10h5z"/>'),
  spin: svg('<path class="l" d="M16 5a11 11 0 1 1-10.4 7.4"/><path class="f" d="M1.5 9.5l5 5.5 4.5-6z"/><circle class="f" cx="16" cy="16" r="4.5"/>'),
  dash: svg('<path class="l" d="M2 11h4M1 16h5M2 21h4"/><path class="f" d="M9 11h9V5.5L28.5 16 18 26.5V21H9z"/>'),
  shield: svg('<path class="f" d="M16 3l11 4v7c0 8-5 13-11 15C10 27 5 22 5 14V7z"/><path class="k" d="M16 8v17M9 13h14"/>'),
  roll: svg('<path class="l" d="M25 12a10 10 0 1 0 1 7"/><path class="f" d="M28 4v10h-10z"/><circle class="f" cx="15" cy="16" r="4"/>'),
  barrier: svg('<circle class="l" cx="16" cy="16" r="12.5"/><path class="f" d="M16 8.5l4.5 4.5L16 24l-4.5-11z"/><path class="k" d="M14 13h4"/>'),
  smoke: svg('<circle class="f" cx="7.5" cy="8" r="3"/><circle class="f" cx="14" cy="4.8" r="2"/><path class="f" d="M8 26a5 5 0 0 1 .5-10 7 7 0 0 1 13.5-2.5 5.5 5.5 0 0 1 3 12.5z"/>'),
  blink: svg('<path class="f" d="M15 3l3 10 10 3.5-10 3L15 30l-3-10.5-10-3 10-3.5z"/><path class="l" d="M26 3v5M23.5 5.5h5"/>'),
  jump: svg('<path class="l" d="M8 28h16"/><path class="f" d="M16 3l11 11h-6v8H11v-8H5z"/>'),
  // 특수 칸: 호출(로봇 머리 + 신호) / 탑승(위로 올라타기) / 하차(아래로 내리기)
  call: svg('<path class="l" d="M4.5 10a12 12 0 0 0 0 13M27.5 10a12 12 0 0 1 0 13"/><rect class="f" x="12" y="2" width="3.2" height="8" rx="1.6"/><rect class="f" x="16.8" y="2" width="3.2" height="8" rx="1.6"/><rect class="f" x="9" y="9" width="14" height="15" rx="4"/><path class="k" d="M13.5 15v2M18.5 15v2M13.5 20.5h5"/>'),
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

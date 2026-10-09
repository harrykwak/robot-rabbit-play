// Compact cartoon pictograms. All geometry is local to a 48 × 48 canvas.
const ink = '#1b1036';
const C = { yellow: '#ffd23a', gold: '#ffc93a', orange: '#ff8a1f', blue: '#2f8cff', green: '#5fd94a', red: '#ff4d5e', purple: '#a066ff', cream: '#fff6e3', steel: '#9fb4c8' };
const p = (d, fill = C.cream, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (d, color = ink, width = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const circle = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const rect = (x,y,w,h,r,fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const shade = (d, fill) => p(d, fill, 'stroke="none"');
const shine = (d) => line(d, '#fff', 3);
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const starPath = 'M24 4l6 12 13 2-9.5 9.5L36 41l-12-6.5L12 41l2.5-13.5L5 18l13-2z';
const heartPath = 'M24 41C18 36 5 27 5 17 5 5 19 4 24 13 29 4 43 5 43 17c0 10-13 19-19 24z';
const medal = (color, dark, mark) => svg(p('M11 4h10l5 15-10 5z',C.blue)+p('M27 4h10l-5 20-10-5z',C.red)+circle(24,29,15,color)+shade('M11 34c7 8 20 8 27-2-2 14-23 17-27 2z',dark)+circle(24,29,10,color)+line(mark,ink,3)+shine('M14 25l2-3'));
const disc = (color, dark, body) => svg(circle(24,24,19,color)+shade('M6 29c10 10 27 9 37-5 0 23-33 27-37 5z',dark)+body+shine('M12 16l3-3'));
const chevron = (d) => svg(p(d,C.cream)+shade('M7 24l22 19 9-9-8 1-15-13z','#d5c8b1')+shine('M29 12l-10 9'));

export const UI_ICONS = {
  trophy: svg(p('M12 10H5v7c0 7 6 9 11 8M36 10h7v7c0 7-6 9-11 8',C.gold)+p('M14 5h20v14c0 7-4 12-10 12s-10-5-10-12z',C.yellow)+shade('M24 8h7v11c0 6-2 8-7 10z','#ffad0d')+p('M21 31h6v7h8v6H13v-6h8z',C.gold)+shine('M19 10v8')),
  star: svg(p(starPath,C.yellow)+shade('M24 24l10 3.5L36 41l-12-6.5L12 41z','#ffad0d')+shine('M21 16l3-6')),
  'star-empty': svg(p(starPath,'#d6e2ee')+shade('M24 24l10 3.5L36 41l-12-6.5L12 41z',C.steel)+shine('M21 16l3-6')),
  heart: svg(p(heartPath,C.red)+shade('M7 23c12 12 25 11 34-3-2 9-13 18-17 21C17 36 10 29 7 23z','#e0283d')+shine('M11 16q1-5 6-4')),
  'heart-empty': svg(p(heartPath,'#d6e2ee')+shade('M7 23c12 12 25 11 34-3-2 9-13 18-17 21C17 36 10 29 7 23z',C.steel)+shine('M11 16q1-5 6-4')),
  carrot: svg(p('M28 18l-1-12 6 3 3-6 4 7 5 1-9 12',C.green)+p('M31 15c9 4 9 9 2 16L8 43c-3 1-4-1-3-4l12-24c3-5 9-3 14 0z',C.orange)+shade('M32 19c3 4 2 7-2 11L8 43l25-12c6-6 7-10-1-12z','#f0650a')+line('M15 24l5 3M22 16l5 3')+shine('M12 34l3-6')),
  crown: svg(p('M5 12l11 8L24 6l8 14 11-8-5 29H10z',C.yellow)+shade('M9 31h30l-1 10H10z','#ffad0d')+line('M11 34h26')+circle(24,27,3,C.red)+shine('M12 24l1 4')),
  'medal-1': medal(C.gold,'#ffad0d','M21 26l3-3v12M21 35h6'),
  'medal-2': medal('#d6e2ee','#9fb4c8','M20 26c0-5 9-5 8 0 0 3-8 6-8 9h9'),
  'medal-3': medal('#e39a5c','#bb6939','M20 24h8l-5 5c7-1 8 7 0 7l-3-1'),
  lock: svg(p('M13 22V14a11 11 0 0 1 22 0v8h-7v-8a4 4 0 0 0-8 0v8z','#d6e2ee')+rect(7,20,34,23,6,C.yellow)+shade('M8 34h32v3q0 6-6 6H14q-6 0-6-6z','#ffad0d')+circle(24,29,3,ink)+line('M24 31v5')+shine('M12 26h5')),
  skull: svg(p('M7 22C7 1 41 1 41 22c0 7-3 10-8 12v8H15v-8c-5-2-8-5-8-12z',C.cream)+shade('M31 8c10 9 7 20-3 24v10h5v-8c14-7 9-23-2-26z','#cdbd9e')+circle(16,23,5,ink)+circle(32,23,5,ink)+p('M24 29l-3 5h6z',ink)+line('M21 38v4M27 38v4')+shine('M13 14l3-3')),
  robot: svg(rect(12,3,8,19,4,C.cream)+rect(28,3,8,19,4,C.cream)+line('M16 8v7','#ff8fab',3)+line('M32 8v7','#ff8fab',3)+rect(3,26,7,8,2,C.steel)+rect(38,26,7,8,2,C.steel)+rect(8,18,32,25,10,C.cream)+shade('M34 22v9q0 7-8 7H11q3 5 9 5h9q11 0 11-12v-3q-1-4-6-6z','#d5c8b1')+rect(13,24,22,11,4,C.blue)+line('M18 28v3M30 28v3',ink,3)+line('M21 38h6')+shine('M13 22h6')),
  juice: svg(p('M19 5h10v9l7 7v20H12V21l7-7z',C.orange)+shade('M28 15l8 6v20h-9z','#f0650a')+rect(17,3,14,8,2,C.green)+rect(11,23,26,13,3,C.cream)+p('M22 27h6l-5 6z',C.orange)+shine('M17 18l-2 4')),
  stopwatch: svg(rect(19,3,10,6,2,C.steel)+line('M36 10l4 4',ink,5)+circle(24,27,17,C.blue)+shade('M9 33c12 7 26 0 30-13 7 26-25 31-30 13z','#1a5fd6')+circle(24,27,11,C.cream)+line('M24 19v8l6 3')+shine('M13 16l3-2')),
  lightning: svg(p('M26 3L8 27h13l-2 18 22-28H27l4-14z',C.yellow)+shade('M21 27l-2 18 22-28H27L16 27z','#ffad0d')+shine('M24 12l-6 8')),
  swords: svg(p('M7 4l10 4 18 25-5 5L9 15z','#d6e2ee')+shade('M7 4l28 29-5 5z',C.steel)+p('M41 4l-10 4L13 33l5 5 21-23z',C.cream)+shade('M41 4L13 33l5 5 21-23z','#9fb4c8')+line('M9 30l10 9M29 39l10-9',C.yellow,6)+line('M12 38l-5 5M36 38l5 5',ink,6)+shine('M32 13l3-4')),
  friends: svg(circle(15,15,8,C.orange)+circle(33,15,8,C.yellow)+p('M3 40v-6c0-14 24-14 24 0v6z',C.orange)+p('M23 40v-6c0-14 22-14 22 0v6z',C.yellow)+shade('M29 35h15v5H24v-4z','#ffad0d')+shine('M8 30l3-2')),
  user: svg(circle(24,13,9,C.yellow)+shade('M19 19c8 1 10-4 11-11 9 10-2 19-11 11z','#ffad0d')+p('M7 42v-8c0-16 34-16 34 0v8z',C.blue)+shade('M9 35h30v7H9z','#1a5fd6')+shine('M14 29l4-2')),
  gear: svg(p('M19 4h10l2 6 5 3 6-1 4 9-5 4-1 6 2 5-8 6-5-4h-6l-5 4-8-6 2-5-1-6-5-4 4-9 6 1 5-3z',C.steel)+shade('M11 32l7 10 5-4h6l5 4 8-6-2-5 1-6c-8 13-20 14-30 7z','#738aa3')+circle(25,24,8,C.cream)+shine('M21 10h5')),
  question: disc(C.purple,'#7a3ff0',line('M18 18c0-9 15-9 15 0 0 5-9 5-9 10','#fff6e3',5)+circle(24,35,2,'#fff6e3')),
  home: svg(p('M5 23L24 6l19 17-5 5-3-3v17H13V25l-3 3z',C.orange)+shade('M25 7l18 16-5 5-3-3v17H25z','#f0650a')+rect(20,29,8,13,1,C.cream)+shine('M14 19l7-6')),
  door: svg(rect(9,5,29,38,3,C.blue)+p('M14 8l18 5v30l-18-5z',C.cream)+shade('M26 12l6 1v30l-6-2z','#d5c8b1')+circle(26,27,2,C.yellow)+shine('M18 15v8')),
  flag: svg(line('M11 5v38',ink,5)+p('M12 6c10-8 16 8 29 0l-4 20c-12 7-15-8-25-1z',C.red)+shade('M12 18c10-7 16 7 26-1l-1 9c-12 7-15-8-25-1z','#e0283d')+shine('M17 10l5 1')),
  map: svg(p('M4 10l13-5 14 5 13-5v33l-13 5-14-5-13 5z',C.cream)+shade('M17 5l14 5v33l-14-5z','#e8d7b3')+line('M17 5v33M31 10v33')+line('M9 26l6-7 9 9 11-10',C.orange,4)+circle(36,17,3,C.red)+shine('M8 14l4-2')),
  target: svg(circle(24,25,18,C.red)+shade('M9 34c13 7 28-2 31-16 8 25-23 33-31 16z','#e0283d')+circle(24,25,12,C.cream)+circle(24,25,5,C.red)+line('M24 25L40 9',ink,4)+p('M34 7l7-4v7l-7 4z',C.yellow)+shine('M11 18l3-3')),
  shield: svg(p('M24 4l17 6v13c0 10-8 17-17 21C15 40 7 33 7 23V10z',C.blue)+shade('M24 4v40c9-4 17-11 17-21V10z','#1a5fd6')+p('M24 12l3 7 8 1-6 6 1 8-6-4-7 4 2-8-6-6 8-1z',C.yellow)+shine('M12 14v6')),
  fist: svg(p('M14 31c-7-2-10-6-9-12 1-5 6-7 11-5V9c0-7 22-7 24 2 3 10 0 20-8 24v8H14z',C.red)+shade('M33 9c6 14-1 21-11 23v11h10v-8c8-4 11-14 8-24z','#e0283d')+rect(12,34,22,10,3,C.orange)+line('M16 15v8l6 2')+shine('M23 9h6')),
  boot: svg(p('M12 5h16v20l11 4c5 2 5 6 4 13H9V26h3z',C.orange)+shade('M23 5h5v20l11 4c5 2 5 6 4 13H9v-7h24l-10-8z','#f0650a')+line('M15 15h8M15 21h8M10 36h32')+shine('M17 10h5')),
  sparkle: svg(p('M24 3l6 15 15 6-15 6-6 15-6-15-15-6 15-6z',C.yellow)+shade('M24 24l21 0-15 6-6 15z','#ffad0d')+shine('M24 11l-3 9')),
  fire: svg(p('M25 3c3 11 11 12 8 22l8-7c10 26-26 34-34 16-4-10 5-16 7-24 1 8 6 9 6 13 5-5 4-13 5-20z',C.orange)+shade('M39 27c-1 13-21 17-29 7 8 21 39 9 31-16z','#f0650a')+p('M24 23c-2 7-8 10-4 16 6 7 14-3 9-9l-2 4z',C.yellow)+shine('M13 25l-2 5')),
  check: svg(p('M5 24l8-8 9 10L36 7l8 7-22 29z',C.green)+shade('M5 24l17 19 22-29-6 2-17 21z','#2fae2f')+shine('M11 24l9 10')),
  close: svg(p('M12 5l12 12L36 5l8 8-12 11 12 12-8 8-12-12-12 12-8-8 12-12L4 13z',C.red)+shade('M4 36l8 8 12-12 12 12 8-8-20-11z','#e0283d')+shine('M11 13l7 7')),
  info: disc(C.blue,'#1a5fd6',circle(24,15,2,C.cream)+line('M22 23h3v12h-4M25 35h4',C.cream,4)),
  warning: svg(p('M20 6c2-3 6-3 8 0l17 31c1 3-1 6-5 6H8c-4 0-6-3-5-6z',C.yellow)+shade('M4 36h40l1 1c1 3-1 6-5 6H8c-4 0-6-3-5-6z','#ffad0d')+line('M24 16v12',ink,5)+circle(24,35,2,ink)+shine('M17 16l-5 9')),
  wifi: svg(p('M3 15c12-12 30-12 42 0l-6 7c-9-8-21-8-30 0z',C.blue)+p('M13 27c6-6 16-6 22 0l-6 7c-3-3-7-3-10 0z',C.blue)+circle(24,40,4,C.green)+shade('M3 15l6 7c9-8 21-8 30 0l3-4c-12-9-25-9-36-1z','#1a5fd6')+shine('M13 13l6-2')),
  link: svg(p('M19 30l-3 3c-6 6-15-3-9-9l10-10c6-6 13-1 13 5l-6 5c0-3-2-5-4-3l-7 7c-2 2 0 4 2 2l4-4z',C.blue)+p('M29 18l3-3c6-6 15 3 9 9L31 34c-6 6-13 1-13-5l6-5c0 3 2 5 4 3l7-7c2-2 0-4-2-2l-4 4z',C.purple)+shine('M28 12l3-3')),
  refresh: svg(p('M39 7v15H24l6-6c-9-7-21 2-17 12l-7 4C-2 14 19-1 35 10z',C.blue)+p('M9 41V26h15l-6 6c9 7 21-2 17-12l7-4c8 18-13 33-29 22z',C.green)+shine('M10 17l4-5')),
  play: svg(p('M12 5c-2-1-4 1-4 3v32c0 3 2 4 4 3l31-17c2-1 2-3 0-4z',C.green)+shade('M8 33v7c0 3 2 4 4 3l31-17c2-1 2-3 0-4l-4-2z','#2fae2f')+shine('M13 13v13')),
  pause: svg(rect(8,6,12,36,3,C.yellow)+rect(28,6,12,36,3,C.yellow)+shade('M9 33h10v6q0 3-3 3h-4q-3 0-3-3M29 33h10v6q0 3-3 3h-4q-3 0-3-3','#ffad0d')+shine('M13 12v12M33 12v12')),
  music: svg(p('M20 8l22-4v29h-6V15l-10 2v21h-6z',C.purple)+shade('M20 20l6-3v21h-6M36 15h6v18h-6','#7a3ff0')+p('M20 32c-13-5-21 12-7 12 8 0 13-6 7-12M36 27c-12-5-20 12-6 12 8 0 13-6 6-12',C.purple)+shine('M25 11l10-2')),
  volume: svg(p('M5 18h9L27 7v34L14 30H5z',C.blue)+shade('M14 24l13 7v10L14 30H5v-6z','#1a5fd6')+line('M33 18q5 6 0 12M39 12q9 12 0 24',ink,6)+line('M33 18q5 6 0 12M39 12q9 12 0 24',C.cream,3)+shine('M20 17l2-2')),
  'volume-off': svg(p('M5 18h9L27 7v34L14 30H5z',C.steel)+shade('M14 24l13 7v10L14 30H5v-6z','#738aa3')+line('M33 18l10 12M43 18L33 30',ink,7)+line('M33 18l10 12M43 18L33 30',C.red,4)+shine('M20 17l2-2')),
  'chevron-left': chevron('M29 5l9 9-12 10 12 10-9 9L7 24z'),
  'chevron-right': svg(p('M19 5l-9 9 12 10-12 10 9 9 22-19z',C.cream)+shade('M22 24L10 34l9 9 22-19z','#d5c8b1')+shine('M19 11l11 10')),
  'chevron-down': svg(p('M5 19l9-9 10 12 10-12 9 9-19 22z',C.cream)+shade('M5 19l19 22 19-22-6 1-13 14-13-14z','#d5c8b1')+shine('M14 16l10 12')),
  plus: svg(p('M18 5h12v13h13v12H30v13H18V30H5V18h13z',C.green)+shade('M5 25h18v18h7V30h13v-5H30V5h-7v20z','#2fae2f')+shine('M22 10v9')),
  minus: svg(rect(5,18,38,12,3,C.red)+shade('M6 25h36v2q0 3-3 3H9q-3 0-3-3z','#e0283d')+shine('M11 22h12')),
  gamepad: svg(p('M15 11h18c7 0 9 8 12 23 1 8-6 11-11 4l-4-5H18l-4 5c-5 7-12 4-11-4 3-15 5-23 12-23z',C.purple)+shade('M5 32c6 4 8-5 14-5h10c6 0 8 9 14 5 5 13-4 15-9 6l-4-5H18l-4 5c-6 9-13 4-9-6z','#7a3ff0')+line('M14 18v10M9 23h10',C.cream,4)+circle(34,20,2,C.yellow)+circle(38,26,2,C.red)+shine('M19 15h9')),
  keyboard: svg(rect(3,10,42,29,5,C.cream)+shade('M4 31h40v3q0 5-5 5H9q-5 0-5-5z','#d5c8b1')+line('M10 18h2M19 18h2M28 18h2M37 18h1M10 25h2M19 25h2M28 25h2M37 25h1M14 32h20',ink,3)+shine('M9 14h7')),
  hand: svg(p('M17 24V8c0-6 8-6 8 0v12c0-5 7-5 7 0 0-4 7-4 7 1 0-3 6-2 6 2v9c0 8-7 13-16 13-6 0-9-2-13-6L5 29c-5-5 1-10 6-6l6 5z',C.cream)+shade('M38 21v11c0 7-8 11-16 10 16 10 23-4 23-10v-9c0-4-6-5-7-2z','#d5c8b1')+shine('M21 9v9')),
  'phone-rotate': svg(p('M12 9l21 7-8 25-21-7z',C.blue)+shade('M26 14l7 2-8 25-6-2z','#1a5fd6')+p('M14 15l13 4-5 15-13-4z',C.cream)+line('M34 6c9 3 12 12 8 21',C.yellow,4)+p('M35 25l7 7 4-9z',C.yellow)+line('M13 42l5 2',ink,3)+shine('M17 19l-2 6')),
};

export const ICON_NAMES = Object.freeze(Object.keys(UI_ICONS));

/** Creates a decorative SVG; unknown names fall back to the question badge. */
export function icon(name, className = 'rr-ic') {
  const template = document.createElement('template');
  template.innerHTML = Object.hasOwn(UI_ICONS, name) ? UI_ICONS[name] : UI_ICONS.question;
  const element = template.content.firstElementChild;
  element.setAttribute('class', className);
  return element;
}

/** Hydrates placeholders once; generated SVGs do not retain data-icon. */
export function hydrateIcons(root = document) {
  const placeholders = [...root.querySelectorAll('i[data-icon]')];
  if (root.matches?.('i[data-icon]')) placeholders.unshift(root);
  for (const placeholder of placeholders) {
    const element = icon(placeholder.dataset.icon, placeholder.getAttribute('class') || 'rr-ic');
    if (placeholder.id) element.id = placeholder.id;
    placeholder.replaceWith(element);
  }
}

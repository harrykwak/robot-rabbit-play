// Small mascot portraits follow the same ear silhouettes and gentle faces as the rigs.
export function rabbitPortrait(type) {
  const palettes = {
    titan: ['#edb389', '#e6b76e'], bolt: ['#9bcbbd', '#e6baaf'],
    cannon: ['#c3b4d6', '#e4b6c4'], hammer: ['#b6c8a0', '#dcb7a0'],
  };
  const [coat, lining] = palettes[type] || palettes.titan;
  const face = '#fff2dc', ink = '#594b50';
  let ears;
  if (type === 'hammer') ears = `<path d="M20 24C3 14 0 32 8 45C11 49 16 43 15 35L23 32M44 24C61 14 64 32 56 45C53 49 48 43 49 35L41 32" fill="${coat}"/><path d="M14 25Q5 25 10 39M50 25Q59 25 54 39" stroke="${lining}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  else {
    ears = `<ellipse cx="22" cy="17" rx="7" ry="16" transform="rotate(-12 22 17)" fill="${coat}"/><ellipse cx="22" cy="17" rx="3" ry="11" transform="rotate(-12 22 17)" fill="${lining}"/>`;
    ears += type === 'cannon'
      ? `<path d="M37 25C37 7 48 4 55 16Q58 24 51 26Q46 27 45 19L44 29" fill="${coat}"/><path d="M43 19Q46 10 51 20" stroke="${lining}" stroke-width="4" stroke-linecap="round" fill="none"/>`
      : `<ellipse cx="42" cy="17" rx="7" ry="16" transform="rotate(12 42 17)" fill="${coat}"/><ellipse cx="42" cy="17" rx="3" ry="11" transform="rotate(12 42 17)" fill="${lining}"/>`;
  }
  let mane = '';
  if (type === 'titan') for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    mane += `<circle cx="${32 + Math.cos(a) * 23}" cy="${39 + Math.sin(a) * 19}" r="7.5" fill="${lining}"/>`;
  }
  const eyes = type === 'cannon'
    ? `<path d="M20 39q4-4 8 0m8 0q4-4 8 0" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    : `<g fill="${ink}"><ellipse cx="23" cy="39" rx="2.7" ry="3.2"/><ellipse cx="41" cy="39" rx="2.7" ry="3.2"/></g><g fill="white"><circle cx="22.4" cy="38" r=".8"/><circle cx="40.4" cy="38" r=".8"/></g>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${ears}${mane}<ellipse cx="32" cy="40" rx="24" ry="20" fill="${coat}"/><ellipse cx="32" cy="42" rx="22" ry="17" fill="${face}"/><g fill="#ecc3b5"><ellipse cx="15" cy="45" rx="4" ry="2.4"/><ellipse cx="49" cy="45" rx="4" ry="2.4"/></g>${eyes}<path d="M29 44Q32 42 35 44Q35 47 32 48Q29 47 29 44" fill="#c79691"/><path d="M32 48q-3 4-5 0m5 0q3 4 5 0" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}

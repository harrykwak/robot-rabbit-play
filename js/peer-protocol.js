// Local installation identity, not an authenticated account or a public directory.
export const PEER_VERSION = 1;
export const MAX_WIRE_BYTES = 48 * 1024;
export const MAX_CODE_LENGTH = 70000;
const STORE = 'rr-peer-profile-v1';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const forbidden = new Set(['__proto__','constructor','prototype']);
export function normalizePeerId(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const raw = value.trim().toUpperCase().replace(/[-\s]/g, '');
  if (!/^RR[0-9A-F]{32}$/.test(raw)) return null;
  return 'RR-' + raw.slice(2).match(/.{4}/g).join('-');
}
export function validName(value) { return typeof value === 'string' && value.length > 0 && value.length <= 16 && !/[\u0000-\u001f\u007f]/.test(value); }
export function cleanProfile(value) {
  const id = normalizePeerId(value?.id);
  if (!id || !validName(value?.name)) throw new Error('기기 ID 또는 이름이 올바르지 않아요.');
  return { id, name: value.name };
}
export function savePeerProfile(storage, profile) {
  try { if (!storage?.setItem) return false; storage.setItem(STORE, JSON.stringify(cleanProfile(profile))); return true; } catch { return false; }
}
export function loadPeerProfile(storage) {
  try { const raw = storage?.getItem(STORE); if (raw && raw.length < 512) return cleanProfile(parseJSON(raw)); } catch { /* new installation identity */ }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = normalizePeerId('RR' + [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''));
  const profile = { id, name: '토끼 ' + id.slice(-4) };
  savePeerProfile(storage, profile); return profile;
}
export function parseJSON(text, maxBytes = MAX_WIRE_BYTES) {
  if (typeof text !== 'string' || text.length > maxBytes || encoder.encode(text).length > maxBytes) throw new Error('연결 정보가 너무 커요. 새 초대를 보내 주세요.');
  const value = JSON.parse(text, (key, v) => { if (forbidden.has(key)) throw new Error('잘못된 연결 정보예요.'); return v; });
  let count = 0;
  const visit = (v, depth) => {
    if (++count > 12000 || depth > 16) throw new Error('연결 정보의 구조가 올바르지 않아요.');
    if (v && typeof v === 'object') for (const key of Object.keys(v)) visit(v[key], depth + 1);
  };
  visit(value, 0); return value;
}
const sessionOK = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export function validateInvite(value, kind) {
  if (!value || value.v !== PEER_VERSION || value.kind !== kind || !['offer','answer'].includes(kind) || !sessionOK(value.session)) throw new Error('지원하지 않는 초대예요. 두 기기의 앱 버전을 확인해 주세요.');
  const from = cleanProfile(value.from), to = normalizePeerId(value.to);
  const sdp = value.sdp;
  if (!to || to === from.id || !sdp || sdp.type !== kind || typeof sdp.sdp !== 'string' || sdp.sdp.length > 40000
    || !/^v=0\r?\n/.test(sdp.sdp) || !/^m=application /m.test(sdp.sdp) || !/^a=fingerprint:sha-256 /m.test(sdp.sdp)
    || /^m=(audio|video) /m.test(sdp.sdp)) throw new Error('게임 연결용 초대가 아니에요.');
  const candidates = sdp.sdp.split(/\r?\n/).filter(line => line.startsWith('a=candidate:'));
  if (!candidates.length || candidates.some(line => !/ typ host(?: |$)/.test(line))) throw new Error('같은 Wi-Fi에서 사용할 연결 주소가 없어요. 네트워크 설정을 확인해 주세요.');
  return { v: PEER_VERSION, kind, session: value.session, from, to, sdp: { type: kind, sdp: sdp.sdp } };
}
export function encodeInvite(value) {
  const safe = validateInvite(value, value.kind);
  const bytes = encoder.encode(JSON.stringify(safe));
  let raw = ''; for (let i=0;i<bytes.length;i+=8192) raw += String.fromCharCode(...bytes.subarray(i,i+8192));
  return 'RR1.' + btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeInvite(code, kind) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH || !/^RR1\.[A-Za-z0-9_-]+$/.test(code.trim())) throw new Error('초대 전체를 복사해서 붙여 넣어 주세요.');
  try {
    const raw = atob(code.trim().slice(4).replaceAll('-','+').replaceAll('_','/'));
    return validateInvite(parseJSON(decoder.decode(Uint8Array.from(raw, c=>c.charCodeAt(0)))), kind);
  } catch (error) { if (error instanceof SyntaxError || error instanceof TypeError || error.name === 'InvalidCharacterError') throw new Error('초대 정보가 손상됐어요. 새 초대를 받아 주세요.'); throw error; }
}

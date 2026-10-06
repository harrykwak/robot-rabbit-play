// Shared network boundary. No browser, filesystem or command execution APIs.
import { PILOTS, ROBOT_ORDER, STAGES } from './data.js';
export const ROOM_VERSION = 1;
export const MAX_PLAYERS = 4; // Arena capacity; transport and identities use a roster, not a peer pair.
export const ROOM_RECONNECT_GRACE_MS = 120000; // Finite reservation; approval and bearer stay unchanged.
export const INPUT_BUTTONS = ['jump','atk','hvy','dash','actP','grdP','atkD','hvyD','grd','act'];
export const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k));
export const validName = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 16 && !/[\u0000-\u001f\u007f]/.test(s);
export const validChoice = p => p && validName(p.name) && Number.isInteger(p.pilot) && p.pilot >= 0 && p.pilot < PILOTS.length && ROBOT_ORDER.includes(p.robot);
export const validStage = stage => STAGES.some(s => s.id === stage);
export const validInput = p => exact(p,['seq','mx','mz',...INPUT_BUTTONS]) && Number.isSafeInteger(p.seq) && p.seq >= 0
  && Number.isFinite(p.mx) && Number.isFinite(p.mz) && Math.hypot(p.mx,p.mz) <= 1.001 && INPUT_BUTTONS.every(k => typeof p[k] === 'boolean');
export function validRoomConfig(c) {
  return c && validStage(c.stage) && c.stock === 3 && c.diff === 1 && c.autoplay === false
    && Array.isArray(c.roster) && c.roster.length >= 2 && c.roster.length <= MAX_PLAYERS
    && new Set(c.roster.map(p=>p.id)).size === c.roster.length
    && c.roster.every((p,i)=>validChoice(p) && typeof p.id === 'string' && /^[a-f0-9]{24}$/.test(p.id) && p.slot === i);
}
export function safeJSON(text, max=48*1024) {
  if(typeof text !== 'string' || new TextEncoder().encode(text).length > max) throw new Error('payload-too-large');
  const value = JSON.parse(text, (k,v)=>{if(['__proto__','constructor','prototype'].includes(k))throw new Error('invalid-key');return v;});
  let nodes=0;
  const visit=(v,d)=>{if(++nodes>12000||d>16)throw new Error('invalid-structure');if(v&&typeof v==='object')for(const x of Object.values(v))visit(x,d+1);};
  visit(value,0);return value;
}

// Keep the help and HUD vocabulary aligned with the visible touch buttons.
import { fmtKeys, actionLabel } from './input.js';
// 터치: 점프는 스틱 옆 버튼, 대시는 스틱을 같은 방향으로 두 번 튕기기 (따로 버튼 없음)
const labels = { move: '스틱', atk: '공격', hvy: '스킬 1', grd: '스킬 2', jump: '점프', dash: '대시(스틱 두 번)', act: '호출 / 탑승 / 하차', pause: '메뉴' };
const isTouch = () => document.documentElement.classList.contains('touch-mode');
export const controlLabel = (action) => isTouch() ? labels[action] || actionLabel(action) : actionLabel(action);
export const formatControls = (text) => isTouch() ? String(text).replace(/\{(\w+)\}/g, (_, key) => labels[key] || key) : fmtKeys(text);

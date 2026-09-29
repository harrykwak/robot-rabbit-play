// Keep the help and HUD vocabulary aligned with the visible touch buttons.
import { fmtKeys, actionLabel } from './input.js';
// 터치에는 점프·대시 버튼이 없다: 오른쪽 화면을 위로 튕기면 점프, 옆·아래로 밀면 대시
const labels = { move: '스틱', atk: '공격', hvy: '스킬 1', grd: '스킬 2', jump: '위로 스와이프', dash: '옆으로 스와이프', act: '호출 / 탑승 / 하차', pause: '메뉴' };
const isTouch = () => document.documentElement.classList.contains('touch-mode');
export const controlLabel = (action) => isTouch() ? labels[action] || actionLabel(action) : actionLabel(action);
export const formatControls = (text) => isTouch() ? String(text).replace(/\{(\w+)\}/g, (_, key) => labels[key] || key) : fmtKeys(text);

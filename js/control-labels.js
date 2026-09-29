// Keep the help and HUD vocabulary aligned with the visible touch buttons.
import { fmtKeys, actionLabel } from './input.js';
const labels = { move: '스틱', atk: '공격', hvy: '강공격 / 스킬 1', grd: '가드 / 스킬 2', jump: '점프', dash: '대시', act: '소환 / 탑승 / 하차', pause: '메뉴' };
const isTouch = () => document.documentElement.classList.contains('touch-mode');
export const controlLabel = (action) => isTouch() ? labels[action] || actionLabel(action) : actionLabel(action);
export const formatControls = (text) => isTouch() ? String(text).replace(/\{(\w+)\}/g, (_, key) => labels[key] || key) : fmtKeys(text);

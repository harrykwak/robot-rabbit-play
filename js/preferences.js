const clamp = (value, fallback, low, high) => Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

export function normalizePreferences(value, reducedMotion = false) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    touch: ['auto', 'on', 'off'].includes(v.touch) ? v.touch : 'auto',
    quality: ['auto', 'low', 'high'].includes(v.quality) ? v.quality : 'auto',
    frameRate: ['auto', '30', '60'].includes(v.frameRate) ? v.frameRate : 'auto',
    diagnostics: v.diagnostics === true,
    leftHanded: v.leftHanded === true,
    scale: clamp(v.scale, 1, 0.85, 1.15),
    reducedMotion: typeof v.reducedMotion === 'boolean' ? v.reducedMotion : reducedMotion,
    touchGuideSeen: v.touchGuideSeen === true,
  };
}

export function touchEnabled(preferences, hasTouch) {
  return preferences.touch === 'on' || (preferences.touch === 'auto' && hasTouch);
}

export function qualityProfile(preferences, hasTouch, deviceDpr = 1, width = 0, height = 0) {
  // Auto spends the frame budget on the game, without a full-screen bloom
  // chain and a second shadow-map scene pass on every display frame.
  const low = preferences.quality !== 'high';
  let dpr = Math.min(Math.max(1, deviceDpr || 1), low ? 1 : 1.75);
  // Bound GPU fill on large iPads as well as high-DPI phones. DOM controls stay sharp.
  if (low && width > 0 && height > 0) dpr = Math.min(dpr, Math.sqrt(921600 / (width * height)));
  return { low, dpr, shadows: !low, bloom: !low };
}

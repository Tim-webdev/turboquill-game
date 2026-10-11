/** Safe LocalStorage wrapper: never throws, validates shape, falls back to defaults. */
const KEY = 'turboquill.v1';
export const DEFAULT_SAVE = () => ({
  settings: { music: 0.6, sfx: 0.8, muted: false, sensitivity: 1, quality: 'auto', reducedMotion: null, showTouch: 'auto' },
  best: { 1: 0, 2: 0 },
  rings: { 1: 0, 2: 0 },
  unlocked: 1,
  completed: { 1: false, 2: false },
});
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;

export function sanitize(raw) {
  const d = DEFAULT_SAVE();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings || {};
  d.settings.music = num(s.music, d.settings.music, 0, 1);
  d.settings.sfx = num(s.sfx, d.settings.sfx, 0, 1);
  d.settings.muted = s.muted === true;
  d.settings.sensitivity = num(s.sensitivity, 1, 0.6, 1.6);
  d.settings.quality = ['auto', 'low', 'medium', 'high'].includes(s.quality) ? s.quality : 'auto';
  d.settings.reducedMotion = typeof s.reducedMotion === 'boolean' ? s.reducedMotion : null;
  d.settings.showTouch = ['auto', 'on', 'off'].includes(s.showTouch) ? s.showTouch : 'auto';
  for (const k of [1, 2]) {
    d.best[k] = Math.floor(num(raw.best && raw.best[k], 0, 0, 1e9));
    d.rings[k] = Math.floor(num(raw.rings && raw.rings[k], 0, 0, 1e6));
    d.completed[k] = !!(raw.completed && raw.completed[k] === true);
  }
  d.unlocked = Math.floor(num(raw.unlocked, 1, 1, 2));
  return d;
}

let cache = null;
export function load() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
  cache = sanitize(raw);
  return cache;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache || DEFAULT_SAVE())); return true; } catch (e) { return false; }
}
export function reset() { cache = DEFAULT_SAVE(); save(); return cache; }
export function recordResult(levelId, score, rings, completed) {
  const d = load();
  if (score > d.best[levelId]) d.best[levelId] = Math.floor(score);
  if (rings > d.rings[levelId]) d.rings[levelId] = rings;
  if (completed) { d.completed[levelId] = true; d.unlocked = Math.max(d.unlocked, Math.min(2, levelId + 1)); }
  save();
}

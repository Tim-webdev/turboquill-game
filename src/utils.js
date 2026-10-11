export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Deterministic PRNG (mulberry32) so every run of a level is identical. */
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (a2, b) => a2 + (b - a2) * f();
  f.int = (a2, b) => Math.floor(a2 + (b - a2 + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const isTouchDevice = () => (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer:coarse)').matches;
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

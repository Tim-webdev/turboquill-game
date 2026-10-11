import * as store from './storage.js';
const listeners = new Set();
export const settings = {
  get data() { return store.load().settings; },
  get reducedMotion() { const v = this.data.reducedMotion; return v === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : v; },
  set(key, value) { this.data[key] = value; store.save(); listeners.forEach((fn) => fn(key, value)); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

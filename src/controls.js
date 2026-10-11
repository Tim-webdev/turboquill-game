/**
 * Unified input: keyboard + touch buttons (pointer events) + swipe gestures.
 * Game code reads `held` (continuous) and consumes `queue` (discrete presses) each frame.
 * Every pointer is tracked by id and released on up / cancel / lostcapture / blur so nothing sticks.
 */
import { settings } from './settings.js';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);

export class Controls {
  constructor({ touchRoot, swipeTarget, onPause, onMute }) {
    this.enabled = false;        // true only while a level is being played
    this.held = { accel: false, boost: false, slide: false };
    this.queue = { lane: [], jump: false, slide: false, boost: false };
    this.onPause = onPause; this.onMute = onMute;
    this.touchRoot = touchRoot; this.swipeTarget = swipeTarget;
    this.pointers = new Map();   // pointerId -> {action, since, repeat}
    this.keys = new Set();
    this.swipes = new Map();
    this.repeatTimers = new Set();
    this._bind();
  }

  reset() { this.held.accel = this.held.boost = this.held.slide = false; this.queue = { lane: [], jump: false, slide: false, boost: false }; this.keys.clear(); this.pointers.forEach((p) => this._clearRepeat(p)); this.pointers.clear(); this.touchRoot?.querySelectorAll('.tbtn.down').forEach((b) => b.classList.remove('down')); }
  consume() { const q = this.queue; this.queue = { lane: [], jump: false, slide: false, boost: false }; return q; }

  _press(action) {
    switch (action) {
      case 'left': this.queue.lane.push(-1); break;
      case 'right': this.queue.lane.push(1); break;
      case 'jump': this.queue.jump = true; break;
      case 'slide': this.queue.slide = true; this.held.slide = true; break;
      case 'boost': this.queue.boost = true; this.held.boost = true; break;
      case 'accel': this.held.accel = true; break;
    }
  }
  _release(action) {
    if (action === 'slide') this.held.slide = false;
    if (action === 'boost') this.held.boost = false;
    if (action === 'accel') this.held.accel = false;
  }
  _clearRepeat(p) { if (p.timer) { clearTimeout(p.timer); clearInterval(p.interval); p.timer = p.interval = null; } }

  _bind() {
    const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump', KeyS: 'slide', ArrowDown: 'slide', ShiftLeft: 'boost', ShiftRight: 'boost', KeyW: 'accel', ArrowUp: 'accel' };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { this.onMute?.(); return; }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { this.onPause?.(e); return; }
      if (!this.enabled || !GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      if (e.repeat || this.keys.has(e.code)) return;
      this.keys.add(e.code); this._press(map[e.code]);
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      if (!GAME_KEYS.has(e.code)) return;
      if (this.enabled) e.preventDefault();
      this.keys.delete(e.code);
      const a = map[e.code]; // release only if no other key still maps to it
      if (![...this.keys].some((k) => map[k] === a)) this._release(a);
    }, { passive: false });
    window.addEventListener('blur', () => this.reset());

    if (this.touchRoot) {
      this.touchRoot.querySelectorAll('.tbtn').forEach((btn) => {
        const action = btn.dataset.action;
        const down = (e) => {
          e.preventDefault();
          if (!this.enabled) return;
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          btn.classList.add('down');
          const p = { action, btn }; this.pointers.set(e.pointerId, p);
          this._press(action);
          if (action === 'left' || action === 'right') { p.timer = setTimeout(() => { p.interval = setInterval(() => { if (this.enabled) this._press(action); }, 170); }, 260); }
        };
        const up = (e) => {
          const p = this.pointers.get(e.pointerId); if (!p) return;
          this._clearRepeat(p); this.pointers.delete(e.pointerId);
          // release only if no other finger still holds this action
          if (![...this.pointers.values()].some((q) => q.action === p.action)) { this._release(p.action); btn.classList.remove('down'); }
        };
        btn.addEventListener('pointerdown', down);
        ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((t) => btn.addEventListener(t, up));
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });
      this.touchRoot.addEventListener('touchstart', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
    }
    if (this.swipeTarget) {
      const t = this.swipeTarget;
      t.addEventListener('pointerdown', (e) => { if (!this.enabled || e.pointerType === 'mouse' || e.target.closest('.tbtn,button')) return; this.swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, done: false }); });
      t.addEventListener('pointermove', (e) => {
        const s = this.swipes.get(e.pointerId); if (!s || s.done || !this.enabled) return;
        const th = 34 / settings.data.sensitivity; const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) < th && Math.abs(dy) < th) return;
        s.done = true;
        if (Math.abs(dx) > Math.abs(dy)) this._press(dx < 0 ? 'left' : 'right'); else if (dy < 0) this._press('jump'); else { this._press('slide'); setTimeout(() => this._release('slide'), 380); }
      });
      const end = (e) => this.swipes.delete(e.pointerId);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => t.addEventListener(n, end));
    }
  }
}

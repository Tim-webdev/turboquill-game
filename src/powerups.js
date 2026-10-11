/** Reusable timed power-up system. Re-collecting refreshes the timer (never stacks), multipliers are max-combined and capped in physics. */
import { CONFIG } from '../config/game-config.js';

export class PowerUps {
  constructor(defs = CONFIG.powerups) { this.defs = defs; this.active = new Map(); }
  activate(id) {
    const d = this.defs[id]; if (!d) return false;
    const isNew = !this.active.has(id);
    this.active.set(id, { left: d.duration, total: d.duration });   // refresh instead of stack
    return isNew;
  }
  update(dt) {
    const expired = [];
    for (const [id, a] of this.active) { a.left -= dt; if (a.left <= 0) { this.active.delete(id); expired.push(id); } }
    return expired;
  }
  get speedMul() { let m = 1; for (const id of this.active.keys()) m = Math.max(m, this.defs[id].speedMul || 1); return m; }
  get jumpMul() { let m = 1; for (const id of this.active.keys()) m = Math.max(m, this.defs[id].jumpMul || 1); return m; }
  has(id) { return this.active.has(id); }
  get any() { return this.active.size > 0; }
  /** first active power-up info for the HUD */
  get primary() { for (const [id, a] of this.active) return { id, def: this.defs[id], ...a }; return null; }
  clear() { this.active.clear(); }
}

/**
 * Track path + player physics.
 * Gameplay is solved in "lane space": s = distance along the track, x = lateral offset, y = height.
 * `Path` maps lane space to world space so the track can curve and bank without complicating collisions.
 */
import * as THREE from 'three';
import { CONFIG } from '../config/game-config.js';
import { clamp, damp } from './utils.js';

export class Path {
  constructor(curve) { this.A = curve.A; this.L = curve.L; }
  cx(s) { return this.A * Math.sin(s / this.L); }
  dcx(s) { return (this.A / this.L) * Math.cos(s / this.L); }
  d2cx(s) { return -(this.A / (this.L * this.L)) * Math.sin(s / this.L); }
  yaw(s) { return -Math.atan(this.dcx(s)); }
  roll(s) { return clamp(-this.d2cx(s) * 105, -0.2, 0.2); }
  /** lane space -> world space (writes into `out`). */
  world(s, x, y, out = new THREE.Vector3()) {
    const d = this.dcx(s), len = Math.sqrt(1 + d * d), r = this.roll(s);
    out.x = this.cx(s) + (x * Math.cos(r)) / len;
    out.z = -s + (x * d * Math.cos(r)) / len;
    out.y = y + x * Math.sin(r);
    return out;
  }
}

/** Highest support surface at (s, y). Ramps/decks are full-width; gaps remove the ground. */
export function surfaceAt(level, s, y, grounded) {
  let best = null;
  // ground (unless inside a gap)
  let inGap = false;
  for (const g of level.gaps) { if (s >= g.s0 && s <= g.s1) { inGap = true; break; } if (g.s0 > s + 2) break; }
  if (!inGap && 0 <= y + 0.6) best = { h: 0, slope: 0 };
  for (const r of level.ramps) {
    if (s < r.s0) break;
    if (s > r.s1) continue;
    const t = (s - r.s0) / (r.s1 - r.s0), h = r.h0 + (r.h1 - r.h0) * t;
    if (h <= y + 1.0 && (!best || h > best.h)) best = { h, slope: (r.h1 - r.h0) / (r.s1 - r.s0) };
  }
  for (const d of level.decks) {
    if (s < d.s0) break;
    if (s > d.s1) continue;
    if (d.h <= y + 1.0 && (!best || d.h > best.h)) best = { h: d.h, slope: 0 };
  }
  return best;
}

export function newPlayerState() {
  const P = CONFIG.player;
  return { s: 0, x: 0, y: 0, vy: 0, lane: 0, speed: 0, grounded: true, coyote: 0, jumpBuf: 0, sliding: false, slideT: 0, boosting: false, energy: P.boostMax, padT: 0, stumbleT: 0, invuln: 0, health: P.maxHealth, lastSlope: 0, airT: 0, fallen: false, hitFlash: 0, dead: false, bounce: false };
}

/**
 * Advance the player. `ctx` = { level, def, input:{held,q}, mods:{speedMul,jumpMul}, arena:boolean, sens }.
 * Returns an array of event strings for the game to react to (sfx, particles, score).
 */
export function stepPlayer(p, dt, ctx) {
  const P = CONFIG.player, ev = [];
  const { level, def, input, mods, arena, sens } = ctx;
  const q = input.q;

  // lane changes
  for (const d of q.lane) { const n = clamp(p.lane + d, -1, 1); if (n !== p.lane) { p.lane = n; ev.push('lane'); } }
  p.x = damp(p.x, p.lane * CONFIG.laneWidth, P.laneSnap * sens, dt);

  // timers
  p.invuln = Math.max(0, p.invuln - dt); p.stumbleT = Math.max(0, p.stumbleT - dt); p.padT = Math.max(0, p.padT - dt); p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.coyote = Math.max(0, p.coyote - dt); p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  if (q.jump) p.jumpBuf = P.jumpBuffer;

  // speed
  let target = def.baseSpeed;
  if (arena) target = def.arenaSpeed;
  else {
    if (input.held.accel) target = def.maxSpeed;
    p.boosting = input.held.boost && p.energy > 2;
    if (p.boosting) { target = def.boostSpeed; p.energy = Math.max(0, p.energy - P.boostDrain * dt); if (!p._wasBoost) ev.push('boostStart'); }
    if (p.padT > 0) target = Math.max(target, def.boostSpeed * 0.92);
    target *= mods.speedMul;
    target = Math.min(target, def.boostSpeed * 1.3);            // hard cap: power-ups can never stack past this
    if (p.stumbleT > 0) target *= 0.62;
  }
  if (arena) p.boosting = false;
  p._wasBoost = p.boosting;
  if (!p.boosting) p.energy = Math.min(P.boostMax, p.energy + (arena ? 40 : P.boostRegen) * dt);
  const a = p.speed < target ? P.accel * (p.boosting || p.padT > 0 ? 2.2 : 1) : P.decel;
  p.speed += clamp(target - p.speed, -a * dt, a * dt);
  p.s += p.speed * dt;

  // slide
  if (q.slide) {
    if (p.grounded) { if (!p.sliding) ev.push('slide'); p.sliding = true; p.slideT = P.slideTime; }
    else p.vy = Math.min(p.vy, -22);                                   // fast-fall dive
  }
  if (p.sliding) { p.slideT -= dt; if (p.slideT <= 0 && !(input.held.slide && p.grounded)) p.sliding = false; }

  // vertical
  let surf = surfaceAt(level, p.s, p.y, p.grounded);
  if (p.grounded) {
    if (surf) { p.y = surf.h; p.lastSlope = surf.slope; }
    else { p.grounded = false; p.coyote = P.coyote; p.vy = p.lastSlope > 0.05 ? p.lastSlope * p.speed : 0; p.airT = 0; }
  }
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0) && !p.sliding) {
    p.vy = P.jumpVelocity * mods.jumpMul + (p.grounded && p.lastSlope > 0.05 ? p.lastSlope * p.speed * 0.8 : 0);
    p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.airT = 0; ev.push('jump');
  }
  if (p.bounce) { p.vy = P.stompBounce * mods.jumpMul; p.grounded = false; p.bounce = false; p.coyote = 0; }
  if (!p.grounded) {
    p.airT += dt;
    p.vy -= P.gravity * dt; const prevY = p.y; p.y += p.vy * dt;
    surf = surfaceAt(level, p.s, p.y, false);
    if (p.vy <= 0 && surf && p.y <= surf.h + 0.02 && prevY >= surf.h - 1.0) { p.y = surf.h; if (p.vy < -9) ev.push('land'); p.vy = 0; p.grounded = true; p.sliding = p.sliding && false; }
    if (p.y < -7) { p.fallen = true; ev.push('fall'); }
  }
  return ev;
}

export function playerBox(p) {
  const P = CONFIG.player, h = p.sliding ? P.slideHeight : P.height;
  return { x0: p.x - P.halfWidth, x1: p.x + P.halfWidth, s0: p.s - P.halfLength, s1: p.s + P.halfLength, y0: p.y, y1: p.y + h };
}

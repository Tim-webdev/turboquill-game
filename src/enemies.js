/**
 * Enemy robots + hazard projectiles (original designs):
 *  - Scuttler  : small ground robot that patrols across the lanes.        (stomp / Turbo Rush)
 *  - Buzz Drone: hovering robot that sweeps sideways at head height.      (stomp from above / slide under / Turbo Rush)
 *  - Bulwark   : heavy guardian that blocks a lane, telegraphs, fires slow plasma orbs.  (2 stomps / Turbo Rush / dodge)
 */
import * as THREE from 'three';
import { overlap, box } from './collision.js';

let SH = null;
function shared() {
  if (SH) return SH;
  const m = (c, e = 0x000000, s = 40) => new THREE.MeshPhongMaterial({ color: c, emissive: e, shininess: s });
  SH = {
    geo: {
      dome: new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), band: new THREE.CylinderGeometry(0.58, 0.6, 0.12, 10), eye: new THREE.SphereGeometry(0.16, 8, 6), spike: new THREE.ConeGeometry(0.09, 0.28, 5),
      leg: new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), ball: new THREE.SphereGeometry(0.45, 12, 10), torus: new THREE.TorusGeometry(0.55, 0.06, 6, 18), disc: new THREE.CylinderGeometry(0.5, 0.5, 0.03, 12),
      box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1), orb: new THREE.SphereGeometry(0.45, 10, 8), halo: new THREE.SphereGeometry(0.75, 10, 8), sph: new THREE.SphereGeometry(0.5, 10, 8), cone: new THREE.ConeGeometry(0.4, 0.8, 6),
    },
    mat: {
      steel: m(0x5a6a8a, 0x0a1020, 60), dark: m(0x232c44, 0x05060c, 60), orange: m(0xff6a1a, 0x7a2a00), eyeHot: new THREE.MeshBasicMaterial({ color: 0xff3a2a }), amber: new THREE.MeshBasicMaterial({ color: 0xffb020 }),
      prop: new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, depthWrite: false }), warn: new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      orb: new THREE.MeshBasicMaterial({ color: 0xff7a2a }), orbHalo: new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
      wave: new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      bolt: new THREE.MeshBasicMaterial({ color: 0x7af4ff }), boltHalo: new THREE.MeshBasicMaterial({ color: 0x28d8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    },
  };
  return SH;
}
export function disposeShared() { if (!SH) return; Object.values(SH.geo).forEach((g) => g.dispose()); Object.values(SH.mat).forEach((m) => m.dispose()); SH = null; }

const add = (parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o; };

function buildScuttler() {
  const S = shared(), g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  add(body, S.geo.dome, S.mat.steel, 0, 0.28, 0, 1.1, 0.95, 1.1); add(body, S.geo.band, S.mat.orange, 0, 0.34, 0, 1.1, 1, 1.1);
  g.userData.eye = add(body, S.geo.eye, S.mat.eyeHot, 0, 0.55, 0.5, 1, 0.7, 0.8);
  for (let i = 0; i < 3; i++) add(body, S.geo.spike, S.mat.orange, (i - 1) * 0.28, 0.9, -0.05);
  g.userData.legs = [];
  for (const [x, z] of [[-0.42, 0.35], [0.42, 0.35], [-0.42, -0.35], [0.42, -0.35]]) { const p = new THREE.Group(); p.position.set(x, 0.3, z); body.add(p); add(p, S.geo.leg, S.mat.dark, 0, -0.2, 0); g.userData.legs.push(p); }
  return g;
}
function buildDrone() {
  const S = shared(), g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  add(body, S.geo.ball, S.mat.dark, 0, 0, 0, 1.15, 0.85, 1.15); add(body, S.geo.torus, S.mat.amber, 0, 0, 0, 1.1, 1.1, 1.1).rotation.x = Math.PI / 2;
  g.userData.eye = add(body, S.geo.eye, S.mat.amber, 0, 0.05, 0.5, 1.5, 1.1, 0.8);
  g.userData.props = [-1, 1].map((s) => { const d = add(body, S.geo.disc, S.mat.prop, s * 0.7, 0.42, 0); add(body, S.geo.leg, S.mat.steel, s * 0.7, 0.2, 0, 1, 0.5, 1); return d; });
  g.userData.reticle = add(g, S.geo.torus, S.mat.warn, 0, -1.7, 0, 0.9, 0.9, 0.9); g.userData.reticle.rotation.x = Math.PI / 2;
  return g;
}
function buildGuardian() {
  const S = shared(), g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  add(body, S.geo.box, S.mat.steel, 0, 1.15, 0, 1.9, 1.3, 1.2); add(body, S.geo.box, S.mat.dark, 0, 0.35, 0, 1.5, 0.7, 1.0);
  add(body, S.geo.box, S.mat.dark, -0.75, 0.3, 0, 0.55, 0.6, 1.5); add(body, S.geo.box, S.mat.dark, 0.75, 0.3, 0, 0.55, 0.6, 1.5);
  add(body, S.geo.dome, S.mat.steel, 0, 1.75, 0.05, 1.0, 1.0, 1.0); g.userData.eye = add(body, S.geo.box, S.mat.eyeHot, 0, 1.98, 0.5, 0.7, 0.1, 0.1);
  for (const s of [-1, 1]) add(body, S.geo.sph, S.mat.orange, s * 1.05, 1.55, 0, 1.0, 0.8, 1.0);
  g.userData.arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 1.1, 1.4, 0.1); body.add(p); add(p, S.geo.box, S.mat.dark, 0, -0.3, 0.3, 0.45, 0.45, 1.0); add(p, S.geo.sph, S.mat.orange, 0, -0.3, 0.85, 0.7, 0.7, 0.7); return p; });
  add(body, S.geo.box, S.mat.orange, 0, 1.2, 0.65, 1.2, 0.18, 0.1); add(body, S.geo.box, S.mat.orange, 0, 0.9, 0.65, 1.2, 0.18, 0.1);
  g.userData.strip = add(g, S.geo.plane, S.mat.warn, 0, 0.07, 8, 2.6, 15, 1); g.userData.strip.rotation.x = -Math.PI / 2; g.userData.strip.visible = false;
  return g;
}
const BUILD = { scuttler: buildScuttler, drone: buildDrone, guardian: buildGuardian };
const SIZE = { scuttler: { hw: 0.6, hl: 0.6, h: 0.95 }, drone: { hw: 0.75, hl: 0.7, h: 1.1 }, guardian: { hw: 1.15, hl: 0.9, h: 2.0 } };

/** Hazard projectiles: orb (jump / dodge), wave (jump), beam (slide). Also the player's quill bolts. */
export class Hazards {
  constructor(scene, path) { this.scene = scene; this.path = path; this.list = []; this.pool = { orb: [], wave: [], beam: [], bolt: [] }; }
  mesh(kind) {
    const S = shared(); let g = this.pool[kind].pop();
    if (!g) {
      g = new THREE.Group();
      if (kind === 'orb') { add(g, S.geo.orb, S.mat.orb); add(g, S.geo.halo, S.mat.orbHalo); }
      else if (kind === 'wave') { add(g, S.geo.box, S.mat.wave, 0, 0.4, 0, 10.4, 0.8, 0.5); }
      else if (kind === 'beam') { add(g, S.geo.box, S.mat.wave, 0, 1.5, 0, 10.4, 1.0, 0.45); add(g, S.geo.box, S.mat.orb, 0, 1.5, 0, 10.4, 0.12, 0.3); }
      else { add(g, S.geo.cone, S.mat.bolt, 0, 0, 0, 0.6, 1.6, 0.6).rotation.x = -Math.PI / 2; add(g, S.geo.halo, S.mat.boltHalo, 0, 0, 0, 0.7, 0.7, 1.4); }
    }
    g.visible = true; this.scene.add(g); return g;
  }
  spawn(kind, s, x, vs, o = {}) {
    const dims = { orb: { hw: 0.5, hl: 0.5, y0: 0.35, h: 1.0 }, wave: { hw: 5.2, hl: 0.5, y0: 0, h: 0.8 }, beam: { hw: 5.2, hl: 0.4, y0: 1.0, h: 1.0 }, bolt: { hw: 0.5, hl: 1.0, y0: 0.3, h: 1.2 } }[kind];
    const h = { kind, s, x, vs, ...dims, life: o.life || 6, mesh: this.mesh(kind), dead: false, friendly: kind === 'bolt', y: o.y ?? 0 };
    this.list.push(h); return h;
  }
  /** Returns hazards that hit the player's box this frame. */
  update(dt, t, p, pbox) {
    const hits = [];
    for (const h of this.list) {
      h.s += h.vs * dt; h.life -= dt;
      const pos = this.path.world(h.s, h.x, h.y, h.mesh.position);
      h.mesh.rotation.y = this.path.yaw(h.s);
      if (h.kind === 'orb') { h.mesh.position.y += 0.85; h.mesh.scale.setScalar(1 + Math.sin(t * 20) * 0.08); }
      if (h.kind === 'wave') h.mesh.scale.y = 1 + Math.sin(t * 25) * 0.1;
      if (h.kind === 'bolt') { h.mesh.position.y += 0.9; h.mesh.rotation.y = this.path.yaw(h.s); }
      if (h.life <= 0 || h.s < p.s - 12) h.dead = true;
      if (!h.dead && !h.friendly && pbox && overlap(pbox, { x0: h.x - h.hw, x1: h.x + h.hw, s0: h.s - h.hl, s1: h.s + h.hl, y0: h.y0, y1: h.y0 + h.h })) { hits.push(h); h.dead = true; }
    }
    this.list = this.list.filter((h) => { if (h.dead) { this.release(h); return false; } return true; });
    return hits;
  }
  release(h) { h.mesh.visible = false; this.scene.remove(h.mesh); this.pool[h.kind].push(h.mesh); }
  clear() { this.list.forEach((h) => this.release(h)); this.list = []; }
  dispose() { this.clear(); }
}

export class Enemies {
  constructor(scene, level, particles, hazards, sfx) {
    this.scene = scene; this.level = level; this.path = level.path; this.particles = particles; this.hazards = hazards; this.sfx = sfx;
    this.pool = { scuttler: [], drone: [], guardian: [] }; this.start = 0; this.hard = level.def.id >= 2;
    this.reset();
  }
  reset() {
    for (const e of this.level.enemies) { if (e.mesh) this.release(e); Object.assign(e, { dead: false, hp: e.type === 'guardian' ? 2 : 1, hitCd: 0, tele: 0, cool: 1.2, dying: 0, mesh: null, px: e.x, py: e.y }); }
    this.start = 0;
  }
  release(e) { if (!e.mesh) return; e.mesh.visible = false; this.scene.remove(e.mesh); this.pool[e.type].push(e.mesh); e.mesh = null; }
  worldPos(e, out) { return this.path.world(e.s, e.px, e.py, out); }

  update(dt, t, p) {
    const E = this.level.enemies;
    while (this.start < E.length && E[this.start].s < p.s - 25) { this.release(E[this.start]); this.start++; }
    for (let i = this.start; i < E.length; i++) {
      const e = E[i]; if (e.s > p.s + 170) break; if (e.dead && e.dying <= 0) continue;
      if (!e.mesh) { const m = this.pool[e.type].pop() || BUILD[e.type](); m.visible = true; m.scale.setScalar(1); this.scene.add(m); e.mesh = m; }
      e.hitCd = Math.max(0, e.hitCd - dt);
      // movement
      if (e.type === 'scuttler') { e.px = e.x + Math.sin(t * e.speed * 1.5 + e.phase) * e.amp; e.py = e.y; }
      else if (e.type === 'drone') { e.px = e.x + Math.sin(t * e.speed * 1.4 + e.phase) * e.amp; e.py = e.y + 1.65 + Math.sin(t * 3 + e.phase) * 0.15; }
      else { e.px = e.x; e.py = 0; }
      const m = e.mesh, u = m.userData;
      this.path.world(e.s, e.px, e.py, m.position); m.rotation.y = this.path.yaw(e.s); m.rotation.z = this.path.roll(e.s);
      // idle animation
      if (e.type === 'scuttler') { u.legs.forEach((l, k) => { l.rotation.x = Math.sin(t * 14 + k * 1.6) * 0.6; }); u.body.position.y = Math.abs(Math.sin(t * 14 + e.phase)) * 0.08; u.eye.scale.setScalar(0.9 + Math.sin(t * 9) * 0.25); }
      else if (e.type === 'drone') { u.props.forEach((pp) => { pp.rotation.y = t * 40; }); u.body.rotation.z = Math.cos(t * e.speed * 1.4 + e.phase) * 0.25; u.reticle.position.y = -e.py; u.reticle.rotation.z = t * 2; u.reticle.scale.setScalar(0.8 + Math.sin(t * 6) * 0.1); }
      else this.guardianAI(e, dt, t, p);
      { const bs = u.body.scale, k = Math.min(1, dt * 8); bs.x += (1 - bs.x) * k; bs.y += (1 - bs.y) * k; bs.z += (1 - bs.z) * k; }
      if (e.dead) { e.dying -= dt; const k = Math.max(0, e.dying / 0.3); m.scale.setScalar(k); m.rotation.y += dt * 12; if (e.dying <= 0) this.release(e); }
    }
  }
  guardianAI(e, dt, t, p) {
    const u = e.mesh.userData, d = e.s - p.s;
    e.cool -= dt;
    if (e.tele > 0) {
      e.tele -= dt; u.strip.visible = true; u.strip.material.opacity = 0.2 + 0.3 * (Math.floor(t * 14) % 2);
      u.arms.forEach((a) => { a.rotation.x = -1.2; }); u.eye.scale.set(1.4, 2.5, 1);
      if (e.tele <= 0) { u.strip.visible = false; this.hazards.spawn('orb', e.s - 1.4, e.px, -(this.hard ? 22 : 18), { life: 5 }); this.sfx('shoot'); u.arms.forEach((a) => { a.rotation.x = 0.3; }); }
    } else {
      u.strip.visible = false; u.eye.scale.set(1, 1, 1); u.arms.forEach((a) => { a.rotation.x += (Math.sin(t * 2) * 0.1 - a.rotation.x) * Math.min(1, dt * 6); });
      if (!e.dead && d < 46 && d > 18 && e.cool <= 0) { e.tele = this.hard ? 0.75 : 0.95; e.cool = 3.2; this.sfx('warn'); }
    }
  }

  /** Resolve player-vs-enemy contacts. Returns events for the game (score/sfx/damage). */
  collide(p, pbox) {
    const out = [], E = this.level.enemies;
    for (let i = this.start; i < E.length; i++) {
      const e = E[i]; if (e.s > p.s + 4) break; if (e.dead || !e.mesh) continue;
      const sz = SIZE[e.type], eb = box(e.px, e.s, e.type === 'drone' ? e.py - 0.55 : e.py, sz.hw, sz.hl, sz.h);
      const stompZone = e.type !== 'guardian' || true ? { x0: eb.x0, x1: eb.x1, s0: eb.s0 - 0.5, s1: eb.s1 + 0.5, y0: eb.y0, y1: eb.y1 + 0.7 } : eb;
      const canStomp = !p.grounded && p.vy < 0 && p.y >= eb.y1 - 0.35 && overlap(pbox, stompZone);
      if (!canStomp && !overlap(pbox, eb)) continue;
      if (e.hitCd > 0) continue;
      if (p.boosting) { this.damage(e, 9); out.push({ type: 'kill', e }); continue; }
      if (canStomp || (p.vy < 0 && !p.grounded && p.y >= eb.y1 - 0.6)) { e.hitCd = 0.4; this.damage(e, 1); p.bounce = true; out.push({ type: e.dead ? 'stomp-kill' : 'stomp-hit', e }); continue; }
      if (p.invuln <= 0) { e.hitCd = 1.2; out.push({ type: 'hurt', e }); }
    }
    return out;
  }
  damage(e, n) {
    e.hp -= n;
    const pos = this.path.world(e.s, e.px, e.type === 'drone' ? e.py : e.py + 0.8, new THREE.Vector3());
    if (e.hp <= 0) { e.dead = true; e.dying = 0.3; this.particles.burst(pos.x, pos.y, pos.z, 26, 0xff8a2a, 9, 0.7); this.particles.burst(pos.x, pos.y, pos.z, 10, 0xffffff, 6, 0.4); }
    else { this.particles.burst(pos.x, pos.y, pos.z, 12, 0xffd23a, 6, 0.4); if (e.mesh) e.mesh.userData.body.scale.set(1.2, 0.7, 1.2); }
  }
  dispose() { for (const e of this.level.enemies) { if (e.mesh) this.release(e); } for (const k of Object.values(this.pool)) k.forEach((g) => this.scene.remove(g)); }
}

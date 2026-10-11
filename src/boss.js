/**
 * IRON WARDEN — original multi-phase boss.
 * Fight loop: attack sequence (telegraphed) -> shields open (core exposed) -> player fires quill bolts at the core -> repeat.
 * Phase 2 (<= 50% HP): faster telegraphs, longer sequences, combined attacks, shorter damage windows.
 * Counter-play: lane changes dodge orbs, jumping clears shockwaves, sliding passes under sweep beams.
 */
import * as THREE from 'three';
import { CONFIG } from '../config/game-config.js';
import { damp, clamp } from './utils.js';

export const BOSS_NAME = 'IRON WARDEN';
const LW = CONFIG.laneWidth;

export class Boss {
  constructor(scene, level, particles, hazards, hooks) {
    this.scene = scene; this.path = level.path; this.particles = particles; this.hazards = hazards; this.hooks = hooks;
    this.maxHp = 10; this.hp = this.maxHp; this.state = 'off'; this.t = 0; this.s = 0; this.x = 0; this.targetLane = 0; this.phase = 1;
    this.queue = []; this.timeline = []; this.windowT = 0; this.windowHits = 0; this.flash = 0; this.last = ''; this.strips = [];
    this.mats = {
      steel: new THREE.MeshPhongMaterial({ color: 0x3a4660, emissive: 0x000000, shininess: 70 }), dark: new THREE.MeshPhongMaterial({ color: 0x1b2236, shininess: 40 }), orange: new THREE.MeshPhongMaterial({ color: 0xff6a1a, emissive: 0x6a2400 }),
      gold: new THREE.MeshPhongMaterial({ color: 0xffc83a, emissive: 0x4a3000, shininess: 100 }), core: new THREE.MeshBasicMaterial({ color: 0xffb040 }), eye: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      warn: new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      ring: new THREE.MeshBasicMaterial({ color: 0x38f0ff }),
    };
    this._geo = [];
    this.group = this._build(); this.group.visible = false; scene.add(this.group);
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(1, 1); this._geo.push(g); const m = new THREE.Mesh(g, this.mats.warn); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); this.strips.push(m); }
    const bg = new THREE.BoxGeometry(1, 1, 1); this._geo.push(bg); this.beamWarn = new THREE.Mesh(bg, this.mats.warn); this.beamWarn.visible = false; scene.add(this.beamWarn);
  }

  _build() {
    const M = this.mats, g = new THREE.Group(), geo = (G) => { this._geo.push(G); return G; };
    const add = (parent, G, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo(G), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; };
    const body = new THREE.Group(); g.add(body); this.body = body;
    add(body, new THREE.CylinderGeometry(1.6, 1.2, 0.9, 10), M.dark, 0, 2.3, 0); const hr = add(body, new THREE.TorusGeometry(1.5, 0.12, 6, 22), M.ring, 0, 1.8, 0); hr.rotation.x = Math.PI / 2; this.hoverRing = hr;
    add(body, new THREE.BoxGeometry(3.6, 3.0, 2.4), M.steel, 0, 4.2, 0); add(body, new THREE.BoxGeometry(3.9, 0.5, 2.6), M.dark, 0, 5.8, 0); add(body, new THREE.BoxGeometry(3.0, 0.4, 2.0), M.orange, 0, 2.95, 0);
    for (const s of [-1, 1]) { add(body, new THREE.BoxGeometry(0.2, 2.2, 2.5), M.orange, s * 1.85, 4.2, 0); }
    // chest frame + core
    const fr = add(body, new THREE.TorusGeometry(1.0, 0.16, 8, 20), M.gold, 0, 4.3, 1.25); this.core = add(body, new THREE.SphereGeometry(0.72, 14, 10), M.core, 0, 4.3, 1.22);
    this.shields = [-1, 1].map((s) => add(body, new THREE.BoxGeometry(1.15, 2.3, 0.35), M.dark, s * 0.58, 4.3, 1.55));
    for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.15, 2.0, 0.2), M.orange, s * 0.58, 4.3, 1.75);
    // head
    this.head = new THREE.Group(); this.head.position.set(0, 6.3, 0.1); body.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), M.steel, 0, 0, 0); add(this.head, new THREE.BoxGeometry(1.5, 0.22, 0.2), M.eye, 0, 0.18, 0.88); this.eye = this.head.children[1];
    for (const s of [-1, 1]) add(this.head, new THREE.ConeGeometry(0.16, 1.0, 5), M.gold, s * 0.5, 0.95, -0.2).rotation.z = -s * 0.35;
    // arms with cannons
    this.arms = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 2.45, 5.2, 0); body.add(p);
      add(p, new THREE.SphereGeometry(0.95, 10, 8), M.orange, 0, 0, 0); add(p, new THREE.BoxGeometry(0.95, 2.0, 0.95), M.dark, 0, -1.2, 0);
      const cn = new THREE.Group(); cn.position.set(0, -2.2, 0.2); p.add(cn); add(cn, new THREE.CylinderGeometry(0.55, 0.65, 2.2, 8), M.steel, 0, 0, 0.9).rotation.x = Math.PI / 2;
      add(cn, new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8), M.core, 0, 0, 2.05).rotation.x = Math.PI / 2; p.userData.cn = cn; return p;
    });
    g.scale.setScalar(1.45);
    return g;
  }

  start(p) {
    this.state = 'intro'; this.t = 0; this.hp = this.maxHp; this.phase = 1; this.s = p.s + 62; this.x = 0; this.targetLane = 0; this.group.visible = true;
    this.queue = []; this.timeline = []; this.windowT = 0; this.windowHits = 0; this.flash = 0; this.open = 0; this.introY = -14; this.hooks.onIntro?.();
  }
  get vulnerable() { return this.state === 'fight' && this.windowT > 0; }
  get active() { return this.state !== 'off' && this.state !== 'dead'; }

  // ---- scheduling -------------------------------------------------------------------------------
  at(delay, fn) { this.timeline.push({ t: this.t + delay, fn }); }
  tele() { return this.phase === 1 ? 0.95 : 0.68; }
  strip(i, x, width, on) { const m = this.strips[i]; m.visible = on; if (on) { m.scale.set(width, this.s - this.pS - 3, 1); this.path.world((this.s + this.pS + 3) / 2, x, 0.07, m.position); m.rotation.z = -this.path.yaw((this.s + this.pS) / 2) * 0; m.material.opacity = 0.25 + 0.3 * (Math.floor(this.t * 14) % 2); } }
  planAttack() {
    const choices = ['orbs', 'wave', 'beam'].filter((n) => n !== this.last); const name = choices[Math.floor(Math.random() * choices.length)]; this.last = name;
    const T = this.tele(), p2 = this.phase === 2, vs = p2 ? -24 : -20;
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    let dur = 2.2;
    if (name === 'orbs') {
      const n = p2 ? 3 : 2; dur = n * 0.75 + T + 0.8;
      for (let i = 0; i < n; i++) { const lane = lanes[i % 3], d = i * 0.75; this.at(d, () => this.armLane(lane, T)); this.at(d + T, () => { this.fire('orb', lane * LW, vs); }); }
    } else if (name === 'wave') {
      const n = p2 ? 2 : 1; dur = T + n * 1.1 + 0.9;
      for (let i = 0; i < n; i++) { this.at(i * 1.15, () => this.armWide(T, 'wave')); this.at(i * 1.15 + T, () => { this.fire('wave', 0, p2 ? -19 : -16); this.slam(); }); }
    } else {
      dur = T + (p2 ? 2.4 : 1.2) + 0.8; this.at(0, () => this.armWide(T, 'beam')); this.at(T, () => this.fire('beam', 0, p2 ? -26 : -20));
      if (p2) { const lane = lanes[0]; this.at(T + 1.0, () => this.armLane(lane, T * 0.8)); this.at(T + 1.0 + T * 0.8, () => this.fire('orb', lane * LW, vs)); }
    }
    this.sub = name; this.attackEnd = this.t + dur;
  }
  armLane(lane, T) { this.hooks.onTelegraph?.(); this.tel = { kind: 'lane', x: lane * LW, until: this.t + T }; this.telList = this.telList || []; this.telList.push(this.tel); this.armRaise = T; }
  armWide(T, kind) { this.hooks.onTelegraph?.(); (this.telList = this.telList || []).push({ kind, x: 0, until: this.t + T }); this.armRaise = T; }
  fire(kind, x, vs) { this.hazards.spawn(kind, this.s - 2, x, vs, { life: 4.5 }); this.hooks.onFire?.(kind); }
  slam() { const pos = this.path.world(this.s - 2, 0, 0.2, new THREE.Vector3()); this.particles.burst(pos.x, pos.y, pos.z, 18, 0xff7a2a, 8, 0.5); }

  // ---- update -----------------------------------------------------------------------------------
  update(dt, tNow, p) {
    if (!this.active) return;
    this.t += dt; this.pS = p.s;
    const follow = p.s + 31; this.s = damp(this.s, this.state === 'intro' ? p.s + 40 : follow, 3, dt);
    this.x = damp(this.x, this.targetLane * LW, this.state === 'fight' ? 5 : 3, dt);
    this.flash = Math.max(0, this.flash - dt);
    const m = this.mats; m.steel.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000); m.steel.emissiveIntensity = this.flash > 0 ? 0.8 : 0;

    if (this.state === 'intro') {
      this.introY = damp(this.introY, 0, 2.2, dt);
      if (this.t > 1.2 && !this._roared) { this._roared = true; this.hooks.onRoar?.(); }
      if (this.t > 3.6) { this.state = 'fight'; this.sub = 'idle'; this.idleT = 0.8; this._roared = false; this.hooks.onFightStart?.(); }
    } else if (this.state === 'fight') this.fightLogic(dt, p);
    else if (this.state === 'dying') {
      this.deadT -= dt; this.introY -= dt * 2.2;
      if (Math.random() < dt * 14) { const pos = this.path.world(this.s + (Math.random() - 0.5) * 3, this.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 6, new THREE.Vector3()); this.particles.burst(pos.x, pos.y, pos.z, 16, Math.random() < 0.5 ? 0xff8a2a : 0xffe08a, 9, 0.8); if (Math.random() < 0.3) this.hooks.onBlast?.(); }
      if (this.deadT <= 0) { this.state = 'dead'; this.group.visible = false; this.hooks.onDefeat?.(); }
    }
    // timeline
    for (let i = this.timeline.length - 1; i >= 0; i--) if (this.t >= this.timeline[i].t) { const f = this.timeline[i].fn; this.timeline.splice(i, 1); f(); }
    // telegraph strips
    this.telList = (this.telList || []).filter((x) => x.until > this.t);
    let si = 0; this.beamWarn.visible = false;
    for (const x of this.telList) {
      if (x.kind === 'lane') this.strip(si++, x.x, LW - 0.3, true);
      else if (x.kind === 'wave') this.strip(si++, 0, 10.4, true);
      else if (x.kind === 'beam') { this.beamWarn.visible = true; this.path.world(this.s - 6, 0, 1.5, this.beamWarn.position); this.beamWarn.scale.set(10.4, 1.0, 0.4); this.beamWarn.material.opacity = 0.25 + 0.3 * (Math.floor(this.t * 14) % 2); this.beamWarn.rotation.y = this.path.yaw(this.s); }
    }
    for (; si < 3; si++) this.strips[si].visible = false;
    this.animate(dt, tNow);
  }

  fightLogic(dt, p) {
    if (this.windowT > 0) {
      this.windowT -= dt; this.open = damp(this.open, 1, 9, dt);
      if (this.windowT <= 0 || this.windowHits >= (this.phase === 1 ? 2 : 1) + (this.windowHits > 0 && this.windowT > 0 ? 0 : 0) && this.windowT < 0.01) { /* closes below */ }
      if (this.windowT <= 0) { this.windowT = 0; this.sub = 'idle'; this.idleT = this.phase === 1 ? 0.9 : 0.55; this.hooks.onWindow?.(false); }
      return;
    }
    this.open = damp(this.open, 0, 9, dt);
    if (this.sub === 'idle') {
      this.idleT -= dt;
      if (this.idleT <= 0) { if (!this.queue.length) { const n = 2; this.queue = Array.from({ length: n }, (_, i) => i); } this.queue.shift(); this.planAttack(); }
    } else if (this.sub === 'window-prep') {
      // moving to the exposed lane
    } else if (this.t >= this.attackEnd) {
      if (this.queue.length) { this.sub = 'idle'; this.idleT = this.phase === 1 ? 0.35 : 0.15; }
      else { this.openWindow(); }
    }
  }
  openWindow() {
    const lane = [-1, 0, 1][Math.floor(Math.random() * 3)]; this.targetLane = lane; this.windowT = this.phase === 1 ? 4.6 : 3.6; this.windowHits = 0; this.sub = 'window'; this.hooks.onWindow?.(true); this.last = '';
  }

  /** Called with each friendly bolt; returns 'hit' | 'deflect' | null. */
  testBolt(bolt) {
    if (!this.active || this.state !== 'fight' && this.state !== 'intro') return null;
    if (bolt.s < this.s - 3.5 || bolt.s > this.s + 2) return null;
    if (Math.abs(bolt.x - this.x) > 2.4) return null;
    if (this.vulnerable) {
      this.hp = Math.max(0, this.hp - 1); this.windowHits++; this.flash = 0.35; this.hooks.onHit?.(this.hp);
      const pos = this.path.world(this.s - 2, this.x, 4.5, new THREE.Vector3()); this.particles.burst(pos.x, pos.y, pos.z, 30, 0xffd23a, 10, 0.7); this.particles.burst(pos.x, pos.y, pos.z, 14, 0x7af4ff, 8, 0.5);
      if (this.hp <= 0) { this.die(); }
      else {
        if (this.phase === 1 && this.hp <= this.maxHp / 2) { this.phase = 2; this.hooks.onPhase2?.(); this.windowT = 0.01; this.queue = []; this.sub = 'idle'; this.idleT = 1.2; }
        else if (this.windowHits >= 2) this.windowT = Math.min(this.windowT, 0.5);
      }
      return 'hit';
    }
    this.flash = 0.08; return 'deflect';
  }
  die() { this.state = 'dying'; this.deadT = 3.4; this.windowT = 0; this.timeline = []; this.telList = []; this.hazards.list.forEach((h) => { if (!h.friendly) h.dead = true; }); this.hooks.onDying?.(); }

  animate(dt, t) {
    const y = this.state === 'intro' || this.state === 'dying' ? this.introY : Math.sin(t * 1.6) * 0.25;
    this.path.world(this.s, this.x, Math.max(y, -14), this.group.position); this.group.rotation.y = this.path.yaw(this.s) + (this.state === 'dying' ? Math.sin(t * 40) * 0.05 : 0);
    this.hoverRing.rotation.z = t * 3;
    this.shields[0].position.x = -0.58 - this.open * 1.15; this.shields[1].position.x = 0.58 + this.open * 1.15;
    const pulse = 0.6 + 0.4 * Math.sin(t * (this.vulnerable ? 14 : 3));
    this.core.scale.setScalar(this.vulnerable ? 1.1 + pulse * 0.3 : 0.9); this.mats.core.color.setHex(this.vulnerable ? 0xfff0a0 : 0xff8a30);
    this.mats.eye.color.setHex(this.phase === 2 ? 0xff7a1a : 0xff2a2a);
    const raise = (this.armRaise = Math.max(0, (this.armRaise || 0) - dt));
    this.arms.forEach((a, i) => { const tgt = raise > 0 ? -1.4 : Math.sin(t * 1.4 + i) * 0.08; a.rotation.x = damp(a.rotation.x, tgt, 12, dt); });
    this.head.rotation.y = Math.sin(t * 0.9) * 0.15; this.group.visible = this.state !== 'off' && this.state !== 'dead';
  }

  worldPos(out) { return this.path.world(this.s, this.x, 4, out); }
  reset() { this.state = 'off'; this.group.visible = false; this.timeline = []; this.telList = []; this.strips.forEach((m) => { m.visible = false; }); this.beamWarn.visible = false; this.windowT = 0; this.open = 0; }
  dispose() { this.scene.remove(this.group); this.strips.forEach((m) => this.scene.remove(m)); this.scene.remove(this.beamWarn); this._geo.forEach((g) => g.dispose()); Object.values(this.mats).forEach((m) => m.dispose()); }
}

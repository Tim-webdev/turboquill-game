/** Game orchestrator: owns the loop, level lifecycle, scoring, camera and all gameplay systems. */
import * as THREE from 'three';
import { CONFIG } from '../config/game-config.js';
import { ASSETS } from '../config/assets.js';
import { SceneManager } from './scene.js';
import { ChunkManager } from './chunks.js';
import { generateLevel } from './levels.js';
import { newPlayerState, stepPlayer, playerBox, surfaceAt } from './physics.js';
import { overlap } from './collision.js';
import { PlayerModel } from './player.js';
import { RingField, PickupField } from './collectibles.js';
import { Enemies, Hazards, disposeShared } from './enemies.js';
import { Boss, BOSS_NAME } from './boss.js';
import { PowerUps } from './powerups.js';
import { Particles } from './particles.js';
import { audio } from './audio.js';
import { settings } from './settings.js';
import * as store from './storage.js';
import { ads } from './ads.js';
import { clamp, damp, smoothstep, isTouchDevice } from './utils.js';

const EMPTY = () => ({ lane: [], jump: false, slide: false, boost: false });
const _v = new THREE.Vector3(), _look = new THREE.Vector3(), _tb = { x0: 0, x1: 0, s0: 0, s1: 0, y0: 0, y1: 0 };

export class Game {
  constructor({ canvas, stage, ui, controls, debug = {} }) {
    this.canvas = canvas; this.stage = stage; this.ui = ui; this.controls = controls; this.debug = debug;
    this.state = 'init'; this.t = 0; this.last = 0; this.fps = 60; this.fpsT = 0; this.run = null; this.touchDevice = isTouchDevice();
  }

  pickQuality() {
    const q = settings.data.quality; if (q !== 'auto') return q;
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    if (mem <= 2 || cores <= 2) return 'low';
    if (this.touchDevice || cores <= 4) return 'medium';
    return 'high';
  }

  /** Create renderer + persistent objects. Throws if WebGL is unavailable. */
  async init(report) {
    report(0.1, 'Starting the 3D engine…');
    this.sm = new SceneManager(this.canvas, this.stage, this.pickQuality());
    this.particles = new Particles(this.sm.scene, CONFIG.quality.high.particles); this.particles.setMax(this.sm.q.particles);
    report(0.4, 'Building the hero…');
    this.model = new PlayerModel(); this.sm.scene.add(this.model.root, this.model.shadow);
    if (ASSETS.models.player) await this.model.loadCustom(ASSETS.models.player);
    report(0.7, 'Compiling shaders…');
    this.sm.setLevel(CONFIG.levels[0]);
    try { this.sm.renderer.compile(this.sm.scene, this.sm.camera); } catch (e) { /* non-fatal */ }
    this.sm.camera.position.set(0, 5, 10); this.sm.render();
    report(1, 'Ready!');
    new ResizeObserver(() => this.sm.resize()).observe(this.stage);
    window.addEventListener('orientationchange', () => setTimeout(() => this.sm.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.state = 'menu'; this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  applyQuality() { this.sm.setQuality(this.pickQuality()); this.particles.setMax(settings.reducedMotion ? Math.floor(this.sm.q.particles / 2) : this.sm.q.particles); }

  // ---------------------------------------------------------------------------------- lifecycle
  startLevel(id, opts = {}) {
    this.endRun(); this.applyQuality();
    const def = CONFIG.levels.find((l) => l.id === id) || CONFIG.levels[0], sm = this.sm;
    const level = generateLevel(def), path = level.path;
    sm.setLevel(def);
    const r = this.run = {
      def, level, path, score: 0, rings: 0, ended: false, bossStarted: false, oi: 0, camX: 0, camY: 0, shake: 0, boltCd: 0, time: 0, timers: [],
      p: newPlayerState(), powerups: new PowerUps(), god: !!this.debug.god || !!opts.god,
    };
    r.p.s = opts.startS || 0; r.p.speed = def.baseSpeed * 0.7;
    r.chunks = new ChunkManager(sm.scene, level, sm.mats, sm.q, sm.extras);
    r.rings = new RingField(sm.scene, level); r.pickups = new PickupField(sm.scene, level);
    r.hazards = new Hazards(sm.scene, path);
    r.enemies = new Enemies(sm.scene, level, this.particles, r.hazards, (n) => audio.sfx(n));
    r.boss = def.bossAtEnd ? new Boss(sm.scene, level, this.particles, r.hazards, this.bossHooks(r)) : null;
    this.seek(r, r.p.s);
    r.chunks.update(r.p.s, true);
    this.model.powered = false; this.model.root.visible = true; this.particles.clear();
    this.updateCamera(0.016, true);
    this.ui.initHud(def, CONFIG.player.maxHealth); this.ui.hideAll(); this.ui.setHud(true);
    const st = settings.data.showTouch; this.ui.setTouch(st === 'on' || (st === 'auto' && this.touchDevice));
    this.immersive(true); this.controls.reset(); this.controls.enabled = true;
    this.state = 'playing'; this.t = 0; audio.setPaused(false); audio.play(def.music);
    this.ui.banner(opts.startS ? 'GO!' : `LEVEL ${def.id}`, 1400); this.ui.setMuteIcon(settings.data.muted);
    if (id === 1 && !opts.startS) this.hint(this.touchDevice ? 'Swipe or use ◀ ▶ to change lanes · ▲ jump · ▼ slide · hold ⚡ to boost' : 'A / D change lanes · SPACE jump · S slide · W accelerate · SHIFT boost', 6000);
    if (this.touchDevice && innerHeight > innerWidth && !sessionStorage.getItem('tq-rot')) { $('#rotate-hint').hidden = false; r.timers.push(setTimeout(() => { $('#rotate-hint').hidden = true; }, 7000)); }
    this.lastId = id; this.lastOpts = opts;
  }
  hint(text, ms) { this.ui.prompt(text); this.run.timers.push(setTimeout(() => { if (this.run && !this.run.boss?.active) this.ui.prompt(''); }, ms)); }
  immersive(on) { document.body.classList.toggle('immersive', on && (this.touchDevice || innerWidth <= 800)); }
  restart() { this.startLevel(this.lastId, this.lastOpts); }

  endRun() {
    const r = this.run; if (!r) return;
    r.timers.forEach(clearTimeout);
    r.chunks.disposeAll(); r.rings.dispose(); r.pickups.dispose(); r.enemies.dispose(); r.hazards.dispose(); r.boss?.dispose();
    disposeShared(); this.particles.clear(); this.run = null; this.model.root.visible = false; this.model.shadow.visible = false;
    this.ui.setHud(false); this.ui.setTouch(false); this.controls.enabled = false; this.controls.reset();
  }
  quit() { this.endRun(); this.state = 'menu'; this.immersive(false); document.getElementById('rotate-hint').hidden = true; audio.setPaused(false); audio.play('menu'); this.ui.refreshBest(); this.ui.show('menu'); }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.controls.reset(); this.controls.enabled = false; audio.setPaused(true); this.ui.show('pause'); }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.controls.enabled = true; audio.setPaused(false); this.ui.hideAll(); this.last = performance.now(); this.canvas.focus?.({ preventScroll: true }); }
  togglePause() { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); }

  seek(r, s) {
    const O = r.level.obstacles; r.oi = 0; while (r.oi < O.length && O[r.oi].s1 < s - 3) r.oi++;
    const R = r.level.rings; r.rings.start = 0; while (r.rings.start < R.length && R[r.rings.start].s < s - 14) r.rings.start++;
    const E = r.level.enemies; r.enemies.start = 0; while (r.enemies.start < E.length && E[r.enemies.start].s < s - 25) r.enemies.start++;
  }

  // ---------------------------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(CONFIG.maxFrame, Math.max(0.0001, (now - this.last) / 1000)); this.last = now;
    if (this.state === 'playing') {
      this.update(dt);
      this.fps += (1 / dt - this.fps) * 0.05; this.fpsT += dt;
      if (this.fpsT > 2.5) { this.fpsT = 0; this.sm.adapt(this.fps, settings.data.quality === 'auto'); }
    }
    if (this.run && (this.state === 'playing' || this.state === 'paused' || this.state === 'ended')) {
      if (this.state !== 'playing') this.sm.update(0); this.sm.render();
    }
  }

  update(dt) {
    const r = this.run; if (!r) return;
    this.t += dt; r.time += dt;
    const q = this.controls.consume();
    const n = Math.max(1, Math.ceil(dt / CONFIG.maxStep)), h = dt / n;
    for (let i = 0; i < n && this.state === 'playing'; i++) this.step(h, i === 0 ? q : EMPTY());
    if (this.state !== 'playing' && this.state !== 'ended') return;
    this.frame(dt);
  }

  step(dt, q) {
    const r = this.run, p = r.p, def = r.def, level = r.level;
    const arena = !!(r.boss && r.boss.active);
    const mods = { speedMul: r.powerups.speedMul, jumpMul: r.powerups.jumpMul };
    if (arena && q.boost) this.fireBolt();
    const ev = stepPlayer(p, dt, { level, def, input: { held: this.controls.held, q }, mods, arena, sens: settings.data.sensitivity });
    for (const e of ev) this.onPlayerEvent(e);
    if (this.state !== 'playing') return;

    // timers & power-ups
    for (const id of r.powerups.update(dt)) { audio.sfx('powerdown'); this.ui.banner('Velocity Core faded', 900); }
    if (p.s >= level.finishS) {
      if (def.bossAtEnd) { if (!r.bossStarted) { r.bossStarted = true; r.boss.start(p); } }
      else { this.complete(); return; }
    }
    const pb = playerBox(p);

    // obstacles
    const O = level.obstacles; while (r.oi < O.length && O[r.oi].s1 < p.s - 3) r.oi++;
    for (let i = r.oi; i < O.length && O[i].s0 < p.s + 2; i++) {
      const o = O[i]; if (o.hit) continue;
      _tb.x0 = o.x0; _tb.x1 = o.x1; _tb.s0 = o.s0; _tb.s1 = o.s1; _tb.y0 = o.y0; _tb.y1 = o.y1;
      if (overlap(pb, _tb)) { if (p.invuln <= 0 && !r.god) { o.hit = true; this.hurt('obstacle'); } else if (r.god) o.hit = true; }
      else if (!o.credited && p.s > o.s1) {
        o.credited = true; this.addScore(CONFIG.score.obstacleClear);
        if ((o.kind === 'barrier' && p.y > 0.5) || (o.kind === 'bar' && p.sliding)) this.addScore(CONFIG.score.jump);
      }
    }
    for (const g of level.gaps) { if (g.s0 > p.s + 5) break; if (!g.passed && p.s > g.s1 + 1 && p.y > -1) { g.passed = true; this.addScore(CONFIG.score.jump); } }
    // pads & gates
    for (const pd of level.pads) { if (pd.s > p.s + 5) break; if (!pd.used && p.grounded && p.s >= pd.s && p.s <= pd.s + pd.len && Math.abs(p.x - pd.x) < pd.w / 2 + 0.4) { pd.used = true; p.padT = 1.6; audio.sfx('pad'); this.ui.banner('BOOST!', 600); this.burstAt(p, 14, 0x6af0ff); } }
    for (const g of level.gates) { if (g.s > p.s + 5) break; if (!g.got && Math.abs(p.s - g.s) < 1.2 && p.x > g.x0 - 0.4 && p.x < g.x1 + 0.4) { g.got = true; p.padT = 1.8; this.addScore(CONFIG.score.gate); audio.sfx('gate'); this.ui.banner('SPEED GATE!', 700); this.burstAt(p, 24, 0xffd23a); } }
    // enemies & hazards
    r.enemies.update(dt, this.t, p);
    for (const e of r.enemies.collide(p, pb)) this.onEnemyEvent(e);
    for (const hz of r.hazards.update(dt, this.t, p, pb)) { if (hz && !r.god) this.hurt('hazard'); }
    // pickups & rings (every sub-step so fast movement cannot skip them)
    const view = 150;
    r.rings.update(this.t, p, view, (ring, pos) => this.onRing(ring, pos));
    r.pickups.update(this.t, p, view, (pk, pos) => this.onPickup(pk, pos));
    if (p.fallen) this.onFall();
  }

  frame(dt) {
    const r = this.run, p = r.p, def = r.def, sm = this.sm;
    if (r.boss && r.boss.active) {
      r.boss.update(dt, this.t, p); r.boltCd = Math.max(0, r.boltCd - dt);
      for (const b of r.hazards.list) if (b.friendly && !b.dead) { const res = r.boss.testBolt(b); if (res) { b.dead = true; if (res === 'deflect') { audio.sfx('deflect'); r.boss.worldPos(_v); this.particles.burst(_v.x, _v.y - 1, _v.z + 3, 8, 0xbfe8ff, 6, 0.3); } } }
    }
    r.chunks.update(p.s);
    // player model
    const path = r.path; path.world(p.s, p.x, p.y, this.model.root.position);
    this.model.root.rotation.set(0, path.yaw(p.s), path.roll(p.s), 'YXZ');
    this.model.powered = r.powerups.has('velocity_core');
    const sp = clamp((p.speed - def.baseSpeed) / (def.boostSpeed - def.baseSpeed), 0, 1.2);
    this.model.animate(dt, p, sp, p.boosting || p.padT > 0, this.t);
    const surf = surfaceAt(r.level, p.s, p.y + 0.5, false);
    this.model.shadow.visible = !!surf && p.y - surf.h < 6;
    if (surf) { path.world(p.s, p.x, surf.h + 0.04, this.model.shadow.position); this.model.shadow.rotation.set(-Math.PI / 2, 0, 0); this.model.shadow.scale.setScalar(clamp(1 - (p.y - surf.h) * 0.12, 0.4, 1)); }
    // trail
    if ((p.boosting || p.padT > 0 || this.model.powered) && !settings.reducedMotion) {
      for (let i = 0; i < 2; i++) { path.world(p.s - 0.7, p.x + (Math.random() - 0.5) * 0.5, p.y + 0.5 + Math.random() * 0.7, _v); this.particles.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 4 + Math.random() * 3, this.model.powered ? 0x40e0ff : 0xffd23a, 0.4); }
    }
    this.particles.update(dt);
    this.updateCamera(dt, false);
    sm.update(dt);
    // HUD
    const pu = r.powerups.primary;
    this.ui.updateHud({ rings: r.ringsCollected || 0, score: r.score, health: p.health, speedFrac: clamp(p.speed / (def.boostSpeed * 1.1), 0, 1), energy: p.energy, arena: !!(r.boss && r.boss.active),
      power: pu ? { name: pu.def.name, frac: pu.left / pu.total } : null, boss: r.boss && r.boss.active ? { hp: r.boss.hp, max: r.boss.maxHp } : null });
  }
  ringCount() { return this.run.ringsCollected || 0; }

  updateCamera(dt, snap) {
    const r = this.run, p = r.p, sm = this.sm, cam = sm.camera, path = r.path, k = sm.viewScale;
    const tx = p.x * 0.6, ty = p.y * 0.72;
    if (snap) { r.camX = tx; r.camY = ty; } else { r.camX = damp(r.camX, tx, 7, dt); r.camY = damp(r.camY, ty, p.grounded ? 8 : 4, dt); }
    path.world(p.s - 9.5 * k, r.camX, r.camY + 3.5 + 1.0 * k, cam.position);
    path.world(p.s + 10, p.x * 0.35, r.camY * 0.5 + 1.3, _look);
    const b = r.boss;
    if (b && b.state === 'intro') { b.worldPos(_v); const w = smoothstep(0, 1.2, b.t) * (1 - smoothstep(2.6, 3.6, b.t)); _look.lerp(_v, w * 0.85); }
    if (r.shake > 0.001 && !settings.reducedMotion) { cam.position.x += (Math.random() - 0.5) * r.shake; cam.position.y += (Math.random() - 0.5) * r.shake; }
    r.shake *= Math.pow(0.02, dt);
    cam.lookAt(_look);
    const boost = settings.reducedMotion ? 0 : clamp((p.speed - r.def.baseSpeed) / (r.def.boostSpeed - r.def.baseSpeed), 0, 1.2) * 9;
    sm.setFov(damp(sm.fovBoost, boost, 4, Math.max(dt, 0.001)));
  }

  // ---------------------------------------------------------------------------------- events
  addScore(n) { this.run.score += n; }
  burstAt(p, n, color) { const r = this.run; r.path.world(p.s, p.x, p.y + 0.8, _v); if (!settings.reducedMotion || n < 10) this.particles.burst(_v.x, _v.y, _v.z, n, color, 6, 0.6); }
  onPlayerEvent(e) {
    const p = this.run.p;
    if (e === 'jump') { audio.sfx('jump'); this.burstAt(p, 5, 0xffffff); }
    else if (e === 'land') { audio.sfx('land'); this.burstAt(p, 5, 0xd8c8a0); }
    else if (e === 'slide') audio.sfx('slide');
    else if (e === 'boostStart') audio.sfx('boost');
    else if (e === 'lane') { /* silent */ }
  }
  onRing(ring, pos) {
    const r = this.run; r.ringsCollected = (r.ringsCollected || 0) + 1; this.addScore(CONFIG.score.ring); r.p.energy = Math.min(100, r.p.energy + 2);
    audio.sfx('ring'); this.particles.burst(pos.x, pos.y, pos.z, settings.reducedMotion ? 3 : 8, 0xffd23a, 4, 0.45, 2);
  }
  onPickup(pk, pos) {
    const r = this.run;
    if (pk.kind === 'velocity_core') { r.powerups.activate('velocity_core'); audio.sfx('powerup'); this.ui.banner('VELOCITY CORE!', 1300); this.particles.burst(pos.x, pos.y, pos.z, 40, 0x40e0ff, 9, 0.8); this.addScore(100); }
    else { r.p.health = Math.min(CONFIG.player.maxHealth, r.p.health + 1); audio.sfx('heal'); this.ui.banner('+1 HEALTH', 900); this.addScore(CONFIG.score.health); this.particles.burst(pos.x, pos.y, pos.z, 24, 0x20ffb0, 6, 0.7); }
  }
  onEnemyEvent(e) {
    const S = CONFIG.score, heavy = e.e.type === 'guardian'; const r = this.run;
    if (e.type === 'kill') { this.addScore(heavy ? S.heavy : S.enemy); audio.sfx('enemy'); r.shake = 0.25; }
    else if (e.type === 'stomp-kill') { this.addScore(heavy ? S.heavy : S.enemy); audio.sfx('enemy'); }
    else if (e.type === 'stomp-hit') { this.addScore(50); audio.sfx('stomp'); }
    else if (e.type === 'hurt') { if (!r.god) this.hurt('enemy'); }
  }
  hurt(src) {
    const r = this.run, p = r.p; if (this.state !== 'playing' || p.invuln > 0 || r.god) return;
    p.health--; p.invuln = CONFIG.player.invulnTime; p.hitFlash = 0.3; p.stumbleT = 0.9; if (!(r.boss && r.boss.active)) p.speed *= 0.55;
    audio.sfx('hit'); this.ui.flash(); r.shake = 0.7; this.burstAt(p, 14, 0xff5a2a);
    if (p.health <= 0) this.gameOver();
  }
  onFall() {
    const r = this.run, p = r.p; p.fallen = false;
    if (r.god) { p.health = CONFIG.player.maxHealth; }
    let g = null; for (const x of r.level.gaps) { if (x.s0 <= p.s + 1) g = x; else break; }
    let rs = g ? g.s0 - 8 : Math.max(0, p.s - 20);
    const ramp = g && r.level.ramps.find((q) => Math.abs(q.s1 - g.s0) < 1 && q.h1 > q.h0); if (ramp) rs = ramp.s0 - 6;
    p.s = Math.max(0, rs); p.y = 0; p.vy = 0; p.grounded = true; p.lastSlope = 0; p.speed = r.def.baseSpeed * 0.8; p.invuln = 0;
    this.seek(r, p.s); this.hurtFall(); this.updateCamera(0.016, true);
  }
  hurtFall() { const r = this.run, p = r.p; p.health--; p.invuln = CONFIG.player.invulnTime + 0.6; p.hitFlash = 0.3; audio.sfx('hit'); this.ui.flash(); this.ui.banner('FELL!', 700); if (p.health <= 0) this.gameOver(); }
  fireBolt() {
    const r = this.run, p = r.p; if (r.boltCd > 0 || p.energy < 25 || r.boss.state === 'dying') return;
    p.energy -= 25; r.boltCd = 0.3; r.hazards.spawn('bolt', p.s + 1.5, p.x, 80, { life: 1.3, y: 0 }); audio.sfx('bolt');
  }

  bossHooks(r) {
    const ui = this.ui;
    return {
      onIntro: () => { ui.banner(BOSS_NAME, 2800, 'boss'); audio.sfx('bossRoar'); audio.play('boss'); r.shake = 0.5; },
      onFightStart: () => { ui.prompt('Dodge the telegraphed attacks!'); r.timers.push(setTimeout(() => ui.prompt(''), 2500)); },
      onTelegraph: () => audio.sfx('warn'), onFire: (k) => audio.sfx('shoot'),
      onWindow: (on) => { if (on) { ui.prompt(this.touchDevice ? 'CORE EXPOSED! TAP ⚡ TO FIRE' : 'CORE EXPOSED! TAP SHIFT TO FIRE', true); audio.sfx('pad'); } else ui.prompt(''); },
      onHit: () => { this.addScore(CONFIG.score.bossHit); audio.sfx('bossHit'); r.shake = 0.8; ui.flash(); },
      onPhase2: () => { ui.banner('ENRAGED!', 1500, 'boss'); audio.sfx('bossRoar'); r.shake = 0.8; },
      onDying: () => { ui.prompt(''); audio.sfx('explode'); r.shake = 1; ui.banner('IRON WARDEN DOWN!', 2600); },
      onBlast: () => { if (Math.random() < 0.5) audio.sfx('explode'); r.shake = 0.6; },
      onDefeat: () => { this.addScore(CONFIG.score.boss); this.complete(); },
    };
  }

  // ---------------------------------------------------------------------------------- end states
  finish() { const r = this.run; this.state = 'ended'; this.controls.reset(); this.controls.enabled = false; r.ended = true; this.ui.prompt(''); }
  gameOver() {
    const r = this.run; if (r.ended) return; this.finish(); audio.stopMusic(); audio.sfx('lose');
    const rings = r.ringsCollected || 0; store.recordResult(r.def.id, r.score, rings, false);
    document.getElementById('over-score').textContent = Math.floor(r.score).toLocaleString('en-US'); document.getElementById('over-rings').textContent = rings; document.getElementById('over-best').textContent = store.load().best[r.def.id].toLocaleString('en-US');
    setTimeout(() => { if (this.state === 'ended') this.ui.show('gameover'); }, 700);
  }
  complete() {
    const r = this.run; if (r.ended) return; this.finish(); audio.stopMusic(); audio.sfx('win');
    const bonus = r.p.health * CONFIG.score.health + CONFIG.score.level; r.score += bonus; const rings = r.ringsCollected || 0;
    const prev = store.load().best[r.def.id]; store.recordResult(r.def.id, r.score, rings, true);
    const $ = (id) => document.getElementById(id); const f = (n) => Math.floor(n).toLocaleString('en-US');
    $('comp-name').textContent = `Level ${r.def.id} — ${r.def.name}`; $('comp-score').textContent = f(r.score); $('comp-rings').textContent = rings; $('comp-bonus').textContent = f(bonus); $('comp-best').textContent = f(store.load().best[r.def.id]);
    $('comp-new').hidden = !(r.score > prev); const last = r.def.id >= CONFIG.levels.length; $('btn-next').hidden = last;
    this.ui.banner('LEVEL COMPLETE!', 1500);
    setTimeout(() => { if (this.state === 'ended') { this.ui.show('complete'); ads.showLevelComplete(); } }, 1200);
  }
}
const $ = (s) => document.querySelector(s);

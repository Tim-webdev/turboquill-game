/**
 * Distance-based track/scenery streaming. Each chunk merges its static geometry into two draw calls
 * (lit + emissive) and is disposed when the player has left it far behind.
 */
import * as THREE from 'three';
import { CONFIG } from '../config/game-config.js';
import { Batch } from './batch.js';
import { featuresInRange } from './levels.js';
import { rng, clamp } from './utils.js';

const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 7), cone: new THREE.ConeGeometry(1, 1, 6),
  ico: new THREE.IcosahedronGeometry(1, 0), dode: new THREE.DodecahedronGeometry(1, 0), arc: new THREE.TorusGeometry(1, 0.05, 5, 18, Math.PI),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _ctr = new THREE.Vector3(), _n = new THREE.Vector3(), _o = new THREE.Vector3();
const _corner = Array.from({ length: 8 }, () => new THREE.Vector3());

function put(batch, geo, pos, rx, ry, rz, sx, sy, sz, color, opts) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(pos, _q, _s.set(sx, sy, sz)); batch.add(geo, _m, color, opts); }

export class ChunkManager {
  constructor(scene, level, mats, quality, extras) {
    this.scene = scene; this.level = level; this.mats = mats; this.q = quality; this.chunks = new Map(); this.CL = CONFIG.chunkLength;
    this.theme = level.def.theme; this.path = level.path; this.extras = extras; this.def = level.def;
    this.pal = this.theme === 'island'
      ? { track: level.def.trackColor, alt: level.def.trackAlt, curb: 0x9a8a68, grass: 0x4fae3c, grass2: 0x3d9a35, stone: 0x8e8068, danger: 0xff6a1a, glow: level.def.accent }
      : { track: level.def.trackColor, alt: level.def.trackAlt, curb: 0x2a3348, grass: 0x39465e, grass2: 0x2f3a50, stone: 0x2d364a, danger: 0xff5a1a, glow: level.def.accent };
  }

  bank(s) { return clamp(4.2 + 3.2 * Math.sin(s / 41) + 2.2 * Math.sin(s / 97 + 1), 0, 9); }

  update(playerS, immediate = false) {
    const CL = this.CL, lo = Math.max(0, Math.floor((playerS - CONFIG.keepBehind) / CL)), hi = Math.floor((playerS + this.q.viewAhead) / CL);
    let built = 0;
    for (let ci = lo; ci <= hi; ci++) {
      if (!this.chunks.has(ci)) { if (built >= 1 && !immediate) break; this.chunks.set(ci, this.build(ci)); built++; }
    }
    for (const [ci, ch] of this.chunks) if (ci < lo - 1 || ci > hi + 3) { this.free(ch); this.chunks.delete(ci); }
  }
  free(ch) { this.scene.remove(ch.group); ch.group.traverse((o) => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); }
  disposeAll() { for (const ch of this.chunks.values()) this.free(ch); this.chunks.clear(); }

  // ---- geometry helpers -------------------------------------------------------------------
  prism(B, s0, s1, x0, x1, b0, b1, t0, t1, color, sh = [1, 0.78, 0.45, 0.65]) {
    const P = this.path, c = _corner;
    P.world(s0, x0, b0, c[0]); P.world(s0, x0, t0, c[1]); P.world(s0, x1, b0, c[2]); P.world(s0, x1, t0, c[3]);
    P.world(s1, x0, b1, c[4]); P.world(s1, x0, t1, c[5]); P.world(s1, x1, b1, c[6]); P.world(s1, x1, t1, c[7]);
    _ctr.set(0, 0, 0); for (const v of c) _ctr.add(v); _ctr.multiplyScalar(1 / 8);
    const f = (a, b, cc, d, shade) => {
      _o.copy(a).add(cc).multiplyScalar(0.5).sub(_ctr);
      _n.subVectors(b, a).cross(_d.subVectors(cc, a));
      if (_n.dot(_o) < 0) B.quad(a, d, cc, b, color, shade); else B.quad(a, b, cc, d, color, shade);
    };
    f(c[1], c[3], c[7], c[5], sh[0]);               // top
    f(c[0], c[2], c[6], c[4], sh[2]);               // bottom
    f(c[0], c[1], c[5], c[4], sh[1]);               // x0 side
    f(c[2], c[3], c[7], c[6], sh[1]);               // x1 side
    f(c[0], c[1], c[3], c[2], sh[3]);               // s0 end
    f(c[4], c[5], c[7], c[6], sh[3]);               // s1 end
  }
  /** Place a primitive in lane space with the track's yaw. */
  prim(B, geo, s, x, y, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, opts) {
    this.path.world(s, x, y, _p); put(B, geo, _p, rx, this.path.yaw(s) + ry, this.path.roll(s) + rz, sx, sy, sz, color, opts);
  }

  build(ci) {
    const CL = this.CL, s0 = ci * CL, s1 = s0 + CL, def = this.def, P = this.pal, theme = this.theme;
    const r = rng(def.seed * 977 + ci * 131 + 7), sc = this.q.scenery;
    const lit = new Batch(), glow = new Batch();
    const F = featuresInRange(this.level, s0, s1);
    const zone = theme === 'zone';

    // ---- track tiles (skip gaps)
    let intervals = [[s0, s1]];
    for (const g of F.gaps) { const out = []; for (const [a, b] of intervals) { if (g.s1 <= a || g.s0 >= b) { out.push([a, b]); continue; } if (g.s0 > a) out.push([a, g.s0]); if (g.s1 < b) out.push([g.s1, b]); } intervals = out; }
    let ti = ci * 6;
    for (const [a, b] of intervals) {
      const n = Math.max(1, Math.ceil((b - a) / 8)), step = (b - a) / n;
      for (let i = 0; i < n; i++, ti++) {
        const ta = a + i * step, tb = ta + step, col = (ti % 2) ? P.track : P.alt;
        this.prism(lit, ta, tb, -5.2, 5.2, -0.9, -0.9, 0, 0, col);
        for (const sd of [-1, 1]) {
          const xa = sd > 0 ? 5.0 : -5.6, xb = sd > 0 ? 5.6 : -5.0;
          this.prism(lit, ta, tb, xa, xb, -0.9, -0.9, 0.38, 0.38, P.curb);
          this.prism(glow, ta, tb, sd > 0 ? 5.15 : -5.45, sd > 0 ? 5.45 : -5.15, 0.38, 0.38, 0.43, 0.43, zone ? P.glow : 0xffd36a);
          const bw = this.bank((ta + tb) / 2);
          if (bw > 0.6) this.prism(lit, ta, tb, sd > 0 ? 5.6 : -5.6 - bw, sd > 0 ? 5.6 + bw : -5.6, -1.6, -1.6, -0.25, -0.25, (ti % 2) ? P.grass : P.grass2);
        }
        if (zone) { for (const lx of [-1.5, 1.5]) this.prism(glow, ta + 0.5, tb - 0.5, lx - 0.04, lx + 0.04, 0, 0, 0.02, 0.02, 0x2a7fb0); }
        else if (i % 2 === 0) this.prism(lit, ta + 1, tb - 1, -0.2, 0.2, 0, 0, 0.015, 0.015, 0xb09a6f);
      }
    }
    // gap edges: glowing warning lips so pits are readable from afar
    for (const g of F.gaps) { for (const e of [g.s0 - 0.5, g.s1]) if (e + 0.5 >= s0 && e <= s1) this.prism(glow, e, e + 0.5, -5.2, 5.2, 0, 0, 0.05, 0.05, P.danger); }
    // under-track pylons (the track is elevated)
    for (let s = Math.ceil(s0 / 24) * 24; s < s1; s += 24) {
      if (F.gaps.some((g) => s > g.s0 - 2 && s < g.s1 + 2)) continue;
      for (const sd of [-1, 1]) this.prim(lit, G.cyl, s, sd * 4.4, -16, 0.8, 30, 0.8, zone ? 0x2b3650 : 0x7a7060);
    }

    // ---- ramps & decks
    for (const R of F.ramps) {
      const n = Math.max(1, Math.round((R.s1 - R.s0) / 5));
      for (let i = 0; i < n; i++) {
        const a = R.s0 + (R.s1 - R.s0) * i / n, b = R.s0 + (R.s1 - R.s0) * (i + 1) / n, ha = R.h0 + (R.h1 - R.h0) * i / n, hb = R.h0 + (R.h1 - R.h0) * (i + 1) / n;
        this.prism(lit, a, b, -5.2, 5.2, Math.min(ha, hb) - 0.9, Math.min(ha, hb) - 0.9, ha, hb, zone ? 0xaab4c6 : 0xd6a45a);
        this.prism(glow, a, b, -5.2, -4.9, ha, hb, ha + 0.06, hb + 0.06, 0xffc83a); this.prism(glow, a, b, 4.9, 5.2, ha, hb, ha + 0.06, hb + 0.06, 0xffc83a);
      }
    }
    for (const D of F.decks) {
      const n = Math.max(1, Math.round((D.s1 - D.s0) / 8));
      for (let i = 0; i < n; i++) {
        const a = D.s0 + (D.s1 - D.s0) * i / n, b = D.s0 + (D.s1 - D.s0) * (i + 1) / n;
        this.prism(lit, a, b, -5.2, 5.2, D.h - 1.0, D.h - 1.0, D.h, D.h, i % 2 ? P.track : P.alt);
        this.prism(glow, a, b, -5.2, -4.85, D.h, D.h, D.h + 0.07, D.h + 0.07, P.glow); this.prism(glow, a, b, 4.85, 5.2, D.h, D.h, D.h + 0.07, D.h + 0.07, P.glow);
      }
    }

    // ---- hazards
    for (const o of F.obstacles) {
      const sm = (o.s0 + o.s1) / 2;
      if (o.kind === 'barrier') {
        this.prism(lit, o.s0, o.s1, o.x0, o.x1, 0, 0, 0, 0.92, zone ? 0x2d364a : 0x8e8068);
        this.prism(glow, o.s0 - 0.04, o.s1 + 0.04, o.x0 - 0.02, o.x1 + 0.02, 0.92, 0.92, 0.92, 1.0, P.danger);
        this.prism(glow, o.s0 - 0.03, o.s1 + 0.03, o.x0 + 0.1, o.x1 - 0.1, 0.4, 0.4, 0.5, 0.5, P.danger);
      } else if (o.kind === 'pillar') {
        this.prism(lit, o.s0, o.s1, o.x0, o.x1, 0, 0, 0, 3.3, zone ? 0x2d364a : 0x9b8f78);
        this.prism(glow, o.s0 - 0.05, o.s1 + 0.05, o.x0 - 0.05, o.x1 + 0.05, 3.3, 3.3, 3.3, 3.5, P.danger);
        this.prism(glow, o.s0 - 0.04, o.s1 + 0.04, o.x0 - 0.04, o.x1 + 0.04, 0.8, 0.8, 0.8, 0.95, P.danger);
      } else if (o.kind === 'bar') {
        for (const sd of [-1, 1]) this.prism(lit, o.s0, o.s1 + 0.2, sd > 0 ? 4.4 : -5.2, sd > 0 ? 5.2 : -4.4, 0, 0, 0, 3.1, zone ? 0x2d364a : 0x9b8f78);
        this.prism(lit, o.s0, o.s1, -4.4, 4.4, 1.05, 1.05, 2.0, 2.0, zone ? 0x3a4560 : 0xa59a82);
        this.prism(glow, o.s0 - 0.03, o.s1 + 0.03, -4.4, 4.4, 1.05, 1.05, 1.17, 1.17, P.danger);
        this.prism(glow, o.s0 - 0.03, o.s1 + 0.03, -4.4, 4.4, 1.9, 1.9, 2.02, 2.02, 0xffd23a);
      }
    }

    // ---- boost pads (chevrons)
    for (const pd of F.pads) {
      const x0 = pd.x - pd.w / 2, x1 = pd.x + pd.w / 2;
      this.prism(glow, pd.s, pd.s + pd.len, x0, x1, 0, 0, 0.03, 0.03, 0x0c5a86);
      for (let i = 0; i < 3; i++) { const a = pd.s + 0.3 + i * 1.9; this.chev(glow, a, pd.x, pd.w / 2 - 0.15, i % 2 ? 0xffd23a : 0x6af0ff); }
    }
    // ---- speed gates
    for (const g of F.gates) {
      this.prism(glow, g.s - 0.3, g.s + 0.3, g.x0 - 0.45, g.x0, 0, 0, 0, 4.6, 0x38f0ff);
      this.prism(glow, g.s - 0.3, g.s + 0.3, g.x1, g.x1 + 0.45, 0, 0, 0, 4.6, 0x38f0ff);
      this.prism(glow, g.s - 0.3, g.s + 0.3, g.x0 - 0.45, g.x1 + 0.45, 4.2, 4.2, 4.2, 4.7, 0xffd23a);
      for (let i = 0; i < 3; i++) this.chev(glow, g.s - 0.2, g.xc, 1.2, 0xffd23a, 4.9 + i * 0.35, true);
    }
    // ---- finish / boss gate
    if (this.level.finishS >= s0 - 2 && this.level.finishS <= s1 + 2) this.finish(lit, glow, this.level.finishS);

    // ---- scenery
    const group = new THREE.Group(); group.userData.chunk = ci;
    if (theme === 'island') this.islandScenery(lit, glow, r, s0, s1, sc, group); else this.zoneScenery(lit, glow, r, s0, s1, sc, group);
    this.farScenery(lit, glow, r, s0, s1, sc, group);

    const mL = lit.build(this.mats.lit), mG = glow.build(this.mats.glow);
    for (const m of [mL, mG]) if (m) { m.userData.own = true; group.add(m); }
    this.scene.add(group);
    return { group, ci };
  }

  chev(B, s, xc, half, color, y = 0.06, vertical = false) {
    // chevron pointing forward (+s). `vertical` makes a flat arrow on a gate lintel.
    const P = this.path, mk = (ss, xx) => P.world(ss, xx, y, new THREE.Vector3());
    const L = [mk(s, xc - half), mk(s + 0.9, xc), mk(s + 1.45, xc), mk(s + 0.55, xc - half)];
    const R = [mk(s, xc + half), mk(s + 0.55, xc + half), mk(s + 1.45, xc), mk(s + 0.9, xc)];
    if (vertical) { return; }
    B.quad(L[0], L[3], L[2], L[1], color); B.quad(R[0], R[3], R[2], R[1], color);
    // ensure visible from above regardless of winding
    B.quad(L[0], L[1], L[2], L[3], color); B.quad(R[0], R[1], R[2], R[3], color);
  }

  finish(lit, glow, s) {
    const boss = this.def.bossAtEnd, col = boss ? 0x2a3042 : 0xe8e8e8;
    for (const sd of [-1, 1]) this.prism(lit, s - 0.8, s + 0.8, sd > 0 ? 5.4 : -7.0, sd > 0 ? 7.0 : -5.4, 0, 0, 0, 12, col);
    this.prism(lit, s - 0.8, s + 0.8, -7.0, 7.0, 10, 10, 10, 12.6, col);
    if (boss) {
      for (let i = 0; i < 9; i++) this.prism(glow, s + 0.82, s + 0.9, -6.6 + i * 1.5, -5.6 + i * 1.5, 10.2, 10.2, 11.0, 11.0, i % 2 ? 0xffc83a : 0x1a1a1a);
      this.prism(glow, s - 0.6, s + 0.6, -5.4, 5.4, 9.7, 9.7, 9.7, 10, 0xff3a2a);
    } else {
      for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) this.prism(glow, s + 0.82, s + 0.9, -6.7 + i * 0.96, -5.74 + i * 0.96, 10.2 + j * 1.0, 10.2 + j * 1.0, 11.2 + j * 1.0 - 0.0, 11.2 + j * 1.0, (i + j) % 2 ? 0xffffff : 0x111111);
      this.prism(glow, s - 0.1, s + 0.1, -5.4, 5.4, 0, 0, 0.03, 0.03, 0xffffff);
    }
  }

  // ---- scenery ------------------------------------------------------------------------------
  islandScenery(lit, glow, r, s0, s1, sc, group) {
    const P = this.pal, n = (v) => Math.max(0, Math.round(v * sc));
    // palms on the grass banks
    for (let i = 0, N = n(7); i < N; i++) {
      const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, bw = this.bank(s);
      if (bw < 2) continue;
      const x = sd * (6.3 + r() * (bw - 1.4)), h = 4.5 + r() * 3.5, lean = (r() - 0.5) * 0.35;
      this.prim(lit, G.cyl, s, x, h / 2 - 0.3, 0.22, h, 0.22, 0x8a5a2b, lean, 0, 0);
      const top = h - 0.4;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; this.prim(lit, G.cone, s - Math.sin(a) * 1.5, x - Math.cos(a) * 1.5, top - 0.1, 0.45, 3.4, 0.14, k % 2 ? 0x2f9e3a : 0x37b24a, 0, a, Math.PI / 2 + 0.25); }
    }
    // bushes & rocks
    for (let i = 0, N = n(5); i < N; i++) { const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, bw = this.bank(s); if (bw < 1.5) continue; this.prim(lit, G.ico, s, sd * (6.2 + r() * bw), 0.2, 0.7 + r() * 0.8, 0.6 + r() * 0.5, 0.7 + r() * 0.8, r() < 0.5 ? 0x2f8f3a : 0x7d7466); }
    // ruins: arches and broken columns
    if (r() < 0.55 * Math.max(0.5, sc)) {
      const s = s0 + 8 + r() * 30, sd = r() < 0.5 ? -1 : 1, bw = this.bank(s);
      if (bw > 3.2) {
        const x = sd * (7.4 + r() * 1.2);
        this.prim(lit, G.box, s - 1.8, x, 2.6, 1.1, 5.2, 1.1, 0xb9ad94); this.prim(lit, G.box, s + 1.8, x, 2.0, 1.1, 4.0, 1.1, 0xa89d85);
        this.prim(lit, G.box, s, x, 5.4, 1.5, 0.9, 5.4, 0xb9ad94); this.prim(lit, G.ico, s, x, 5.95, 1.0, 0.35, 0.9, 0x5c8a45);
        this.prim(glow, G.box, s, x, 5.0, 0.3, 0.12, 4.2, P.glow);
      }
    }
    // floating islands
    for (let i = 0, N = n(2.2); i < N; i++) { const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, x = sd * (22 + r() * 60), y = 8 + r() * 34, z = 5 + r() * 8; this.floatIsland(lit, glow, r, s, x, y, z); }
    // hills
    for (let i = 0, N = n(1.5); i < N; i++) { const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1; this.prim(lit, G.ico, s, sd * (38 + r() * 40), -12, 18 + r() * 16, 12 + r() * 10, 18 + r() * 14, r() < 0.5 ? 0x4aa23a : 0x3b8f34); }
    // waterfall cliff
    if (r() < 0.5 * Math.max(0.4, sc)) {
      const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, x = sd * (26 + r() * 14);
      this.prim(lit, G.box, s, x, -5, 16, 36, 12, 0x7a7266); this.prim(lit, G.ico, s, x, 14, 10, 4, 8, 0x4a9a3a);
      const w = new THREE.Mesh(this.extras.waterfallGeo, this.extras.waterfallMat); this.path.world(s, x - sd * 8.3, -3, w.position); w.rotation.y = this.path.yaw(s) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2); group.add(w);
    }
  }
  floatIsland(lit, glow, r, s, x, y, size) {
    this.prim(lit, G.cone, s, x, y - size * 0.55, size, size * 1.2, size, 0x6e6657, Math.PI, 0, 0);
    this.prim(lit, G.cyl, s, x, y + 0.2, size * 1.02, 0.7, size * 1.02, 0x4aae3a);
    if (r() < 0.8) { this.prim(lit, G.cyl, s, x, y + 2.2, 0.25, 4.5, 0.25, 0x8a5a2b); for (let k = 0; k < 5; k++) { const a = k * 1.25; this.prim(lit, G.cone, s - Math.sin(a) * 1.3, x - Math.cos(a) * 1.3, y + 4.4, 0.4, 3, 0.12, 0x2f9e3a, 0, a, Math.PI / 2 + 0.25); } }
    this.prim(glow, G.cyl, s, x, y - 0.3, size * 0.3, 0.15, size * 0.3, this.pal.glow);
  }
  zoneScenery(lit, glow, r, s0, s1, sc, group) {
    const n = (v) => Math.max(0, Math.round(v * sc));
    for (let i = 0, N = n(6); i < N; i++) {
      const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, x = sd * (10 + r() * 24), h = 14 + r() * 50, w = 2.5 + r() * 3.5;
      this.prim(lit, G.box, s, x, h / 2 - 20, w, h + 40, w, 0x1d2742);
      for (let k = 0; k < 4; k++) this.prim(glow, G.box, s - w * 0.52, x, -4 + k * (h / 4) * 0.9 + 6, 0.05, 0.4, w * 0.8, k % 2 ? 0x38f0ff : 0xffc83a);
      this.prim(glow, G.box, s, x, h - 19.7, w * 1.1, 0.4, w * 1.1, this.pal.glow);
    }
    for (let s = Math.ceil(s0 / 72) * 72; s < s1; s += 72) {
      const gate = this.level.gates.some((g) => Math.abs(g.s - s) < 10), fin = Math.abs(this.level.finishS - s) < 10;
      if (gate || fin || s < 80) continue;
      this.prim(glow, G.arc, s, 0, 0, 6.8, 6.8, 6.8, this.pal.glow, 0, 0, 0, { flat: false });
      this.prim(glow, G.arc, s, 0, 0, 7.0, 7.0, 7.0, 0xffc83a, 0, 0, 0, { flat: false });
    }
    for (let i = 0, N = n(2); i < N; i++) { const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1; this.floatIsland(lit, glow, r, s, sd * (26 + r() * 50), 10 + r() * 34, 5 + r() * 7); }
    if (r() < 0.35 * Math.max(0.4, sc)) {
      const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, x = sd * (32 + r() * 12);
      this.prim(lit, G.box, s, x, -5, 16, 36, 12, 0x4a5568);
      const w = new THREE.Mesh(this.extras.waterfallGeo, this.extras.waterfallMat); this.path.world(s, x - sd * 8.3, -3, w.position); w.rotation.y = this.path.yaw(s) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2); group.add(w);
    }
  }
  farScenery(lit, glow, r, s0, s1, sc, group) {
    const zone = this.theme === 'zone';
    for (let i = 0, N = Math.max(1, Math.round(1.6 * sc)); i < N; i++) {
      const s = s0 + r() * this.CL, sd = r() < 0.5 ? -1 : 1, x = sd * (95 + r() * 80), h = 55 + r() * 80, rad = 35 + r() * 35;
      this.prim(lit, G.cone, s, x, h / 2 - 40, rad, h, rad, zone ? 0x3b5a82 : 0x59805a, 0, r() * 3);
      this.prim(lit, G.cone, s, x, h - 40 - h * 0.12, rad * 0.28, h * 0.26, rad * 0.28, 0xf2f6fa);
    }
  }
}
const LW = () => CONFIG.laneWidth;

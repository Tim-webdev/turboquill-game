/**
 * Level data generation. Levels are deterministic (seeded) lists of gameplay features expressed in lane space.
 * Meshes are NOT created here — see chunks.js, which builds/destroys track geometry by distance.
 */
import { CONFIG } from '../config/game-config.js';
import { rng, clamp } from './utils.js';
import { Path } from './physics.js';

const LW = CONFIG.laneWidth;
const laneX = (i) => i * LW;

export function generateLevel(def) {
  const r = rng(def.seed);
  const L = { def, length: def.length, path: new Path(def.curve), obstacles: [], gaps: [], ramps: [], decks: [], rings: [], enemies: [], pickups: [], pads: [], gates: [], buckets: new Map() };
  const base = def.baseSpeed;
  const jumpDist = base * 0.695;
  const gapLen = Math.round(jumpDist * 0.55);
  const rampGapLen = Math.round(base * 0.5 * 0.8 + 1);
  const hard = def.id >= 2;

  const ring = (s, x, y = 1.0) => L.rings.push({ s, x, y, got: false, ph: r() * 6.28 });
  const ringLine = (lane, s0, n, sp = 3, y = 1.0) => { for (let i = 0; i < n; i++) ring(s0 + i * sp, laneX(lane), y); };
  const ringArc = (x, s0, n, sp, peak, y0 = 1.0) => { for (let i = 0; i < n; i++) ring(s0 + i * sp, x, y0 + peak * Math.sin(Math.PI * (i / (n - 1)))); };
  const obstacle = (kind, s, xc, w, len) => {
    const o = { kind, s0: s - len / 2, s1: s + len / 2, x0: xc - w / 2, x1: xc + w / 2, y0: 0, y1: 1.0, hit: false, passed: false, credited: false };
    if (kind === 'bar') { o.y0 = 1.05; o.y1 = 2.2; o.x0 = -5; o.x1 = 5; }
    if (kind === 'pillar') o.y1 = 3.4;
    L.obstacles.push(o); return o;
  };
  const gap = (s0, len) => L.gaps.push({ s0, s1: s0 + len, passed: false });
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const otherLanes = (l) => [-1, 0, 1].filter((x) => x !== l);

  const P = {
    rings: (s) => { const l = pick([-1, 0, 1]); ringLine(l, s + 6, r.int(8, 12)); return 8 * 3 + 22; },
    snake: (s) => { const n = 12; for (let i = 0; i < n; i++) ring(s + 6 + i * 3, laneX(Math.round(Math.sin(i / 2.2))), 1.0); return n * 3 + 22; },
    barrierFull: (s) => { obstacle('barrier', s + 16, 0, 9.8, 1.2); ringArc(laneX(pick([-1, 0, 1])), s + 6, 9, 2.6, 1.7); return 42; },
    barrierLane: (s) => { const free = pick([-1, 0, 1]); const blocked = otherLanes(free); const n = hard && r() < 0.5 ? 2 : 1; blocked.slice(0, n).forEach((l) => obstacle('barrier', s + 16, laneX(l), LW - 0.2, 1.2)); if (n === 1) { const l2 = blocked[1]; ringLine(l2, s + 8, 6); } ringLine(free, s + 6, 10); return 40; },
    pillars: (s) => { const free = pick([-1, 0, 1]); otherLanes(free).forEach((l, i) => { if (i === 0 || r() < 0.7) obstacle('pillar', s + 18, laneX(l), 2.1, 2.1); }); ringLine(free, s + 6, 10); return 42; },
    slideBar: (s) => { obstacle('bar', s + 18, 0, 10, 1.1); ringLine(pick([-1, 0, 1]), s + 10, 8, 2.4, 0.65); return 44; },
    gap: (s) => { gap(s + 18, gapLen); ringArc(laneX(pick([-1, 0, 1])), s + 18 - 3, 8, (gapLen + 6) / 7, 1.8); return 18 + gapLen + 22; },
    rampGap: (s) => { const s0 = s + 14; L.ramps.push({ s0, s1: s0 + 10, h0: 0, h1: 2.2 }); gap(s0 + 10, rampGapLen); ringArc(laneX(pick([-1, 0, 1])), s0 + 8, 8, (rampGapLen + 4) / 7, 1.5, 3.1); return 14 + 10 + rampGapLen + 24; },
    deck: (s) => {
      const s0 = s + 14, h = 2.4;
      L.ramps.push({ s0, s1: s0 + 10, h0: 0, h1: h }); L.decks.push({ s0: s0 + 10, s1: s0 + 40, h }); L.ramps.push({ s0: s0 + 40, s1: s0 + 50, h0: h, h1: 0 });
      const l = pick([-1, 0, 1]); ringLine(l, s0 + 12, 9, 3, h + 1.0);
      if (hard) { enemy('scuttler', s0 + 30, laneX(0), 3.2, 1.6, h); }
      return 14 + 50 + 20;
    },
    enemyGround: (s) => { const n = hard ? 2 : 1; for (let i = 0; i < n; i++) enemy('scuttler', s + 20 + i * 16, laneX(0), 3.6, 1.2 + r() * 0.6); ringLine(pick([-1, 1]), s + 8, 6); return 30 + n * 16 + 10; },
    enemyHover: (s) => { enemy('drone', s + 22, laneX(pick([-1, 0, 1])) * 0.5, 3.0, 1.0 + r() * 0.5, 0); ringLine(0, s + 8, 5, 3, 1.0); return 50; },
    enemyHeavy: (s) => { const l = pick([-1, 0, 1]); enemy('guardian', s + 26, laneX(l), 0, 0); otherLanes(l).forEach((o) => ringLine(o, s + 6, 8)); return 54; },
    pad: (s) => { const l = pick([-1, 0, 1]); L.pads.push({ s: s + 14, len: 6, x: laneX(l), w: LW - 0.6 }); ringLine(l, s + 22, 14, 3.2, 1.3); return 14 + 6 + 14 * 3.2 + 14; },
    gate: (s) => { const l = pick([-1, 0, 1]); L.gates.push({ s: s + 18, x0: laneX(l) - 1.5, x1: laneX(l) + 1.5, xc: laneX(l), got: false }); ringLine(l, s + 6, 14, 2.6, 1.4); return 18 + 26; },
    zigzag: (s) => { const seq = [-1, 1, 0, -1, 1]; seq.forEach((l, i) => { const lanes = otherLanes(l); obstacle('pillar', s + 18 + i * 17, laneX(lanes[0]), 2.1, 2.1); obstacle('pillar', s + 18 + i * 17, laneX(lanes[1]), 2.1, 2.1); ringLine(l, s + 10 + i * 17, 3, 3.2); }); return 18 + 5 * 17 + 10; },
    narrow: (s) => { obstacle('bar', s + 16, 0, 10, 1.1); obstacle('pillar', s + 38, laneX(-1), 2.1, 2.1); obstacle('pillar', s + 38, laneX(1), 2.1, 2.1); obstacle('barrier', s + 58, laneX(0), 9.8, 1.2); ringLine(0, s + 24, 6, 3.2, 1.0); return 78; },
    combo: (s) => { obstacle('barrier', s + 16, 0, 9.8, 1.2); gap(s + 16 + 26, gapLen); ringArc(0, s + 8, 8, 2.8, 1.8); ringArc(0, s + 16 + 20, 8, (gapLen + 6) / 7, 1.8); return 16 + 26 + gapLen + 24; },
    heavyGate: (s) => { const l = pick([-1, 0, 1]); enemy('guardian', s + 30, laneX(l), 0, 0); const o = pick(otherLanes(l)); L.gates.push({ s: s + 26, x0: laneX(o) - 1.5, x1: laneX(o) + 1.5, xc: laneX(o), got: false }); ringLine(o, s + 10, 10); return 58; },
  };
  function enemy(type, s, x, amp, speed, y = 0) { L.enemies.push({ type, s, x, amp, speed, y, phase: r() * 6.28, hp: type === 'guardian' ? 2 : 1, dead: false }); }

  // pattern tables: [name, weight, minDifficulty]
  const table = hard
    ? [['rings', 1, 0], ['snake', 1, 0], ['barrierLane', 2.5, 0], ['barrierFull', 2, 0], ['pillars', 2, 0], ['slideBar', 1.5, 0], ['gap', 2, 0.05], ['rampGap', 2, 0.05], ['pad', 2, 0], ['gate', 4, 0], ['enemyGround', 2, 0.06], ['enemyHover', 2, 0.1], ['enemyHeavy', 1.6, 0.18], ['deck', 1.2, 0.15], ['zigzag', 1.5, 0.3], ['narrow', 1.3, 0.35], ['combo', 1.6, 0.3], ['heavyGate', 2, 0.4]]
    : [['rings', 1, 0], ['snake', 0.8, 0], ['barrierLane', 3, 0], ['barrierFull', 2, 0.05], ['pillars', 2, 0.08], ['slideBar', 1.2, 0.12], ['gap', 1.5, 0.2], ['pad', 1.2, 0], ['enemyGround', 2.5, 0.1], ['enemyHover', 2, 0.2], ['enemyHeavy', 1.6, 0.3], ['deck', 1.4, 0.22], ['rampGap', 1.2, 0.35], ['zigzag', 0.6, 0.6]];

  const uses = {};
  let s = 110, lastCore = -9999, lastHeart = 0, last = '';
  const end = def.length - 90;
  while (s < end) {
    const d = s / def.length;
    const opts = table.filter(([n, , min]) => d >= min && n !== last);
    const eff = (o) => o[1] / (1 + 0.8 * (uses[o[0]] || 0));           // favour patterns not seen yet -> variety
    const total = opts.reduce((a, o) => a + eff(o), 0);
    let t = r() * total, name = opts[0][0];
    for (const o of opts) { t -= eff(o); if (t <= 0) { name = o[0]; break; } }
    uses[name] = (uses[name] || 0) + 1;
    const used = P[name](s);
    last = name;
    s += used;
    // pickups placed in calm gaps between patterns
    if (s - lastCore > (hard ? 380 : 440) && s < end - 60) { L.pickups.push({ kind: 'velocity_core', s: s + 4, x: laneX(pick([-1, 0, 1])), y: 1.3, got: false }); ringLine(0, s + 10, 5, 3); lastCore = s; s += 28; }
    else if (s - lastHeart > 330 && s < end - 40 && r() < 0.55) { L.pickups.push({ kind: 'heart', s: s + 4, x: laneX(pick([-1, 0, 1])), y: 1.3, got: false }); lastHeart = s; s += 16; }
    s += (hard ? 5 : 8);
  }
  // guarantee a power-up early so players meet it in the first minute
  if (!L.pickups.some((p) => p.kind === 'velocity_core' && p.s < 380)) L.pickups.push({ kind: 'velocity_core', s: 300, x: 0, y: 1.3, got: false });

  const bySort = (a, b) => a.s - b.s, bySort0 = (a, b) => a.s0 - b.s0;
  L.obstacles.sort(bySort0); L.gaps.sort(bySort0); L.ramps.sort(bySort0); L.decks.sort(bySort0);
  L.rings.sort(bySort); L.enemies.sort(bySort); L.pickups.sort(bySort); L.pads.sort(bySort); L.gates.sort(bySort);
  L.finishS = def.length;
  return L;
}

/** Features overlapping a chunk, for geometry building. */
export function featuresInRange(L, a, b) {
  const inR = (s0, s1) => s1 >= a && s0 <= b;
  return {
    obstacles: L.obstacles.filter((o) => inR(o.s0, o.s1)),
    gaps: L.gaps.filter((o) => inR(o.s0, o.s1)),
    ramps: L.ramps.filter((o) => inR(o.s0, o.s1)),
    decks: L.decks.filter((o) => inR(o.s0, o.s1)),
    pads: L.pads.filter((o) => inR(o.s, o.s + o.len)),
    gates: L.gates.filter((o) => inR(o.s - 1, o.s + 1)),
  };
}

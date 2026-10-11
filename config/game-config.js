/** TURBO QUILL — gameplay constants and level definitions. Tweak freely. */
export const CONFIG = {
  laneWidth: 3.0,
  lanes: [-1, 0, 1],
  trackHalfWidth: 5.2,
  chunkLength: 48,
  viewAhead: 300,          // metres of track kept alive ahead of the player
  keepBehind: 70,
  maxStep: 1 / 50,         // max physics sub-step (seconds)
  maxFrame: 0.1,           // clamp frame delta (seconds)

  player: {
    maxHealth: 5,
    gravity: 38,
    jumpVelocity: 13.2,
    coyote: 0.1,
    jumpBuffer: 0.12,
    height: 1.7,
    slideHeight: 0.75,
    slideTime: 0.75,
    halfWidth: 0.5,
    halfLength: 0.5,
    laneSnap: 15,            // lateral smoothing
    invulnTime: 1.6,
    accel: 22,
    decel: 16,
    boostDrain: 38,          // energy / second
    boostRegen: 14,
    boostMax: 100,
    stompBounce: 10.5,
  },

  score: { ring: 10, enemy: 150, heavy: 400, jump: 25, obstacleClear: 20, level: 1000, bossHit: 250, boss: 5000, gate: 100, health: 200 },

  powerups: {
    velocity_core: { name: 'Velocity Core', duration: 8, speedMul: 1.3, jumpMul: 1.16, color: 0x28d8ff },
  },

  quality: {
    low:    { pixelRatio: 1,   particles: 120, viewAhead: 190, scenery: 0.5, antialias: false, fogFar: 200 },
    medium: { pixelRatio: 1.5, particles: 260, viewAhead: 260, scenery: 0.8, antialias: true,  fogFar: 270 },
    high:   { pixelRatio: 2,   particles: 420, viewAhead: 320, scenery: 1.0, antialias: true,  fogFar: 330 },
  },

  levels: [
    {
      id: 1, name: 'Tropical Fantasy Island', short: 'Island', seed: 1337, length: 2100,
      baseSpeed: 24, maxSpeed: 31, boostSpeed: 40,
      curve: { A: 10, L: 210 },
      sky: { top: '#2f7fe0', mid: '#8fd0ff', bottom: '#fdf3d0' },
      fog: 0xbfe6ff, sea: 0x1d9ec7, trackColor: 0xc9b48a, trackAlt: 0xbba37a, accent: 0x20e0ff,
      sun: 0xfff2d0, ambient: 0xcfe8ff,
      theme: 'island', bossAtEnd: false, music: 'game',
      blurb: 'Waterfalls, ruins and floating islands. Learn the rhythm of the run.',
    },
    {
      id: 2, name: 'Speed Zone', short: 'Speed Zone', seed: 4242, length: 2600,
      baseSpeed: 31, maxSpeed: 40, boostSpeed: 52,
      curve: { A: 26, L: 135 },
      sky: { top: '#16225c', mid: '#3b6fe0', bottom: '#ffb98a' },
      fog: 0x7fa4d8, sea: 0x0f6a9a, trackColor: 0x8d97a6, trackAlt: 0x7c8696, accent: 0x38f0ff,
      sun: 0xffd9b0, ambient: 0xa8c4ff,
      theme: 'zone', bossAtEnd: true, arenaSpeed: 24, music: 'game',
      blurb: 'Banked curves, speed gates and tight passages. The Iron Warden awaits at the end.',
    },
  ],
};

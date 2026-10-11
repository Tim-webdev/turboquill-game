/**
 * Original hero model "Quill" — procedural low-poly runner (teal body, gold quill-crest, cyan visor, gold boots).
 * Drop-in replacement: set ASSETS.models.player to a GLB (see README); procedural model is the fallback.
 */
import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const mk = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 55, specular: 0x333333, ...extra });

export class PlayerModel {
  constructor() {
    this.root = new THREE.Group();            // positioned/rotated by the game in world space
    this.vis = new THREE.Group(); this.vis.scale.setScalar(0.88); this.root.add(this.vis);
    this.phase = 0; this.t = 0; this.custom = null; this.mixer = null;
    this.mats = {
      body: mk(0x10b5a2), belly: mk(0xf2ead2), gold: mk(0xffc83a, { emissive: 0x3a2600 }), blue: mk(0x2a7bff, { emissive: 0x0a2a66 }),
      visor: new THREE.MeshBasicMaterial({ color: 0x5af2ff }), dark: mk(0x1a2640), glow: new THREE.MeshBasicMaterial({ color: 0x5af2ff, transparent: true, opacity: 0.9 }),
    };
    this._build();
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10), new THREE.MeshBasicMaterial({ color: 0x28d8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.position.y = 0.85; this.aura.visible = false; this.root.add(this.aura);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.shadow.rotation.x = -Math.PI / 2;
  }

  _build() {
    const M = this.mats, v = this.vis;
    const part = (geo, mat, x, y, z, parent = v) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    this.body = new THREE.Group(); this.body.position.y = 0.62; v.add(this.body);
    part(new THREE.CapsuleGeometry(0.26, 0.22, 4, 10), M.body, 0, 0.30, 0, this.body);
    const belly = part(new THREE.SphereGeometry(0.2, 10, 8), M.belly, 0, 0.28, -0.14, this.body); belly.scale.set(1, 1.35, 0.6);
    part(new THREE.BoxGeometry(0.1, 0.5, 0.22), M.blue, 0, 0.35, 0.28, this.body);              // quill-pack
    for (const s of [-1, 1]) { const f = part(new THREE.ConeGeometry(0.07, 0.55, 5), M.gold, s * 0.11, 0.55, 0.36, this.body); f.rotation.x = 0.9; f.rotation.z = s * 0.25; }
    // head
    this.head = new THREE.Group(); this.head.position.set(0, 0.92, -0.02); this.body.add(this.head);
    part(new THREE.SphereGeometry(0.32, 14, 12), M.body, 0, 0, 0, this.head);
    part(new THREE.BoxGeometry(0.5, 0.15, 0.1), M.visor, 0, 0.04, -0.27, this.head);
    part(new THREE.BoxGeometry(0.56, 0.22, 0.08), M.dark, 0, 0.04, -0.245, this.head);
    this.head.children[this.head.children.length - 1].renderOrder = -1;
    const beak = part(new THREE.ConeGeometry(0.09, 0.24, 6), M.gold, 0, -0.1, -0.36, this.head); beak.rotation.x = -Math.PI / 2;
    for (let i = -1; i <= 1; i++) { const c = part(new THREE.ConeGeometry(0.085, 0.62 - Math.abs(i) * 0.1, 5), M.gold, i * 0.14, 0.32, 0.1, this.head); c.rotation.x = 1.15; c.rotation.z = -i * 0.35; }
    // scarf
    this.scarf = []; for (let i = 0; i < 4; i++) { const m = part(new THREE.BoxGeometry(0.26 - i * 0.03, 0.07, 0.3), i % 2 ? M.gold : M.blue, 0, 0.78, 0.25 + i * 0.3, this.body); this.scarf.push(m); }
    // arms
    this.arms = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 0.34, 0.62, 0); this.body.add(g); part(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), M.body, 0, -0.2, 0, g); part(new THREE.SphereGeometry(0.11, 8, 8), M.belly, 0, -0.43, 0, g); return g; });
    // legs
    this.legs = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 0.15, 0.62, 0); v.add(g); part(new THREE.CapsuleGeometry(0.1, 0.32, 4, 8), M.body, 0, -0.27, 0, g); part(new THREE.BoxGeometry(0.22, 0.15, 0.38), M.gold, 0, -0.56, -0.05, g); part(new THREE.BoxGeometry(0.2, 0.04, 0.34), M.glow, 0, -0.64, -0.05, g); return g; });
  }

  /** Optional GLB replacement. Resolves false (keeping the procedural hero) on any failure. */
  async loadCustom(url) {
    if (!url) return false;
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(url);
      this.vis.visible = false; const m = gltf.scene; m.rotation.y = Math.PI; this.root.add(m); this.custom = m;
      if (gltf.animations.length) { this.mixer = new THREE.AnimationMixer(m); this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name.toLowerCase(), c])); this._play('run'); }
      return true;
    } catch (e) { console.warn('Custom player model failed, using built-in hero:', e); return false; }
  }
  _play(name) { if (!this.mixer || !this.clips?.[name] || this.cur === name) return; this.mixer.stopAllAction(); this.mixer.clipAction(this.clips[name]).reset().play(); this.cur = name; }

  /** Pose the character from simulation state. */
  animate(dt, p, speedRatio, boosting, time) {
    this.t += dt;
    const ground = p.grounded && !p.sliding;
    this.phase += dt * (6 + p.speed * 0.32);
    const sw = Math.sin(this.phase), b = this.body;
    const lean = 0.12 + speedRatio * 0.35 + (boosting ? 0.25 : 0);
    let bodyX = lean, bodyY = 0.62 + (ground ? Math.abs(sw) * 0.05 : 0), legA = 0, legB = 0, armA = 0, armB = 0;
    if (p.sliding) { bodyX = -1.15; bodyY = 0.3; legA = legB = -1.25; armA = armB = 0.6; }
    else if (!p.grounded) {
      if (p.vy > 1) { legA = -0.9; legB = 0.25; armA = armB = -2.4; bodyX = 0.1; }
      else { legA = -0.4; legB = -0.1; armA = armB = -1.6; bodyX = 0.3; }
    } else { legA = sw * 1.05; legB = -sw * 1.05; armA = -sw * 0.95; armB = sw * 0.95; if (boosting) { armA = armB = 1.2; legA *= 1.3; legB *= 1.3; } }
    b.rotation.x = damp(b.rotation.x, bodyX, 18, dt); b.position.y = damp(b.position.y, bodyY, 20, dt);
    this.legs[0].rotation.x = damp(this.legs[0].rotation.x, legA, 24, dt); this.legs[1].rotation.x = damp(this.legs[1].rotation.x, legB, 24, dt);
    this.arms[0].rotation.x = damp(this.arms[0].rotation.x, armA, 24, dt); this.arms[1].rotation.x = damp(this.arms[1].rotation.x, armB, 24, dt);
    this.arms[0].rotation.z = 0.15; this.arms[1].rotation.z = -0.15;
    this.head.rotation.x = -lean * 0.5 + (p.sliding ? 1.0 : 0);
    // lateral lean into lane changes
    this.vis.rotation.z = damp(this.vis.rotation.z, clamp((p.lane * 3 - p.x) * 0.12, -0.35, 0.35), 12, dt);
    this.scarf.forEach((m, i) => { m.position.y = 0.78 + Math.sin(this.t * 14 - i * 0.9) * 0.05 * (1 + speedRatio) + (ground ? 0 : 0.06 * (i + 1)); m.position.x = Math.sin(this.t * 9 - i) * 0.04 * (i + 1); m.rotation.x = Math.sin(this.t * 12 - i) * 0.1; });
    // damage feedback
    const flash = p.hitFlash > 0;
    this.mats.body.emissive.setHex(flash ? 0xff2020 : 0x000000);
    this.root.visible = p.invuln > 0 && p.hitFlash <= 0 && !p.respawning ? (Math.floor(this.t * 14) % 2 === 0) : true;
    this.aura.visible = this.powered || boosting; if (this.aura.visible) { const s = 1 + Math.sin(this.t * 12) * 0.06; this.aura.scale.setScalar(s); this.aura.material.color.setHex(this.powered ? 0x28d8ff : 0xffd23a); }
    if (this.mixer) { this._play(p.sliding ? 'slide' : !p.grounded ? 'jump' : 'run'); this.mixer.update(dt); }
  }
  dispose() { this.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } }); Object.values(this.mats).forEach((m) => m.dispose()); this.shadow.geometry.dispose(); this.shadow.material.dispose(); this.aura.material.dispose(); }
}

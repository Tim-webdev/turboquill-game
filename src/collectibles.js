/** Golden rings (instanced, windowed) and pickups (Velocity Core, repair cell). */
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class RingField {
  constructor(scene, level, max = 420) {
    this.level = level; this.max = max; this.start = 0;
    this.geo = new THREE.TorusGeometry(0.62, 0.14, 8, 18);
    this.mat = new THREE.MeshPhongMaterial({ color: 0xffc83a, emissive: 0x5a3a00, specular: 0xffffff, shininess: 120 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh); this.scene = scene;
  }
  reset() { this.start = 0; this.level.rings.forEach((r) => { r.got = false; }); }
  /** Update visible rings; collect those touching the player. `onCollect(ring, worldPos)` fires once per ring. */
  update(t, p, viewDist, onCollect) {
    const L = this.level, R = L.rings, path = L.path;
    while (this.start < R.length && R[this.start].s < p.s - 14) this.start++;
    let n = 0, cy = p.y + (p.sliding ? 0.4 : 0.85);
    for (let i = this.start; i < R.length && n < this.max; i++) {
      const r = R[i]; if (r.s > p.s + viewDist) break; if (r.got) continue;
      const dx = r.x - p.x, ds = r.s - p.s, dy = r.y - cy;
      if (ds * ds + dx * dx + dy * dy < 2.1) { r.got = true; path.world(r.s, r.x, r.y, _p); onCollect(r, _p); continue; }
      path.world(r.s, r.x, r.y + Math.sin(t * 2 + r.ph) * 0.08, _p);
      _e.set(0, path.yaw(r.s) + t * 3 + r.ph, 0); _q.setFromEuler(_e); _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); this.mesh.dispose(); }
}

export class PickupField {
  constructor(scene, level) {
    this.scene = scene; this.level = level; this.live = new Map(); this.pool = { velocity_core: [], heart: [] };
    this.geo = { ico: new THREE.IcosahedronGeometry(0.5, 1), tor: new THREE.TorusGeometry(0.85, 0.06, 6, 24), box: new THREE.BoxGeometry(0.26, 0.8, 0.26), core: new THREE.OctahedronGeometry(0.28) };
    this.mat = {
      core: new THREE.MeshBasicMaterial({ color: 0x7af4ff }), shell: new THREE.MeshBasicMaterial({ color: 0x28d8ff, wireframe: true }), ring: new THREE.MeshBasicMaterial({ color: 0xffd23a }),
      heart: new THREE.MeshPhongMaterial({ color: 0x20d890, emissive: 0x0a7a50, shininess: 80 }), halo: new THREE.MeshBasicMaterial({ color: 0x20ffb0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  }
  make(kind) {
    const g = new THREE.Group();
    if (kind === 'velocity_core') {
      g.add(new THREE.Mesh(this.geo.ico, this.mat.core)); const sh = new THREE.Mesh(this.geo.ico, this.mat.shell); sh.scale.setScalar(1.45); g.add(sh);
      const r1 = new THREE.Mesh(this.geo.tor, this.mat.ring); const r2 = new THREE.Mesh(this.geo.tor, this.mat.ring); r2.rotation.x = Math.PI / 2; g.add(r1, r2); g.userData.rings = [r1, r2];
    } else {
      g.add(new THREE.Mesh(this.geo.box, this.mat.heart)); const h = new THREE.Mesh(this.geo.box, this.mat.heart); h.rotation.z = Math.PI / 2; g.add(h);
      const halo = new THREE.Mesh(this.geo.ico, this.mat.halo); halo.scale.setScalar(1.6); g.add(halo);
    }
    return g;
  }
  reset() { this.level.pickups.forEach((p) => { p.got = false; }); for (const [pk, g] of this.live) { g.visible = false; this.pool[pk.kind].push(g); } this.live.clear(); }
  update(t, p, viewDist, onCollect) {
    const path = this.level.path;
    for (const pk of this.level.pickups) {
      if (pk.got) { const g = this.live.get(pk); if (g) { g.visible = false; this.pool[pk.kind].push(g); this.live.delete(pk); } continue; }
      const near = pk.s > p.s - 12 && pk.s < p.s + viewDist;
      let g = this.live.get(pk);
      if (near && !g) { g = this.pool[pk.kind].pop() || this.make(pk.kind); g.visible = true; this.scene.add(g); this.live.set(pk, g); }
      if (!near && g) { g.visible = false; this.pool[pk.kind].push(g); this.live.delete(pk); continue; }
      if (!g) continue;
      path.world(pk.s, pk.x, pk.y + Math.sin(t * 2.4 + pk.s) * 0.18, g.position); g.rotation.y = t * 2.2; g.rotation.x = Math.sin(t) * 0.2;
      if (g.userData.rings) { g.userData.rings[0].rotation.y = t * 3; g.userData.rings[1].rotation.z = t * 2.4; }
      const dx = pk.x - p.x, ds = pk.s - p.s, dy = pk.y - (p.y + 0.85);
      if (dx * dx + ds * ds + dy * dy < 4.4) { pk.got = true; onCollect(pk, g.position); }
    }
  }
  dispose() { for (const g of this.live.values()) this.scene.remove(g); for (const k of Object.values(this.pool)) k.forEach((g) => this.scene.remove(g)); Object.values(this.geo).forEach((g) => g.dispose()); Object.values(this.mat).forEach((m) => m.dispose()); this.live.clear(); }
}

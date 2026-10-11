/** Pooled additive particle system (one Points draw call, fixed-size ring buffer — no per-frame allocation). */
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Particles {
  constructor(scene, max = 300) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ttl = new Float32Array(max); this.base = new Float32Array(max * 3); this.grav = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.tex = dotTexture();
    this.mat = new THREE.PointsMaterial({ size: 0.55, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.pos.fill(0, 0); for (let k = 0; k < max; k++) this.pos[k * 3 + 1] = -9999;
    scene.add(this.points); this.c = new THREE.Color();
  }
  setMax(n) { this.limit = Math.min(this.max, n); }
  emit(x, y, z, vx, vy, vz, color, ttl, grav = 0) {
    const lim = this.limit || this.max, k = this.i = (this.i + 1) % lim, c = this.c.set(color);
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.base[k * 3] = c.r; this.base[k * 3 + 1] = c.g; this.base[k * 3 + 2] = c.b;
    this.life[k] = ttl; this.ttl[k] = ttl; this.grav[k] = grav;
  }
  burst(x, y, z, n, color, speed = 6, ttl = 0.6, grav = 6) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, b = Math.random() * 3.14 - 1.57, sp = speed * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + speed * 0.3, Math.sin(a) * Math.cos(b) * sp, color, ttl * (0.6 + Math.random() * 0.6), grav);
    }
  }
  update(dt) {
    const lim = this.limit || this.max;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) { if (this.pos[k * 3 + 1] > -9000) this.pos[k * 3 + 1] = -9999; continue; }
      this.life[k] -= dt; const f = Math.max(0, this.life[k] / this.ttl[k]);
      this.vel[k * 3 + 1] -= this.grav[k] * dt;
      this.pos[k * 3] += this.vel[k * 3] * dt; this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt; this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      this.col[k * 3] = this.base[k * 3] * f; this.col[k * 3 + 1] = this.base[k * 3 + 1] * f; this.col[k * 3 + 2] = this.base[k * 3 + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.pos.fill(0); for (let k = 0; k < this.max; k++) this.pos[k * 3 + 1] = -9999; }
  dispose() { this.geo.dispose(); this.mat.dispose(); this.tex.dispose(); this.points.parent?.remove(this.points); }
}

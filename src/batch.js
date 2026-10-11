/**
 * Static geometry batcher: collects transformed primitives with per-vertex colour and merges them
 * into ONE draw call. Used for track chunks, scenery and obstacles (built once per chunk, disposed on cleanup).
 */
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _col = new THREE.Color(), _nm = new THREE.Matrix3();

export class Batch {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  get empty() { return this.pos.length === 0; }

  /** Add a three.js geometry transformed by `matrix` and tinted `color` (optionally with a vertical gradient). */
  add(geo, matrix, color, { flat = true, tint = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, nrm = g.attributes.normal;
    _nm.getNormalMatrix(matrix);
    _col.set(color);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      const k = tint ? tint(_v) : 1;
      this.col.push(_col.r * k, _col.g * k, _col.b * k);
    }
    if (g !== geo) g.dispose();
    if (flat) this._flatten(this.pos.length / 3 - p.count);
  }

  /** Recompute face normals for the last `count` vertices so low-poly shapes are crisp. */
  _flatten(start) {
    for (let i = start; i + 2 < this.pos.length / 3; i += 3) {
      _a.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      _b.set(this.pos[i * 3 + 3], this.pos[i * 3 + 4], this.pos[i * 3 + 5]);
      _c.set(this.pos[i * 3 + 6], this.pos[i * 3 + 7], this.pos[i * 3 + 8]);
      _n.subVectors(_c, _b).cross(_v.subVectors(_a, _b)).normalize();
      for (let k = 0; k < 3; k++) { this.nor[(i + k) * 3] = _n.x; this.nor[(i + k) * 3 + 1] = _n.y; this.nor[(i + k) * 3 + 2] = _n.z; }
    }
  }

  /** Add a quad/tri list given raw world-space vertices (triangles, counter-clockwise). */
  tri(a, b, c, color, shade = 1) {
    _col.set(color);
    _n.subVectors(c, b).cross(_v.subVectors(a, b)).normalize();
    for (const q of [a, b, c]) { this.pos.push(q.x, q.y, q.z); this.nor.push(_n.x, _n.y, _n.z); this.col.push(_col.r * shade, _col.g * shade, _col.b * shade); }
  }
  quad(a, b, c, d, color, shade = 1) { this.tri(a, b, c, color, shade); this.tri(a, c, d, color, shade); }

  build(material) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
}

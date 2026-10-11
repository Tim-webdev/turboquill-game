/** Renderer, camera, lighting, sky, sea, shared materials and quality management. */
import * as THREE from 'three';
import { CONFIG } from '../config/game-config.js';
import { clamp } from './utils.js';

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
}

function gradientTexture(top, mid, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function waterfallTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#bfe9ff'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 4, 20 + Math.random() * 80); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SceneManager {
  constructor(canvas, container, qualityName) {
    this.canvas = canvas; this.container = container; this.qualityName = qualityName; this.q = CONFIG.quality[qualityName];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x9fd4ff, 1);
    this.resScale = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 900);
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 2.2); this.sun.position.set(-40, 80, 30); this.scene.add(this.sun, this.sun.target);
    this.mats = {
      lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    this.wfTex = waterfallTexture();
    this.extras = {
      waterfallGeo: new THREE.PlaneGeometry(6, 40),
      waterfallMat: new THREE.MeshBasicMaterial({ map: this.wfTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    };
    // sky dome + sea (both follow the camera so they never end)
    this.skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(700, 16, 12), this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.scene.add(this.sky);
    this.seaMat = new THREE.MeshLambertMaterial({ color: 0x1d9ec7 });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), this.seaMat); this.sea.rotation.x = -Math.PI / 2; this.sea.position.y = -34; this.scene.add(this.sea);
    this.scene.fog = new THREE.Fog(0xbfe6ff, 60, 280);
    this.viewScale = 1; this.fovBase = 62; this.fovBoost = 0;
    this.resize();
  }

  setQuality(name) { this.qualityName = name; this.q = CONFIG.quality[name]; this.resize(); }

  setLevel(def) {
    const old = this.skyMat.map; this.skyMat.map = gradientTexture(def.sky.top, def.sky.mid, def.sky.bottom); this.skyMat.needsUpdate = true; old?.dispose();
    this.scene.fog.color.set(def.fog); this.scene.fog.far = this.q.fogFar; this.scene.fog.near = 55;
    this.renderer.setClearColor(def.fog, 1);
    this.hemi.color.set(def.ambient); this.hemi.groundColor.set(def.theme === 'island' ? 0x5c7a3c : 0x2a3350);
    this.sun.color.set(def.sun); this.seaMat.color.set(def.sea);
    this.wfTex.needsUpdate = true;
  }

  resize() {
    const w = Math.max(2, this.container.clientWidth), h = Math.max(2, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * this.resScale;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.aspect = w / h; this.camera.aspect = this.aspect;
    const wide = 1.55 / Math.min(this.aspect, 1.55);                // >1 when the view is narrower than ~16:10
    this.fovBase = clamp(62 * (1 + (wide - 1) * 0.28), 62, 84);
    this.viewScale = clamp(1 + (wide - 1) * 0.38, 1, 1.9);
    this.camera.fov = this.fovBase + this.fovBoost; this.camera.updateProjectionMatrix();
  }

  setFov(boost) { this.fovBoost = boost; const f = this.fovBase + boost; if (Math.abs(this.camera.fov - f) > 0.05) { this.camera.fov = f; this.camera.updateProjectionMatrix(); } }

  /** Dynamic resolution: gently trade pixels for frame-rate on weak devices. */
  adapt(avgFps, allow) {
    if (!allow) return;
    if (avgFps < 42 && this.resScale > 0.6) { this.resScale = Math.max(0.6, this.resScale - 0.1); this.resize(); }
    else if (avgFps > 58 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this.resize(); }
  }

  update(dt) {
    this.wfTex.offset.y -= dt * 0.9;
    this.sky.position.copy(this.camera.position);
    this.sea.position.x = this.camera.position.x; this.sea.position.z = this.camera.position.z;
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z - 20);
    this.sun.position.set(this.camera.position.x - 40, 80, this.camera.position.z + 30);
  }
  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.mats.lit.dispose(); this.mats.glow.dispose(); this.extras.waterfallGeo.dispose(); this.extras.waterfallMat.dispose(); this.wfTex.dispose();
    this.skyMat.map?.dispose(); this.skyMat.dispose(); this.sky.geometry.dispose(); this.sea.geometry.dispose(); this.seaMat.dispose(); this.renderer.dispose();
  }
}

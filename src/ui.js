/** DOM screens, HUD, settings panel and level cards. Pure UI: knows nothing about Three.js. */
import { $, $$, fmt, isTouchDevice } from './utils.js';
import { CONFIG } from '../config/game-config.js';
import { ASSETS } from '../config/assets.js';
import * as store from './storage.js';
import { settings } from './settings.js';
import { audio } from './audio.js';

const SCREENS = ['loading', 'menu', 'panel-levels', 'panel-howto', 'panel-settings', 'panel-credits', 'pause', 'gameover', 'complete', 'webgl-error'];

export class UI {
  constructor(stage) {
    this.stage = stage; this.el = Object.fromEntries(SCREENS.map((s) => [s, $('#' + s)])); this.cache = {}; this.current = null; this.returnTo = 'menu';
    this.hud = $('#hud'); this.touch = $('#touch'); this.bannerEl = $('#banner'); this.promptEl = $('#prompt'); this.bannerT = 0;
    this.flashEl = document.createElement('div'); this.flashEl.className = 'flash'; stage.appendChild(this.flashEl);
    this.buildControlsHelp();
    $$('.btn', stage).forEach((b) => { b.addEventListener('click', () => audio.sfx('click')); b.addEventListener('pointerenter', () => { if (b.matches(':not(:disabled)')) audio.sfx('hover'); }); });
    document.addEventListener('keydown', (e) => this.menuKeys(e));
  }

  buildControlsHelp() {
    const t = isTouchDevice();
    $('#howto-controls').innerHTML = t
      ? '<p><b>Touch:</b> ◀ ▶ lanes · ▲ jump · ▼ slide · ⚡ hold = accelerate/boost, tap in boss fight = fire. You can also swipe on the screen.</p>'
      : '<p><b>Keyboard:</b> W/↑ accelerate · A D/← → lanes · Space jump · S/↓ slide · Shift boost (boss: fire) · Esc/P pause · M mute</p>';
  }

  /** Show exactly one full screen/panel (overlays may sit above a visible game). */
  show(id, { keepGame = false } = {}) {
    for (const [k, el] of Object.entries(this.el)) if (el) el.hidden = k !== id;
    this.current = id;
    const el = this.el[id]; if (!el) return;
    requestAnimationFrame(() => { const first = el.querySelector('.btn.primary, .btn, .card:not([disabled]), input, select'); first?.focus({ preventScroll: true }); });
  }
  hideAll() { for (const el of Object.values(this.el)) if (el) el.hidden = true; this.current = null; }
  setHud(on) { this.hud.hidden = !on; }
  setTouch(on) { this.touch.hidden = !on; }
  menuKeys(e) {
    if (!this.current || this.stage.contains(document.activeElement) === false && this.current !== 'menu') return;
    if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
    const el = this.el[this.current]; if (!el || el.hidden) return;
    const items = $$('.btn:not(:disabled), .card:not([disabled]), input, select', el).filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement); const n = (i + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.type === 'range') return;
    e.preventDefault(); items[n].focus();
  }

  // ---------- loading ----------
  setProgress(frac, msg) {
    const p = Math.round(Math.min(1, frac) * 100);
    $('#load-bar').style.width = p + '%'; $('#load-pct').textContent = p + '%'; $('.bar', this.el.loading).setAttribute('aria-valuenow', p);
    if (msg) $('#load-msg').textContent = msg;
  }
  loadError(text) { const e = $('#load-error'); e.hidden = false; e.textContent = text; $('#load-retry').hidden = false; }

  // ---------- HUD ----------
  initHud(def, maxHealth) {
    this.cache = {}; $('#hud-level').textContent = `LEVEL ${def.id} · ${def.name.toUpperCase()}`;
    const h = $('#hud-hearts'); h.innerHTML = ''; for (let i = 0; i < maxHealth; i++) { const d = document.createElement('span'); d.className = 'heart'; h.appendChild(d); }
    $('#boss-bar').hidden = true; $('#hud-power').hidden = true; this.bannerEl.className = 'banner'; this.promptEl.className = 'prompt';
  }
  set(key, v, fn) { if (this.cache[key] !== v) { this.cache[key] = v; fn(v); } }
  updateHud(s) {
    this.set('rings', s.rings, (v) => { $('#hud-rings').textContent = fmt(v); });
    this.set('score', s.score, (v) => { $('#hud-score').textContent = fmt(v); });
    this.set('health', s.health, (v) => $$('.heart', this.hud).forEach((h, i) => h.classList.toggle('off', i >= v)));
    this.set('speed', Math.round(s.speedFrac * 50), (v) => { $('#speed-fill').style.width = v * 2 + '%'; });
    this.set('energy', Math.round(s.energy / 2), (v) => { $('#energy-fill').style.width = v * 2 + '%'; });
    this.set('arena', s.arena, (v) => { $('#energy-lbl').textContent = v ? 'QUILL ENERGY' : 'BOOST'; });
    this.set('power', s.power ? Math.round(s.power.frac * 50) : -1, (v) => { $('#hud-power').hidden = v < 0; if (v >= 0) { $('#power-fill').style.width = v * 2 + '%'; $('#power-name').textContent = s.power.name.toUpperCase(); } });
    this.set('boss', s.boss ? s.boss.hp : -1, (v) => { $('#boss-bar').hidden = v < 0; if (v >= 0) $('#boss-fill').style.width = (v / s.boss.max) * 100 + '%'; });
  }
  banner(text, ms = 1600, cls = '') {
    const b = this.bannerEl; b.textContent = text; b.className = 'banner show ' + cls; clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.className = 'banner'; }, ms);
  }
  prompt(text, pulse = false) { const p = this.promptEl; if (!text) { p.className = 'prompt'; return; } p.textContent = text; p.className = 'prompt show' + (pulse ? ' pulse' : ''); }
  flash() { this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on'); }
  setMuteIcon(m) { $('#btn-mute').textContent = m ? '🔇' : '🔊'; const c = $('#set-mute'); if (c) c.checked = m; }

  // ---------- menus ----------
  refreshBest() {
    const d = store.load(); const best = Math.max(d.best[1], d.best[2]);
    $('#menu-best').textContent = best > 0 ? `Best score: ${fmt(best)}` : 'Tip: press PLAY — controls are explained in-game.';
  }
  buildLevels(onPick, unlockAll) {
    const d = store.load(), box = $('#level-cards'); box.innerHTML = '';
    for (const def of CONFIG.levels) {
      const locked = def.id > d.unlocked && !unlockAll;
      const b = document.createElement('button'); b.className = 'card'; b.disabled = locked; b.type = 'button';
      const img = ASSETS.images[def.id === 1 ? 'level1Card' : 'level2Card'].src;
      b.innerHTML = `<img src="${img}" alt="" loading="lazy"><div class="meta"><h3>${def.id}. ${def.name}</h3><small>${def.blurb}</small><small>Best: ${fmt(d.best[def.id])}${d.completed[def.id] ? ' · ✔ completed' : ''}</small></div>${locked ? '<span class="lock">🔒 LOCKED — finish level ' + (def.id - 1) + '</span>' : ''}`;
      b.addEventListener('click', () => onPick(def.id)); box.appendChild(b);
    }
  }
  bindSettings(onQuality) {
    const s = settings.data, $m = $('#set-music'), $s = $('#set-sfx'), $c = $('#set-sens');
    const sync = () => {
      const d = settings.data; $m.value = Math.round(d.music * 100); $s.value = Math.round(d.sfx * 100); $c.value = Math.round(d.sensitivity * 100);
      $('#out-music').textContent = $m.value + '%'; $('#out-sfx').textContent = $s.value + '%'; $('#out-sens').textContent = $c.value + '%';
      $('#set-quality').value = d.quality; $('#set-touch').value = d.showTouch; $('#set-motion').checked = settings.reducedMotion; $('#set-mute').checked = d.muted;
    };
    sync(); this.syncSettings = sync;
    $m.addEventListener('input', () => { settings.set('music', $m.value / 100); sync(); });
    $s.addEventListener('input', () => { settings.set('sfx', $s.value / 100); sync(); });
    $s.addEventListener('change', () => audio.sfx('ring'));
    $c.addEventListener('input', () => { settings.set('sensitivity', $c.value / 100); sync(); });
    $('#set-quality').addEventListener('change', (e) => { settings.set('quality', e.target.value); onQuality?.(); });
    $('#set-touch').addEventListener('change', (e) => settings.set('showTouch', e.target.value));
    $('#set-motion').addEventListener('change', (e) => { settings.set('reducedMotion', e.target.checked); document.body.classList.toggle('reduce-motion', e.target.checked); });
    $('#set-mute').addEventListener('change', (e) => { settings.set('muted', e.target.checked); audio.applyVolumes(); this.setMuteIcon(e.target.checked); });
    $('#btn-reset').addEventListener('click', () => { if (confirm('Reset all saved scores and unlocked levels?')) { const keep = settings.data; store.reset(); store.load().settings = keep; store.save(); sync(); this.refreshBest(); } });
    document.body.classList.toggle('reduce-motion', settings.reducedMotion);
  }
}

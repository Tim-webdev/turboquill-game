/** Bootstrap: real asset preloading with progress, WebGL check, menu/screen wiring. */
import { ASSETS } from '../config/assets.js';
import { CONFIG } from '../config/game-config.js';
import { UI } from './ui.js';
import { Controls } from './controls.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { settings } from './settings.js';
import { ads } from './ads.js';
import * as store from './storage.js';
import { webglAvailable } from './scene.js';
import { $, $$ } from './utils.js';

const params = new URLSearchParams(location.search);
const debug = { god: params.has('god'), unlockAll: params.has('unlock') };

const stage = $('#stage'), canvas = $('#game-canvas');
const ui = new UI(stage);
$('#year').textContent = new Date().getFullYear();
ads.init();
ui.bindSettings(() => game?.applyQuality());
ui.setMuteIcon(settings.data.muted);
let game = null, stack = [];

const controls = new Controls({
  touchRoot: $('#touch'), swipeTarget: stage,
  onPause: (e) => {
    if (game?.state === 'playing' || game?.state === 'paused') { e.preventDefault?.(); if (ui.current === 'panel-settings' && game.state === 'paused') back(); else game.togglePause(); }
    else if (['panel-levels', 'panel-howto', 'panel-settings', 'panel-credits'].includes(ui.current)) back();
  },
  onMute: () => { const m = audio.toggleMute(); ui.setMuteIcon(m); ui.syncSettings?.(); },
});

// ---------- loading (progress is derived from real work: image decodes + engine init) ----------
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Failed to load ' + src)); i.src = src; });
async function boot() {
  $('#load-retry').hidden = true; $('#load-error').hidden = true;
  const imgs = Object.entries(ASSETS.images); const total = imgs.length + 1; let done = 0;
  const report = (msg) => ui.setProgress(done / total, msg);
  const msgs = ['Preparing the Speed Zone…', 'Polishing the rings…', 'Charging the Velocity Core…', 'Waking the Iron Warden…', 'Tuning the soundtrack…'];
  report(msgs[0]);
  for (const [name, a] of imgs) {
    try { await loadImage(a.src); } catch (e) { if (a.essential) { ui.loadError(`Essential file missing: ${a.src}. Check your connection and retry.`); throw e; } console.warn('Optional asset failed:', a.src); }
    done++; report(msgs[done % msgs.length]);
  }
  if (!webglAvailable()) { ui.setProgress(done / total, 'Graphics unavailable'); ui.loadError('WebGL is not available in this browser, so the 3D game cannot start.'); throw new Error('WebGL unavailable'); }
  game = new Game({ canvas, stage, ui, controls, debug });
  window.__tq = game;     // handy for debugging in the console
  await game.init((f, m) => ui.setProgress((done + f) / total, m));
  ui.setProgress(1, 'Ready!');
}

function enterMenu() { game.state = 'menu'; ui.refreshBest(); ui.buildLevels(startLevel, debug.unlockAll); ui.show('menu'); }
function startLevel(id, extra = {}) {
  audio.unlock(); stack = [];
  const o = { ...extra };
  if (params.has('skip') && !extra.startS) o.startS = Math.max(0, +params.get('skip') || 0);
  if (params.has('boss') && !extra.startS) { const def = CONFIG.levels.find((l) => l.id === id); o.startS = def.length - 12; }
  game.startLevel(id, o);
  if (!document.body.classList.contains('immersive')) stage.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function openPanel(id, from = 'menu') { stack.push(from); ui.show(id); }
function back() { const to = stack.pop() || 'menu'; if (to === 'pause') { ui.show('pause'); } else if (to === 'menu') ui.show('menu'); else ui.show(to); }

// ---------- wiring ----------
$('#btn-play').onclick = () => { audio.unlock(); const d = store.load(); startLevel(debug.unlockAll ? Math.max(1, Math.min(2, +params.get('level') || 1)) : (params.has('level') ? Math.min(+params.get('level'), d.unlocked) : 1)); };
$('#btn-levels').onclick = () => { audio.unlock(); ui.buildLevels(startLevel, debug.unlockAll); openPanel('panel-levels'); };
$('#btn-howto').onclick = () => { audio.unlock(); openPanel('panel-howto'); };
$('#btn-settings').onclick = () => { audio.unlock(); ui.syncSettings(); openPanel('panel-settings'); };
$('#btn-credits').onclick = () => { audio.unlock(); openPanel('panel-credits'); };
$$('[data-back]').forEach((b) => b.addEventListener('click', back));
$('#btn-resume').onclick = () => game.resume();
$('#btn-restart').onclick = () => game.restart();
$('#btn-pause-settings').onclick = () => { ui.syncSettings(); openPanel('panel-settings', 'pause'); };
$('#btn-quit').onclick = () => game.quit();
$('#btn-retry').onclick = () => game.restart();
$('#btn-over-menu').onclick = () => game.quit();
$('#btn-next').onclick = () => startLevel(Math.min(CONFIG.levels.length, game.lastId + 1));
$('#btn-replay').onclick = () => game.restart();
$('#btn-comp-menu').onclick = () => game.quit();
$('#btn-pause').onclick = () => game?.pause();
$('#btn-mute').onclick = () => { const m = audio.toggleMute(); ui.setMuteIcon(m); ui.syncSettings?.(); };
$('#rotate-close').onclick = () => { $('#rotate-hint').hidden = true; try { sessionStorage.setItem('tq-rot', '1'); } catch (e) { /* ignore */ } };
$('#load-retry').onclick = () => location.reload();
const fsBtn = $('#btn-fullscreen');
if (stage.requestFullscreen && !/iPhone|iPod/.test(navigator.userAgent)) { fsBtn.hidden = false; fsBtn.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen().catch(() => {}); }; }
// first user gesture anywhere unlocks audio (autoplay policy)
['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, () => audio.unlock(), { once: true, passive: true }));
// stop page scrolling with game keys while the stage has focus or a run is active
window.addEventListener('keydown', (e) => { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && game && (game.state === 'playing') ) e.preventDefault(); }, { passive: false });
stage.addEventListener('contextmenu', (e) => { if (game?.state === 'playing') e.preventDefault(); });

boot().then(() => {
  setTimeout(() => { $('#loading').hidden = true; enterMenu(); if (params.has('autostart')) startLevel(+params.get('level') || 1); }, 250);
}).catch((e) => { console.error(e); if (!webglAvailable()) $('#webgl-error').hidden = false; });

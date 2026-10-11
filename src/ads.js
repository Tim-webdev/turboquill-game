/**
 * AdSense integration (config/ads-config.js). Nothing is requested unless ADS.enabled is true AND real ids are set.
 * Ads only ever render in containers outside the canvas/HUD/touch controls. No refresh timers, no interstitials.
 */
import { ADS } from '../config/ads-config.js';

const isPlaceholder = (v) => !v || /X{4,}/.test(v);
let scriptLoaded = false;

function ready() { return ADS.enabled && !isPlaceholder(ADS.publisherId) && /^ca-pub-\d{10,}$/.test(ADS.publisherId); }
function loadScript() {
  if (scriptLoaded) return; scriptLoaded = true;
  if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return;   // already in <head> (index.html)
  const s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADS.publisherId);
  document.head.appendChild(s);
}
function fill(el, cfg) {
  if (el.dataset.filled) return; el.dataset.filled = '1';
  if (ready() && !isPlaceholder(cfg.adSlot)) {
    loadScript(); el.innerHTML = '';
    const ins = document.createElement('ins'); ins.className = 'adsbygoogle'; ins.style.display = 'block';
    ins.dataset.adClient = ADS.publisherId; ins.dataset.adSlot = cfg.adSlot; ins.dataset.adFormat = cfg.format || 'auto'; ins.dataset.fullWidthResponsive = 'true';
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { console.warn('AdSense push failed', e); }
  } else if (ADS.showPlaceholders) {
    el.innerHTML = '<div class="ph">Ad space reserved — AdSense not configured</div>';
  } else { el.style.display = 'none'; }
}
export const ads = {
  init() {
    for (const [name, cfg] of Object.entries(ADS.slots)) {
      const el = document.getElementById(cfg.id); if (!el) continue;
      el.dataset.label = cfg.label; el.style.minHeight = cfg.minHeight + 'px';
      if (name === 'levelComplete') { if (cfg.enabled === false) el.style.display = 'none'; continue; }   // filled lazily when shown
      fill(el, cfg);
    }
  },
  /** Called when the level-complete screen opens (between levels only; never during play). */
  showLevelComplete() { const cfg = ADS.slots.levelComplete, el = document.getElementById(cfg.id); if (el && cfg.enabled !== false) fill(el, cfg); },
};

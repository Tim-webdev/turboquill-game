/**
 * TURBO QUILL — centralized asset map.
 *
 * Source material: the supplied "sonic" folder contained 12 sub-folders of VIDEO FRAMES
 * (40–50 JPG frames of 1280x720 each), not 12 single images. Several of those folders show a
 * third-party copyrighted character, so they are deliberately NOT shipped. Only character-free
 * frames were extracted and converted (see README → "Asset audit"):
 *
 *   #9  Logo reveal        -> frame 40  -> branding/logo.webp, logo-keyed.png, favicons
 *   #10 Menu background    -> frames 1, 25 (island at sunset, no character)
 *   #12 Loading screen     -> (folder shows a UI mock-up with the character) replaced by #9 frame 19
 *   #11 Thumbnail          -> (folder shows the character) rebuilt from #10 + #9 as branding/thumbnail.jpg
 *   #1,#3 character refs   -> NOT used as art; original procedural hero is built in src/player.js
 *   #2,#4 environments     -> NOT used as art; visual direction for src/levels.js (card art from #10)
 *   #5,#6,#7,#8            -> visual direction only; original ring / robots / boss / power-up are
 *                             procedural Three.js models (src/collectibles.js, enemies.js, boss.js, powerups.js)
 */
export const ASSETS = {
  images: {
    logo:         { src: 'assets/images/branding/logo.webp',        essential: true,  role: 'Game logo (screen-blend on dark UI)' },
    logoKeyed:    { src: 'assets/images/branding/logo-keyed.png',   essential: false, role: 'Logo with alpha (loading/menu header)' },
    thumbnail:    { src: 'assets/images/branding/thumbnail.jpg',    essential: false, role: 'Open Graph / social thumbnail' },
    menuBg:       { src: 'assets/images/ui/menu-bg.webp',           essential: true,  role: 'Main menu background' },
    menuBgAlt:    { src: 'assets/images/ui/menu-bg-alt.webp',       essential: false, role: 'Alternate backdrop (level select, panels)' },
    loadingBg:    { src: 'assets/images/ui/loading-bg.webp',        essential: true,  role: 'Loading screen background' },
    level1Card:   { src: 'assets/images/environments/level1-card.webp', essential: false, role: 'Level 1 card art' },
    level2Card:   { src: 'assets/images/environments/level2-card.webp', essential: false, role: 'Level 2 card art' },
  },
  /**
   * Optional replacement 3D models (GLB/GLTF). Leave null to use the built-in procedural models.
   * Example: player: 'assets/models/hero.glb'
   * Expected animation clip names (optional): "run", "jump", "slide", "hit".
   */
  models: {
    player: null,
  },
  /**
   * Optional licensed audio files. Leave null to use the built-in synthesized soundtrack (src/audio.js).
   * Example: music: { menu: 'assets/audio/menu.mp3', game: 'assets/audio/game.mp3', boss: 'assets/audio/boss.mp3' }
   */
  audio: {
    music: { menu: null, game: null, boss: null },
  },
};

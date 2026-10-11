/**
 * TURBO QUILL — advertising configuration (Google AdSense).
 *
 * HOW TO ENABLE (see README → "Google AdSense"):
 *   1. Get your AdSense account approved for your domain.
 *   2. Set `enabled: true`, put your real publisher id in `publisherId` ("ca-pub-XXXXXXXXXXXXXXXX").
 *   3. Create display ad units in AdSense and paste each unit's numeric slot id below.
 *   4. Publish /ads.txt (template: ads.txt.example) at your site root.
 *
 * While `enabled` is false OR a placeholder id is still present, NO ad script is loaded and NO ad request
 * is made. Placeholder boxes are shown (labelled) only if `showPlaceholders` is true, so layout space is
 * reserved correctly and you can verify that ads never overlap gameplay.
 *
 * Policy notes baked into the implementation (src/ads.js):
 *  - ads live outside the game canvas, HUD and touch controls;
 *  - no interstitials during gameplay; no automatic refresh; no incentives for clicking;
 *  - the "between levels" slot lives on the level-complete screen only, and is hidden unless `levelCompleteSlot.enabled`.
 */
export const ADS = {
  enabled: true,
  showPlaceholders: false,
  publisherId: 'ca-pub-1319521339732367',
  slots: {
    top:           { id: 'ad-slot-top',      adSlot: 'XXXXXXXXXX', format: 'auto', minHeight: 100, label: 'Advertisement' },
    below:         { id: 'ad-slot-below',    adSlot: 'XXXXXXXXXX', format: 'auto', minHeight: 250, label: 'Advertisement' },
    levelComplete: { id: 'ad-slot-complete', adSlot: 'XXXXXXXXXX', format: 'auto', minHeight: 90,  label: 'Advertisement', enabled: true },
  },
};

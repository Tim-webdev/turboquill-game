/** Small AABB helpers in lane space (x lateral, s forward, y up). */
export const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.s0 < b.s1 && a.s1 > b.s0 && a.y0 < b.y1 && a.y1 > b.y0;
export const box = (x, s, y, hw, hl, h) => ({ x0: x - hw, x1: x + hw, s0: s - hl, s1: s + hl, y0: y, y1: y + h });
/** Squared 3D distance between player centre and a point (used for pickups). */
export function playerDist2(p, h, x, s, y) {
  const dx = p.x - x, ds = p.s - s, dy = (p.y + h * 0.5) - y;
  return dx * dx + ds * ds + dy * dy;
}

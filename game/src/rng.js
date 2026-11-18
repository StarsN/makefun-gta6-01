// rng.js — deterministic seeded randomness and small math helpers.
// The whole city and every posed screenshot scene derive from one seed,
// so a given seed always builds the same Coral Bay.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  float() { return this.next(); }
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const angleLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
// Move a point out of an axis-aligned box; returns true when it was inside.
export function pushOutOfBox(p, box, pad) {
  const x0 = box.x - pad, y0 = box.y - pad, x1 = box.x + box.w + pad, y1 = box.y + box.h + pad;
  if (p.x <= x0 || p.x >= x1 || p.y <= y0 || p.y >= y1) return false;
  const dl = p.x - x0, dr = x1 - p.x, dt = p.y - y0, db = y1 - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === dt) p.y = y0; else p.y = y1;
  return true;
}
// Does the segment a->b cross the box? Cheap sampled test used for line of sight.
export function segmentHitsBox(ax, ay, bx, by, box) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return true;
  }
  return false;
}

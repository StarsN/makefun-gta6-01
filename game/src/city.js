// Coral Bay itself: a procedural 8x8-block street grid with named special
// buildings (police station, hospital, Vega's Garage, Hotel Solana, a
// warehouse), Coral Plaza with its fountain, a park, parking lots, and a
// beach with a wooden pier on the east edge. Also the geometry helpers the
// traffic, pedestrians and physics all share.

import { PITCH, GRID, ROAD_HALF, CITY_EDGE, BEACH_X, WORLD_W, WORLD_H, PALETTE } from './config.js';
import { pick, rand } from './random.js';

export const roadCenter = (i) => i * PITCH;
export const blockRect = (i, j) => ({
  x: roadCenter(i) + ROAD_HALF, y: roadCenter(j) + ROAD_HALF,
  w: PITCH - ROAD_HALF * 2, h: PITCH - ROAD_HALF * 2,
});

const ROOFS = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];
const SHOP_NAMES = ['Cafe Brisa', 'Banco Coral', 'Tide Books', 'Palma Gym', 'Sol Tacos', 'Marina Deli', 'Hotel Miramar', 'Coral Pharmacy', 'Byte Repair', 'Casa Azul', 'Tiki Bar', 'Onda Surf', 'Palm Court', 'Vista Offices', 'Luna Bakery', 'Reef Realty'];

const SPECIALS = {
  '1,1': { kind: 'police', label: 'CBPD HQ' },
  '6,1': { kind: 'hospital', label: 'Coral General' },
  '3,6': { kind: 'garage', label: "Vega's Garage" },
  '6,5': { kind: 'hotel', label: 'Hotel Solana' },
  '1,6': { kind: 'warehouse', label: 'Pierpoint Storage' },
  '4,3': { kind: 'plaza', label: 'Coral Plaza' },
  '2,4': { kind: 'park', label: 'Palma Park' },
  '5,2': { kind: 'lot', label: 'Parking' },
  '2,2': { kind: 'lot', label: 'Parking' },
};

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const lots = [];
  const spots = {};
  let shopIdx = 0;

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const b = blockRect(i, j);
      const spec = SPECIALS[`${i},${j}`];
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (spec && spec.kind === 'plaza') {
        spots.plaza = { x: cx, y: cy };
        spots.fountain = { x: cx, y: cy, r: 30 };
        for (const [dx, dy] of [[-78, -78], [78, -78], [-78, 78], [78, 78], [0, -88], [0, 88], [-88, 0], [88, 0]])
          trees.push({ x: cx + dx, y: cy + dy, palm: true });
        continue;
      }
      if (spec && spec.kind === 'park') {
        spots.park = { x: cx, y: cy };
        for (let t = 0; t < 12; t++) trees.push({ x: b.x + rand(rng, 18, b.w - 18), y: b.y + rand(rng, 18, b.h - 18), palm: rng() < 0.5 });
        continue;
      }
      if (spec && spec.kind === 'lot') {
        lots.push({ ...b, i, j });
        continue;
      }
      if (spec) {
        // One landmark building with a forecourt; the spot is its front door.
        const w = b.w * 0.72, h = b.h * 0.62;
        buildings.push({ x: cx - w / 2, y: b.y + 8, w, h, color: pick(rng, ROOFS), label: spec.label, kind: spec.kind });
        spots[spec.kind] = { x: cx, y: b.y + 8 + h + 26 };
        if (spec.kind === 'garage') spots.garageDoor = { x: cx, y: b.y + b.h - 6 };
        trees.push({ x: b.x + 16, y: b.y + b.h - 16, palm: true }, { x: b.x + b.w - 16, y: b.y + b.h - 16, palm: true });
        continue;
      }
      // Ordinary block: either one tower or a row of smaller shops/houses.
      if (rng() < 0.4) {
        const w = rand(rng, 120, 165), h = rand(rng, 120, 165);
        buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, color: pick(rng, ROOFS), label: rng() < 0.5 ? SHOP_NAMES[shopIdx++ % SHOP_NAMES.length] : '', kind: 'block' });
      } else {
        const n = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = (b.w - 16 * (n + 1)) / n, h = rand(rng, 92, 150);
          buildings.push({ x: b.x + 16 + k * (w + 16), y: b.y + rand(rng, 10, 34), w, h, color: pick(rng, ROOFS), label: rng() < 0.55 ? SHOP_NAMES[shopIdx++ % SHOP_NAMES.length] : '', kind: 'block' });
        }
        if (rng() < 0.7) trees.push({ x: b.x + rand(rng, 14, b.w - 14), y: b.y + b.h - 14, palm: rng() < 0.6 });
      }
      if (rng() < 0.5) trees.push({ x: b.x + 10, y: b.y + 10, palm: true });
    }
  }

  // Beach palms and the pier.
  for (let y = 90; y < WORLD_H - 60; y += rand(rng, 120, 210)) trees.push({ x: BEACH_X + rand(rng, 16, 90), y, palm: true });
  const pier = { x: BEACH_X + 130, y: roadCenter(4) - 26, w: WORLD_W - BEACH_X - 150, h: 52 };
  spots.pierEnd = { x: pier.x + pier.w - 30, y: pier.y + pier.h / 2 };
  spots.beachLot = { x: BEACH_X + 66, y: roadCenter(5) };
  spots.spawn = { x: spots.plaza.x - 60, y: spots.plaza.y + 120 };

  const colliders = buildings.map((b) => ({ ...b, circle: false }));
  colliders.push({ x: spots.fountain.x - 30, y: spots.fountain.y - 30, w: 60, h: 60, circle: false, fountain: true });

  return { buildings, trees, lots, spots, pier, colliders };
}

export function onVerticalRoad(x) { const m = ((x % PITCH) + PITCH) % PITCH; return m <= ROAD_HALF || m >= PITCH - ROAD_HALF; }
export function onHorizontalRoad(y) { const m = ((y % PITCH) + PITCH) % PITCH; return m <= ROAD_HALF || m >= PITCH - ROAD_HALF; }
export function onRoad(x, y) { return x < CITY_EDGE + ROAD_HALF && (onVerticalRoad(x) || onHorizontalRoad(y)); }

export function groundAt(city, x, y) {
  if (x >= BEACH_X + 130) {
    const p = city.pier;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'pier';
    if (x > BEACH_X + 148) return 'water';
    return 'sand';
  }
  if (x >= BEACH_X) return 'sand';
  if (onRoad(x, y)) return 'road';
  return 'land';
}

export function nearestIntersection(x, y) {
  const i = Math.round(x / PITCH), j = Math.round(y / PITCH);
  return { i: Math.max(0, Math.min(GRID, i)), j: Math.max(0, Math.min(GRID, j)), x: i * PITCH, y: j * PITCH };
}

// Push a circle (x, y, r) out of every building rect and tree trunk; returns
// the corrected position and whether anything was hit (for crash damage).
export function collideWorld(city, x, y, r) {
  let hit = false;
  for (const b of city.colliders) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 < 0.0001) { // centre inside the rect: push out the nearest face
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r; else y = b.y + b.h + r;
      } else {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; y = ny + (dy / d) * r;
      }
    }
  }
  for (const t of city.trees) {
    const dx = x - t.x, dy = y - t.y, d2 = dx * dx + dy * dy, rr = r + 5;
    if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2); x = t.x + (dx / d) * rr; y = t.y + (dy / d) * rr; hit = true; }
  }
  // The sea is a wall, except along the pier deck.
  if (groundAt(city, x, y) === 'water') { x = Math.min(x, BEACH_X + 148 - r); hit = true; }
  x = Math.max(r, Math.min(WORLD_W - r, x));
  y = Math.max(r, Math.min(WORLD_H - r, y));
  return { x, y, hit };
}

// A random point on the sidewalk ring of the block nearest (x, y).
export function sidewalkPoint(rng, x, y) {
  const bi = Math.max(0, Math.min(GRID - 1, Math.floor(x / PITCH)));
  const bj = Math.max(0, Math.min(GRID - 1, Math.floor(y / PITCH)));
  const b = blockRect(bi, bj);
  const inset = 9;
  const side = Math.floor(rng() * 4), t = rng();
  if (side === 0) return { x: b.x + inset + t * (b.w - inset * 2), y: b.y + inset, block: [bi, bj], side };
  if (side === 1) return { x: b.x + b.w - inset, y: b.y + inset + t * (b.h - inset * 2), block: [bi, bj], side };
  if (side === 2) return { x: b.x + inset + t * (b.w - inset * 2), y: b.y + b.h - inset, block: [bi, bj], side };
  return { x: b.x + inset, y: b.y + inset + t * (b.h - inset * 2), block: [bi, bj], side };
}

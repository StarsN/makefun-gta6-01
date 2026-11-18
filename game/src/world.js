// world.js — procedural Coral Bay: an 8x8 block grid with named places of
// interest, a plaza with a fountain, a park, parking lots, palms, and the
// beach and pier along the east shore. Also answers the spatial questions
// every other system asks: what is road, where can things spawn, what blocks
// movement and sight.

import { BLOCK_PITCH, ROAD_W, BLOCKS, CITY_SIZE, BEACH_W, WORLD_W, WORLD_H, BUILDING_COLORS, ROOF_COLORS } from './config.js';
import { Rng, clamp, pushOutOfBox, segmentHitsBox } from './rng.js';

export const roadCenter = (i) => i * BLOCK_PITCH + ROAD_W / 2;
export const blockOrigin = (b) => roadCenter(b) + ROAD_W / 2; // top-left of block b's buildable area
export const BLOCK_INNER = BLOCK_PITCH - ROAD_W;

const POI_BLOCKS = {
  warehouse: { bx: 1, by: 2, name: 'Coral Bay Warehouse' },
  hospital: { bx: 2, by: 1, name: 'Coral Bay General' },
  police: { bx: 6, by: 1, name: 'CBPD Station' },
  hotel: { bx: 6, by: 5, name: 'Hotel Solana' },
  garage: { bx: 1, by: 6, name: "Vega's Garage" },
};
const PLAZA_BLOCK = { bx: 4, by: 4 };
const PARK_BLOCK = { bx: 3, by: 6 };
const LOT_BLOCKS = [{ bx: 5, by: 3 }, { bx: 2, by: 4 }];

export function buildWorld(seed) {
  const rng = new Rng(seed);
  const world = {
    seed, buildings: [], trees: [], pois: {}, parkSpots: [], lotRects: [],
    fountain: null, plaza: null, park: null,
    beach: { x: CITY_SIZE, w: BEACH_W },
    pier: null, waterBoxes: [],
  };
  const pierY = roadCenter(5);
  world.pier = { x: CITY_SIZE + 150, y: pierY - 26, w: BEACH_W - 170, h: 52 };
  world.waterBoxes = [
    { x: CITY_SIZE + 250, y: 0, w: WORLD_W - CITY_SIZE - 250, h: pierY - 26 },
    { x: CITY_SIZE + 250, y: pierY + 26, w: WORLD_W - CITY_SIZE - 250, h: WORLD_H - pierY - 26 },
  ];

  for (let bx = 0; bx < BLOCKS; bx++) {
    for (let by = 0; by < BLOCKS; by++) {
      const ox = blockOrigin(bx), oy = blockOrigin(by);
      const poiKey = Object.keys(POI_BLOCKS).find((k) => POI_BLOCKS[k].bx === bx && POI_BLOCKS[k].by === by);
      if (poiKey) { buildPoiBlock(world, rng, poiKey, ox, oy); continue; }
      if (bx === PLAZA_BLOCK.bx && by === PLAZA_BLOCK.by) { buildPlaza(world, rng, ox, oy); continue; }
      if (bx === PARK_BLOCK.bx && by === PARK_BLOCK.by) { buildPark(world, rng, ox, oy); continue; }
      if (LOT_BLOCKS.some((l) => l.bx === bx && l.by === by)) { buildLot(world, rng, ox, oy); continue; }
      buildResidential(world, rng, ox, oy);
    }
  }

  // Palms line the beach and dot the plaza corners.
  for (let y = 60; y < WORLD_H - 40; y += 130) {
    world.trees.push({ x: CITY_SIZE + 42 + rng.range(-8, 8), y: y + rng.range(-16, 16), r: 7, kind: 'palm' });
  }
  return world;
}

function poiMarker(ox, oy) {
  // The pickup / stand point for a POI: on the road just south of its block.
  return { x: ox + BLOCK_INNER / 2, y: oy + BLOCK_INNER + ROAD_W / 2 };
}

function buildPoiBlock(world, rng, key, ox, oy) {
  const def = POI_BLOCKS[key];
  const w = BLOCK_INNER * 0.72, h = BLOCK_INNER * 0.6;
  const b = {
    x: ox + (BLOCK_INNER - w) / 2, y: oy + 8, w, h,
    color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS),
    kind: key, name: def.name, seed: rng.int(1, 99999), floors: rng.int(3, 6),
  };
  world.buildings.push(b);
  const m = poiMarker(ox, oy);
  world.pois[key] = { ...m, name: def.name, bx: def.bx, by: def.by };
  // A couple of palms by the door.
  world.trees.push({ x: ox + 22, y: oy + BLOCK_INNER - 18, r: 7, kind: 'palm' });
  world.trees.push({ x: ox + BLOCK_INNER - 22, y: oy + BLOCK_INNER - 18, r: 7, kind: 'palm' });
}

function buildPlaza(world, rng, ox, oy) {
  world.plaza = { x: ox, y: oy, w: BLOCK_INNER, h: BLOCK_INNER };
  world.fountain = { x: ox + BLOCK_INNER / 2, y: oy + BLOCK_INNER / 2, r: 40 };
  world.pois.plaza = { x: ox + BLOCK_INNER / 2, y: oy + BLOCK_INNER + ROAD_W / 2, name: 'Coral Plaza', bx: PLAZA_BLOCK.bx, by: PLAZA_BLOCK.by };
  for (const [cx, cy] of [[26, 26], [BLOCK_INNER - 26, 26], [26, BLOCK_INNER - 26], [BLOCK_INNER - 26, BLOCK_INNER - 26]]) {
    world.trees.push({ x: ox + cx, y: oy + cy, r: 8, kind: 'palm' });
  }
}

function buildPark(world, rng, ox, oy) {
  world.park = { x: ox, y: oy, w: BLOCK_INNER, h: BLOCK_INNER };
  world.pois.park = { x: ox + BLOCK_INNER / 2, y: oy + BLOCK_INNER + ROAD_W / 2, name: 'Palmetto Park', bx: PARK_BLOCK.bx, by: PARK_BLOCK.by };
  for (let i = 0; i < 16; i++) {
    world.trees.push({ x: ox + rng.range(24, BLOCK_INNER - 24), y: oy + rng.range(24, BLOCK_INNER - 24), r: rng.range(8, 12), kind: 'tree' });
  }
}

function buildLot(world, rng, ox, oy) {
  const rect = { x: ox + 6, y: oy + 6, w: BLOCK_INNER - 12, h: BLOCK_INNER - 12 };
  world.lotRects.push(rect);
  // Two rows of parking spots, noses facing the central aisle.
  for (let i = 0; i < 5; i++) {
    world.parkSpots.push({ x: rect.x + 42 + i * 56, y: rect.y + 34, angle: Math.PI / 2 });
    world.parkSpots.push({ x: rect.x + 42 + i * 56, y: rect.y + rect.h - 34, angle: -Math.PI / 2 });
  }
}

function buildResidential(world, rng, ox, oy) {
  const count = rng.int(2, 4);
  const cell = BLOCK_INNER / 2;
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (let i = 0; i < count; i++) {
    const [cx, cy] = cells[i];
    const pad = rng.range(10, 22);
    const w = cell - pad * 2, h = cell - pad * 2;
    world.buildings.push({
      x: ox + cx * cell + pad, y: oy + cy * cell + pad, w, h,
      color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS),
      kind: 'block', name: null, seed: rng.int(1, 99999), floors: rng.int(2, 9),
    });
  }
  if (rng.chance(0.7)) world.trees.push({ x: ox + 18, y: oy + 18, r: 7, kind: rng.chance(0.5) ? 'palm' : 'tree' });
  if (rng.chance(0.5)) world.trees.push({ x: ox + BLOCK_INNER - 18, y: oy + BLOCK_INNER - 18, r: 7, kind: 'tree' });
}

// --- spatial questions -----------------------------------------------------

export function isOnRoad(x, y) {
  if (x < 0 || y < 0 || y > WORLD_H || x > CITY_SIZE) return false;
  const mx = x % BLOCK_PITCH, my = y % BLOCK_PITCH;
  return mx < ROAD_W || my < ROAD_W;
}

export function isDrivable(world, x, y) {
  // Roads, open ground (plaza, park, lots, sand, pier) — anywhere a building
  // or the sea does not block. Traffic AI sticks to roads; this is for checks.
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
  if (inWater(x, y)) return false;
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return false;
  }
  return true;
}

function inWater(x, y) {
  const pier = { x: CITY_SIZE + 150, y: roadCenter(5) - 26, w: BEACH_W - 170, h: 52 };
  if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
  return x > CITY_SIZE + 250;
}

// A random point on a road centreline, biased to a ring around (cx, cy).
export function randomRoadPoint(rng, cx, cy, minD, maxD) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng.chance(0.5);
    const i = rng.int(0, BLOCKS);
    const along = rng.range(0, CITY_SIZE);
    const x = vertical ? roadCenter(i) : along;
    const y = vertical ? along : roadCenter(i);
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minD && d <= maxD) return { x, y, vertical, line: i };
  }
  return { x: roadCenter(rng.int(0, BLOCKS)), y: rng.range(0, CITY_SIZE), vertical: true, line: 0 };
}

// Slide a circle (entity) out of buildings, trees, the fountain and the sea.
export function collideWorld(world, p, radius, isVehicle) {
  for (const b of world.buildings) pushOutOfBox(p, b, radius);
  if (world.fountain) {
    const f = world.fountain;
    const d = Math.hypot(p.x - f.x, p.y - f.y);
    if (d < f.r + radius && d > 0.01) { p.x = f.x + (p.x - f.x) / d * (f.r + radius); p.y = f.y + (p.y - f.y) / d * (f.r + radius); }
  }
  for (const t of world.trees) {
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    if (d < t.r + radius && d > 0.01) { p.x = t.x + (p.x - t.x) / d * (t.r + radius); p.y = t.y + (p.y - t.y) / d * (t.r + radius); }
  }
  if (isVehicle || true) {
    for (const w of world.waterBoxes) pushOutOfBox(p, w, radius * 0.4);
  }
  p.x = clamp(p.x, radius, WORLD_W - radius);
  p.y = clamp(p.y, radius, WORLD_H - radius);
}

export function losBlocked(world, ax, ay, bx, by) {
  for (const b of world.buildings) if (segmentHitsBox(ax, ay, bx, by, b)) return true;
  return false;
}

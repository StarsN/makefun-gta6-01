// Coral Bay itself: builds the city from a seed — the road grid, blocks of pastel
// buildings, a hospital, a police station, Vega's Garage, a hotel, dock warehouses, a
// park, a plaza with a fountain, parking lots, palm trees, the beach and the pier —
// and answers the questions the rest of the game asks about it: is this point on a
// road, where may a circle stand without entering a building, and so on.

import { BUILDING_COLORS, CITY } from './config.js';
import { chance, intRange, makeRng, pick, range } from './random.js';

const HALF_ROAD = CITY.roadW / 2;

function roadCentres() {
  const centres = [];
  for (let i = 0; i <= CITY.cols; i += 1) centres.push(HALF_ROAD + i * CITY.pitch);
  return centres;
}

function blockOrigin(index) {
  return CITY.roadW + index * CITY.pitch;
}

// Which blocks are special places rather than ordinary buildings.
const SPECIAL_BLOCKS = {
  '0,0': 'hospital',
  '4,3': 'station',
  '6,1': 'garage',
  '7,2': 'hotel',
  '4,4': 'plaza',
  '2,5': 'park',
  '7,6': 'docks',
  '7,7': 'docks',
};

const SPECIAL_BUILDINGS = {
  hospital: { name: 'ST. CORAL HOSPITAL', color: '#f4f1de' },
  station: { name: 'CBPD — CORAL BAY POLICE', color: '#b8c6db' },
  garage: { name: "VEGA'S GARAGE", color: '#ffb26b' },
  hotel: { name: 'HOTEL SOLANA', color: '#f7e3ac' },
  docks: { name: 'PIER STORAGE CO.', color: '#a8b8a0' },
};

export function buildCity(seed) {
  const rng = makeRng(seed);
  const city = {
    vRoads: roadCentres(),
    hRoads: roadCentres(),
    buildings: [],
    blocks: [],
    trees: [],
    umbrellas: [],
    parkingSpots: [],
    circles: [],
    pier: { x: CITY.grid, y: 2400, w: 340, h: 96 },
    places: {},
    districts: [],
  };

  for (let col = 0; col < CITY.cols; col += 1) {
    for (let row = 0; row < CITY.rows; row += 1) {
      const x0 = blockOrigin(col);
      const y0 = blockOrigin(row);
      const kind = SPECIAL_BLOCKS[`${col},${row}`] ?? (chance(rng, 0.15) ? 'parking' : 'buildings');
      const block = { col, row, x: x0, y: y0, size: CITY.block, kind };
      city.blocks.push(block);
      buildBlock(city, block, rng);
    }
  }

  // Palm trees along the beach and umbrellas on the sand.
  for (let y = 70; y < CITY.height - 40; y += intRange(rng, 90, 150)) {
    city.trees.push({ x: CITY.sandX + range(rng, 18, 60), y, r: range(rng, 13, 19), palm: true });
    if (chance(rng, 0.6)) {
      city.umbrellas.push({ x: CITY.sandX + range(rng, 70, 130), y: y + range(rng, -24, 24), color: pick(rng, ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1']) });
    }
  }

  city.places = {
    hospital: { id: 'hospital', label: 'St. Coral Hospital', x: 448, y: 448 },
    station: { id: 'station', label: 'CBPD Station', x: 1648, y: 1648 },
    garage: { id: 'garage', label: "Vega's Garage", x: 2448, y: 848 },
    hotel: { id: 'hotel', label: 'Hotel Solana', x: 2848, y: 1248 },
    docks: { id: 'docks', label: 'The Dockyards', x: 3248, y: 2848 },
    plaza: { id: 'plaza', label: 'Coral Plaza', x: 1848, y: 1848 },
    marina: { id: 'marina', label: 'Marina Lookout', x: 3380, y: 1648 },
    pier: { id: 'pier', label: 'Coral Pier', x: 3560, y: 2448 },
    heights: { id: 'heights', label: 'Palm Heights', x: 448, y: 2848 },
  };

  city.districts = [
    { name: 'OLD TOWN', x: 650, y: 660 },
    { name: 'NORTH PALMS', x: 2450, y: 260 },
    { name: 'PALM HEIGHTS', x: 650, y: 2650 },
    { name: 'SUNSTRIP', x: 3050, y: 1450 },
    { name: 'THE DOCKYARDS', x: 3050, y: 3050 },
    { name: 'CORAL PLAZA', x: 1848, y: 1760 },
  ];

  return city;
}

function buildBlock(city, block, rng) {
  const { x, y, size, kind } = block;
  if (kind === 'buildings' || SPECIAL_BUILDINGS[kind]) {
    if (SPECIAL_BUILDINGS[kind]) {
      const spec = SPECIAL_BUILDINGS[kind];
      city.buildings.push({ x: x + 52, y: y + 62, w: size - 104, h: size - 124, color: spec.color, name: spec.name });
      scatterTrees(city, rng, x, y, size, 3);
      return;
    }
    // Two-by-two pastel buildings with gaps between them.
    const gap = 18;
    const lot = (size - gap * 3) / 2;
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        if (chance(rng, 0.12)) continue;
        const bx = x + gap + i * (lot + gap) + range(rng, -4, 4);
        const by = y + gap + j * (lot + gap) + range(rng, -4, 4);
        city.buildings.push({
          x: bx, y: by, w: lot + range(rng, -8, 8), h: lot + range(rng, -8, 8),
          color: pick(rng, BUILDING_COLORS), floors: intRange(rng, 2, 6),
        });
      }
    }
    scatterTrees(city, rng, x, y, size, 2);
    return;
  }
  if (kind === 'parking') {
    for (let i = 0; i < 5; i += 1) {
      city.parkingSpots.push({ x: x + 44 + i * 46, y: y + 52, angle: Math.PI / 2 });
      city.parkingSpots.push({ x: x + 44 + i * 46, y: y + size - 52, angle: -Math.PI / 2 });
    }
    scatterTrees(city, rng, x, y, size, 2);
    return;
  }
  if (kind === 'park') {
    scatterTrees(city, rng, x, y, size, 26);
    return;
  }
  if (kind === 'plaza') {
    city.circles.push({ x: x + size / 2, y: y + size / 2, r: 30 }); // the fountain
    scatterTrees(city, rng, x, y, size, 6);
  }
}

function scatterTrees(city, rng, x, y, size, count) {
  for (let i = 0; i < count; i += 1) {
    city.trees.push({
      x: x + range(rng, 16, size - 16),
      y: y + range(rng, 16, size - 16),
      r: range(rng, 11, 17),
      palm: chance(rng, 0.35),
    });
  }
}

export function isOnRoad(city, x, y) {
  if (x >= city.pier.x && x <= city.pier.x + city.pier.w && y >= city.pier.y && y <= city.pier.y + city.pier.h) return true;
  for (const cx of city.vRoads) if (Math.abs(x - cx) <= HALF_ROAD) return true;
  for (const cy of city.hRoads) if (Math.abs(y - cy) <= HALF_ROAD) return true;
  return false;
}

export function isDrivable(city, x, y) {
  if (isOnRoad(city, x, y)) return true;
  for (const block of city.blocks) {
    if (block.kind !== 'parking' && block.kind !== 'plaza') continue;
    if (x >= block.x && x <= block.x + block.size && y >= block.y && y <= block.y + block.size) return true;
  }
  return false;
}

export function onPier(city, x, y) {
  return x >= city.pier.x - 4 && x <= city.pier.x + city.pier.w && y >= city.pier.y - 4 && y <= city.pier.y + city.pier.h;
}

// Push a circle out of every building and fountain it overlaps and keep it on land.
// Returns [x, y, hitSomething].
export function collideCircle(city, x, y, r) {
  let hit = false;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > CITY.width - r) { x = CITY.width - r; hit = true; }
  if (y > CITY.height - r) { y = CITY.height - r; hit = true; }
  if (x > CITY.waterX - r && !onPier(city, x, y)) { x = CITY.waterX - r; hit = true; }

  for (const b of city.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const nearX = Math.max(b.x, Math.min(x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - nearX;
    let dy = y - nearY;
    let d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 < 0.0001) {
      // Centre inside the building: leave by the shortest side.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = b.x - r;
      else if (min === right) x = b.x + b.w + r;
      else if (min === top) y = b.y - r;
      else y = b.y + b.h + r;
      continue;
    }
    const d = Math.sqrt(d2);
    x = nearX + (dx / d) * r;
    y = nearY + (dy / d) * r;
  }
  for (const c of city.circles) {
    const dx = x - c.x;
    const dy = y - c.y;
    const rr = r + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.0001) continue;
    const d = Math.sqrt(d2);
    x = c.x + (dx / d) * rr;
    y = c.y + (dy / d) * rr;
    hit = true;
  }
  return [x, y, hit];
}

// A random point on a road, between minD and maxD from (cx, cy), with the road it is on.
export function randomRoadSpawn(city, rng, cx, cy, minD, maxD) {
  for (let tries = 0; tries < 30; tries += 1) {
    const vertical = chance(rng, 0.5);
    const idx = intRange(rng, 0, CITY.cols);
    const along = range(rng, 30, CITY.grid - 30);
    const centre = vertical ? city.vRoads[idx] : city.hRoads[idx];
    const dir = chance(rng, 0.5) ? 1 : -1;
    const laneOff = vertical ? -dir * CITY.lane : dir * CITY.lane;
    const x = vertical ? centre + laneOff : along;
    const y = vertical ? along : centre + laneOff;
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minD && d <= maxD) return { x, y, axis: vertical ? 'v' : 'h', idx, dir };
  }
  return { x: city.vRoads[0], y: 200, axis: 'v', idx: 0, dir: 1 };
}

// A random point on a sidewalk ring or in a park/plaza, within maxD of (cx, cy).
export function randomSidewalkPoint(city, rng, cx, cy, maxD) {
  for (let tries = 0; tries < 30; tries += 1) {
    const block = pick(rng, city.blocks);
    let x;
    let y;
    if (block.kind === 'park' || block.kind === 'plaza') {
      x = block.x + range(rng, 14, block.size - 14);
      y = block.y + range(rng, 14, block.size - 14);
    } else {
      const inset = 8;
      const side = intRange(rng, 0, 3);
      const t = range(rng, inset, block.size - inset);
      if (side === 0) { x = block.x + t; y = block.y + inset; }
      else if (side === 1) { x = block.x + t; y = block.y + block.size - inset; }
      else if (side === 2) { x = block.x + inset; y = block.y + t; }
      else { x = block.x + block.size - inset; y = block.y + t; }
    }
    if (Math.hypot(x - cx, y - cy) <= maxD) return { x, y };
  }
  return { x: cx + 60, y: cy + 60 };
}

export function nearestRoadPoint(city, x, y) {
  let bestX = x;
  let bestD = Infinity;
  for (const cx of city.vRoads) {
    const d = Math.abs(x - cx);
    if (d < bestD) { bestD = d; bestX = cx; }
  }
  let bestY = y;
  bestD = Infinity;
  for (const cy of city.hRoads) {
    const d = Math.abs(y - cy);
    if (d < bestD) { bestD = d; bestY = cy; }
  }
  return Math.abs(x - bestX) < Math.abs(y - bestY) ? { x: bestX, y } : { x, y: bestY };
}

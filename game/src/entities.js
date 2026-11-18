// entities.js — the living city: cars (traffic on a lane grid, parked cars),
// pedestrians on the sidewalks, and the transient effects (particles,
// tracers, skid marks) that sell every impact.

import { CAR_TYPES, TRAFFIC_TYPES, CAR_COLORS, ROAD_W, BLOCK_PITCH, CITY_SIZE } from './config.js';
import { Rng, clamp, dist } from './rng.js';
import { roadCenter, randomRoadPoint, collideWorld } from './world.js';

let nextId = 1;

export function createCar(typeKey, x, y, angle, role, rng) {
  const type = CAR_TYPES[typeKey];
  return {
    id: nextId++, typeKey, type, x, y, angle, renderAngle: angle,
    speed: 0, hp: type.hp, maxHp: type.hp, color: rng ? rng.pick(CAR_COLORS) : '#cccccc',
    role, driver: role === 'traffic', wrecked: false, exploded: false,
    // traffic rail state
    axis: 'v', line: 0, dir: 1, laneKey: '', bumpX: 0, bumpY: 0, waitT: 0,
    renderX: x, renderY: y, honkT: 0, brakeLight: false,
  };
}

export function laneOffsetFor(axis, dir) {
  // Right-hand traffic: the lane sits to the right of the direction of travel.
  // Eastbound keeps south, westbound north, southbound west, northbound east.
  if (axis === 'h') return dir > 0 ? 24 : -24;
  return dir > 0 ? -24 : 24;
}

export function placeOnRail(car, vertical, line, along) {
  car.axis = vertical ? 'v' : 'h';
  car.line = line;
  car.dir = Math.random() < 0.5 ? 1 : -1;
  const c = roadCenter(line);
  const off = laneOffsetFor(car.axis, car.dir);
  if (car.axis === 'v') { car.x = c + off; car.y = along; car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  else { car.x = along; car.y = c + off; car.angle = car.dir > 0 ? 0 : Math.PI; }
  car.renderX = car.x; car.renderY = car.y; car.renderAngle = car.angle;
  car.laneKey = car.axis + line + ':' + car.dir;
}

export function spawnParkedCars(world, rng, cars) {
  for (const spot of world.parkSpots) {
    if (!rng.chance(0.55)) continue;
    const car = createCar(rng.pick(TRAFFIC_TYPES), spot.x, spot.y, spot.angle, 'parked', rng);
    cars.push(car);
  }
}

// --- traffic ---------------------------------------------------------------

const TRAFFIC_TARGET = 15;

export function updateTraffic(game, dt) {
  const { cars, player, rng } = game;
  const px = player.x, py = player.y;
  // Density recycling: top up near the player, retire the far ones.
  let traffic = cars.filter((c) => c.role === 'traffic');
  if (traffic.length < TRAFFIC_TARGET && rng.chance(0.3)) {
    const p = randomRoadPoint(rng, px, py, 520, 980);
    const car = createCar(rng.pick(TRAFFIC_TYPES), 0, 0, 0, 'traffic', rng);
    placeOnRail(car, p.vertical, p.line, p.vertical ? p.y : p.x);
    if (dist(car.x, car.y, px, py) > 480) cars.push(car);
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.role === 'traffic' && !c.wrecked && dist(c.x, c.y, px, py) > 1250) cars.splice(i, 1);
  }
  traffic = cars.filter((c) => c.role === 'traffic');
  for (const car of traffic) updateTrafficCar(game, car, traffic, dt);
}

function updateTrafficCar(game, car, traffic, dt) {
  if (car.wrecked) { car.speed = 0; return; }
  const cruise = car.type.topSpeed * 0.52;
  let want = cruise;
  const s = car.axis === 'v' ? car.y : car.x;
  // Brake for a car ahead in the same lane, or anything close in front.
  for (const other of game.cars) {
    if (other === car) continue;
    const os = car.axis === 'v' ? other.y : other.x;
    const along = (os - s) * car.dir;
    const lateral = Math.abs((car.axis === 'v' ? other.x : other.y) - (car.axis === 'v' ? car.x : car.y));
    if (along > 0 && along < 74 && lateral < 30) { want = Math.min(want, other.speed * 0.9); if (along < 46) want = 0; }
  }
  // Yield at intersections to cross traffic already inside the box.
  const nextLine = nextIntersection(car);
  if (nextLine !== null) {
    const centre = roadCenter(nextLine);
    const dCentre = Math.abs(centre - s);
    if (dCentre < 86) {
      const ix = car.axis === 'v' ? car.x : centre, iy = car.axis === 'v' ? centre : car.y;
      for (const other of traffic) {
        if (other !== car && Math.abs(other.x - ix) < 52 && Math.abs(other.y - iy) < 52) { want = 0; break; }
      }
    }
  }
  car.brakeLight = want < car.speed - 4;
  car.speed += clamp(want - car.speed, -340 * dt, car.type.accel * 0.6 * dt);
  if (car.speed < 2 && want === 0) { car.waitT += dt; if (car.waitT > 1.4) car.speed = 26; }
  else car.waitT = 0;
  advanceOnRail(game, car, dt);
}

function nextIntersection(car) {
  const s = car.axis === 'v' ? car.y : car.x;
  const rel = (s - ROAD_W / 2) / BLOCK_PITCH;
  const ahead = car.dir > 0 ? Math.floor(rel) + 1 : Math.ceil(rel) - 1;
  if (ahead < 0 || ahead > 8) return null;
  const centre = roadCenter(ahead);
  if ((centre - s) * car.dir < -1) return null;
  return ahead;
}

function advanceOnRail(game, car, dt) {
  let move = car.speed * dt;
  let guard = 0;
  while (move > 0 && guard++ < 4) {
    const s = car.axis === 'v' ? car.y : car.x;
    const line = nextIntersection(car);
    if (line === null) { // ran off the grid edge: turn around at the border road
      moveAlong(car, move); move = 0; break;
    }
    const centre = roadCenter(line);
    const toCentre = Math.abs(centre - s);
    if (move < toCentre) { moveAlong(car, move); move = 0; break; }
    // Reach the intersection: choose straight / left / right, switch rails.
    moveAlong(car, toCentre); move -= toCentre;
    chooseTurn(game, car, line);
  }
  // Render smoothing: position eases to the rail, angle swings through turns.
  car.renderX += (car.x + car.bumpX - car.renderX) * Math.min(1, dt * 10);
  car.renderY += (car.y + car.bumpY - car.renderY) * Math.min(1, dt * 10);
  car.bumpX *= Math.pow(0.4, dt); car.bumpY *= Math.pow(0.4, dt);
  const targetAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  let d = (targetAngle - car.renderAngle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  car.renderAngle += d * Math.min(1, dt * 7);
  car.angle = targetAngle;
}

function moveAlong(car, d) {
  if (car.axis === 'v') car.y += d * car.dir; else car.x += d * car.dir;
}

function chooseTurn(game, car, crossLine) {
  const r = game.rng.float();
  const crossCentre = car.axis === 'v' ? car.y : car.x; // == roadCenter(crossLine)
  if (r < 0.45) return; // straight on
  const newDir = r < 0.72 ? 1 : -1;
  if (car.axis === 'v') {
    car.axis = 'h'; car.line = crossLine; car.dir = newDir;
    car.y = roadCenter(crossLine) + laneOffsetFor('h', newDir);
    car.x = crossCentre;
  } else {
    car.axis = 'v'; car.line = crossLine; car.dir = newDir;
    car.x = roadCenter(crossLine) + laneOffsetFor('v', newDir);
    car.y = crossCentre;
  }
  car.laneKey = car.axis + car.line + ':' + car.dir;
}

// --- pedestrians -------------------------------------------------------------

export function createPed(x, y, rng) {
  return {
    id: nextId++, x, y, angle: rng.range(0, Math.PI * 2), speed: 0,
    state: 'walk', target: null, panicT: 0, downT: 0, hp: 2,
    shirt: rng.pick(['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#ecf0f1', '#9b59b6', '#fd79a8']),
    pants: rng.pick(['#2c3e50', '#7f8c8d', '#34495e', '#6c5b7b', '#95a5a6']),
    skin: rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    walkPhase: rng.range(0, 6),
  };
}

export function spawnPeds(game) {
  const { world, rng } = game;
  const spots = [];
  for (const poi of Object.values(world.pois)) spots.push(poi);
  for (let i = 0; i < 26; i++) {
    const bx = rng.int(0, 7), by = rng.int(0, 7);
    const ox = roadCenter(bx) + ROAD_W / 2, oy = roadCenter(by) + ROAD_W / 2;
    spots.push({ x: ox + rng.range(0, 326), y: oy - 8 });
  }
  for (const s of spots) game.peds.push(createPed(s.x, s.y, rng));
}

export function updatePeds(game, dt) {
  const { world, rng } = game;
  for (const ped of game.peds) {
    if (ped.state === 'down') { ped.downT -= dt; continue; }
    let wantSpeed = 62;
    if (ped.state === 'flee') {
      ped.panicT -= dt;
      const threat = game.threat;
      if (threat) {
        const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
        ped.angle = a; wantSpeed = 235;
      }
      if (ped.panicT <= 0) ped.state = 'walk';
    } else {
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
        ped.target = pickSidewalkTarget(game, ped);
      }
      if (ped.target) ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    }
    ped.speed += clamp(wantSpeed - ped.speed, -300 * dt, 300 * dt);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.walkPhase += ped.speed * dt * 0.11;
    collideWorld(world, ped, 10, false);
  }
  // Keep the crowd near the player: quietly recycle distant walkers.
  for (const ped of game.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, game.player.x, game.player.y) > 1300) {
      const p = randomRoadPoint(rng, game.player.x, game.player.y, 500, 800);
      ped.x = p.x + 40; ped.y = p.y + 40; ped.target = null;
    }
  }
}

function pickSidewalkTarget(game, ped) {
  const { world, rng } = game;
  if (rng.chance(0.12) && world.plaza) {
    return { x: world.plaza.x + rng.range(20, world.plaza.w - 20), y: world.plaza.y + rng.range(20, world.plaza.h - 20) };
  }
  const bx = clamp(Math.floor(ped.x / 430), 0, 7), by = clamp(Math.floor(ped.y / 430), 0, 7);
  const ox = roadCenter(bx) + ROAD_W / 2 - 8, oy = roadCenter(by) + ROAD_W / 2 - 8;
  const side = rng.int(0, 3), t = rng.float();
  const L = 326 + 16;
  if (side === 0) return { x: ox + t * L, y: oy };
  if (side === 1) return { x: ox + L, y: oy + t * L };
  if (side === 2) return { x: ox + t * L, y: oy + L };
  return { x: ox, y: oy + t * L };
}

export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) { ped.state = 'flee'; ped.panicT = game.rng.range(1.4, 2.6); }
  }
}

// --- effects -----------------------------------------------------------------

export function createFx() { return { parts: [], tracers: [], skids: [], rings: [] }; }

export function spawnParticles(fx, x, y, opts) {
  const n = opts.n || 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (opts.speed || 90) * (0.3 + Math.random() * 0.9);
    fx.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0, maxLife: (opts.life || 0.6) * (0.6 + Math.random() * 0.7),
      size: (opts.size || 4) * (0.6 + Math.random() * 0.8),
      color: opts.color || '#ffffff', drag: opts.drag ?? 2.2, rise: opts.rise || 0,
    });
  }
  if (fx.parts.length > 700) fx.parts.splice(0, fx.parts.length - 700);
}

export function updateFx(fx, dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life += dt;
    if (p.life >= p.maxLife) { fx.parts.splice(i, 1); continue; }
    p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt;
    p.x += p.vx * dt; p.y += p.vy * dt - p.rise * dt;
  }
  for (let i = fx.tracers.length - 1; i >= 0; i--) { fx.tracers[i].life -= dt * 9; if (fx.tracers[i].life <= 0) fx.tracers.splice(i, 1); }
  for (let i = fx.skids.length - 1; i >= 0; i--) { fx.skids[i].life -= dt * 0.12; if (fx.skids[i].life <= 0) fx.skids.splice(i, 1); }
  for (let i = fx.rings.length - 1; i >= 0; i--) { fx.rings[i].t += dt * 1.6; if (fx.rings[i].t >= 1) fx.rings.splice(i, 1); }
}

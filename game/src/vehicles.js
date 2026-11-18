// Cars: the factory that builds them, the arcade physics every car shares, the traffic
// AI that drives the city's cars along their lanes and turns them at intersections,
// the player's driving, and getting in and out — including pulling a driver out of a
// moving car, which the police tend to notice.

import { CAR_COLORS, CAR_MODELS, CITY, PARKED_MODELS, PLAYER, TRAFFIC_MODELS } from './config.js';
import { collideCircle, randomRoadSpawn } from './city.js';
import { makePed } from './people.js';
import { chance, pick } from './random.js';
import { down } from './input.js';
import { audio } from './audio.js';

let nextCarId = 1;

export function makeCar(state, modelId, x, y, angle, opts = {}) {
  const model = CAR_MODELS[modelId];
  const car = {
    id: nextCarId,
    kind: opts.kind ?? 'traffic',
    modelId,
    model,
    color: opts.color ?? pick(state.rng, CAR_COLORS),
    x, y, angle,
    vx: 0, vy: 0,
    hp: model.hp,
    maxHp: model.hp,
    burned: false,
    driver: opts.driver ?? null,
    owner: opts.owner ?? null,
    braking: false,
    throttleVis: 0,
    smokeT: 0,
    ai: opts.ai ?? null,
  };
  nextCarId += 1;
  state.cars.push(car);
  return car;
}

export function carRadius(car) {
  return car.model.len * 0.4;
}

export function carSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

export function spawnParkedCars(state) {
  for (const spot of state.city.parkingSpots) {
    if (!chance(state.rng, 0.55)) continue;
    makeCar(state, pick(state.rng, PARKED_MODELS), spot.x, spot.y, spot.angle, { kind: 'parked' });
  }
  // A few cars left along the plaza and the beachfront.
  for (let i = 0; i < 8; i += 1) {
    const spawn = randomRoadSpawn(state.city, state.rng, 1848, 1848, 200, 2600);
    const car = makeCar(state, pick(state.rng, PARKED_MODELS), spawn.x, spawn.y, 0, { kind: 'parked' });
    car.angle = spawn.axis === 'v' ? Math.PI / 2 : 0;
    car.x += spawn.axis === 'v' ? 0 : 0;
    snapParkedToKerb(state, car, spawn);
  }
}

function snapParkedToKerb(state, car, spawn) {
  // Parked cars sit at the kerb: shift them off the lane toward the nearest block.
  if (spawn.axis === 'v') {
    car.x = state.city.vRoads[spawn.idx] + (spawn.x < state.city.vRoads[spawn.idx] ? -1 : 1) * (CITY.roadW / 2 - 14);
    car.angle = Math.PI / 2;
  } else {
    car.y = state.city.hRoads[spawn.idx] + (spawn.y < state.city.hRoads[spawn.idx] ? -1 : 1) * (CITY.roadW / 2 - 14);
    car.angle = 0;
  }
}

export function spawnTrafficCar(state, minD = 850, maxD = 1300) {
  const spawn = randomRoadSpawn(state.city, state.rng, state.player.x, state.player.y, minD, maxD);
  const angle = spawn.axis === 'v' ? (spawn.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spawn.dir > 0 ? 0 : Math.PI);
  const car = makeCar(state, pick(state.rng, TRAFFIC_MODELS), spawn.x, spawn.y, angle, { kind: 'traffic', driver: 'traffic' });
  car.ai = { axis: spawn.axis, idx: spawn.idx, dir: spawn.dir, decidedKey: '', turn: null, stuckT: 0 };
  return car;
}

// One physics step for any car. control is {throttle: -1..1, steer: -1..1, brake: bool}.
export function stepCarPhysics(state, car, control, dt) {
  const model = car.model;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let fSpeed = car.vx * fx + car.vy * fy;
  let lSpeed = car.vx * -fy + car.vy * fx;

  if (control.throttle > 0) {
    const room = Math.max(0, 1 - fSpeed / model.topSpeed);
    fSpeed += model.accel * control.throttle * room * dt;
  } else if (control.throttle < 0) {
    if (fSpeed > 12) fSpeed -= 350 * dt;
    else fSpeed = Math.max(fSpeed + model.accel * 0.55 * control.throttle * dt, -model.topSpeed * 0.36);
  }
  if (control.brake) {
    const decel = 430 * dt;
    fSpeed = Math.abs(fSpeed) <= decel ? 0 : fSpeed - Math.sign(fSpeed) * decel;
  }
  fSpeed -= fSpeed * 0.32 * dt;
  if (Math.abs(fSpeed) < 3 && control.throttle === 0 && !control.brake) fSpeed = 0;

  const steerAuthority = Math.max(-1, Math.min(1, fSpeed / 58));
  const agility = 2.05 * (1 - Math.min(Math.abs(fSpeed) / model.topSpeed, 1) * 0.42);
  car.angle += control.steer * agility * steerAuthority * (control.brake ? 1.45 : 1) * dt;
  const grip = control.brake ? 2.1 : 8.0;
  lSpeed *= Math.exp(-grip * dt);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * fSpeed + -nfy * lSpeed;
  car.vy = nfy * fSpeed + nfx * lSpeed;
  car.braking = control.brake || control.throttle < 0;
  car.throttleVis = control.throttle;

  const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
  const sub = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    car.x += car.vx * sub;
    car.y += car.vy * sub;
    const before = Math.hypot(car.vx, car.vy);
    const [nx, ny, hit] = collideCircle(state.city, car.x, car.y, carRadius(car));
    car.x = nx;
    car.y = ny;
    if (hit) {
      if (before > 85) {
        state.onCarCrash?.(car, before);
      }
      car.vx *= 0.42;
      car.vy *= 0.42;
    }
  }
}

// Pairwise car-against-car bumps: push apart, trade a little velocity, remember hard hits.
export function collideCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const dx = b.x - a.x;
      if (dx > 60 || dx < -60) continue;
      const dy = b.y - a.y;
      if (dy > 60 || dy < -60) continue;
      const rr = (carRadius(a) + carRadius(b)) * 0.86;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
      if (rel < 0) {
        const impulse = -rel * 0.55;
        a.vx -= ux * impulse;
        a.vy -= uy * impulse;
        b.vx += ux * impulse;
        b.vy += uy * impulse;
        if (rel < -95) state.onCarsCollide?.(a, b, -rel);
      }
    }
  }
}

function lanePoint(city, axis, idx, dir, along) {
  if (axis === 'v') return { x: city.vRoads[idx] - dir * CITY.lane, y: along };
  return { x: along, y: city.hRoads[idx] + dir * CITY.lane };
}

function trafficControl(state, car, dt) {
  const ai = car.ai;
  const city = state.city;
  const control = { throttle: 0, steer: 0, brake: false };
  const pos = car.axis === 'v' ? car.y : car.x;

  // Decide turns a little before each intersection.
  const roads = ai.axis === 'v' ? city.hRoads : city.vRoads;
  for (let j = 0; j < roads.length; j += 1) {
    const ahead = (roads[j] - pos) * ai.dir;
    const key = `${ai.idx},${j}`;
    if (ahead > 0 && ahead < 118 && ai.decidedKey !== key && !ai.turn) {
      ai.decidedKey = key;
      if (chance(state.rng, 0.42)) {
        ai.turn = { axis: ai.axis === 'v' ? 'h' : 'v', idx: j, dir: chance(state.rng, 0.5) ? 1 : -1, t: 0 };
      }
    }
  }

  let target;
  let cruise = car.model.cruise;
  if (ai.turn) {
    ai.turn.t += dt;
    const centre = ai.axis === 'v'
      ? { x: city.vRoads[ai.idx], y: city.hRoads[ai.turn.idx] }
      : { x: city.vRoads[ai.turn.idx], y: city.hRoads[ai.idx] };
    const newAlong = (ai.turn.axis === 'v' ? centre.x : centre.y) + ai.turn.dir * 185;
    target = lanePoint(city, ai.turn.axis, ai.turn.idx, ai.turn.dir, newAlong);
    cruise *= 0.55;
    const distCentre = Math.hypot(car.x - centre.x, car.y - centre.y);
    if (distCentre < 30 || ai.turn.t > 1.7) {
      ai.axis = ai.turn.axis;
      ai.idx = ai.turn.idx;
      ai.dir = ai.turn.dir;
      ai.turn = null;
    }
  } else {
    target = lanePoint(city, ai.axis, ai.idx, ai.dir, pos + ai.dir * 170);
  }

  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  control.steer = Math.max(-1, Math.min(1, diff * 2.4));

  // Slow for the car or person ahead.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const probeX = car.x + fx * (car.model.len * 0.5 + 36);
  const probeY = car.y + fy * (car.model.len * 0.5 + 36);
  let blocked = false;
  for (const other of state.cars) {
    if (other === car) continue;
    if (Math.abs(other.x - probeX) < 30 && Math.abs(other.y - probeY) < 30) { blocked = true; break; }
  }
  if (!blocked && !state.player.car) {
    if (Math.abs(state.player.x - probeX) < 24 && Math.abs(state.player.y - probeY) < 24) blocked = true;
  }
  if (!blocked) {
    for (const ped of state.peds) {
      if (Math.abs(ped.x - probeX) < 22 && Math.abs(ped.y - probeY) < 22) { blocked = true; break; }
    }
  }

  const speed = Math.abs(carSpeed(car));
  if (blocked) {
    control.throttle = 0;
    control.brake = speed > 12;
  } else if (speed < cruise - 6) {
    control.throttle = 1;
  } else if (speed > cruise + 14) {
    control.brake = true;
  }
  if (Math.abs(diff) > 0.65 && speed > cruise * 0.6) control.brake = true;

  if (speed < 5 && control.throttle > 0) ai.stuckT += dt;
  else ai.stuckT = 0;
  return control;
}

const TRAFFIC_TARGET = 24;

export function updateTraffic(state, dt) {
  let live = 0;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.driver !== 'traffic') continue;
    live += 1; // recycled cars are still traffic: count them before moving them
    const dist = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (dist > 1550 || (car.ai && car.ai.stuckT > 3.5)) {
      recycleTrafficCar(state, car);
      continue;
    }
    stepCarPhysics(state, car, trafficControl(state, car, dt), dt);
  }
  for (let i = live; i < TRAFFIC_TARGET; i += 1) spawnTrafficCar(state);
}

function recycleTrafficCar(state, car) {
  const spawn = randomRoadSpawn(state.city, state.rng, state.player.x, state.player.y, 880, 1350);
  car.x = spawn.x;
  car.y = spawn.y;
  car.vx = 0;
  car.vy = 0;
  car.angle = spawn.axis === 'v' ? (spawn.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spawn.dir > 0 ? 0 : Math.PI);
  car.hp = car.maxHp;
  car.burned = false;
  car.color = pick(state.rng, CAR_COLORS);
  car.ai = { axis: spawn.axis, idx: spawn.idx, dir: spawn.dir, decidedKey: '', turn: null, stuckT: 0 };
}

export function updatePlayerCar(state, dt) {
  const car = state.player.car;
  if (!car) return;
  const control = {
    throttle: (down('KeyW', 'ArrowUp') ? 1 : 0) + (down('KeyS', 'ArrowDown') ? -1 : 0),
    steer: (down('KeyA', 'ArrowLeft') ? -1 : 0) + (down('KeyD', 'ArrowRight') ? 1 : 0),
    brake: down('Space'),
  };
  stepCarPhysics(state, car, control, dt);
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
}

// Enter the nearest usable car, or get out of the current one. Returns a note for the HUD.
export function tryEnterExit(state) {
  const player = state.player;
  if (player.car) {
    const car = player.car;
    car.driver = null;
    if (car.kind === 'traffic') car.kind = 'parked';
    player.car = null;
    const side = Math.PI / 2;
    for (const s of [1, -1]) {
      const px = car.x + Math.cos(car.angle + side * s) * (car.model.wid / 2 + 15);
      const py = car.y + Math.sin(car.angle + side * s) * (car.model.wid / 2 + 15);
      const [nx, ny] = collideCircle(state.city, px, py, PLAYER.radius);
      player.x = nx;
      player.y = ny;
      break;
    }
    return 'exit';
  }

  let best = null;
  let bestD = PLAYER.enterRange;
  for (const car of state.cars) {
    if (car.burned || car.driver === 'police' || car.driver === 'player') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return null;

  if (best.driver === 'traffic') {
    // Pull the driver out: they land on the pavement and run.
    const driver = makePed(state, best.x + 20, best.y + 10, { kind: 'ped' });
    driver.state = 'flee';
    driver.fleeFrom = { x: player.x, y: player.y };
    driver.fleeT = 3;
    best.driver = null;
  }
  const wasParked = best.kind === 'parked';
  best.driver = 'player';
  player.car = best;
  player.x = best.x;
  player.y = best.y;
  if (best.owner !== 'mari') {
    state.stats.stolen += 1;
    state.crime('carjack', best.x, best.y);
  }
  if (wasParked) best.kind = 'traffic'; // driven cars join the traffic pool bookkeeping
  audio.uiClick();
  return 'enter';
}

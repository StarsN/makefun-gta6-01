// The Coral Bay PD: a heat-based wanted system. Crimes only count when someone sees
// or hears them; heat fades while nobody is watching. Police cars spawn on the roads
// around the player and hunt — and when the player is on foot, officers get out and
// come on foot, shooting at three stars and up, and pinning the player for an arrest
// whenever they can hold them still.

import { WANTED } from './config.js';
import { nearestRoadPoint, randomRoadSpawn, collideCircle } from './city.js';
import { officerShoot } from './combat.js';
import { alertPeds, makePed } from './people.js';
import { carSpeed, makeCar, stepCarPhysics } from './vehicles.js';

const CRIME_HEAT = {
  carjack: 60,
  hitped: 70,
  killped: 130,
  hitcar: 25,
  hitcop: 85,
  shooting: 45,
  assaultcop: 60,
  killcop: 200,
  explosion: 110,
};

const STAR_THRESHOLDS = [1, 90, 180, 290, 410];
const LOUD = new Set(['shooting', 'explosion']);

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars += 1;
  return Math.min(WANTED.maxStars, stars);
}

function witnessedBy(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) return true;
  }
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    if (Math.hypot(car.x - x, car.y - y) < radius + 160) return true;
  }
  return false;
}

export function commitCrime(state, kind, x, y) {
  const heat = CRIME_HEAT[kind] ?? 0;
  if (heat <= 0) return;
  const seen = witnessedBy(state, x, y, 340);
  if (!seen && !LOUD.has(kind)) return;
  const before = state.wanted.stars;
  state.wanted.heat += seen ? heat : heat * 0.6;
  state.wanted.lastCrimeAt = state.time;
  if (kind === 'killped' || kind === 'hitped' || kind === 'explosion') alertPeds(state, x, y, 300);
  const after = starsForHeat(state.wanted.heat);
  if (after > before) state.wanted.flashT = 1.2;
}

// Directly raise the heat (a tip-off, a camera, a mission going loud).
export function addHeat(state, amount) {
  const before = state.wanted.stars;
  state.wanted.heat += amount;
  state.wanted.lastCrimeAt = state.time;
  if (starsForHeat(state.wanted.heat) > before) state.wanted.flashT = 1.2;
}

function policeTargetCount(state) {
  const stars = state.wanted.stars;
  if (stars <= 0) return 0;
  return Math.min(6, stars + 1);
}

function spawnPoliceCar(state) {
  const spawn = randomRoadSpawn(state.city, state.rng, state.player.x, state.player.y, 760, 1150);
  const angle = spawn.axis === 'v' ? (spawn.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spawn.dir > 0 ? 0 : Math.PI);
  const car = makeCar(state, 'interceptor', spawn.x, spawn.y, angle, { kind: 'police', driver: 'police', color: '#f1f2f6' });
  car.officerOut = false;
  car.officerCd = 0;
  return car;
}

function adoptTrafficAi(state, car) {
  // A police car that loses the player melts back into traffic.
  let axis = 'v';
  let idx = 0;
  let best = Infinity;
  state.city.vRoads.forEach((cx, i) => {
    const d = Math.abs(car.x - cx);
    if (d < best) { best = d; axis = 'v'; idx = i; }
  });
  state.city.hRoads.forEach((cy, i) => {
    const d = Math.abs(car.y - cy);
    if (d < best) { best = d; axis = 'h'; idx = i; }
  });
  const dir = axis === 'v' ? (Math.sin(car.angle) >= 0 ? 1 : -1) : (Math.cos(car.angle) >= 0 ? 1 : -1);
  car.kind = 'traffic';
  car.driver = 'traffic';
  car.ai = { axis, idx, dir, decidedKey: '', turn: null, stuckT: 0 };
}

export function updateWanted(state, dt) {
  const wanted = state.wanted;
  const player = state.player;

  // Who can see the player right now?
  let seen = false;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    if (Math.hypot(car.x - player.x, car.y - player.y) < 560) { seen = true; break; }
  }
  if (!seen) {
    for (const ped of state.peds) {
      if (ped.kind !== 'officer' || ped.state === 'down') continue;
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 430) { seen = true; break; }
    }
  }
  wanted.seenNow = seen;
  if (seen) wanted.lastSeenAt = state.time;

  // A mission can hold the heat at a floor (the finale's running chase).
  if (state.wantedFloor > 0) {
    const floorHeat = STAR_THRESHOLDS[state.wantedFloor - 1] + 5;
    if (wanted.heat < floorHeat) wanted.heat = floorHeat;
  }

  if (!seen && state.time - wanted.lastSeenAt > WANTED.unseenGrace && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - (4 + wanted.stars * 2.4) * dt);
  }
  const newStars = starsForHeat(wanted.heat);
  if (newStars !== wanted.stars) wanted.stars = newStars;
  if (wanted.flashT > 0) wanted.flashT -= dt;

  // Keep the response at strength; retire units that fall too far behind.
  let policeCars = state.cars.filter((car) => car.kind === 'police');
  for (const car of policeCars) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d > 1750) {
      state.cars.splice(state.cars.indexOf(car), 1);
    } else if (wanted.stars === 0 && d > 620) {
      adoptTrafficAi(state, car);
    }
  }
  policeCars = state.cars.filter((car) => car.kind === 'police');
  const target = policeTargetCount(state);
  for (let i = policeCars.length; i < target; i += 1) spawnPoliceCar(state);

  // The arrest meter: pinned by a car, or held by an officer.
  let pinning = 0;
  if (player.car) {
    if (Math.abs(carSpeed(player.car)) < 26) {
      for (const car of policeCars) {
        if (Math.hypot(car.x - player.x, car.y - player.y) < 84) { pinning = 1; break; }
      }
    }
  } else {
    for (const ped of state.peds) {
      if (ped.kind === 'officer' && ped.state !== 'down' && Math.hypot(ped.x - player.x, ped.y - player.y) < 34) {
        pinning = 1.25;
        break;
      }
    }
    if (!pinning) {
      for (const car of policeCars) {
        if (Math.hypot(car.x - player.x, car.y - player.y) < 48) { pinning = 0.55; break; }
      }
    }
  }
  if (pinning > 0 && wanted.stars > 0) {
    wanted.bust += (dt / WANTED.bustSeconds) * pinning;
    if (wanted.bust >= 1) {
      wanted.bust = 0;
      state.doBusted();
      return;
    }
  } else {
    wanted.bust = Math.max(0, wanted.bust - dt * 0.55);
  }
}

function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function updatePolice(state, dt) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.driver !== 'police') continue;
    car.officerCd = Math.max(0, (car.officerCd ?? 0) - dt);
    if (state.wanted.stars === 0) {
      // No longer wanted: units stand down where they are.
      stepCarPhysics(state, car, { throttle: 0, steer: 0, brake: true }, dt);
      continue;
    }
    const dist = Math.hypot(player.x - car.x, player.y - car.y);

    // Send the officer out when the player is on foot and close.
    if (!car.officerOut && !player.car && dist < 130 && Math.abs(carSpeed(car)) < 42 && car.officerCd <= 0) {
      const officer = makePed(state, car.x + 18, car.y, { kind: 'officer', hp: 100, color: '#2f3542', carRef: car });
      officer.state = 'chase';
      car.officerOut = true;
      car.officerRef = officer;
    }
    if (car.officerOut) {
      stepCarPhysics(state, car, { throttle: 0, steer: 0, brake: true }, dt);
      continue;
    }

    let tx = player.x + (player.car ? player.car.vx * 0.32 : 0);
    let ty = player.y + (player.car ? player.car.vy * 0.32 : 0);
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    if (pointInBuilding(state.city, car.x + fx * 74, car.y + fy * 74)) {
      const road = nearestRoadPoint(state.city, player.x, player.y);
      tx = road.x;
      ty = road.y;
    }
    const desired = Math.atan2(ty - car.y, tx - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const control = { throttle: 0, steer: Math.max(-1, Math.min(1, diff * 2.6)), brake: false };
    const speed = Math.abs(carSpeed(car));
    if (Math.abs(diff) > 2.35 && dist < 78) {
      control.throttle = -1; // back up and come again
    } else if (dist > 46) {
      control.throttle = 1;
    } else if (speed > 60) {
      control.brake = true;
    }
    if (Math.abs(diff) > 0.9 && speed > 190) control.brake = true;
    stepCarPhysics(state, car, control, dt);
  }
}

export function updateOfficers(state, dt) {
  const player = state.player;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const officer = state.peds[i];
    if (officer.kind !== 'officer') continue;
    const car = officer.carRef;
    if (officer.state === 'down') continue;
    if (!car || !state.cars.includes(car)) {
      state.peds.splice(i, 1);
      continue;
    }
    const distPlayer = Math.hypot(player.x - officer.x, player.y - officer.y);
    const distCar = Math.hypot(car.x - officer.x, car.y - officer.y);

    // Back to the car when the chase is over or the player has driven off.
    if (state.wanted.stars === 0 || (player.car && distPlayer > 430)) {
      if (distCar < 20) {
        car.officerOut = false;
        car.officerRef = null;
        car.officerCd = 6;
        state.peds.splice(i, 1);
        continue;
      }
      moveOfficer(state, officer, car.x, car.y, 175, dt);
      continue;
    }

    officer.angle = Math.atan2(player.y - officer.y, player.x - officer.x);
    const armed = state.wanted.stars >= 3;
    if (armed && distPlayer < 380 && distPlayer > 64) {
      officer.shootCd -= dt;
      officer.speed = 0;
      if (officer.shootCd <= 0) {
        officer.shootCd = 1.15;
        officerShoot(state, officer);
      }
    } else if (distPlayer > 24) {
      moveOfficer(state, officer, player.x, player.y, 172, dt);
    } else {
      officer.speed = 0;
    }
  }
}

function moveOfficer(state, officer, tx, ty, speed, dt) {
  const dx = tx - officer.x;
  const dy = ty - officer.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    officer.speed = 0;
    return;
  }
  officer.angle = Math.atan2(dy, dx);
  officer.speed = speed;
  const [nx, ny] = collideCircle(state.city, officer.x + (dx / d) * speed * dt, officer.y + (dy / d) * speed * dt, 9);
  officer.x = nx;
  officer.y = ny;
  officer.walkPhase += dt * speed * 0.075;
}

// Stand the whole force down: units melt into traffic, officers vanish into their
// cars, the arrest meter empties. Used when the player is taken in or treated.
export function clearPolice(state) {
  for (const car of state.cars) {
    if (car.kind === 'police') {
      car.officerOut = false;
      car.officerRef = null;
      adoptTrafficAi(state, car);
    }
  }
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    if (state.peds[i].kind === 'officer') state.peds.splice(i, 1);
  }
  state.wanted.bust = 0;
}

export function policeNearLevel(state) {
  // 0..1 for the siren: louder the closer the nearest unit.
  let best = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    best = Math.min(best, Math.hypot(car.x - state.player.x, car.y - state.player.y));
  }
  for (const ped of state.peds) {
    if (ped.kind !== 'officer') continue;
    best = Math.min(best, Math.hypot(ped.x - state.player.x, ped.y - state.player.y));
  }
  if (best === Infinity) return 0;
  return Math.max(0, Math.min(1, 1 - best / 640));
}

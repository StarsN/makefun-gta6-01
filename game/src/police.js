// police.js — the CBPD: a heat-based wanted system (crimes count when they
// are witnessed or heard, heat cools when nobody is watching), patrol cars
// that pursue with real driving physics, and officers who bail out to chase
// and, from three stars, shoot. Standing close under arrest fills the bust
// meter; a full meter is a BUSTED screen.

import { HEAT_PER_STAR, MAX_STARS } from './config.js';
import { clamp, dist, angleTo } from './rng.js';
import { createCar, scarePeds } from './entities.js';
import { randomRoadPoint, losBlocked, collideWorld } from './world.js';

export function starsForHeat(heat) {
  return clamp(Math.ceil(heat / HEAT_PER_STAR), 0, MAX_STARS);
}

const CRIME_HEAT = {
  shot: { heat: 16, radius: 380 },
  carjack: { heat: 46, radius: 250 },
  hitPed: { heat: 88, radius: 300 },
  hitCar: { heat: 30, radius: 240 },
  hitCop: { heat: 72, radius: 460 },
  explosion: { heat: 64, radius: 520 },
  theft: { heat: 38, radius: 250 },
};

// Report a crime at (x, y). Full heat only when a pedestrian or officer can
// see it; a fraction when it is merely heard / noticed at the edge of range.
export function reportCrime(game, kind, x, y) {
  const def = CRIME_HEAT[kind];
  if (!def) return;
  let witnessed = false, noticed = false;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < def.radius * 0.62 && !losBlocked(game.world, ped.x, ped.y, x, y)) witnessed = true;
    else if (d < def.radius) noticed = true;
  }
  for (const unit of game.units) {
    const d = dist(unit.car.x, unit.car.y, x, y);
    if (d < def.radius + 140) witnessed = true;
    else if (d < def.radius + 260) noticed = true;
  }
  if (game.missionHeatFloor > 0) witnessed = true; // story heat: the city is watching
  if (witnessed) game.heat = Math.min(500, game.heat + def.heat);
  else if (noticed) game.heat = Math.min(500, game.heat + def.heat * 0.35);
  if (kind === 'shot' || kind === 'explosion') scarePeds(game, x, y, 190);
}

export function desiredCopCars(stars) {
  return stars <= 0 ? 0 : Math.min(6, 1 + stars);
}

export function updatePolice(game, dt) {
  const { player, world, rng } = game;
  // Are we seen right now? Police eyes matter most; nearby peds phone it in.
  let seen = false;
  for (const unit of game.units) {
    if (dist(unit.car.x, unit.car.y, player.x, player.y) < 540 && !losBlocked(world, unit.car.x, unit.car.y, player.x, player.y)) seen = true;
    if (unit.officer && dist(unit.officer.x, unit.officer.y, player.x, player.y) < 300) seen = true;
  }
  if (!seen) {
    for (const ped of game.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, player.x, player.y) < 170) { seen = true; break; }
    }
  }
  game.seen = seen;
  if (game.heat < game.missionHeatFloor) game.heat = game.missionHeatFloor;
  if (!seen && game.heat > game.missionHeatFloor) game.heat = Math.max(game.missionHeatFloor, game.heat - 6.5 * dt);
  game.stars = starsForHeat(game.heat);

  // Spawn / retire units to match the wanted level.
  const want = desiredCopCars(game.stars);
  const active = game.units.filter((u) => !u.leaving);
  if (active.length < want && rng.chance(0.5)) {
    const p = randomRoadPoint(rng, player.x, player.y, 640, 880);
    const car = createCar('interceptor', p.x, p.y, 0, 'police', rng);
    car.color = '#f4f6f8'; car.driver = true;
    game.cars.push(car);
    game.units.push({ car, officer: null, stuckT: 0, reverseT: 0, shootT: rng.range(0.5, 1.4), leaving: false });
  }
  for (const unit of game.units) if (game.units.filter((u) => !u.leaving).length > want && !unit.leaving) unit.leaving = true;

  for (let i = game.units.length - 1; i >= 0; i--) {
    const unit = game.units[i];
    updateUnit(game, unit, dt);
    const d = dist(unit.car.x, unit.car.y, player.x, player.y);
    if ((unit.leaving && d > 900) || (game.stars === 0 && d > 1000)) {
      game.cars.splice(game.cars.indexOf(unit.car), 1);
      game.units.splice(i, 1);
    }
  }
  updateBust(game, dt);
}

function updateUnit(game, unit, dt) {
  const { player, world } = game;
  const car = unit.car;
  if (car.wrecked) { updateOfficer(game, unit, dt); return; }
  const d = dist(car.x, car.y, player.x, player.y);
  const playerSlow = !player.car || Math.abs(player.car.speed) < 70;

  if (unit.leaving) { driveCar(game, car, car.x + Math.cos(car.angle) * 300, car.y + Math.sin(car.angle) * 300, dt, 0.7); return; }

  if (!unit.officer && d < 150 && playerSlow && game.stars >= 1) {
    // Officer bails out to make the arrest on foot.
    unit.officer = { x: car.x + 20, y: car.y + 10, angle: 0, hp: 3, shootT: 0.8, walkPhase: 0, unit };
    car.driver = false; car.speed = 0;
    game.officers.push(unit.officer);
  }
  if (unit.officer) {
    car.speed += clamp(0 - car.speed, -300 * dt, 300 * dt);
    updateOfficer(game, unit, dt);
    // Back in the car when the player runs in a fast car.
    if (player.car && Math.abs(player.car.speed) > 130 && d > 240) {
      game.officers.splice(game.officers.indexOf(unit.officer), 1);
      unit.officer = null; car.driver = true;
    }
    return;
  }
  // Pursuit: aim ahead of the player's motion.
  const lead = player.car ? 0.45 : 0.1;
  const tx = player.x + player.vx * lead, ty = player.y + player.vy * lead;
  driveCar(game, car, tx, ty, dt, 1);
  collideWorld(world, car, 24, true);
}

function driveCar(game, car, tx, ty, dt, aggression) {
  const desired = angleTo(car.x, car.y, tx, ty);
  let diff = (desired - car.angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    car.speed += clamp(-190 - car.speed, -300 * dt, 300 * dt);
    car.angle -= Math.sign(diff || 1) * 1.9 * dt;
  } else {
    const steer = clamp(diff, -1, 1);
    const turnRate = 2.5 * (car.speed >= 0 ? 1 : -1);
    car.angle += steer * turnRate * dt * clamp(Math.abs(car.speed) / 130, 0.25, 1);
    const target = Math.abs(diff) > 2.2 ? 60 : car.type.topSpeed * (0.72 + 0.26 * aggression);
    car.speed += clamp(target - car.speed, -420 * dt, car.type.accel * dt);
    if (Math.abs(car.speed) < 12 && Math.abs(diff) > 0.4) { car.stuckT += dt; if (car.stuckT > 0.9) { car.reverseT = 0.55; car.stuckT = 0; } }
    else car.stuckT = Math.max(0, car.stuckT - dt);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.renderX = car.x; car.renderY = car.y;
  car.renderAngle += ((car.angle - car.renderAngle + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
}

function updateOfficer(game, unit, dt) {
  const off = unit.officer;
  if (!off) return;
  const { player, world, rng } = game;
  const d = dist(off.x, off.y, player.x, player.y);
  const canShoot = game.stars >= 3 && d > 90 && d < 310 && !losBlocked(world, off.x, off.y, player.x, player.y);
  if (canShoot) {
    off.shootT -= dt;
    off.angle = angleTo(off.x, off.y, player.x, player.y);
    if (off.shootT <= 0) {
      off.shootT = rng.range(0.85, 1.5);
      game.fx.tracers.push({ x1: off.x, y1: off.y, x2: player.x, y2: player.y, life: 1, hostile: true });
      game.sound.shot();
      const hitChance = clamp(0.62 - d / 620 - Math.abs(player.vx) / 900, 0.12, 0.6);
      if (rng.chance(hitChance)) game.damagePlayer(rng.range(4, 9), off.x, off.y);
    }
  } else if (d > 24) {
    off.angle = angleTo(off.x, off.y, player.x, player.y);
    const sp = 243;
    off.x += Math.cos(off.angle) * sp * dt;
    off.y += Math.sin(off.angle) * sp * dt;
    off.walkPhase += dt * 11;
    collideWorld(world, off, 11, false);
  }
  if (off.hp <= 0) {
    game.officers.splice(game.officers.indexOf(off), 1);
    unit.officer = null;
    reportCrime(game, 'hitCop', off.x, off.y);
  }
}

function updateBust(game, dt) {
  const { player } = game;
  let pressure = 0;
  if (game.stars > 0) {
    for (const off of game.officers) if (dist(off.x, off.y, player.x, player.y) < 34) pressure = Math.max(pressure, 1 / 1.35);
    if (player.car && Math.abs(player.car.speed) < 26) {
      for (const unit of game.units) if (dist(unit.car.x, unit.car.y, player.x, player.y) < 58) pressure = Math.max(pressure, 1 / 1.8);
    }
    if (!player.car) {
      for (const unit of game.units) if (unit.car.driver && dist(unit.car.x, unit.car.y, player.x, player.y) < 40) pressure = Math.max(pressure, 1 / 1.8);
    }
  }
  if (pressure > 0) game.bust = Math.min(1, game.bust + pressure * dt);
  else game.bust = Math.max(0, game.bust - dt * 1.4);
  if (game.bust >= 1 && game.state === 'playing') game.doBusted();
}

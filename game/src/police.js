// The CBPD: a heat-based five-star wanted system. Crimes only count when
// somebody sees or hears them; heat cools while nobody is watching.
// Police cars hunt in packs scaled to the star level, officers bail out
// to chase on foot, shoot from three stars, and pin the player into a
// bust when they get close for long enough.

import { HEAT_MAX, HEAT_DECAY, UNSEEN_DELAY, POLICE_WANTED, PITCH, GRID } from './config.js';
import { clamp, angleDelta, dist, rand } from './random.js';
import { collideWorld, nearestIntersection } from './city.js';
import { makeCar, stepCarPhysics, forwardSpeed } from './vehicles.js';
import { makePed, scarePeds } from './people.js';
import { fireBullet } from './combat.js';

export const starsFor = (heat) => (heat <= 0 ? 0 : Math.min(5, Math.ceil(heat / 100)));

// Called by every crime in the game. If a citizen, officer or police car
// is inside the earshot/eyeshot radius, the heat lands; otherwise the
// crime never happened as far as the CBPD knows.
export function witnessCrime(g, x, y, amount, radius) {
  let seen = false;
  for (const p of g.peds) if (!p.dead && dist(p.x, p.y, x, y) < radius) { seen = true; break; }
  if (!seen) for (const c of g.cars) if (c.kind === 'police' && !c.dead && dist(c.x, c.y, x, y) < radius) { seen = true; break; }
  if (amount >= 40) scarePeds(g, x, y, Math.min(radius, 300));
  if (!seen) return false;
  if (g.shotMode) return true; // a posed diorama keeps the heat it was posed with
  if (amount > 0) {
    g.heat = Math.min(HEAT_MAX, g.heat + amount);
    g.lastCrimeT = g.time;
  }
  return true;
}

function spawnPoliceCar(g) {
  const a = rand(g.rng, 0, Math.PI * 2);
  const px = clamp(g.player.x + Math.cos(a) * rand(g.rng, 540, 700), 60, 2340);
  const py = clamp(g.player.y + Math.sin(a) * rand(g.rng, 540, 700), 60, 2340);
  const inter = nearestIntersection(px, py);
  const car = makeCar(g.rng, 'police', 'interceptor', inter.x, inter.y, Math.atan2(g.player.y - inter.y, g.player.x - inter.x), '#eef1f4');
  car.officerOut = false;
  g.cars.push(car);
}

function updatePoliceCar(g, car, dt) {
  const target = g.player.car || g.player;
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 360) g.lastSeenT = g.time;
  if (g.heat <= 0) {
    car.input.throttle = 0; car.input.brake = forwardSpeed(car) > 4;
    stepCarPhysics(g, car, dt);
    return;
  }
  // Far away, buildings block a straight line: route intersection to
  // intersection along the grid first, then hunt directly when close.
  let steerTarget = target;
  if (d > 240) {
    const dest = nearestIntersection(target.x, target.y);
    const here = nearestIntersection(car.x, car.y);
    let best = null, bestScore = Infinity;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = here.i + di, nj = here.j + dj;
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
      const cand = { x: ni * PITCH, y: nj * PITCH };
      const score = Math.abs(cand.x - dest.x) + Math.abs(cand.y - dest.y) + dist(car.x, car.y, cand.x, cand.y) * 0.3;
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    if (best) steerTarget = best;
  }
  const want = Math.atan2(steerTarget.y - car.y, steerTarget.x - car.x);
  const delta = angleDelta(car.angle, want);
  const f = forwardSpeed(car);
  car.input.handbrake = false;
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    car.input.throttle = -0.85; car.input.steer = clamp(-delta * 2.2, -1, 1);
  } else {
    car.input.steer = clamp(delta * 2.4, -1, 1);
    if (Math.abs(delta) > 2.5 && d < 90) { car.reverseT = 0.5; }
    if (d > 240) {
      car.input.throttle = 1; car.input.brake = false;
    } else if (!g.player.car) {
      // On foot she is an arrest, not a target: ease in, pull up short, get out.
      car.input.throttle = d > 80 ? clamp((d - 70) / 200, 0.2, 0.95) : 0;
      car.input.brake = d < 150 && f > 55;
    } else {
      car.input.throttle = d > 55 ? 1 : 0.3;
      car.input.brake = d < 34 && f > 60;
    }
  }
  if (Math.abs(f) < 6 && car.input.throttle > 0) { car.stuckT += dt; if (car.stuckT > 1.5) { car.reverseT = 0.6; car.stuckT = 0; } }
  else car.stuckT = 0;
  stepCarPhysics(g, car, dt);
  // Bail out and chase on foot when the player is slow, close, or the car is dying.
  const playerSlow = !g.player.car || Math.abs(forwardSpeed(g.player.car)) < 34;
  if (!car.officerOut && ((playerSlow && d < 108) || car.health < 30)) {
    car.officerOut = true;
    const off = makePed(g.rng, car.x + 14, car.y + 10, 'officer');
    off.car = car;
    g.peds.push(off);
  }
}

function updateOfficer(g, off, dt) {
  if (off.dead) return;
  const target = g.player.car || g.player;
  const d = dist(off.x, off.y, target.x, target.y);
  if (d < 340) g.lastSeenT = g.time;
  const stars = starsFor(g.heat);
  const shootRange = stars >= 3 ? 235 : 0;
  let mx = 0, my = 0;
  if (d > (shootRange ? 175 : 15)) {
    mx = (target.x - off.x) / (d || 1); my = (target.y - off.y) / (d || 1);
    off.angle = Math.atan2(my, mx);
  } else {
    off.angle = Math.atan2(target.y - off.y, target.x - off.x);
  }
  if (mx || my) {
    const res = collideWorld(g.city, off.x + mx * 208 * dt, off.y + my * 208 * dt, 9);
    off.x = res.x; off.y = res.y;
  }
  if (shootRange && d < shootRange && g.heat > 0) {
    off.shootCd -= dt;
    if (off.shootCd <= 0) {
      off.shootCd = rand(g.rng, 0.75, 1.25);
      fireBullet(g, off.x, off.y, off.angle, true);
      if (d < 460) g.sound.shot();
    }
  }
  // Pinning the player fills the bust meter.
  const pinRange = g.player.car ? 48 : 30;
  const playerPinned = !g.player.car || Math.abs(forwardSpeed(g.player.car)) < 12;
  if (d < pinRange && playerPinned && g.heat > 0) g.bust = Math.min(1, g.bust + dt / 1.6);
}

export function updateWanted(g, dt) {
  const stars = starsFor(g.heat);
  // Cooling off: only once no police unit has seen the player for a while.
  if (g.heat > 0 && g.time - g.lastSeenT > UNSEEN_DELAY) {
    g.heat = Math.max(g.heatFloor || 0, g.heat - HEAT_DECAY * dt * (1 + (5 - stars) * 0.12));
  }
  if (g.heatFloor) g.heat = Math.max(g.heat, g.heatFloor);
  // Reinforcements.
  const want = POLICE_WANTED[starsFor(g.heat)];
  const active = g.cars.filter((c) => c.kind === 'police' && !c.dead).length;
  g.spawnT -= dt;
  if (active < want && g.spawnT <= 0) {
    g.spawnT = 0.55;
    spawnPoliceCar(g);
    if (want - active >= 4) spawnPoliceCar(g); // a big jump in stars answers in pairs
  }
  // Police cars boxed around a stopped player also fill the bust meter.
  if (g.player.car && Math.abs(forwardSpeed(g.player.car)) < 10 && g.heat > 0) {
    for (const c of g.cars) if (c.kind === 'police' && !c.dead && dist(c.x, c.y, g.player.car.x, g.player.car.y) < 56) { g.bust = Math.min(1, g.bust + dt / 2.4); break; }
  }
  if (g.bust > 0) g.bust = Math.max(0, g.bust - dt * 0.22);
  for (const car of g.cars) if (car.kind === 'police' && !car.dead) updatePoliceCar(g, car, dt);
  for (const p of g.peds) if (p.role === 'officer') updateOfficer(g, p, dt);
  if (g.bust >= 1) { g.doBusted(); return; }
  // Clean-up: when the heat is gone, distant units drift out of the world.
  if (g.heat <= 0) {
    g.cars = g.cars.filter((c) => c.kind !== 'police' || c.dead || dist(c.x, c.y, g.player.x, g.player.y) < 850);
    g.peds = g.peds.filter((p) => p.role !== 'officer' || p.dead || dist(p.x, p.y, g.player.x, g.player.y) < 700);
  }
  // Siren follows the nearest unit.
  let nearest = 1e9;
  for (const c of g.cars) if (c.kind === 'police' && !c.dead) nearest = Math.min(nearest, dist(c.x, c.y, g.player.x, g.player.y));
  g.sound.sirenLevel(nearest, g.heat > 0 && nearest < 900);
}

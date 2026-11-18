// Cars: the catalogue in motion. One arcade physics step serves the
// player, traffic and police; what differs is who writes car.input.
// Traffic follows lanes between intersections and brakes for obstacles;
// wrecked cars smoke, burn and finally explode.

import { CAR_MODELS, CAR_COLORS, PITCH, GRID, LANE_OFF, CITY_EDGE } from './config.js';
import { clamp, angleDelta, dist, pick, rand } from './random.js';
import { collideWorld, onRoad } from './city.js';
import { burst, smoke, fire } from './fx.js';

let nextCarId = 1;

export function makeCar(rng, kind, modelKey, x, y, angle, color) {
  const spec = CAR_MODELS[modelKey];
  return {
    id: nextCarId++, kind, model: modelKey, spec,
    color: color || pick(rng, CAR_COLORS),
    x, y, angle, vx: 0, vy: 0,
    health: spec.hp, maxHealth: spec.hp,
    input: { throttle: 0, steer: 0, brake: false, handbrake: false },
    driverOut: false, dead: false, smokeT: 0, fireT: 0,
    cruise: rand(rng, 120, 185), nav: null, stuckT: 0, reverseT: 0, honkT: rand(rng, 2, 9),
  };
}

export function forwardSpeed(car) { return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle); }
export function speedKmh(car) { return Math.round(Math.abs(forwardSpeed(car)) * 0.36); }

export function damageCar(g, car, amount, sx, sy) {
  if (car.dead) return;
  car.health -= amount;
  if (sx !== undefined) burst(g, sx, sy, amount > 14 ? 10 : 5, '#ffd76a', 150, 0.35, 2.5);
  if (car.health <= 0) explodeCar(g, car);
}

export function explodeCar(g, car) {
  if (car.dead) return;
  car.dead = true; car.health = 0;
  burst(g, car.x, car.y, 42, '#ff9a3c', 300, 0.7, 5);
  burst(g, car.x, car.y, 24, '#5a5a5a', 170, 1.1, 6);
  g.shake = Math.max(g.shake, 13);
  g.sound.explosion();
  // An explosion is heard all over the block — but it only lands on Rae's
  // record when she caused it (her car, her bullets, her driving).
  if (car.playerCaused || car === g.player.car) g.witness(car.x, car.y, 90, 430);
  const R = 96;
  for (const other of g.cars) if (other !== car && !other.dead && dist(car.x, car.y, other.x, other.y) < R) { if (car.playerCaused) other.playerCaused = true; damageCar(g, other, 42); }
  for (const p of g.peds) if (!p.dead && dist(car.x, car.y, p.x, p.y) < R) p.hp -= 70;
  if (!g.player.car && dist(car.x, car.y, g.player.x, g.player.y) < R) g.hurtPlayer(46);
  if (g.player.car && dist(car.x, car.y, g.player.car.x, g.player.car.y) < R) g.hurtPlayer(30);
}

// The shared arcade step: throttle and steering in, velocity integrated
// with a strong lateral grip (weaker under the handbrake, hence drifts),
// then world collision with impact damage.
export function stepCarPhysics(g, car, dt) {
  if (car.dead) { car.vx *= 0.9; car.vy *= 0.9; return; }
  const spec = car.spec;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let f = car.vx * fx + car.vy * fy;
  let lx = car.vx - fx * f, ly = car.vy - fy * f;
  const inp = car.input;
  if (inp.throttle > 0) f += spec.accel * inp.throttle * dt * (f < 0 ? 2.2 : 1);
  if (inp.throttle < 0) f += (f > 6 ? -spec.accel * 2.4 : -spec.accel * 0.55) * -inp.throttle * dt;
  if (inp.brake) f -= Math.sign(f) * Math.min(Math.abs(f), spec.accel * 2.6 * dt);
  const top = inp.throttle < 0 ? spec.top * 0.36 : spec.top;
  f = clamp(f, -spec.top * 0.36, top);
  f -= f * 0.55 * dt; // drag and rolling resistance
  const steerAuthority = clamp(f / 90, -1, 1);
  car.angle += inp.steer * 2.35 * steerAuthority * dt * (inp.handbrake ? 1.35 : 1);
  const grip = spec.grip * (inp.handbrake ? 0.22 : 1);
  const keep = Math.exp(-grip * dt);
  lx *= keep; ly *= keep;
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  car.vx = nfx * f + lx; car.vy = nfy * f + ly;
  const ox = car.x, oy = car.y;
  car.x += car.vx * dt; car.y += car.vy * dt;
  const res = collideWorld(g.city, car.x, car.y, spec.l * 0.30);
  if (res.hit) {
    const impact = Math.abs(f) ;
    if (impact > 120) { damageCar(g, car, (impact - 110) * 0.14, ox, oy); if (car.kind !== 'parked') g.sound.crash(impact > 260); g.shake = Math.max(g.shake, Math.min(9, impact / 46)); }
    car.x = res.x; car.y = res.y;
    car.vx *= -0.18; car.vy *= -0.18;
  }
  // Smoke, fire and skid dressing.
  if (car.health < 55 && !car.dead) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) { car.smokeT = 0.09; smoke(g, car.x, car.y, car.health < 30); if (car.health < 30) fire(g, car.x, car.y); }
  }
  const latMag = Math.hypot(lx, ly);
  if ((latMag > 95 && Math.abs(f) > 130) || (inp.handbrake && Math.abs(f) > 110)) {
    const bx = car.x - nfx * spec.l * 0.32, by = car.y - nfy * spec.l * 0.32;
    const px = -nfy * spec.w * 0.36, py = nfx * spec.w * 0.36;
    // skid marks at both rear wheels
    g.skidAt(bx + px, by + py); g.skidAt(bx - px, by - py);
  }
  if (Math.abs(f) < 4 && inp.throttle === 0) { car.vx *= 0.8; car.vy *= 0.8; }
}

// --- Traffic -------------------------------------------------------------
// A traffic car's nav state is the intersection it is heading for and the
// direction of travel; its target point is that intersection's lane entry.

function lanePoint(i, j, di, dj) {
  // Entering intersection (i, j) travelling (di, dj): stay on the right.
  const rx = dj, ry = -di; // right vector of the heading
  return { x: i * PITCH + rx * LANE_OFF, y: j * PITCH + ry * LANE_OFF };
}

export function initNav(rng, car) {
  const i = clamp(Math.round(car.x / PITCH), 0, GRID), j = clamp(Math.round(car.y / PITCH), 0, GRID);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => i + di >= 0 && i + di <= GRID && j + dj >= 0 && j + dj <= GRID);
  const [di, dj] = pick(rng, dirs);
  car.nav = { i, j, di, dj };
  car.angle = Math.atan2(dj, di);
  const p = lanePoint(i, j, di, dj);
  car.x = p.x; car.y = p.y;
}

function chooseNextDir(rng, nav) {
  const opts = [];
  const straight = [nav.di, nav.dj], left = [nav.dj, -nav.di], right = [-nav.dj, nav.di];
  for (const [d, w] of [[straight, 0.55], [left, 0.225], [right, 0.225]]) {
    const ni = nav.i + d[0], nj = nav.j + d[1];
    if (ni >= 0 && ni <= GRID && nj >= 0 && nj <= GRID) opts.push({ d, w });
  }
  if (!opts.length) return [-nav.di, -nav.dj];
  let roll = rng(), acc = 0;
  for (const o of opts) { acc += o.w; if (roll <= acc) return o.d; }
  return opts[opts.length - 1].d;
}

function obstacleAhead(g, car, range) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const other of g.cars) {
    if (other === car) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * fx + dy * fy, side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < range && side < 24) return other;
  }
  for (const p of g.peds) {
    if (p.dead) continue;
    const dx = p.x - car.x, dy = p.y - car.y;
    const ahead = dx * fx + dy * fy, side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < range * 0.6 && side < 20) return p;
  }
  if (!g.player.car) { // drivers brake for Rae too, most of the time
    const dx = g.player.x - car.x, dy = g.player.y - car.y;
    const ahead = dx * fx + dy * fy, side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < range * 0.6 && side < 20) return g.player;
  }
  return null;
}

export function updateTrafficCar(g, car, dt) {
  if (car.dead || car.driverOut) { car.input.throttle = 0; return; }
  const nav = car.nav;
  const dest = lanePoint(nav.i + nav.di, nav.j + nav.dj, nav.di, nav.dj);
  const d = dist(car.x, car.y, dest.x, dest.y);
  if (d < 46) {
    nav.i += nav.di; nav.j += nav.dj;
    const [di, dj] = chooseNextDir(g.rng, nav);
    nav.di = di; nav.dj = dj;
  }
  const look = { x: dest.x + nav.di * 70, y: dest.y + nav.dj * 70 };
  const want = Math.atan2(look.y - car.y, look.x - car.x);
  const delta = angleDelta(car.angle, want);
  car.input.steer = clamp(delta * 2.4, -1, 1);
  const f = forwardSpeed(car);
  const blocker = obstacleAhead(g, car, 58 + Math.max(0, f) * 0.42);
  car.input.handbrake = false;
  if (car.reverseT > 0) {
    car.reverseT -= dt; car.input.throttle = -0.8; car.input.steer = -car.input.steer;
  } else if (blocker) {
    car.input.throttle = f > 12 ? 0 : -0.15;
    car.input.brake = f > 4;
    car.stuckT += dt;
    car.honkT -= dt;
    if (car.honkT <= 0) { car.honkT = rand(g.rng, 3, 8); if (dist(car.x, car.y, g.player.x, g.player.y) < 420) g.sound.honk?.(); }
    if (car.stuckT > 2.6) { car.reverseT = 0.55; car.stuckT = 0; }
  } else {
    car.stuckT = 0;
    car.input.brake = false;
    car.input.throttle = f < car.cruise ? 0.75 : 0;
  }
  stepCarPhysics(g, car, dt);
}

// Car-to-car bumps: separate overlapping circles, share the momentum and
// charge damage for the closing speed.
export function collideCars(g, dt) {
  const cars = g.cars;
  for (let a = 0; a < cars.length; a++) {
    for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b];
      const rr = (A.spec.l + B.spec.l) * 0.30;
      const dx = B.x - A.x, dy = B.y - A.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.01) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
      if (!A.dead) { A.x -= nx * push; A.y -= ny * push; }
      if (!B.dead) { B.x += nx * push; B.y += ny * push; }
      const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rel < 0) {
        const imp = -rel * 0.55;
        A.vx -= nx * imp; A.vy -= ny * imp;
        B.vx += nx * imp; B.vy += ny * imp;
        if (-rel > 95) {
          const dmg = (-rel - 85) * 0.16;
          damageCar(g, A, dmg, A.x + nx * rr * 0.5, A.y + ny * rr * 0.5);
          damageCar(g, B, dmg, B.x - nx * rr * 0.5, B.y - ny * rr * 0.5);
          g.sound.crash(-rel > 220);
          g.shake = Math.max(g.shake, Math.min(8, -rel / 40));
          // Only the player's own crashes are crimes; the CBPD piling into
          // each other is their own problem, not Rae's heat.
          if (A === g.player.car || B === g.player.car) {
            const other = A === g.player.car ? B : A;
            other.playerCaused = true;
            g.witness((A.x + B.x) / 2, (A.y + B.y) / 2, other.kind === 'police' ? 70 : 22, 240);
          }
        }
      }
    }
  }
}

export function spawnTraffic(g, count) {
  const models = ['pico', 'marlin', 'ventana', 'tortuga', 'brisa', 'solcab'];
  for (let n = 0; n < count; n++) {
    const i = 1 + Math.floor(g.rng() * (GRID - 1)), j = 1 + Math.floor(g.rng() * (GRID - 1));
    const car = makeCar(g.rng, 'traffic', pick(g.rng, models), i * PITCH, j * PITCH, 0);
    initNav(g.rng, car);
    if (dist(car.x, car.y, g.player.x, g.player.y) < 260) continue;
    g.cars.push(car);
  }
}

export function spawnParked(g) {
  const models = ['pico', 'marlin', 'ventana', 'tortuga', 'brisa'];
  for (const lot of g.city.lots) {
    const rows = 2, per = 3 + Math.floor(g.rng() * 3);
    for (let r = 0; r < rows; r++) for (let k = 0; k < per; k++) {
      if (g.rng() < 0.25) continue;
      const x = lot.x + 34 + k * 52, y = lot.y + 44 + r * 92;
      const car = makeCar(g.rng, 'parked', pick(g.rng, models), x, y, Math.PI / 2 + (g.rng() < 0.5 ? 0 : Math.PI));
      g.cars.push(car);
    }
  }
  // A few cars parallel-parked along quiet streets, and three at the beach.
  for (let n = 0; n < 7; n++) {
    const i = 1 + Math.floor(g.rng() * (GRID - 1));
    const x = i * PITCH + LANE_OFF + 13, y = rand(g.rng, 200, CITY_EDGE - 150);
    const car = makeCar(g.rng, 'parked', pick(g.rng, models), x, y, Math.PI / 2);
    if (onRoad(car.x, car.y)) g.cars.push(car);
  }
  for (let n = 0; n < 3; n++) {
    const car = makeCar(g.rng, 'parked', pick(g.rng, models), g.city.spots.beachLot.x + (g.rng() - 0.5) * 30, g.city.spots.beachLot.y - 90 + n * 80, -Math.PI / 2);
    g.cars.push(car);
  }
}

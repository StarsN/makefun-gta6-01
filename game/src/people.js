// Pedestrians: Coral Bay citizens who stroll the sidewalks, chat in pairs,
// and run screaming when the shooting starts. Officers on foot share the
// body but are driven by police.js, so updatePeds only moves citizens.

import { PALETTE } from './config.js';
import { clamp, dist, pick, rand } from './random.js';
import { collideWorld, sidewalkPoint } from './city.js';
import { burst } from './fx.js';

let nextPedId = 1;

export function makePed(rng, x, y, role = 'ped') {
  return {
    id: nextPedId++, role, x, y, angle: rand(rng, 0, Math.PI * 2),
    speed: rand(rng, 52, 82), hp: 30, dead: false,
    shirt: role === 'officer' ? '#274b73' : pick(rng, PALETTE.pedShirt),
    skin: pick(rng, ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0cfa8']),
    state: 'wander', tx: x, ty: y, waitT: rand(rng, 0, 2),
    panicT: 0, threatX: 0, threatY: 0, shootCd: rand(rng, 0.4, 1.2), car: null,
  };
}

export function spawnPeds(g, count) {
  for (let n = 0; n < count; n++) {
    const x = rand(g.rng, 120, 2280), y = rand(g.rng, 120, 2280);
    const p = sidewalkPoint(g.rng, x, y);
    const ped = makePed(g.rng, p.x, p.y);
    ped.tx = p.x; ped.ty = p.y;
    if (dist(ped.x, ped.y, g.player.x, g.player.y) < 120) continue;
    g.peds.push(ped);
  }
  // A small crowd on the beach, too.
  for (let n = 0; n < 6; n++) {
    const ped = makePed(g.rng, 2560 + rand(g.rng, 0, 90), rand(g.rng, 200, 2400));
    ped.tx = ped.x; ped.ty = ped.y;
    g.peds.push(ped);
  }
}

export function scarePeds(g, x, y, radius) {
  for (const p of g.peds) {
    if (p.dead || p.role !== 'ped') continue;
    if (dist(p.x, p.y, x, y) < radius) { p.state = 'flee'; p.panicT = rand(g.rng, 1.6, 3.2); p.threatX = x; p.threatY = y; }
  }
}

export function updatePeds(g, dt) {
  for (const p of g.peds) {
    if (p.dead || p.role === 'officer') continue;
    if (p.hp <= 0) { p.dead = true; burst(g, p.x, p.y, 8, '#b03a2e', 90, 0.5, 3); continue; }
    let mx = 0, my = 0, spd = p.speed;
    if (p.state === 'flee') {
      p.panicT -= dt;
      const dx = p.x - p.threatX, dy = p.y - p.threatY, d = Math.hypot(dx, dy) || 1;
      mx = dx / d; my = dy / d; spd = 205;
      if (p.panicT <= 0) { p.state = 'wander'; const t = sidewalkPoint(g.rng, p.x, p.y); p.tx = t.x; p.ty = t.y; }
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 8) {
        p.waitT -= dt;
        if (p.waitT <= 0) { const t = sidewalkPoint(g.rng, p.x, p.y); p.tx = t.x; p.ty = t.y; p.waitT = rand(g.rng, 0, 2.5); }
      } else { mx = dx / d; my = dy / d; }
    }
    if (mx || my) {
      p.angle = Math.atan2(my, mx);
      const res = collideWorld(g.city, p.x + mx * spd * dt, p.y + my * spd * dt, 9);
      p.x = res.x; p.y = res.y;
    }
    // Traffic is dangerous: a fast car that reaches a citizen runs them down.
    for (const car of g.cars) {
      if (car.dead) continue;
      const cs = Math.hypot(car.vx, car.vy);
      if (cs < 55) continue;
      const rr = car.spec.l * 0.34 + 9;
      if (dist(p.x, p.y, car.x, car.y) < rr) {
        p.hp -= 60;
        const dx = p.x - car.x, dy = p.y - car.y, d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 22; p.y += (dy / d) * 22;
        burst(g, p.x, p.y, 10, '#b03a2e', 130, 0.5, 3);
        if (car === g.player.car) { g.witness(p.x, p.y, 130, 320); g.sound.crash(false); g.shake = Math.max(g.shake, 5); }
        else g.witness(p.x, p.y, 0, 200); // bystanders still panic and stare
        scarePeds(g, p.x, p.y, 190);
        break;
      }
    }
  }
  // Keep the population steady: quietly replace the fallen, far away.
  const alive = g.peds.filter((p) => !p.dead && p.role === 'ped').length;
  if (alive < 26 && g.rng() < dt * 0.7) {
    const p = sidewalkPoint(g.rng, g.player.x + (g.rng() - 0.5) * 1600, g.player.y + (g.rng() - 0.5) * 1600);
    if (dist(p.x, p.y, g.player.x, g.player.y) > 480) g.peds.push(makePed(g.rng, p.x, p.y));
  }
  g.peds = g.peds.filter((p) => !p.dead || g.rng() < 0.995);
}

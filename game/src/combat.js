// Gunfire: fast tracer rounds shared by the player and police officers.
// A bullet is a short-lived ray segment; it stops on buildings, cars and
// people, and leaves a spark where it lands.

import { dist } from './random.js';
import { burst } from './fx.js';

export function fireBullet(g, x, y, angle, fromCop) {
  const spread = fromCop ? 0.085 : 0.028;
  const a = angle + (Math.random() - 0.5) * 2 * spread;
  g.bullets.push({
    x, y, vx: Math.cos(a) * 980, vy: Math.sin(a) * 980,
    life: 0.5, fromCop, dmg: fromCop ? 8 : 34,
  });
  burst(g, x + Math.cos(a) * 14, y + Math.sin(a) * 14, 2, '#ffd76a', 60, 0.12, 2);
}

function pointInRect(x, y, b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

export function updateBullets(g, dt) {
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.life -= dt;
    const steps = 3;
    let killed = b.life <= 0;
    for (let s = 0; s < steps && !killed; s++) {
      b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
      for (const r of g.city.colliders) {
        if (pointInRect(b.x, b.y, r)) { burst(g, b.x, b.y, 3, '#ffe9a8', 110, 0.25, 2); killed = true; break; }
      }
      if (killed) break;
      for (const car of g.cars) {
        if (car.dead) continue;
        if (b.fromCop && car.kind === 'police') continue;
        if (!b.fromCop && car === g.player.car) continue;
        if (dist(b.x, b.y, car.x, car.y) < car.spec.l * 0.36) {
          car.health -= b.dmg * 0.5;
          if (!b.fromCop) car.playerCaused = true;
          burst(g, b.x, b.y, 4, '#ffd76a', 130, 0.3, 2);
          if (car.health <= 0) g.explodeCar(car);
          killed = true; break;
        }
      }
      if (killed) break;
      if (b.fromCop) {
        if (!g.player.car && dist(b.x, b.y, g.player.x, g.player.y) < 12) { g.hurtPlayer(b.dmg); killed = true; }
        else if (g.player.car && dist(b.x, b.y, g.player.car.x, g.player.car.y) < g.player.car.spec.l * 0.36) {
          g.player.car.health -= b.dmg * 0.4;
          if (g.player.car.health <= 0) g.explodeCar(g.player.car);
          killed = true;
        }
      } else {
        for (const p of g.peds) {
          if (p.dead) continue;
          if (dist(b.x, b.y, p.x, p.y) < 11) {
            p.hp -= b.dmg;
            burst(g, b.x, b.y, 5, '#b03a2e', 110, 0.4, 2.5);
            if (p.role === 'officer') g.witness(p.x, p.y, 60, 380);
            else { g.witness(p.x, p.y, 45, 300); }
            if (p.hp <= 0) { p.dead = true; if (p.role === 'officer') g.witness(p.x, p.y, 110, 420); }
            killed = true; break;
          }
        }
      }
    }
    if (killed) g.bullets.splice(i, 1);
  }
}

// Combat and effects: the player's pistol (hitscan with spread, a magazine and a
// reload), damage to people and cars, cars catching fire and exploding, and the
// particle/tracer/floating-text effects everything else calls to make hits read.

import { audio } from './audio.js';
import { alertPeds } from './people.js';
import { carRadius } from './vehicles.js';

export const PISTOL = { damage: 34, range: 470, cooldown: 0.17, magazine: 12, reloadTime: 0.95, spread: 0.045 };

export function burst(state, x, y, { count = 8, color = '#ffd166', speed = 120, life = 0.4, size = 3, gravity = 0 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = speed * (0.3 + state.rng() * 0.7);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + state.rng() * 0.8), maxLife: life,
      size: size * (0.6 + state.rng() * 0.8), color, gravity,
    });
  }
}

export function hitBurst(state, x, y) {
  burst(state, x, y, { count: 7, color: '#e63946', speed: 105, life: 0.35, size: 3.4 });
}

export function floatText(state, x, y, text, color = '#ffe66d') {
  state.texts.push({ x, y, text, color, life: 1.15 });
}

function raycast(state, ox, oy, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let hit = { kind: 'none', x: ox + dx * maxDist, y: oy + dy * maxDist, dist: maxDist, target: null };
  for (let d = 10; d <= maxDist; d += 6) {
    const x = ox + dx * d;
    const y = oy + dy * d;
    let done = false;
    for (const b of state.city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        hit = { kind: 'building', x, y, dist: d, target: null };
        done = true;
        break;
      }
    }
    if (done) break;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.abs(ped.x - x) < 11 && Math.abs(ped.y - y) < 11) {
        hit = { kind: 'ped', x, y, dist: d, target: ped };
        done = true;
        break;
      }
    }
    if (done) break;
    for (const car of state.cars) {
      if (car === state.player.car) continue;
      const rr = carRadius(car) * 0.95;
      const cx = car.x - x;
      const cy = car.y - y;
      if (cx * cx + cy * cy < rr * rr) {
        hit = { kind: 'car', x, y, dist: d, target: car };
        done = true;
        break;
      }
    }
    if (done) break;
  }
  return hit;
}

export function damagePed(state, ped, dmg, byPlayer) {
  if (ped.state === 'down') return;
  ped.hp -= dmg;
  hitBurst(state, ped.x, ped.y);
  if (ped.hp <= 0) {
    ped.state = 'down';
    ped.deadT = 0;
    if (byPlayer) state.crime(ped.kind === 'officer' ? 'killcop' : 'killped', ped.x, ped.y);
    return;
  }
  if (ped.kind === 'ped') {
    ped.state = 'flee';
    ped.fleeFrom = { x: state.player.x, y: state.player.y };
    ped.fleeT = 2.6;
  }
  if (byPlayer && ped.kind === 'officer') state.crime('assaultcop', ped.x, ped.y);
}

export function damageCar(state, car, dmg, byPlayer) {
  if (car.burned) return;
  car.hp -= dmg;
  if (car.hp <= 0) {
    explodeCar(state, car, byPlayer);
  }
}

export function explodeCar(state, car, byPlayer) {
  if (car.burned) return;
  car.burned = true;
  car.hp = 0;
  audio.explosion();
  state.shake = Math.min(14, state.shake + 9);
  burst(state, car.x, car.y, { count: 26, color: '#ff9f43', speed: 260, life: 0.6, size: 5 });
  burst(state, car.x, car.y, { count: 18, color: '#e63946', speed: 180, life: 0.5, size: 4 });
  burst(state, car.x, car.y, { count: 14, color: '#576574', speed: 60, life: 1.1, size: 6 });
  if (car.driver === 'player' && state.player.car === car) {
    state.player.car = null;
    car.driver = null;
    state.player.x = car.x + car.model.wid + 18;
    state.player.y = car.y;
    state.hurtPlayer(42, car.x, car.y);
  } else if (car.driver === 'traffic') {
    car.driver = null;
  } else if (car.driver === 'police') {
    car.driver = null;
  }
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < 95 && ped.state !== 'down') damagePed(state, ped, 55, byPlayer);
  }
  for (const other of state.cars) {
    if (other === car || other.burned) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 100) damageCar(state, other, 40, byPlayer);
  }
  if (Math.hypot(state.player.x - car.x, state.player.y - car.y) < 95 && !state.player.car) {
    state.hurtPlayer(38, car.x, car.y);
  }
  alertPeds(state, car.x, car.y, 340);
  if (byPlayer) state.crime('explosion', car.x, car.y);
}

// The player's shooting, driven by the mouse while on foot.
export function updatePlayerShooting(state, dt) {
  const player = state.player;
  if (player.car) return;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      player.ammo = PISTOL.magazine;
      audio.reload();
    }
    return;
  }
  if (state.inputRef.justPressed('KeyR') && player.ammo < PISTOL.magazine) {
    player.reloadT = PISTOL.reloadTime;
    return;
  }
  player.fireCd -= dt;
  if (!state.inputRef.mouse.down || player.fireCd > 0) return;
  if (player.ammo <= 0) {
    audio.dryFire();
    player.reloadT = PISTOL.reloadTime;
    player.fireCd = 0.3;
    return;
  }
  player.fireCd = PISTOL.cooldown;
  player.ammo -= 1;
  state.stats.shots += 1;
  audio.shot();
  state.shake = Math.min(5, state.shake + 1.1);
  const baseAngle = Math.atan2(state.inputRef.mouse.worldY - player.y, state.inputRef.mouse.worldX - player.x);
  const angle = baseAngle + (state.rng() - 0.5) * 2 * PISTOL.spread;
  const hit = raycast(state, player.x, player.y, angle, PISTOL.range);
  state.tracers.push({ x1: player.x + Math.cos(baseAngle) * 16, y1: player.y + Math.sin(baseAngle) * 16, x2: hit.x, y2: hit.y, life: 0.07 });
  burst(state, player.x + Math.cos(baseAngle) * 18, player.y + Math.sin(baseAngle) * 18, { count: 2, color: '#ffe66d', speed: 30, life: 0.08, size: 3 });
  if (hit.kind === 'ped') {
    state.stats.hits += 1;
    damagePed(state, hit.target, PISTOL.damage, true);
  } else if (hit.kind === 'car') {
    burst(state, hit.x, hit.y, { count: 4, color: '#ffd166', speed: 90, life: 0.25, size: 2.4 });
    damageCar(state, hit.target, PISTOL.damage, true);
  } else if (hit.kind === 'building') {
    burst(state, hit.x, hit.y, { count: 3, color: '#d8d8d8', speed: 60, life: 0.2, size: 2 });
  }
  alertPeds(state, player.x, player.y, 330);
  state.crime('shooting', player.x, player.y);
}

// An officer's shot at the player: inaccurate on purpose, worse when the player moves.
export function officerShoot(state, officer) {
  const player = state.player;
  const dist = Math.hypot(player.x - officer.x, player.y - officer.y);
  const angle = Math.atan2(player.y - officer.y, player.x - officer.x);
  const playerSpeed = player.car ? Math.abs(player.car.vx) + Math.abs(player.car.vy) : (player.moving ? 150 : 0);
  const miss = (state.rng() - 0.5) * (0.1 + dist / 900 + playerSpeed / 1600);
  const tx = player.x + Math.cos(angle + miss) * 14;
  const ty = player.y + Math.sin(angle + miss) * 14;
  state.tracers.push({ x1: officer.x, y1: officer.y, x2: tx, y2: ty, life: 0.07 });
  audio.shot();
  const hitChance = Math.max(0.12, 0.52 - dist / 620 - playerSpeed / 900);
  if (state.rng() < hitChance) {
    state.hurtPlayer(6 + state.rng() * 5, officer.x, officer.y);
  } else {
    burst(state, tx, ty, { count: 2, color: '#ffd166', speed: 50, life: 0.15, size: 2 });
  }
}

export function updateFx(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 0) * dt;
    p.vx *= Math.exp(-2.2 * dt);
    p.vy *= Math.exp(-2.2 * dt);
  }
  for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
    state.tracers[i].life -= dt;
    if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
  }
  for (let i = state.texts.length - 1; i >= 0; i -= 1) {
    const t = state.texts[i];
    t.life -= dt;
    t.y -= 26 * dt;
    if (t.life <= 0) state.texts.splice(i, 1);
  }
  // Smoke from hurt cars, fire from burning ones.
  for (const car of state.cars) {
    if (car.burned) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.09;
        burst(state, car.x, car.y, { count: 2, color: state.rng() < 0.5 ? '#ff9f43' : '#e63946', speed: 26, life: 0.55, size: 5 });
      }
    } else if (car.hp < car.maxHp * 0.38) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.16;
        burst(state, car.x, car.y, { count: 1, color: '#576574', speed: 18, life: 0.8, size: 4.5 });
      }
    }
  }
}

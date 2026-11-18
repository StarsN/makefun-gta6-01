// player.js — Rae Solano: walking and sprinting on foot, mouse-aimed pistol
// combat, and the arcade driving model (throttle, steering that bites with
// speed, handbrake drift, impact damage) for every car she steals.

import { PLAYER_RADIUS, WALK_SPEED, SPRINT_SPEED, ENTER_RANGE } from './config.js';
import { clamp, dist, angleTo } from './rng.js';
import { collideWorld } from './world.js';
import { reportCrime } from './police.js';
import { createPed, scarePeds, spawnParticles } from './entities.js';

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, angle: -Math.PI / 2, hp: 100, car: null,
    ammo: 12, magSize: 12, reloadT: 0, fireT: 0, hurtT: 0, regenT: 0,
    walkPhase: 0, muzzleT: 0, dead: false,
  };
}

export function damagePlayer(game, amount, sx, sy) {
  const p = game.player;
  if (p.dead || game.state !== 'playing') return;
  p.hp -= amount;
  p.hurtT = 0.55; p.regenT = 0;
  game.shake = Math.min(14, game.shake + amount * 0.35);
  if (sx !== undefined) {
    const a = angleTo(sx, sy, p.x, p.y);
    p.x += Math.cos(a) * 6; p.y += Math.sin(a) * 6;
  }
  if (p.hp <= 0) { p.hp = 0; game.doWasted(); }
}

export function updatePlayer(game, dt) {
  const p = game.player;
  if (p.dead) return;
  p.fireT -= dt; p.muzzleT -= dt; p.hurtT -= dt;
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) p.ammo = p.magSize; }
  if (p.hurtT <= 0 && p.hp > 0 && p.hp < 100) {
    p.regenT += dt;
    if (p.regenT > 5) p.hp = Math.min(100, p.hp + 6 * dt);
  }
  if (p.car) updateDriving(game, dt); else updateOnFoot(game, dt);
  game.threat = { x: p.x, y: p.y }; // what pedestrians flee from when alarmed
}

function updateOnFoot(game, dt) {
  const p = game.player, input = game.input;
  let mx = 0, my = 0;
  if (input.down('w', 'arrowup')) my -= 1;
  if (input.down('s', 'arrowdown')) my += 1;
  if (input.down('a', 'arrowleft')) mx -= 1;
  if (input.down('d', 'arrowright')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  const sprint = input.down('shift');
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  if (moving) {
    const len = Math.hypot(mx, my);
    p.vx = (mx / len) * speed; p.vy = (my / len) * speed;
    if (!input.mouse.down) p.angle = Math.atan2(my, mx);
    p.walkPhase += dt * (sprint ? 13 : 10);
  } else { p.vx = 0; p.vy = 0; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (input.mouse.down || p.fireT > 0.1) {
    const w = game.screenToWorld(input.mouse.x, input.mouse.y);
    p.angle = angleTo(p.x, p.y, w.x, w.y);
  }
  collideWorld(game.world, p, PLAYER_RADIUS, false);
  // Push out of cars (you cannot walk through a bonnet).
  for (const car of game.cars) {
    const r = car.type.len * 0.42;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < r + PLAYER_RADIUS && d > 0.01) {
      p.x = car.x + (p.x - car.x) / d * (r + PLAYER_RADIUS);
      p.y = car.y + (p.y - car.y) / d * (r + PLAYER_RADIUS);
    }
  }
  if (input.tapped('e', 'f')) tryEnterCar(game);
  if (input.tapped('r') && p.ammo < p.magSize && p.reloadT <= 0) startReload(game);
  if (input.mouse.down) tryShoot(game);
}

function tryEnterCar(game) {
  const p = game.player;
  let best = null, bestD = ENTER_RANGE;
  for (const car of game.cars) {
    if (car.exploded) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return;
  if (best.driver && best.role === 'traffic') {
    // Yank the driver out: they become a very motivated pedestrian.
    const driver = createPed(best.x + 18, best.y + 12, game.rng);
    driver.state = 'flee'; driver.panicT = 3;
    game.peds.push(driver);
    reportCrime(game, 'carjack', best.x, best.y);
    game.save.stats.stolen++;
  } else if (best.role === 'police') {
    reportCrime(game, 'hitCop', best.x, best.y);
    game.save.stats.stolen++;
  } else if (best.role === 'parked' && best.hot) {
    reportCrime(game, 'theft', best.x, best.y);
    game.save.stats.stolen++;
  } else if (best.role === 'parked' || best.role === 'mission') {
    game.save.stats.stolen += best.ownedOnce ? 0 : 0; // plain parked cars are fair game
  }
  best.driver = 'player';
  best.role = 'player';
  p.car = best;
  p.x = best.x; p.y = best.y;
  game.sound.door();
}

export function exitCar(game) {
  const p = game.player, car = p.car;
  if (!car) return;
  car.driver = false;
  if (car.role === 'player') car.role = 'parked';
  p.car = null;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * (car.type.wid / 2 + 16);
  p.y = car.y + Math.sin(side) * (car.type.wid / 2 + 16);
  collideWorld(game.world, p, PLAYER_RADIUS, false);
  game.sound.door();
}

function updateDriving(game, dt) {
  const p = game.player, car = p.car, input = game.input;
  const type = car.type;
  const fwdX = Math.cos(car.angle), fwdY = Math.sin(car.angle);
  let vx = car.renderVx ?? 0, vy = car.renderVy ?? 0;
  let fSpeed = vx * fwdX + vy * fwdY;
  const throttle = input.down('w', 'arrowup') ? 1 : 0;
  const brake = input.down('s', 'arrowdown') ? 1 : 0;
  const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
  const hand = input.down(' ');

  if (throttle) fSpeed += type.accel * dt;
  if (brake) fSpeed -= (fSpeed > 12 ? 430 : 150) * dt;
  fSpeed = clamp(fSpeed, -type.topSpeed * 0.36, type.topSpeed);
  if (!throttle && !brake) fSpeed -= fSpeed * 0.55 * dt; // engine drag
  fSpeed -= fSpeed * 0.22 * dt;                            // air drag

  const grip = hand ? 2.1 : 7.5;
  const latX = -fwdY, latY = fwdX;
  let lSpeed = vx * latX + vy * latY;
  lSpeed -= lSpeed * Math.min(1, grip * dt) * (hand ? 0.55 : 1);
  if (steer !== 0 && Math.abs(fSpeed) > 4) {
    const turn = steer * clamp(Math.abs(fSpeed) / 150, 0.3, 1.35) * 1.85 * dt * Math.sign(fSpeed);
    car.angle += turn;
  }
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  vx = nfx * fSpeed + (-nfy) * lSpeed;
  vy = nfy * fSpeed + nfx * lSpeed;

  const prevVx = vx, prevVy = vy;
  car.x += vx * dt; car.y += vy * dt;
  const before = { x: car.x, y: car.y };
  collideWorld(game.world, car, type.len * 0.36, true);
  const impact = Math.hypot(car.x - before.x, car.y - before.y);
  if (impact > 2.2) {
    // The world pushed back hard: that was a crash.
    const severity = Math.min(1, Math.abs(fSpeed) / 320);
    damageCar(game, car, severity * 26);
    game.shake = Math.min(16, game.shake + severity * 11);
    game.sound.crash(severity > 0.55);
    spawnParticles(game.fx, car.x, car.y, { n: 8, color: '#ffd76a', speed: 160, size: 3, life: 0.4 });
    vx *= 0.25; vy *= 0.25; fSpeed *= 0.25;
    reportCrime(game, 'hitCar', car.x, car.y);
  }
  car.renderVx = vx; car.renderVy = vy;
  car.speed = fSpeed;
  p.x = car.x; p.y = car.y;
  p.vx = vx; p.vy = vy;
  game.save.stats.distanceKm += Math.abs(fSpeed) * dt / 38000;

  // Skid marks while drifting or braking hard at speed.
  if ((hand && Math.abs(fSpeed) > 120) || (brake && fSpeed > 260)) {
    const backX = car.x - nfx * type.len * 0.36, backY = car.y - nfy * type.len * 0.36;
    game.fx.skids.push({ x1: backX - latXNow(car) * 10, y1: backY - latYNow(car) * 10, x2: backX + latXNow(car) * 10, y2: backY + latYNow(car) * 10, life: 1 });
    if (game.fx.skids.length > 260) game.fx.skids.shift();
  }
  if (car.hp < car.maxHp * 0.45 && Math.random() < 0.35) {
    spawnParticles(game.fx, car.x + nfx * type.len * 0.4, car.y + nfy * type.len * 0.4,
      { n: 1, color: car.hp < car.maxHp * 0.2 ? '#ff8c42' : '#9aa0a6', speed: 26, size: 6, life: 0.9, rise: 26 });
  }
  if (input.tapped('e', 'f') && Math.abs(fSpeed) < 130) exitCar(game);
  void prevVx; void prevVy;
}

function latXNow(car) { return -Math.sin(car.angle); }
function latYNow(car) { return Math.cos(car.angle); }

export function damageCar(game, car, amount) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp <= car.maxHp * 0.5 && car.hp + amount > car.maxHp * 0.5) {
    spawnParticles(game.fx, car.x, car.y, { n: 10, color: '#9aa0a6', speed: 60, size: 6, life: 1, rise: 20 });
  }
  if (car.hp <= 0) {
    car.hp = 0; car.wrecked = true;
    game.fx.rings.push({ x: car.x, y: car.y, t: 0 });
    spawnParticles(game.fx, car.x, car.y, { n: 34, color: '#ff9f43', speed: 260, size: 6, life: 0.8 });
    spawnParticles(game.fx, car.x, car.y, { n: 20, color: '#57606f', speed: 120, size: 9, life: 1.4, rise: 30 });
    game.sound.explosion();
    game.shake = Math.min(18, game.shake + 9);
    reportCrime(game, 'explosion', car.x, car.y);
    scarePeds(game, car.x, car.y, 260);
    if (game.player.car === car) {
      damagePlayer(game, 22);
      if (!game.player.dead) exitCar(game);
    }
    car.exploded = true; car.speed = 0; car.driver = false;
  }
}

function startReload(game) {
  const p = game.player;
  p.reloadT = 1.05;
  game.sound.reload();
}

function tryShoot(game) {
  const p = game.player;
  if (p.fireT > 0 || p.reloadT > 0) return;
  if (p.ammo <= 0) { game.sound.dryFire(); p.fireT = 0.3; startReload(game); return; }
  p.fireT = 0.235; p.ammo--; p.muzzleT = 0.05;
  game.save.stats.shots++;
  game.sound.shot();
  const w = game.screenToWorld(game.input.mouse.x, game.input.mouse.y);
  const ang = angleTo(p.x, p.y, w.x, w.y);
  p.angle = ang;
  const range = 760;
  const ex = p.x + Math.cos(ang) * range, ey = p.y + Math.sin(ang) * range;
  let hitT = 1, hitKind = null, hitTarget = null;
  const testCircle = (tx, ty, r, kind, target) => {
    const dx = tx - p.x, dy = ty - p.y;
    const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (proj < 0 || proj > range) return;
    const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    if (perp < r && proj / range < hitT) { hitT = proj / range; hitKind = kind; hitTarget = target; }
  };
  for (const ped of game.peds) if (ped.state !== 'down') testCircle(ped.x, ped.y, 13, 'ped', ped);
  for (const off of game.officers) testCircle(off.x, off.y, 13, 'officer', off);
  for (const car of game.cars) if (!car.exploded) testCircle(car.x, car.y, car.type.len * 0.44, 'car', car);
  for (const b of game.world.buildings) {
    // Buildings stop bullets: approximate with a few sample points on the ray.
    for (let t = 0.05; t < hitT; t += 0.04) {
      const sx = p.x + (ex - p.x) * t, sy = p.y + (ey - p.y) * t;
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) { hitT = t; hitKind = 'wall'; hitTarget = null; break; }
    }
  }
  const hx = p.x + (ex - p.x) * hitT, hy = p.y + (ey - p.y) * hitT;
  game.fx.tracers.push({ x1: p.x + Math.cos(ang) * 18, y1: p.y + Math.sin(ang) * 18, x2: hx, y2: hy, life: 1, hostile: false });
  spawnParticles(game.fx, hx, hy, { n: 3, color: '#ffe08a', speed: 90, size: 2.5, life: 0.3 });
  if (hitKind === 'ped') {
    hitTarget.hp -= 1;
    if (hitTarget.hp <= 0 && hitTarget.state !== 'down') {
      hitTarget.state = 'down'; hitTarget.downT = 7;
      reportCrime(game, 'hitPed', hitTarget.x, hitTarget.y);
    }
  } else if (hitKind === 'officer') {
    hitTarget.hp -= 2;
  } else if (hitKind === 'car') {
    damageCar(game, hitTarget, 11);
    if (hitTarget.role === 'police') reportCrime(game, 'hitCop', hitTarget.x, hitTarget.y);
  }
  reportCrime(game, 'shot', p.x, p.y);
  if (p.ammo === 0) startReload(game);
}

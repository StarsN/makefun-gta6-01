// People: the pedestrians who stroll Coral Bay's sidewalks, run from trouble and
// occasionally get in the way, and the player character's own two feet. Police
// officers are people too, but police.js directs them; this file only walks the
// civilians and the player.

import { PED_COLORS, PLAYER } from './config.js';
import { collideCircle, randomSidewalkPoint } from './city.js';
import { down } from './input.js';
import { pick, range } from './random.js';
import { carRadius, carSpeed } from './vehicles.js';

let nextPedId = 1;

const SKIN_TONES = ['#f6cfae', '#e8b08a', '#c98a5e', '#96613c', '#6e4525'];

export function makePed(state, x, y, opts = {}) {
  const ped = {
    id: nextPedId,
    kind: opts.kind ?? 'ped',
    x, y,
    angle: range(state.rng, 0, Math.PI * 2),
    speed: 0,
    hp: opts.hp ?? 60,
    maxHp: opts.hp ?? 60,
    color: opts.color ?? pick(state.rng, PED_COLORS),
    skin: pick(state.rng, SKIN_TONES),
    state: opts.state ?? 'walk',
    tx: x, ty: y,
    waitT: 0,
    fleeFrom: null,
    fleeT: 0,
    walkPhase: range(state.rng, 0, 6),
    deadT: 0,
    shootCd: 0,
    bustT: 0,
    carRef: opts.carRef ?? null,
  };
  nextPedId += 1;
  state.peds.push(ped);
  return ped;
}

export function spawnCrowd(state, count = 26) {
  for (let i = 0; i < count; i += 1) {
    const point = randomSidewalkPoint(state.city, state.rng, state.player.x, state.player.y, 950);
    const ped = makePed(state, point.x, point.y, {});
    retargetPed(state, ped);
  }
}

function retargetPed(state, ped) {
  const point = randomSidewalkPoint(state.city, state.rng, ped.x, ped.y, 640);
  ped.tx = point.x;
  ped.ty = point.y;
}

export function alertPeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.kind !== 'ped' || ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.fleeT = range(state.rng, 1.6, 3.2);
    }
  }
}

const CROWD_TARGET = 26;

export function updatePeds(state, dt) {
  let live = 0;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.kind !== 'ped') continue;
    if (ped.state === 'down') {
      ped.deadT += dt;
      if (ped.deadT > 30) state.peds.splice(i, 1);
      continue;
    }
    const distPlayer = Math.hypot(ped.x - state.player.x, ped.y - state.player.y);
    if (distPlayer > 1250) {
      const point = randomSidewalkPoint(state.city, state.rng, state.player.x, state.player.y, 880);
      ped.x = point.x;
      ped.y = point.y;
      retargetPed(state, ped);
    }
    live += 1;
    stepPed(state, ped, dt);
  }
  for (let i = live; i < CROWD_TARGET; i += 1) {
    const point = randomSidewalkPoint(state.city, state.rng, state.player.x, state.player.y, 880);
    makePed(state, point.x, point.y, {});
  }
}

function stepPed(state, ped, dt) {
  let moveX = 0;
  let moveY = 0;
  let speed = 0;

  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const dx = ped.x - (ped.fleeFrom?.x ?? ped.x);
    const dy = ped.y - (ped.fleeFrom?.y ?? ped.y);
    const d = Math.hypot(dx, dy) || 1;
    moveX = dx / d;
    moveY = dy / d;
    speed = 208;
    if (ped.fleeT <= 0) {
      ped.state = 'walk';
      retargetPed(state, ped);
    }
  } else if (ped.state === 'wait') {
    ped.waitT -= dt;
    if (ped.waitT <= 0) {
      ped.state = 'walk';
      retargetPed(state, ped);
    }
  } else {
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 9) {
      if (state.rng() < 0.4) {
        ped.state = 'wait';
        ped.waitT = range(state.rng, 0.5, 3);
      } else {
        retargetPed(state, ped);
      }
    } else {
      moveX = dx / d;
      moveY = dy / d;
      speed = 74;
    }
  }

  // Sidestep anything with wheels that is coming close.
  for (const car of state.cars) {
    if (car.burned) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const d2 = dx * dx + dy * dy;
    const rr = carRadius(car) + 26;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2);
      moveX += (dx / d) * 1.4;
      moveY += (dy / d) * 1.4;
      if (Math.abs(carSpeed(car)) > 130 && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.fleeFrom = { x: car.x, y: car.y };
        ped.fleeT = 1.4;
        speed = 208;
      }
    }
  }

  const len = Math.hypot(moveX, moveY);
  if (len > 0.01 && speed > 0) {
    moveX /= len;
    moveY /= len;
    ped.angle = Math.atan2(moveY, moveX);
    ped.speed = speed;
    const [nx, ny] = collideCircle(state.city, ped.x + moveX * speed * dt, ped.y + moveY * speed * dt, 9);
    ped.x = nx;
    ped.y = ny;
    ped.walkPhase += dt * speed * 0.075;
  } else {
    ped.speed = 0;
  }
}

// Cars meeting people: a slow nudge pushes a pedestrian aside; a fast hit puts them
// down, hurts the car a little, and — if the player is driving — is a serious crime.
export function collideCarsWithPeds(state) {
  for (const car of state.cars) {
    if (car.burned) continue;
    const speed = Math.abs(carSpeed(car));
    if (speed < 4 && car.driver !== 'player') continue;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (ped.carRef === car && ped.kind === 'officer') continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const rr = carRadius(car) + 9;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (speed > 118) {
        ped.state = 'down';
        ped.hp = 0;
        ped.deadT = 0;
        state.spawnHitFx?.(ped.x, ped.y);
        if (car.driver === 'player') state.crime('killped', ped.x, ped.y);
        else if (car.driver) state.crimeSeen?.(ped.x, ped.y);
        car.vx *= 0.82;
        car.vy *= 0.82;
      } else {
        const d = Math.hypot(dx, dy) || 1;
        ped.x += (dx / d) * 7;
        ped.y += (dy / d) * 7;
        if (ped.kind === 'ped') {
          ped.state = 'flee';
          ped.fleeFrom = { x: car.x, y: car.y };
          ped.fleeT = 1.6;
        }
        if (car.driver === 'player' && speed > 55) state.crime('hitped', ped.x, ped.y);
      }
    }
  }
}

export function updatePlayerOnFoot(state, dt) {
  const player = state.player;
  if (player.car) return;
  let mx = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0);
  const sprint = down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    player.angle = Math.atan2(my, mx);
    const [nx, ny] = collideCircle(state.city, player.x + mx * speed * dt, player.y + my * speed * dt, PLAYER.radius);
    player.x = nx;
    player.y = ny;
    player.walkPhase += dt * speed * 0.075;
    player.moving = true;
  } else {
    player.moving = false;
  }
  // Face the mouse while it is held down to shoot; otherwise face the walk direction.
  if (state.inputRef.mouse.down) {
    player.angle = Math.atan2(state.inputRef.mouse.worldY - player.y, state.inputRef.mouse.worldX - player.x);
  }
}

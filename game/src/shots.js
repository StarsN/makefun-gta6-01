// shots.js — deterministic posed scenes for the maker's screenshots.
// Each scene resets the world in memory (never touching the player's save),
// warms the simulation up so traffic and crowds settle naturally, places the
// cast precisely, freezes the frame and renames the page title to
// "SHOT <name> READY — Coral Bay Heat" so tooling knows the frame is ready.

import { Rng } from './rng.js';
import { createCar, createPed } from './entities.js';
import { roadCenter } from './world.js';
import { MISSION_DEFS, sms } from './missions.js';
import { defaultSave } from './save.js';

const STEP = 1 / 30;

function warmUp(game, steps) {
  for (let i = 0; i < steps; i++) game.update(STEP);
}

function putPlayerInCar(game, typeKey, x, y, angle, speedPx) {
  const car = createCar(typeKey, x, y, angle, 'player', game.rng);
  car.driver = 'player';
  car.renderVx = Math.cos(angle) * speedPx;
  car.renderVy = Math.sin(angle) * speedPx;
  car.speed = speedPx;
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x; game.player.y = y;
  game.player.vx = car.renderVx; game.player.vy = car.renderVy;
  return car;
}

function addCopUnit(game, x, y, angle) {
  const car = createCar('interceptor', x, y, angle, 'police', game.rng);
  car.color = '#f4f6f8'; car.driver = true;
  game.cars.push(car);
  game.units.push({ car, officer: null, stuckT: 0, reverseT: 0, shootT: 1, leaving: false });
  return car;
}

function beginScene(game, seed) {
  game.rng = new Rng(seed);
  game.resetEntities();
  game.save = defaultSave(); // in memory only: a screenshot never touches the real save
  game.state = 'playing';
  game.playT = 30; // past the control-hint window unless a scene wants it
}

export function setupShot(game, name, seed) {
  const pois = game.world.pois;
  if (name === 'title') {
    beginScene(game, seed);
    game.state = 'title';
    warmUp(game, 20);
    game.camera.x = 2080; game.camera.y = 1620; game.camera.zoom = 0.6;
  } else if (name === 'onfoot') {
    beginScene(game, seed);
    const f = game.world.fountain;
    game.player.x = f.x - 30; game.player.y = f.y + 86;
    game.player.angle = -0.5;
    for (let i = 0; i < 4; i++) {
      const ped = createPed(f.x + game.rng.range(-120, 120), f.y + game.rng.range(50, 130), game.rng);
      game.peds.push(ped);
    }
    warmUp(game, 50);
    game.player.x = f.x - 30; game.player.y = f.y + 86; game.player.angle = -0.5;
    game.camera.x = game.player.x; game.camera.y = game.player.y; game.camera.zoom = 1;
  } else if (name === 'chase') {
    beginScene(game, seed);
    const roadY = roadCenter(5);
    game.player.x = 2280; game.player.y = roadY;
    warmUp(game, 45);
    // Rae in a Ventana, eastbound on the pier road, delivery on the banner.
    putPlayerInCar(game, 'ventana', 2280, roadY + 24, 0, 219);
    game.mission.active = MISSION_DEFS[1];
    game.mission.stages = [{ kind: 'goto', x: pois.hotel.x, y: pois.hotel.y, r: 66, label: 'Deliver to Hotel Solana — fast', time: 150 }];
    game.mission.stageIdx = 0; game.mission.stageT = 141;
    game.phone.length = 0;
    sms(game, 'Mari: They are right behind you, Rae — do NOT stop. Hotel Solana, go!');
    game.heat = 385; game.stars = 4;
    addCopUnit(game, 2280 - 150, roadY - 24, 0);
    addCopUnit(game, 2280 - 265, roadY + 24, 0);
    addCopUnit(game, 2280 - 330, roadY - 24, 0);
    warmUp(game, 10);
    const car = game.player.car;
    car.speed = 219; car.renderVx = 219; car.renderVy = 0;
    game.heat = 385; game.stars = 4;
    game.camera.x = car.x + 60; game.camera.y = car.y; game.camera.zoom = 0.95;
  } else if (name === 'mission') {
    beginScene(game, seed);
    const roadY = roadCenter(6);
    game.player.x = 2375; game.player.y = roadY;
    warmUp(game, 45);
    putPlayerInCar(game, 'marlin', 2375, roadY - 24, 0, 175);
    game.mission.active = MISSION_DEFS[1];
    game.mission.stages = [{ kind: 'goto', x: pois.hotel.x, y: pois.hotel.y, r: 66, label: 'Deliver to Hotel Solana — fast', time: 150 }];
    game.mission.stageIdx = 0; game.mission.stageT = 97;
    game.phone.length = 0;
    sms(game, 'Mari: Hotel Solana. Fast, Rae — and keep the package in one piece.');
    warmUp(game, 3); // let the mission system publish the delivery objective
    const car = game.player.car;
    car.speed = 175; car.renderVx = 175; car.renderVy = 0;
    game.mission.stageT = 97;
    game.camera.x = car.x + 40; game.camera.y = car.y; game.camera.zoom = 0.95;
  }
  game.frozen = true;
  if (game.ctx) game.render(game.ctx);
  if (typeof document !== 'undefined') document.title = 'SHOT ' + name + ' READY — Coral Bay Heat';
}

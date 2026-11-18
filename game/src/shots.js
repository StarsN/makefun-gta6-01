// Staged screenshot scenes behind ?shot=title|chase|onfoot|mission, and the ?test=1
// self-check. Each scene builds on the real world and runs the real simulation
// forward with scripted keys, so a screenshot is a frame the game itself produced —
// the chase has real police AI behind the player, the mission scene is a real
// delivery stage with its timer running.

import { currentObjective } from './missions.js';
import { makePed } from './people.js';
import { makeCar } from './vehicles.js';

function givePlayerCar(state, modelId, x, y, angle, color) {
  const car = makeCar(state, modelId, x, y, angle, { kind: 'mission', color, driver: 'player' });
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

function policeCar(state, x, y, angle, speed) {
  const car = makeCar(state, 'interceptor', x, y, angle, { kind: 'police', driver: 'police', color: '#f1f2f6' });
  car.officerOut = false;
  car.officerCd = 0;
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  return car;
}

function runSteps(api, steps, keys) {
  api.setKeys(keys);
  for (let i = 0; i < steps; i += 1) api.step(1 / 60);
  api.setKeys([]);
}

function stageTitle(state, api) {
  state.mode = 'title';
  state.ui.selected = 0;
  state.camera.x = 3050;
  state.camera.y = 1500;
  state.camera.zoom = 0.92;
  // Life on the beachfront avenue behind the menu.
  const avenue = state.city.vRoads[8];
  makeCar(state, 'marlin', avenue - 23, 1180, Math.PI / 2, { kind: 'traffic', driver: 'traffic' })
    .ai = { axis: 'v', idx: 8, dir: 1, decidedKey: '', turn: null, stuckT: 0 };
  makeCar(state, 'taxi', avenue + 23, 1900, -Math.PI / 2, { kind: 'traffic', driver: 'traffic' })
    .ai = { axis: 'v', idx: 8, dir: -1, decidedKey: '', turn: null, stuckT: 0 };
  for (let i = 0; i < 7; i += 1) {
    makePed(state, 3330 + state.rng() * 90, 1250 + i * 95 + state.rng() * 30, {});
  }
  runSteps(api, 40, []);
  state.mode = 'title';
  state.camera.x = 3120;
  state.camera.y = 1560;
  state.camera.zoom = 0.92;
}

function stageChase(state, api) {
  api.startPlay();
  const road = state.city.vRoads[6]; // 2448, a long north-south avenue
  const car = givePlayerCar(state, 'ventana', road - 23, 1560, Math.PI / 2, '#e74c3c');
  car.vy = 235;
  policeCar(state, road - 23, 1330, Math.PI / 2, 245);
  policeCar(state, road + 23, 1240, Math.PI / 2, 250);
  policeCar(state, road - 23, 1090, Math.PI / 2, 255);
  const ahead = makeCar(state, 'marlin', road - 23, 2150, Math.PI / 2, { kind: 'traffic', driver: 'traffic', color: '#3498db' });
  ahead.ai = { axis: 'v', idx: 6, dir: 1, decidedKey: '', turn: null, stuckT: 0 };
  const oncoming = makeCar(state, 'pico', road + 23, 2300, -Math.PI / 2, { kind: 'traffic', driver: 'traffic', color: '#f39c12' });
  oncoming.ai = { axis: 'v', idx: 6, dir: -1, decidedKey: '', turn: null, stuckT: 0 };
  state.wanted.heat = 330; // four stars
  state.wanted.lastSeenAt = state.time;
  state.mission.index = 1;
  state.mission.phase = 'active';
  state.mission.stage = 1;
  state.mission.timer = 142;
  state.messages.push({ from: 'Mari', text: 'They are right behind you, Rae — do NOT stop. Hotel Solana, go!', ttl: 99 });
  runSteps(api, 62, ['KeyW']);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y + 60;
}

function stageOnfoot(state, api) {
  api.startPlay();
  const plaza = state.city.places.plaza;
  state.player.x = plaza.x - 40;
  state.player.y = plaza.y + 120;
  state.player.car = null;
  for (let i = 0; i < 9; i += 1) {
    const ped = makePed(state, plaza.x - 120 + state.rng() * 240, plaza.y - 110 + state.rng() * 220, {});
    ped.tx = plaza.x - 130 + state.rng() * 260;
    ped.ty = plaza.y - 120 + state.rng() * 240;
  }
  makeCar(state, 'ventana', plaza.x + 96, plaza.y + 128, 0, { kind: 'parked', color: '#e74c3c' });
  makeCar(state, 'marlin', plaza.x - 130, plaza.y + 128, 0, { kind: 'parked', color: '#ecf0f1' });
  runSteps(api, 46, ['KeyW']);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

function stageMission(state, api) {
  api.startPlay();
  const road = state.city.hRoads[3]; // 1248, the hotel's street
  const car = givePlayerCar(state, 'marlin', 2230, road + 23, 0, '#2ecc71');
  car.vx = 215;
  policeCar(state, 1985, road + 23, 0, 228);
  const cross = makeCar(state, 'brisa', state.city.vRoads[7], road - 190, Math.PI / 2, { kind: 'traffic', driver: 'traffic', color: '#9b59b6' });
  cross.ai = { axis: 'v', idx: 7, dir: 1, decidedKey: '', turn: null, stuckT: 0 };
  state.wanted.heat = 200; // three stars
  state.wanted.lastSeenAt = state.time;
  state.mission.index = 1;
  state.mission.phase = 'active';
  state.mission.stage = 1;
  state.mission.timer = 97;
  state.messages.push({ from: 'Mari', text: 'Hotel Solana. Fast, Rae — and keep the package in one piece.', ttl: 99 });
  runSteps(api, 58, ['KeyW']);
  state.camera.x = state.player.x + 120;
  state.camera.y = state.player.y;
}

export function stageShot(state, name, api) {
  if (name === 'chase') stageChase(state, api);
  else if (name === 'onfoot') stageOnfoot(state, api);
  else if (name === 'mission') stageMission(state, api);
  else stageTitle(state, api);
  state.objective = state.mode === 'play' ? currentObjective(state) : null;
}

// ----- the self-check ---------------------------------------------------------

export function runSelfTest(state, api) {
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  try {
    api.startPlay();
    const player = state.player;

    const startX = player.x;
    const startY = player.y;
    runSteps(api, 60, ['KeyW']);
    check('player walks on foot', Math.hypot(player.x - startX, player.y - startY) > 45, `moved ${Math.round(Math.hypot(player.x - startX, player.y - startY))}px`);

    const parked = state.cars.find((car) => car.kind === 'parked');
    check('a parked car exists to steal', Boolean(parked));
    if (parked) {
      player.x = parked.x + 30;
      player.y = parked.y;
      api.press('KeyE');
      api.step(1 / 60);
      api.setKeys([]);
      check('player enters the car with E', player.car === parked);
    }

    if (player.car) {
      const carX = player.car.x;
      const carY = player.car.y;
      runSteps(api, 72, ['KeyW']);
      const speed = Math.hypot(player.car.vx, player.car.vy);
      const moved = Math.hypot(player.car.x - carX, player.car.y - carY);
      check('car drives under power', speed > 55 && moved > 80, `speed ${Math.round(speed)} moved ${Math.round(moved)}px`);
      api.press('KeyE');
      api.step(1 / 60);
      api.setKeys([]);
      check('player exits the car with E', player.car === null);
    }

    api.setMouse(state.view.w / 2 + 120, state.view.h / 2, true);
    runSteps(api, 24, []);
    api.setMouse(0, 0, false);
    check('player fires the pistol', state.stats.shots >= 1, `${state.stats.shots} shots`);

    state.wanted.heat = 200;
    runSteps(api, 40, []);
    const police = state.cars.filter((car) => car.kind === 'police');
    check('wanted level rises and police respond', state.wanted.stars >= 3 && police.length >= 2, `${state.wanted.stars} stars, ${police.length} units`);

    const garage = state.city.places.garage;
    state.wanted.heat = 0;
    player.x = garage.x;
    player.y = garage.y;
    runSteps(api, 20, []);
    check('a mission starts at the garage', state.mission.phase === 'active', `mission ${state.mission.index}`);

    check('no page errors', state.errors.length === 0, state.errors.join('; '));
  } catch (error) {
    results.push(`FAIL self-test threw: ${error && error.message ? error.message : error}`);
  }
  const log = document.getElementById('testlog');
  const passed = results.every((line) => line.startsWith('PASS'));
  if (log) log.textContent = results.join('\n');
  document.title = `${passed ? 'TEST PASS' : 'TEST FAIL'} — Coral Bay Heat`;
  window.__testResults = results;
}

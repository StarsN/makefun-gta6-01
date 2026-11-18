// Coral Bay Heat — the game itself: state, the main loop, the camera, mode changes
// (title, play, pause, busted, wasted), pickups, damage and arrest outcomes, and the
// wiring that lets every other module call into the whole. Modules own the systems;
// this file owns the whole and the order they run in.

import { CITY, PLAYER } from './config.js';
import { makeRng } from './random.js';
import { buildCity, randomSidewalkPoint } from './city.js';
import { attachInput, attachMouse, down, endFrame, input, justPressed } from './input.js';
import { audio } from './audio.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { spawnParkedCars, spawnTrafficCar, tryEnterExit, updatePlayerCar, updateTraffic } from './vehicles.js';
import { collideCarsWithPeds, spawnCrowd, updatePeds, updatePlayerOnFoot } from './people.js';
import { collideCars } from './vehicles.js';
import { commitCrime, policeNearLevel, updateOfficers, updatePolice, updateWanted, clearPolice } from './police.js';
import { currentObjective, newMissionState, updateMissions } from './missions.js';
import { burst, damageCar, floatText, hitBurst, updateFx, updatePlayerShooting } from './combat.js';
import { drawScene } from './render.js';
import { drawBustedWasted, drawHUD, drawHelp, drawPause, drawTitle, titleItems } from './hud.js';
import { stageShot, runSelfTest } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') ?? 7) || 7;

function freshPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, walkPhase: 0, moving: false,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    car: null, ammo: 12, reloadT: 0, fireCd: 0, stunT: 0,
  };
}

function createState() {
  const state = {
    mode: 'title',
    time: 0,
    rng: makeRng(SEED * 7919 + 101),
    city: null,
    cars: [], peds: [], particles: [], tracers: [], texts: [], pickups: [], messages: [],
    player: freshPlayer(1848, 2048),
    wanted: { heat: 0, stars: 0, lastSeenAt: -99, seenNow: false, bust: 0, flashT: 0, lastCrimeAt: -99 },
    wantedFloor: 0,
    mission: newMissionState(),
    money: 0,
    stats: { stolen: 0, shots: 0, hits: 0, busted: 0, wasted: 0, missionsDone: 0 },
    camera: { x: 2900, y: 1650, zoom: 0.92 },
    view: { w: 1280, h: 800 },
    shake: 0,
    damageFlash: 0,
    lastHurtAt: -99,
    announce: null,
    objective: null,
    muted: false,
    hasSave: false,
    storyDone: false,
    ui: { selected: 0 },
    frozen: false,
    errors: [],
    crimeClock: {},
    saveClock: 0,
    inputRef: { mouse: input.mouse, keys: input.keys, down, justPressed },
  };
  return state;
}

const state = createState();
window.__game = state;
window.addEventListener('error', (event) => {
  state.errors.push(String(event.message ?? event.error ?? 'unknown error'));
});

function resetWorld() {
  state.city = buildCity(SEED);
  state.cars = [];
  state.peds = [];
  state.particles = [];
  state.tracers = [];
  state.texts = [];
  state.messages = [];
  spawnParkedCars(state);
  for (let i = 0; i < 24; i += 1) spawnTrafficCar(state, 130, 1500);
  spawnCrowd(state);
  spawnPickups();
}

function spawnPickups() {
  state.pickups = [];
  for (let i = 0; i < 12; i += 1) {
    const p = randomSidewalkPoint(state.city, state.rng, 1650, 1650, 1550);
    state.pickups.push({ x: p.x, y: p.y, kind: 'cash', amount: 20 + Math.floor(state.rng() * 41), taken: false, respawnT: 0 });
  }
  const hospital = state.city.places.hospital;
  state.pickups.push({ x: hospital.x + 30, y: hospital.y + 24, kind: 'health', amount: 45, taken: false, respawnT: 0 });
  for (let i = 0; i < 3; i += 1) {
    const p = randomSidewalkPoint(state.city, state.rng, 1650, 1650, 1550);
    state.pickups.push({ x: p.x, y: p.y, kind: 'health', amount: 45, taken: false, respawnT: 0 });
  }
}

// ----- cross-module hooks ---------------------------------------------------

state.crime = (kind, x, y) => {
  const last = state.crimeClock[kind] ?? -9;
  if (state.time - last < 0.7 && kind !== 'killcop' && kind !== 'killped') return;
  state.crimeClock[kind] = state.time;
  commitCrime(state, kind, x, y);
};
state.spawnHitFx = (x, y) => hitBurst(state, x, y);
state.onCarCrash = (car, speed) => {
  damageCar(state, car, (speed - 85) * 0.14, car === state.player.car);
  const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
  if (d < 720) audio.crash(Math.min(1, (speed - 85) / 220));
  if (car === state.player.car) state.shake = Math.min(11, state.shake + (speed - 85) * 0.03);
};
state.onCarsCollide = (a, b, rel) => {
  const dmg = (rel - 95) * 0.11;
  damageCar(state, a, dmg, b === state.player.car);
  damageCar(state, b, dmg, a === state.player.car);
  const playerCar = state.player.car;
  if (playerCar && (a === playerCar || b === playerCar)) {
    const other = a === playerCar ? b : a;
    state.shake = Math.min(10, state.shake + rel * 0.02);
    audio.crash(Math.min(1, rel / 260));
    if (other.kind === 'police') state.crime('hitcop', other.x, other.y);
    else state.crime('hitcar', other.x, other.y);
  }
};
state.hurtPlayer = (dmg, fromX, fromY) => {
  if (state.mode !== 'play' || state.frozen) return;
  const player = state.player;
  player.hp -= dmg;
  state.damageFlash = 1;
  state.lastHurtAt = state.time;
  if (!player.car && fromX !== undefined) {
    const d = Math.hypot(player.x - fromX, player.y - fromY) || 1;
    player.x += ((player.x - fromX) / d) * 7;
    player.y += ((player.y - fromY) / d) * 7;
  }
  if (player.hp <= 0) {
    player.hp = 0;
    doWasted();
  }
};
state.doBusted = () => {
  if (state.mode !== 'play') return;
  state.mode = 'busted';
  state.stats.busted += 1;
  audio.bustedSting();
};
state.saveGame = () => {
  writeSave(state);
  state.hasSave = true;
};

// ----- flow -----------------------------------------------------------------

function startNewGame() {
  clearSave();
  state.hasSave = false;
  state.money = 0;
  state.stats = { stolen: 0, shots: 0, hits: 0, busted: 0, wasted: 0, missionsDone: 0 };
  state.mission = newMissionState();
  state.storyDone = false;
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wantedFloor = 0;
  state.player = freshPlayer(1848, 2048);
  resetWorld();
  state.mode = 'play';
  state.messages.push({ from: 'Mari', text: 'Rae — you are back in Coral Bay. Come by the garage, I have work that pays.', ttl: 8 });
  state.messages.push({ from: 'Guide', text: 'Follow the yellow marker. E gets you into a car. Try not to get arrested.', ttl: 8 });
  audio.phone();
}

function startContinue() {
  const save = loadSave();
  if (!save) {
    startNewGame();
    return;
  }
  state.money = save.money ?? 0;
  state.stats = { stolen: 0, shots: 0, hits: 0, busted: 0, wasted: 0, missionsDone: 0, ...(save.stats ?? {}) };
  state.mission = newMissionState();
  state.mission.index = Math.min(save.missionIndex ?? 0, 5);
  state.mission.phase = state.mission.index >= 5 ? 'done' : 'offer';
  state.storyDone = Boolean(save.storyDone);
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wantedFloor = 0;
  state.player = freshPlayer(save.player?.x ?? 1848, save.player?.y ?? 2048);
  resetWorld();
  state.mode = 'play';
  state.messages.push({ from: 'Mari', text: 'There you are. The garage board is up to date — come get paid.', ttl: 7 });
}

function doWasted() {
  if (state.mode !== 'play') return;
  state.mode = 'wasted';
  state.stats.wasted += 1;
  audio.wastedSting();
}

function respawn() {
  const busted = state.mode === 'busted';
  const fee = busted ? 100 + 50 * state.wanted.stars : 120;
  state.money = Math.max(0, state.money - Math.min(state.money, fee));
  const place = busted ? state.city.places.station : state.city.places.hospital;
  if (state.player.car) {
    state.player.car.driver = null;
    state.player.car = null;
  }
  state.player = freshPlayer(place.x + 24, place.y + 30);
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bust = 0;
  state.wantedFloor = state.mission.phase === 'active' ? state.wantedFloor : 0;
  clearPolice(state);
  state.mode = 'play';
  state.saveGame();
}

// ----- per-frame update -------------------------------------------------------

function stepPlay(dt) {
  const player = state.player;
  if (player.stunT > 0) player.stunT -= dt;

  if (justPressed('KeyE', 'KeyF')) tryEnterExit(state);
  if (player.car) updatePlayerCar(state, dt);
  else if (player.stunT <= 0) updatePlayerOnFoot(state, dt);

  updateTraffic(state, dt);
  updatePeds(state, dt);
  collideCars(state);
  collideCarsWithPeds(state);
  playerCarDanger(dt);
  updateWanted(state, dt);
  if (state.mode !== 'play') return; // busted mid-frame
  updatePolice(state, dt);
  updateOfficers(state, dt);
  updatePlayerShooting(state, dt);
  updateMissions(state, dt);
  updatePickups(dt);
  updateFx(state, dt);

  // Health drifts back once the shooting stops.
  if (state.time - state.lastHurtAt > 6 && player.hp > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 6 * dt);
  }
  state.objective = currentObjective(state);

  state.saveClock += dt;
  if (state.saveClock > 20) {
    state.saveClock = 0;
    state.saveGame();
  }
}

function playerCarDanger(dt) {
  const player = state.player;
  if (player.car || player.stunT > 0) return;
  for (const car of state.cars) {
    if (!car.driver || car.burned) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 125) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < 30) {
      player.stunT = 0.55;
      state.hurtPlayer(20, car.x, car.y);
      burst(state, player.x, player.y, { count: 6, color: '#ffd166', speed: 90, life: 0.3, size: 3 });
      break;
    }
  }
}

function updatePickups(dt) {
  const player = state.player;
  for (const p of state.pickups) {
    if (p.taken) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        p.taken = false;
        if (p.kind === 'cash') {
          const np = randomSidewalkPoint(state.city, state.rng, player.x, player.y, 1300);
          p.x = np.x;
          p.y = np.y;
        }
      }
      continue;
    }
    if (Math.hypot(p.x - player.x, p.y - player.y) < 27) {
      p.taken = true;
      p.respawnT = p.kind === 'cash' ? 50 : 30;
      if (p.kind === 'cash') {
        state.money += p.amount;
        audio.cash();
        floatText(state, p.x, p.y - 16, `+$${p.amount}`, '#7bed6f');
      } else {
        player.hp = Math.min(player.maxHp, player.hp + p.amount);
        audio.pickup();
        floatText(state, p.x, p.y - 16, `+${p.amount} HP`, '#ff8fa3');
      }
    }
  }
}

function updateCamera(dt) {
  const cam = state.camera;
  const player = state.player;
  if (state.mode === 'title' || state.mode === 'help') {
    cam.x = 2920 + Math.cos(state.time * 0.06) * 420;
    cam.y = 1620 + Math.sin(state.time * 0.06) * 420;
    cam.zoom += (0.92 - cam.zoom) * Math.min(1, dt * 2);
    return;
  }
  const lead = player.car ? 0.34 : 0.12;
  const tx = player.x + (player.car ? player.car.vx * lead : 0);
  const ty = player.y + (player.car ? player.car.vy * lead : 0);
  const k = Math.min(1, dt * 5);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  let targetZoom = 1;
  if (player.car) {
    const speed = Math.hypot(player.car.vx, player.car.vy);
    targetZoom = 1 - Math.min(1, speed / player.car.model.topSpeed) * 0.2;
  }
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2.4);
  const halfW = state.view.w / 2 / cam.zoom;
  const halfH = state.view.h / 2 / cam.zoom;
  cam.x = Math.max(halfW - 80, Math.min(CITY.width - halfW + 80, cam.x));
  cam.y = Math.max(halfH - 80, Math.min(CITY.height - halfH + 80, cam.y));
}

function updateMessages(dt) {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    state.messages[i].ttl -= dt;
    if (state.messages[i].ttl <= 0) state.messages.splice(i, 1);
  }
  if (state.announce) {
    state.announce.ttl -= dt;
    if (state.announce.ttl <= 0) state.announce = null;
  }
  state.damageFlash = Math.max(0, state.damageFlash - dt * 2.6);
  state.shake = Math.max(0, state.shake - dt * 26);
}

function handleTitleInput() {
  const items = titleItems(state);
  if (justPressed('ArrowUp', 'KeyW')) state.ui.selected = (state.ui.selected + items.length - 1) % items.length;
  if (justPressed('ArrowDown', 'KeyS')) state.ui.selected = (state.ui.selected + 1) % items.length;
  let chosen = null;
  if (justPressed('Enter')) chosen = items[state.ui.selected]?.id;
  if (input.mouse.clicked) {
    for (const item of items) {
      if (input.mouse.x >= item.x && input.mouse.x <= item.x + item.w && input.mouse.y >= item.y && input.mouse.y <= item.y + item.h) {
        chosen = item.id;
      }
    }
  }
  if (!chosen) return;
  audio.unlock();
  audio.uiClick();
  if (chosen === 'new') startNewGame();
  else if (chosen === 'continue') startContinue();
  else if (chosen === 'help') state.mode = 'help';
}

function update(dt) {
  state.time += dt;
  // The mouse's world position, for aiming.
  input.mouse.worldX = (input.mouse.x - state.view.w / 2) / state.camera.zoom + state.camera.x;
  input.mouse.worldY = (input.mouse.y - state.view.h / 2) / state.camera.zoom + state.camera.y;

  if (justPressed('KeyM')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }

  switch (state.mode) {
    case 'title':
      updateTraffic(state, dt);
      updatePeds(state, dt);
      collideCars(state);
      handleTitleInput();
      break;
    case 'help':
      if (justPressed('Escape', 'Enter') || input.mouse.clicked) state.mode = 'title';
      break;
    case 'play':
      if (justPressed('KeyP', 'Escape')) {
        state.mode = 'pause';
        break;
      }
      stepPlay(dt);
      break;
    case 'pause':
      if (justPressed('KeyP', 'Escape', 'Enter')) state.mode = 'play';
      break;
    case 'busted':
    case 'wasted':
      updateFx(state, dt);
      if (justPressed('Enter')) respawn();
      break;
    default:
      break;
  }
  updateMessages(dt);
  updateCamera(dt);

  // Sound: the engine note follows the player's car; sirens swell as units close in.
  const speedNorm = state.player.car
    ? Math.min(1, Math.abs(state.player.car.vx) + Math.abs(state.player.car.vy)) / 320
    : null;
  audio.update(state.mode === 'play' && state.player.car ? Math.min(1, speedNorm) : null,
    state.mode === 'play' ? policeNearLevel(state) : 0);
}

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  state.view.w = w;
  state.view.h = h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#177e96';
  ctx.fillRect(0, 0, w, h);

  const shakeX = state.shake ? (state.rng() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (state.rng() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);
  drawScene(ctx, state);
  ctx.restore();

  if (state.mode === 'play' || state.mode === 'pause' || state.mode === 'busted' || state.mode === 'wasted') {
    drawHUD(ctx, state);
  }
  if (state.mode === 'title') drawTitle(ctx, state);
  else if (state.mode === 'help') drawHelp(ctx, state);
  else if (state.mode === 'pause') drawPause(ctx, state);
  else if (state.mode === 'busted' || state.mode === 'wasted') drawBustedWasted(ctx, state);

  canvas.style.cursor = state.mode === 'play' && !state.player.car ? 'none' : 'default';
}

// ----- boot -------------------------------------------------------------------

function boot() {
  attachInput(window);
  attachMouse(canvas);
  const save = loadSave();
  state.hasSave = Boolean(save);
  state.muted = Boolean(save?.muted);
  audio.setMuted(state.muted);
  resetWorld();
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  window.addEventListener('keydown', () => audio.unlock(), { once: false });

  const shotName = params.get('shot');
  const api = {
    state,
    startPlay() {
      state.mode = 'play';
      state.messages = [];
    },
    setKeys(codes) {
      input.keys.clear();
      for (const code of codes) input.keys.add(code);
    },
    press(code) {
      input.pressed.add(code);
      input.keys.add(code);
    },
    setMouse(x, y, isDown) {
      input.mouse.x = x;
      input.mouse.y = y;
      input.mouse.down = isDown;
    },
    step(dt) {
      state.time += dt;
      input.mouse.worldX = (input.mouse.x - state.view.w / 2) / state.camera.zoom + state.camera.x;
      input.mouse.worldY = (input.mouse.y - state.view.h / 2) / state.camera.zoom + state.camera.y;
      stepPlay(dt);
      updateMessages(dt);
      updateCamera(dt);
      endFrame();
    },
    draw,
  };

  if (shotName) {
    stageShot(state, shotName, api);
    state.frozen = true;
    window.__shotReady = shotName;
    document.title = `SHOT ${shotName} READY — Coral Bay Heat`;
  } else if (params.get('test') === '1') {
    runSelfTest(state, api);
    state.frozen = true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!state.frozen) {
      update(dt);
      endFrame();
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();

// Coral Bay Heat — the game itself. This module owns the game object and
// the state machine (title, how-to, play, pause, BUSTED, WASTED), wires
// every other module together, runs the fixed-step loop, and exposes a
// test handle when the page is opened with ?test=1.

import { WORLD_W, WORLD_H } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildCity, collideWorld } from './city.js';
import { SoundBank } from './audio.js';
import { input, bindInput, down, justPressed, clearPressed } from './input.js';
import { defaultSave, loadSave, writeSave, wipeSave, hasSave } from './save.js';
import { makeCar, stepCarPhysics, forwardSpeed, updateTrafficCar, collideCars, spawnTraffic, spawnParked, explodeCar, initNav } from './vehicles.js';
import { spawnPeds, updatePeds, makePed } from './people.js';
import { witnessCrime, updateWanted, starsFor } from './police.js';
import { fireBullet, updateBullets } from './combat.js';
import { startMission, updateMissions, currentObjective, onPlayerEnterCar } from './missions.js';
import { drawWorld } from './render.js';
import { drawHUD, drawMenus } from './hud.js';
import { updateFx, skid, floatText } from './fx.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams((globalThis.location && globalThis.location.search) || '');
const TEST_MODE = params.has('test');
const SHOT_NAME = params.get('shot');
const SEED = params.has('seed') ? parseInt(params.get('seed'), 10) : (TEST_MODE || SHOT_NAME ? 7 : (Date.now() % 90000) + 11);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = globalThis.innerWidth || 1280;
  canvas.height = globalThis.innerHeight || 800;
  g.screen.w = canvas.width; g.screen.h = canvas.height;
}
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('resize', resize);

function createGame() {
  const rng = makeRng(SEED);
  const city = buildCity(rng);
  const saved = loadSave();
  const g = {
    rng, city, time: 0, playT: 0, state: 'title',
    save: saved || defaultSave(),
    player: {
      x: city.spots.spawn.x, y: city.spots.spawn.y, angle: -Math.PI / 2, vx: 0, vy: 0,
      hp: 100, cash: saved ? saved.cash : 0, car: null,
      ammo: 12, reloading: false, reloadT: 0, fireT: 0, skin: '#c98d5f',
    },
    cars: [], peds: [], bullets: [], fx: [], skids: [], texts: [], messages: [],
    dialogue: null, mission: null, objective: null,
    heat: 0, heatFloor: 0, lastSeenT: -99, lastCrimeT: -99, bust: 0, spawnT: 0,
    cam: { x: city.spots.plaza.x, y: city.spots.plaza.y, zoom: 1 },
    screen: { w: 1280, h: 800 }, view: { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H },
    shake: 0, flashT: 0, menuIdx: 0, menuRects: [], lastFine: 0,
    shotMode: false, muted: false, saveT: 0, mouseWorld: null,
    sound: null,
  };
  g.sound = new SoundBank(g.save);
  g.muted = g.sound.muted;
  // Cross-module hooks (kept on g so the modules stay decoupled).
  g.witness = (x, y, amount, radius) => witnessCrime(g, x, y, amount, radius);
  g.explodeCar = (car) => explodeCar(g, car);
  g.skidAt = (x, y) => skid(g, x, y);
  g.say = (from, text) => { g.messages.push({ from, text, t: g.time }); if (g.messages.length > 8) g.messages.shift(); };
  g.talk = (who, text, secs) => { g.dialogue = { who, text, until: g.time + secs }; };
  g.persist = () => { g.save.cash = g.player.cash; g.save.muted = g.muted; writeSave(g.save); };
  g.hurtPlayer = (dmg) => {
    if (g.state !== 'play' || g.shotMode) return;
    g.player.hp -= dmg;
    g.flashT = Math.max(g.flashT, 0.3);
    g.shake = Math.max(g.shake, 4);
    if (g.player.hp <= 0) doWasted(g);
  };
  g.doBusted = () => doBusted(g);
  spawnTraffic(g, 15);
  spawnParked(g);
  spawnPeds(g, 30);
  return g;
}

const g = createGame();
resize();

// --- State changes -------------------------------------------------------

function startPlay(fresh) {
  if (fresh) {
    wipeSave();
    g.save = defaultSave();
    g.player.cash = 0;
    g.mission = null;
    g.heat = 0; g.bust = 0;
  } else {
    const s = loadSave();
    if (s) { g.save = s; g.player.cash = s.cash; }
  }
  g.player.hp = 100;
  g.state = 'play';
  g.playT = 0;
  if (g.save.missionDone === 0 && fresh) g.say('Mari', 'Rae. Garage, when you are ready. Bring your driving gloves.');
  g.persist();
}

function doBusted(g) {
  if (g.shotMode) return;
  const fine = Math.min(g.player.cash, 60 + starsFor(g.heat) * 40);
  g.lastFine = fine;
  g.player.cash -= fine;
  g.save.stats.busted += 1;
  g.heat = 0; g.heatFloor = 0; g.bust = 0;
  if (g.player.car) { g.player.x = g.player.car.x + 30; g.player.y = g.player.car.y + 10; g.player.car = null; }
  g.state = 'busted';
  g.persist();
}

function doWasted(g) {
  if (g.shotMode) return;
  const fine = Math.min(g.player.cash, 80);
  g.lastFine = fine;
  g.player.cash -= fine;
  g.save.stats.wasted += 1;
  g.heat = 0; g.heatFloor = 0; g.bust = 0;
  g.player.car = null;
  g.state = 'wasted';
  g.persist();
}

function respawn(g) {
  const spot = g.state === 'busted' ? g.city.spots.police : g.city.spots.hospital;
  g.player.x = spot.x; g.player.y = spot.y;
  g.player.hp = 100; g.player.ammo = 12;
  g.state = 'play';
}

// --- Player --------------------------------------------------------------

function tryEnterCar(g) {
  let best = null, bestD = 1e9;
  for (const car of g.cars) {
    if (car.dead) continue;
    const d = dist(g.player.x, g.player.y, car.x, car.y);
    if (d < car.spec.l * 0.5 + 30 && d < bestD) { best = car; bestD = d; }
  }
  if (!best) return;
  if (best.kind === 'police') { floatText(g, g.player.x, g.player.y - 24, 'LOCKED', '#ff8a7a'); return; }
  const wasTraffic = best.kind === 'traffic' && !best.driverOut;
  const wasParked = best.kind === 'parked' && !best.stolen;
  if (wasTraffic) {
    // Yank the driver out; they hit the pavement running.
    best.driverOut = true;
    const driver = makePed(g.rng, best.x + 20, best.y + 14);
    driver.state = 'flee'; driver.panicT = 2.8; driver.threatX = best.x; driver.threatY = best.y;
    g.peds.push(driver);
  }
  if (wasTraffic || wasParked) {
    best.stolen = true;
    g.save.stats.stolen += 1;
    g.witness(best.x, best.y, wasTraffic ? 95 : 70, 250);
  }
  g.player.car = best;
  best.input.throttle = 0; best.input.steer = 0;
  onPlayerEnterCar(g, best);
}

function exitCar(g) {
  const car = g.player.car;
  if (!car) return;
  const side = car.angle - Math.PI / 2;
  g.player.x = car.x + Math.cos(side) * (car.spec.w / 2 + 17);
  g.player.y = car.y + Math.sin(side) * (car.spec.w / 2 + 17);
  const res = collideWorld(g.city, g.player.x, g.player.y, 11);
  g.player.x = res.x; g.player.y = res.y;
  car.input.throttle = 0; car.input.steer = 0; car.input.brake = true;
  g.player.car = null;
}

function updatePlayer(g, dt) {
  const p = g.player;
  p.fireT -= dt;
  if (p.reloading) { p.reloadT -= dt; if (p.reloadT <= 0) { p.reloading = false; p.ammo = 12; } }
  if (justPressed('KeyE') || justPressed('KeyF')) {
    if (p.car) exitCar(g); else tryEnterCar(g);
  }
  if (p.car) {
    const car = p.car;
    if (g.shotMode) { car.input.throttle = 0.22; car.input.steer = 0; }
    else {
      car.input.throttle = (down('KeyW') || down('ArrowUp') ? 1 : 0) + (down('KeyS') || down('ArrowDown') ? -1 : 0);
      car.input.steer = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
      car.input.handbrake = down('Space');
      car.input.brake = false;
    }
    stepCarPhysics(g, car, dt);
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    g.save.stats.distance += Math.abs(forwardSpeed(car)) * dt;
    g.sound.engine(Math.abs(forwardSpeed(car)) / car.spec.top, true);
    return;
  }
  g.sound.engine(0, false);
  // On foot.
  let mx = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  let my = (down('KeyS') || down('ArrowDown') ? 1 : 0) - (down('KeyW') || down('ArrowUp') ? 1 : 0);
  const run = down('ShiftLeft') || down('ShiftRight');
  const spd = run ? 218 : 148;
  if (mx || my) {
    const d = Math.hypot(mx, my);
    mx /= d; my /= d;
    p.vx = mx * spd; p.vy = my * spd;
    const res = collideWorld(g.city, p.x + p.vx * dt, p.y + p.vy * dt, 11);
    p.x = res.x; p.y = res.y;
    g.save.stats.distance += spd * dt;
  } else { p.vx = 0; p.vy = 0; }
  // Cars are solid: they shove Rae aside, and a fast one knocks her down.
  for (const car of g.cars) {
    if (car.dead) continue;
    const rr = car.spec.l * 0.36 + 10;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < rr && d > 0.01) {
      const nx = (p.x - car.x) / d, ny = (p.y - car.y) / d;
      p.x += nx * (rr - d); p.y += ny * (rr - d);
      if (Math.hypot(car.vx, car.vy) > 170) { g.hurtPlayer(16); p.x += car.vx * 0.06; p.y += car.vy * 0.06; }
    }
  }
  // Aim at the mouse; shoot the pistol.
  if (g.mouseWorld && !g.shotMode) p.angle = Math.atan2(g.mouseWorld.y - p.y, g.mouseWorld.x - p.x);
  if (justPressed('KeyR') && !p.reloading && p.ammo < 12) { p.reloading = true; p.reloadT = 0.95; g.sound.reload(); }
  if (input.mouseDown && !p.reloading && p.fireT <= 0) {
    if (p.ammo <= 0) { p.fireT = 0.3; g.sound.dryFire(); p.reloading = true; p.reloadT = 0.95; g.sound.reload(); }
    else {
      p.ammo -= 1; p.fireT = 0.16;
      g.save.stats.shots += 1;
      fireBullet(g, p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, p.angle, false);
      g.sound.shot();
      g.witness(p.x, p.y, 45, 430);
      if (p.ammo === 0) { p.reloading = true; p.reloadT = 0.95; g.sound.reload(); }
    }
  }
}

// --- World update --------------------------------------------------------

function updatePlay(g, dt) {
  g.playT += dt;
  if (justPressed('KeyP') || justPressed('Escape')) { g.state = 'pause'; return; }
  updatePlayer(g, dt);
  for (const car of g.cars) {
    if (car.kind === 'traffic') updateTrafficCar(g, car, dt);
    else if (car !== g.player.car && (car.vx * car.vx + car.vy * car.vy) > 4) stepCarPhysics(g, car, dt);
  }
  collideCars(g, dt);
  updateWanted(g, dt);
  if (g.state !== 'play') return; // busted mid-update
  updatePeds(g, dt);
  updateBullets(g, dt);
  updateMissions(g, dt);
  updateFx(g, dt);
  g.objective = currentObjective(g);
  // Recycle far-off traffic to streets near the player.
  for (const car of g.cars) {
    if (car.kind !== 'traffic' || car.driverOut) continue;
    if (dist(car.x, car.y, g.player.x, g.player.y) > 1080) {
      const a = g.rng() * Math.PI * 2;
      car.x = clamp(g.player.x + Math.cos(a) * 600, 80, 2320);
      car.y = clamp(g.player.y + Math.sin(a) * 600, 80, 2320);
      car.health = car.maxHealth;
      initNav(g.rng, car);
    }
  }
  g.saveT -= dt;
  if (g.saveT <= 0) { g.saveT = 20; g.persist(); }
}

function updateAmbient(g, dt) {
  for (const car of g.cars) if (car.kind === 'traffic') updateTrafficCar(g, car, dt);
  collideCars(g, dt);
  updatePeds(g, dt);
  updateFx(g, dt);
  g.cam.x = g.city.spots.plaza.x + Math.cos(g.time * 0.07) * 150;
  g.cam.y = g.city.spots.plaza.y + Math.sin(g.time * 0.05) * 110;
  g.cam.zoom = 0.92;
}

function updateCamera(g, dt) {
  if (g.state !== 'play') return;
  const target = g.player.car || g.player;
  const look = g.player.car ? 0.38 : 0.12;
  const tx = target.x + (target.vx || 0) * look, ty = target.y + (target.vy || 0) * look;
  const k = 1 - Math.exp(-6 * dt), kz = 1 - Math.exp(-3 * dt);
  g.cam.x += (tx - g.cam.x) * k;
  g.cam.y += (ty - g.cam.y) * k;
  const speedRatio = g.player.car ? Math.abs(forwardSpeed(g.player.car)) / g.player.car.spec.top : 0;
  const tz = g.player.car ? 1 - speedRatio * 0.24 : 1;
  g.cam.zoom += (tz - g.cam.zoom) * kz;
}

function computeView(g) {
  const hw = g.screen.w / 2 / g.cam.zoom, hh = g.screen.h / 2 / g.cam.zoom;
  g.view = { x0: g.cam.x - hw - 90, y0: g.cam.y - hh - 90, x1: g.cam.x + hw + 90, y1: g.cam.y + hh + 90 };
  g.mouseWorld = {
    x: g.cam.x + (input.mouseX - g.screen.w / 2) / g.cam.zoom,
    y: g.cam.y + (input.mouseY - g.screen.h / 2) / g.cam.zoom,
  };
}

function stepGame(dt) {
  g.time += dt;
  g.flashT = Math.max(0, g.flashT - dt);
  g.shake *= Math.exp(-7 * dt);
  if (justPressed('KeyM') && g.state === 'play') {
    g.muted = !g.muted;
    g.sound.setMuted(g.muted);
    g.persist();
  }
  if (g.state === 'play') { updatePlay(g, dt); updateCamera(g, dt); }
  else if (g.state === 'title') {
    updateAmbient(g, dt);
    const n = hasSave() ? 3 : 2;
    if (justPressed('ArrowDown') || justPressed('KeyS')) g.menuIdx = (g.menuIdx + 1) % n;
    if (justPressed('ArrowUp') || justPressed('KeyW')) g.menuIdx = (g.menuIdx + n - 1) % n;
    if (justPressed('Enter')) activateMenu(g, ['new', 'continue', 'howto'][hasSave() ? g.menuIdx : (g.menuIdx === 0 ? 0 : 2)]);
  }
  else if (g.state === 'howto') { if (justPressed('Enter') || justPressed('Escape')) g.state = 'title'; }
  else if (g.state === 'pause') { if (justPressed('KeyP') || justPressed('Escape') || justPressed('Enter')) g.state = 'play'; }
  else if (g.state === 'busted' || g.state === 'wasted') { updateFx(g, dt); if (justPressed('Enter')) respawn(g); }
  computeView(g);
  clearPressed();
}

function activateMenu(g, action) {
  if (action === 'new') startPlay(true);
  else if (action === 'continue') startPlay(false);
  else if (action === 'howto') g.state = 'howto';
  else if (action === 'title') g.state = 'title';
}

function render() {
  const { w, h } = g.screen;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d141d';
  ctx.fillRect(0, 0, w, h);
  const shX = (Math.random() - 0.5) * 2 * g.shake, shY = (Math.random() - 0.5) * 2 * g.shake;
  ctx.translate(w / 2, h / 2);
  ctx.scale(g.cam.zoom, g.cam.zoom);
  ctx.translate(-g.cam.x + shX, -g.cam.y + shY);
  drawWorld(ctx, g);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (g.state === 'play' || g.state === 'pause') drawHUD(ctx, g);
  drawMenus(ctx, g);
  if (g.flashT > 0) {
    ctx.fillStyle = `rgba(205,32,22,${(g.flashT * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (TEST_MODE) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px monospace';
    ctx.fillText('TEST MODE — window.__cbh drives the game', 12, h - 12);
  }
}

// --- Boot ----------------------------------------------------------------

if (typeof globalThis.addEventListener === 'function') {
  bindInput(globalThis, canvas);
  globalThis.addEventListener('pointerdown', () => g.sound.unlock(), { once: false });
  globalThis.addEventListener('keydown', () => g.sound.unlock(), { once: false });
  canvas.addEventListener('click', () => {
    if (g.state !== 'title' && g.state !== 'howto') return;
    for (const r of g.menuRects) {
      if (input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h) activateMenu(g, r.action);
    }
  });
}

if (SHOT_NAME && setupShot(g, SHOT_NAME)) {
  // Settle the pose with a few real steps, then freeze on one clean frame.
  for (let i = 0; i < 18; i++) stepGame(1 / 60);
  render();
  document.title = `SHOT ${SHOT_NAME} READY — Coral Bay Heat`;
} else {
  let last = 0, acc = 0;
  const frame = (ts) => {
    const now = ts / 1000;
    let dt = Math.min(0.1, now - (last || now));
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 5) { stepGame(1 / 60); acc -= 1 / 60; n++; }
    render();
    globalThis.requestAnimationFrame(frame);
  };
  globalThis.requestAnimationFrame(frame);
}

if (TEST_MODE) {
  globalThis.__cbh = {
    g, input,
    step: (n = 1) => { for (let i = 0; i < n; i++) stepGame(1 / 60); },
    startNew: () => startPlay(true),
    teleport: (x, y) => { g.player.x = x; g.player.y = y; if (g.player.car) { g.player.car.x = x; g.player.car.y = y; } },
    press: (code) => { if (!input.keys.has(code)) input.pressed.add(code); input.keys.add(code); },
    release: (code) => input.keys.delete(code),
    setMouse: (x, y, downState) => { input.mouseX = x; input.mouseY = y; input.mouseDown = !!downState; g.mouseWorld = { x, y }; },
    render: () => render(),
  };
}

// game.js — the Game object: owns the world, every entity list, the wanted
// heat, the mission state and the screen state machine (title, help, playing,
// paused, busted, wasted, story complete), and steps the whole simulation.

import { WORLD_W, WORLD_H } from './config.js';
import { Rng, clamp, dist } from './rng.js';
import { buildWorld } from './world.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { createFx, updateFx, spawnParkedCars, updateTraffic, spawnPeds, updatePeds, spawnParticles } from './entities.js';
import { createPlayer, updatePlayer, damagePlayer, damageCar, exitCar } from './player.js';
import { updatePolice, starsForHeat, reportCrime } from './police.js';
import { initMissions, updateMissions, sms } from './missions.js';
import { loadSave, storeSave, wipeSave, defaultSave } from './save.js';
import { renderWorld } from './render.js';
import { drawHud, drawMenus } from './hud.js';

const WORLD_SEED = 20261118;

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas || null;
    this.view = { w: opts.width || 1280, h: opts.height || 800 };
    this.rng = new Rng(opts.seed ?? 7);
    this.world = buildWorld(WORLD_SEED);
    this.sound = new SoundEngine();
    this.input = new Input(canvas);
    this.state = 'title';
    this.time = 0; this.playT = 0;
    this.camera = { x: 900, y: 2900, zoom: 1 };
    this.shake = 0;
    this.buttons = [];
    this.frozen = false;
    this.hasSave = !!loadSave();
    this.save = loadSave() || defaultSave();
    this.sound.muted = this.save.muted;
    this.resetEntities();
    this.player.hp = 100;
    const g = this.world.pois.garage;
    this.player.x = g.x; this.player.y = g.y + 30;
    this.camera.x = this.player.x; this.camera.y = this.player.y;
  }

  resetEntities() {
    this.cars = []; this.peds = []; this.officers = []; this.units = [];
    this.fx = createFx();
    this.heat = 0; this.stars = 0; this.seen = false; this.bust = 0;
    this.missionHeatFloor = 0;
    this.threat = null;
    spawnParkedCars(this.world, this.rng, this.cars);
    this.player = createPlayer(0, 0);
    spawnPeds(this);
    initMissions(this);
    this.damagePlayer = (n, sx, sy) => damagePlayer(this, n, sx, sy);
  }

  // --- state flow -----------------------------------------------------------

  newGame() {
    wipeSave();
    this.save = defaultSave();
    this.hasSave = false;
    this.resetEntities();
    const g = this.world.pois.garage;
    this.player.x = g.x; this.player.y = g.y + 26;
    this.state = 'playing'; this.playT = 0;
    sms(this, 'Mari: Rae, ven. I have work and the garage coffee is terrible. Come see me.');
    this.persist();
  }

  continueGame() {
    this.save = loadSave() || defaultSave();
    this.resetEntities();
    const g = this.world.pois.garage;
    this.player.x = g.x; this.player.y = g.y + 26;
    this.state = 'playing'; this.playT = 0;
  }

  persist() { storeSave(this.save); this.hasSave = true; }

  showStoryComplete() { this.state = 'story'; }

  doBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.lastFine = Math.min(this.save.cash, Math.max(40, Math.round(this.save.cash * 0.12)));
    this.save.cash -= this.lastFine;
    this.save.stats.busts++;
    this.sound.bustedTone();
    this.persist();
  }

  doWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.lastFine = Math.min(this.save.cash, Math.max(30, Math.round(this.save.cash * 0.08)));
    this.save.cash -= this.lastFine;
    this.save.stats.wasted++;
    this.sound.stinger(false);
    this.persist();
  }

  respawn() {
    // Busted wakes up outside the station; wasted outside the hospital.
    const at = this.state === 'busted' ? this.world.pois.police : this.world.pois.hospital;
    if (this.player.car) { this.player.car.role = 'parked'; this.player.car.driver = false; this.player.car = null; }
    this.player.x = at.x; this.player.y = at.y + 24;
    this.player.hp = 100; this.player.dead = false; this.player.ammo = this.player.magSize;
    this.heat = 0; this.stars = 0; this.bust = 0; this.missionHeatFloor = 0;
    for (const u of this.units) {
      const i = this.cars.indexOf(u.car);
      if (i >= 0) this.cars.splice(i, 1);
    }
    this.units = []; this.officers = [];
    this.state = 'playing';
  }

  // --- per-frame --------------------------------------------------------------

  screenToWorld(sx, sy) {
    return {
      x: this.camera.x + (sx - this.view.w / 2) / this.camera.zoom,
      y: this.camera.y + (sy - this.view.h / 2) / this.camera.zoom,
    };
  }

  update(dt) {
    this.time += dt;
    if (this.frozen) return;
    this.handleUiKeys();
    if (this.state !== 'playing') { this.updateCamera(dt, true); return; }
    this.playT += dt;
    updatePlayer(this, dt);
    updateTraffic(this, dt);
    updatePeds(this, dt);
    updatePolice(this, dt);
    updateMissions(this, dt);
    this.updateCarContacts(dt);
    updateFx(this.fx, dt);
    this.updateCamera(dt, false);
    this.sound.engine(!!this.player.car, this.player.car ? Math.abs(this.player.car.speed) / this.player.car.type.topSpeed : 0);
    let nearestCop = 1e9;
    for (const u of this.units) nearestCop = Math.min(nearestCop, dist(u.car.x, u.car.y, this.player.x, this.player.y));
    this.sound.siren(this.stars > 0 ? nearestCop : 1e9);
    this.sound.music(dt, true);
  }

  updateCarContacts(dt) {
    const p = this.player;
    // The player's car shoves other cars and, at speed, flattens pedestrians.
    if (p.car) {
      const mine = p.car;
      for (const other of this.cars) {
        if (other === mine) continue;
        const rr = (mine.type.len + other.type.len) * 0.36;
        const d = dist(mine.x, mine.y, other.x, other.y);
        if (d < rr && d > 0.01) {
          const nx = (other.x - mine.x) / d, ny = (other.y - mine.y) / d;
          const push = (rr - d) / 2;
          other.x += nx * push; other.y += ny * push;
          if (other.role === 'traffic') { other.bumpX += nx * push * 1.6; other.bumpY += ny * push * 1.6; other.renderX = other.x; other.renderY = other.y; }
          const impact = Math.abs(mine.speed) * 0.5 + Math.abs(other.speed || 0) * 0.3;
          if (impact > 60) {
            damageCar(this, other, impact * 0.09);
            damageCar(this, mine, impact * 0.05);
            this.sound.crash(impact > 130);
            this.shake = Math.min(14, this.shake + impact * 0.04);
            spawnParticles(this.fx, (mine.x + other.x) / 2, (mine.y + other.y) / 2, { n: 7, color: '#ffd76a', speed: 130, size: 3, life: 0.35 });
            if (other.role === 'police') this.heat = Math.min(500, this.heat + 12);
          }
          mine.speed *= 0.82;
        }
      }
      if (Math.abs(mine.speed) > 130) {
        for (const ped of this.peds) {
          if (ped.state === 'down') continue;
          if (dist(mine.x, mine.y, ped.x, ped.y) < mine.type.len * 0.4) {
            ped.state = 'down'; ped.downT = 7; ped.hp = 0;
            damageCar(this, mine, 4);
            this.sound.crash(false);
            this.shake = Math.min(12, this.shake + 3);
            reportCrime(this, 'hitPed', ped.x, ped.y);
          }
        }
      }
    }
    // Traffic does not politely stop for Rae on foot.
    if (!p.car && this.state === 'playing') {
      for (const car of this.cars) {
        if (car.role !== 'traffic' || car.wrecked) continue;
        if (Math.abs(car.speed) > 150 && dist(car.x, car.y, p.x, p.y) < 26) {
          damagePlayer(this, 16, car.x, car.y);
          car.speed *= 0.4;
        }
      }
    }
  }

  updateCamera(dt, menuMode) {
    const p = this.player;
    let tx = p.x, ty = p.y, tz = 1;
    if (menuMode && this.state === 'title') {
      // A slow drift over the south-east shore behind the title.
      tx = 2350 + Math.sin(this.time * 0.05) * 500;
      ty = 1500 + Math.cos(this.time * 0.037) * 600;
      tz = 0.62;
    } else if (p.car) {
      const lead = clamp(Math.abs(p.car.speed) / p.car.type.topSpeed, 0, 1);
      tx = p.x + Math.cos(p.car.angle) * lead * 120;
      ty = p.y + Math.sin(p.car.angle) * lead * 120;
      tz = 1 - lead * 0.2;
    }
    const k = Math.min(1, dt * (menuMode ? 0.7 : 5));
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    this.camera.zoom += (tz - this.camera.zoom) * Math.min(1, dt * 2.4);
    this.camera.x = clamp(this.camera.x, 0, WORLD_W);
    this.camera.y = clamp(this.camera.y, 0, WORLD_H);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  handleUiKeys() {
    const input = this.input;
    if (input.tapped('m')) { this.save.muted = !this.save.muted; this.sound.setMuted(this.save.muted); this.persist(); }
    if (this.state === 'playing' && input.tapped('p', 'escape')) this.state = 'paused';
    else if (this.state === 'paused' && input.tapped('p', 'escape')) this.state = 'playing';
    else if (this.state === 'title' && input.tapped('enter')) { if (this.hasSave) this.continueGame(); else this.newGame(); }
    else if ((this.state === 'busted' || this.state === 'wasted') && input.tapped('enter')) this.respawn();
    else if (this.state === 'story' && input.tapped('enter')) this.state = 'playing';
    if (input.mouse.clicked && this.buttons.length) {
      const { x, y } = input.mouse;
      for (const b of this.buttons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.clickButton(b.id); break; }
      }
    }
  }

  clickButton(id) {
    this.sound.ensure();
    if (id === 'new') this.newGame();
    else if (id === 'continue') this.continueGame();
    else if (id === 'help') this.state = 'help';
    else if (id === 'back') this.state = 'title';
    else if (id === 'resume') this.state = 'playing';
    else if (id === 'mute') { this.save.muted = !this.save.muted; this.sound.setMuted(this.save.muted); this.persist(); }
    else if (id === 'restart') this.newGame();
    else if (id === 'quit') this.state = 'title';
    else if (id === 'respawn') this.respawn();
    else if (id === 'freeroam') this.state = 'playing';
  }

  render(ctx) {
    this.buttons = [];
    ctx.save();
    ctx.translate(this.view.w / 2, this.view.h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    if (this.shake > 0.2) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.translate(-this.camera.x, -this.camera.y);
    renderWorld(ctx, this);
    ctx.restore();
    if (this.state === 'playing' || this.state === 'paused') drawHud(ctx, this);
    if (this.state !== 'playing') drawMenus(ctx, this);
  }
}


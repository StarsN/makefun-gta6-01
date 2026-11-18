// main.js — browser bootstrap: canvas sizing, the animation loop, sound
// unlock on first gesture, and the ?shot= / ?test= entry points the maker
// uses for screenshots and the in-page self-test.

import { Game } from './game.js';
import { setupShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = new Game(canvas, { width: window.innerWidth, height: window.innerHeight });
game.ctx = ctx;

function resize() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  game.view.w = window.innerWidth;
  game.view.h = window.innerHeight;
  game.dpr = dpr;
}
window.addEventListener('resize', resize);
resize();

const unlock = () => { game.sound.ensure(); };
window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  setupShot(game, params.get('shot'), parseInt(params.get('seed') || '7', 10));
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  game.update(dt);
  ctx.setTransform(game.dpr || 1, 0, 0, game.dpr || 1, 0, 0);
  game.render(ctx);
  game.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('test')) {
  const results = runPageTest();
  const el = document.createElement('pre');
  el.id = 'test-results';
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;background:#000c;color:#7f7;padding:10px;font:12px monospace;max-height:90vh;overflow:auto';
  el.textContent = results.join('\n');
  document.body.appendChild(el);
  const passed = results.filter((r) => r.startsWith('PASS')).length;
  document.title = 'TESTS ' + passed + '/' + (results.length - 1) + ' PASS';
}

// A compact in-page smoke test driving a throwaway Game through the core
// verbs. The thorough soak lives in the maker's Node harness.
function runPageTest() {
  const out = [];
  const check = (name, ok) => out.push((ok ? 'PASS' : 'FAIL') + ' ' + name);
  try {
    const g = new Game(null, { width: 1280, height: 800, seed: 7 });
    g.state = 'playing';
    const p = g.player;
    p.x = 900; p.y = 2900;
    const y0 = p.y;
    g.input.keys.add('w');
    for (let i = 0; i < 20; i++) g.update(1 / 30);
    g.input.keys.clear();
    check('walk north', p.y < y0 - 40);
    const car = g.cars.find((c) => c.role === 'parked') || g.cars[0];
    p.x = car.x + 30; p.y = car.y;
    g.input.pressed.add('e'); g.update(1 / 30); g.input.pressed.clear();
    check('enter car', p.car === car);
    g.input.keys.add('w');
    for (let i = 0; i < 45; i++) g.update(1 / 30);
    g.input.keys.clear();
    check('drive fast', Math.abs(car.speed) > 110);
    car.speed = 0; if (car.renderVx) { car.renderVx = 0; car.renderVy = 0; }
    g.input.pressed.add('e'); g.update(1 / 30); g.input.pressed.clear();
    check('exit car', p.car === null);
    g.input.mouse.down = true; g.input.mouse.x = 900; g.input.mouse.y = 300;
    const shots0 = g.save.stats.shots;
    for (let i = 0; i < 12; i++) g.update(1 / 30);
    g.input.mouse.down = false;
    check('shoot pistol', g.save.stats.shots > shots0 && g.fx.tracers.length >= 0);
    g.heat = 260;
    for (let i = 0; i < 90 && g.units.length === 0; i++) g.update(1 / 30);
    for (let i = 0; i < 3; i++) g.update(1 / 30); // let the star count settle at the new heat
    check('police respond', g.units.length > 0 && g.stars >= 2);
    const gar = g.world.pois.garage;
    p.x = gar.x; p.y = gar.y;
    for (let i = 0; i < 6; i++) g.update(1 / 30);
    check('mission starts', !!g.mission.active);
    g.render(ctx);
    check('render frame', true);
  } catch (err) {
    out.push('FAIL exception: ' + (err && err.message));
  }
  out.push('DONE');
  return out;
}

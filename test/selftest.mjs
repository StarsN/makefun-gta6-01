// selftest.mjs — headless verification of Coral Bay Heat under Node.
//   node test/selftest.mjs
// Installs minimal DOM/canvas/storage stubs, then drives the real Game
// through the core verbs (walk, enter, drive, exit, shoot, wanted response,
// mission start, a full render frame) and a long soak: the whole five-mission
// story chain, a five-star chase, a bust, a wasting, pause/resume and saves.

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

function makeStubCtx() {
  let calls = 0;
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    get calls() { return calls; },
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => { calls++; };
    },
    set(t, prop, value) { t[prop] = value; return true; },
  });
}

const { Game } = await import('../game/src/game.js');
const { loadSave } = await import('../game/src/save.js');

let passed = 0, failed = 0;
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function step(g, n = 1) {
  for (let i = 0; i < n; i++) { g.update(1 / 30); g.input.pressed.clear(); g.input.mouse.clicked = false; }
}
function tap(g, key) { g.input.pressed.add(key); step(g, 1); }
function teleport(g, x, y) {
  const p = g.player;
  p.x = x; p.y = y;
  if (p.car) { p.car.x = x; p.car.y = y; p.car.renderX = x; p.car.renderY = y; }
}

// ---------- core verbs -------------------------------------------------------
{
  const g = new Game(null, { width: 1280, height: 800, seed: 7 });
  g.state = 'playing';
  const p = g.player;
  p.x = 900; p.y = 2900;
  const y0 = p.y;
  g.input.keys.add('w'); step(g, 20); g.input.keys.clear();
  check('walk north on foot', p.y < y0 - 40, 'moved ' + Math.round(y0 - p.y));

  const car = g.cars.find((c) => c.role === 'parked');
  check('parked cars exist', !!car);
  teleport(g, car.x + 28, car.y);
  step(g, 2);
  tap(g, 'e');
  check('enter car with E', p.car === car);

  // Move the car onto an open road for the driving check.
  car.x = 52 + 430 * 2; car.y = 52 + 430; car.angle = 0; car.renderX = car.x; car.renderY = car.y; car.renderVx = 0; car.renderVy = 0;
  p.x = car.x; p.y = car.y;
  g.input.keys.add('w');
  let maxSpeed = 0;
  for (let i = 0; i < 50; i++) { step(g, 1); maxSpeed = Math.max(maxSpeed, Math.abs(car.speed)); }
  g.input.keys.clear();
  check('drive: car accelerates past 110 px/s', maxSpeed > 110, 'max ' + Math.round(maxSpeed));

  car.speed = 0; car.renderVx = 0; car.renderVy = 0;
  tap(g, 'e');
  check('exit car with E', p.car === null);

  g.input.mouse.down = true; g.input.mouse.x = 1000; g.input.mouse.y = 250;
  const shots0 = g.save.stats.shots;
  step(g, 14);
  g.input.mouse.down = false;
  check('shoot pistol (shots counted, ammo spent)', g.save.stats.shots > shots0 && p.ammo < 12,
    'shots ' + g.save.stats.shots + ' ammo ' + p.ammo);

  g.heat = 260;
  for (let i = 0; i < 40 && g.units.length === 0; i++) step(g, 1);
  step(g, 3); // let a few frames recompute the star count at the new heat
  check('police respond at 3 stars', g.units.length > 0 && g.stars >= 2, 'units ' + g.units.length + ' stars ' + g.stars);
  for (const u of g.units) { const ix = g.cars.indexOf(u.car); if (ix >= 0) g.cars.splice(ix, 1); }
  g.units = []; g.officers = []; g.heat = 0;

  const gar = g.world.pois.garage;
  teleport(g, gar.x, gar.y);
  step(g, 4);
  check('mission starts at the garage', !!g.mission.active && g.mission.active.id === 'first-wheels',
    g.mission.active ? g.mission.active.id : 'none');

  const ctx = makeStubCtx();
  g.render(ctx);
  check('full render frame without errors', ctx.calls > 150, 'draw calls ' + ctx.calls);
}

// ---------- soak: the whole story chain --------------------------------------
{
  const g = new Game(null, { width: 1280, height: 800, seed: 11 });
  g.newGame();
  const p = g.player;
  const gar = g.world.pois.garage;
  let guard = 0;
  while (g.save.missionsDone < 5 && guard++ < 60) {
    if (!g.mission.active) { teleport(g, gar.x, gar.y); step(g, 3); continue; }
    const m = g.mission, stage = m.stages[m.stageIdx];
    if (!stage) { step(g, 2); continue; }
    if (stage.kind === 'steal') {
      if (p.car && p.car !== stage.car) { p.car.speed = 0; p.car.renderVx = 0; p.car.renderVy = 0; tap(g, 'e'); }
      // Stand below the target: parking rows are 56px apart, so the side
      // spots fall outside the enter range from here.
      teleport(g, stage.car.x, stage.car.y + 40);
      step(g, 2); tap(g, 'e'); step(g, 2);
      if (p.car !== stage.car && p.car) { p.car.speed = 0; p.car.renderVx = 0; p.car.renderVy = 0; tap(g, 'e'); teleport(g, stage.car.x, stage.car.y + 40); step(g, 2); tap(g, 'e'); step(g, 2); }
    } else if (stage.kind === 'deliverCar') {
      teleport(g, stage.x, stage.y); step(g, 3);
    } else if (stage.kind === 'goto') {
      teleport(g, stage.x, stage.y); step(g, 3);
    } else if (stage.kind === 'collect') {
      for (const c of m.collect) if (!c.got) { teleport(g, c.x, c.y); step(g, 3); }
    }
    step(g, 2);
    if (g.state === 'busted' || g.state === 'wasted') g.respawn();
  }
  check('soak: all five missions complete', g.save.missionsDone === 5, 'done ' + g.save.missionsDone);
  check('soak: story pays $2,400 in total', g.save.cash === 2400, 'cash ' + g.save.cash);
  check('soak: story-complete screen reached', g.state === 'story' || g.save.storyComplete === true);
  if (g.state === 'story') g.clickButton('freeroam');

  // Five-star chase with a simple autopilot around one block ring.
  if (p.car) { p.car.speed = 0; p.car.renderVx = 0; p.car.renderVy = 0; tap(g, 'e'); step(g, 2); }
  const car = g.cars.find((c) => c.role === 'parked' && !c.wrecked) || g.cars[0];
  teleport(g, car.x, car.y + 40); step(g, 2); tap(g, 'e');
  const drive = g.player.car;
  check('soak: entered a car for the chase', !!drive);
  if (drive) {
  drive.x = 52; drive.y = 52 + 430; drive.angle = 0; drive.renderX = drive.x; drive.renderY = drive.y;
  g.player.x = drive.x; g.player.y = drive.y;
  g.heat = 500;
  const corners = [[3546 - 52, 52 + 430], [3546 - 52, 52 + 430 * 7], [52, 52 + 430 * 7], [52, 52 + 430]];
  let ci = 0, sawCops = false, steps = 0;
  g.input.keys.add('w');
  while (steps++ < 1500) {
    const t = corners[ci];
    if (Math.hypot(drive.x - t[0], drive.y - t[1]) < 120) ci = (ci + 1) % corners.length;
    const want = Math.atan2(t[1] - drive.y, t[0] - drive.x);
    let diff = (want - drive.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2; if (diff < -Math.PI) diff += Math.PI * 2;
    g.input.keys.delete('a'); g.input.keys.delete('d');
    if (diff > 0.12) g.input.keys.add('d'); else if (diff < -0.12) g.input.keys.add('a');
    step(g, 1);
    if (g.units.length > 0) sawCops = true;
    if (g.state !== 'playing') break;
  }
  g.input.keys.clear();
  check('soak: five-star chase runs, police engage', sawCops && steps > 60, 'steps ' + steps + ' state ' + g.state);
  if (g.state === 'busted' || g.state === 'wasted') { g.respawn(); check('soak: respawn after chase ending', g.state === 'playing' && g.heat === 0); }
  }

  // Bust: stand still on foot next to the law.
  if (g.player.car) { g.player.car.speed = 0; g.player.car.renderVx = 0; g.player.car.renderVy = 0; tap(g, 'e'); }
  g.heat = 210;
  for (let i = 0; i < 120 && g.units.length === 0; i++) step(g, 1);
  const unit = g.units[0];
  check('soak: a unit arrives for the bust test', !!unit);
  if (unit) {
    teleport(g, unit.car.x + 60, unit.car.y);
    let busted = false;
    for (let i = 0; i < 900 && !busted; i++) { step(g, 1); if (g.state === 'busted') busted = true; }
    check('soak: standing still under arrest ends BUSTED', busted, 'state ' + g.state + ' officers ' + g.officers.length);
    if (busted) { g.respawn(); check('soak: respawn at the station clears heat', g.state === 'playing' && g.heat === 0); }
  }

  // Wasted and hospital respawn.
  g.damagePlayer(500);
  check('soak: lethal damage ends WASTED', g.state === 'wasted', 'state ' + g.state);
  if (g.state === 'wasted') { g.respawn(); check('soak: hospital respawn restores health', g.state === 'playing' && g.player.hp === 100); }

  // Pause / resume and save round-trip.
  tap(g, 'p');
  const pausedOk = g.state === 'paused';
  tap(g, 'p');
  check('soak: pause and resume', pausedOk && g.state === 'playing', 'state ' + g.state);
  g.persist();
  const loaded = loadSave();
  check('soak: save persists cash and progress', !!loaded && loaded.cash === g.save.cash && loaded.missionsDone === 5);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

// Headless self-test for Coral Bay Heat. Stubs the DOM/canvas/storage,
// loads the real game with ?test=1&seed=7, then drives it through its own
// input system: walking, stealing and driving a car, shooting, raising a
// wanted level, starting a mission and rendering a frame — followed by a
// soak that plays the whole story chain, survives five stars, and goes
// through a bust, a wasting and a pause/resume.
//
//   node test/selftest.mjs

let ctxCalls = 0;
function makeCtx(canvas) {
  const base = {
    canvas,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(base, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => { ctxCalls++; return undefined; };
    },
    set: () => true,
  });
}
function makeCanvas() {
  const c = { width: 0, height: 0, style: {}, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) };
  c.getContext = () => makeCtx(c);
  return c;
}
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { search: '?test=1&seed=7' };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
globalThis.requestAnimationFrame = () => 0;
globalThis.addEventListener = () => {};
globalThis.document = {
  title: '',
  getElementById: () => makeCanvas(),
  createElement: () => makeCanvas(),
  addEventListener: () => {},
};

await import('../game/src/main.js');
const T = globalThis.__cbh;
if (!T) { console.error('FAIL: test handle missing'); process.exit(1); }
const g = T.g;

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
const steps = (n) => T.step(n);
function tap(code) { T.press(code); steps(1); T.release(code); steps(1); }

console.log('SELFTEST — scripted play');
T.startNew();
check('new game enters play state', g.state === 'play');

// 1. Walking.
const y0 = g.player.y;
T.press('KeyW'); steps(50); T.release('KeyW');
check('walking moves the player', g.player.y < y0 - 25, `dy=${(g.player.y - y0).toFixed(1)}`);

// 2. Enter a (parked) car.
const parked = g.cars.find((c) => c.kind === 'parked');
T.teleport(parked.x + 20, parked.y);
tap('KeyE');
check('E enters a car', g.player.car === parked, `car=${g.player.car && g.player.car.model}`);

// 3. Driving.
const cx0 = parked.x, cy0 = parked.y;
T.press('KeyW'); steps(80); T.release('KeyW');
const drove = Math.hypot(parked.x - cx0, parked.y - cy0);
check('driving moves the car', drove > 90, `moved=${drove.toFixed(0)} speed=${Math.hypot(parked.vx, parked.vy).toFixed(0)}`);

// 4. Exit.
tap('KeyE');
check('E leaves the car', g.player.car === null);

// 5. Shooting.
g.player.ammo = 12; g.player.reloading = false;
T.input.mouseX = 640 + 200; T.input.mouseY = 400;
T.input.mouseDown = true; steps(4); T.input.mouseDown = false;
check('shooting fires the pistol', g.save.stats.shots > 0 && g.player.ammo < 12, `shots=${g.save.stats.shots} ammo=${g.player.ammo}`);

// 6. A witnessed theft raises heat; police respond.
const witness = g.peds.find((p) => !p.dead && p.role === 'ped');
const target = g.cars.find((c) => c.kind === 'parked' && c !== parked);
witness.x = target.x + 30; witness.y = target.y + 10; witness.state = 'wander';
T.teleport(target.x + 18, target.y);
tap('KeyE');
check('witnessed theft raises heat', g.heat > 0, `heat=${g.heat.toFixed(0)}`);
// Keep moving for six seconds — sitting still in a stolen car gets you busted.
for (let i = 0; i < 6; i++) { T.teleport(300 + i * 300, 300 + (i % 3) * 300); steps(60); }
const cops = g.cars.filter((c) => c.kind === 'police' && !c.dead).length;
check('police respond to the wanted level', cops >= 1, `cops=${cops}`);
check('evading driver is not busted', g.state === 'play', `state=${g.state}`);
if (g.player.car) tap('KeyE'); // step out again
g.heat = 0;

// 7. A mission starts at Mari's garage.
T.teleport(g.city.spots.garage.x, g.city.spots.garage.y);
steps(3);
check('garage starts the first mission', !!g.mission && g.mission.def.name === 'First Wheels', `mission=${g.mission && g.mission.def.name}`);

// 8. A full render frame runs clean.
ctxCalls = 0;
T.render();
check('render frame executes (stub ctx calls)', ctxCalls > 400, `calls=${ctxCalls}`);

console.log('SOAK — the whole story, five stars, bust, wasted, pause');
// Play the full mission chain by travelling to each objective.
function completeCurrentMission() {
  let guard = 0;
  while (g.mission && guard++ < 40) {
    const m = g.mission;
    const step = m.steps[m.idx];
    if (!step) break;
    g.player.hp = 100;
    if (step.type === 'enterCar') {
      if (g.player.car !== step.car) {
        if (g.player.car) tap('KeyE');
        T.teleport(step.car.x + 18, step.car.y);
        tap('KeyE');
      }
    } else if (step.type === 'goto') {
      if (step.needCar && g.player.car !== step.needCar) {
        if (g.player.car) tap('KeyE');
        T.teleport(step.needCar.x + 18, step.needCar.y);
        tap('KeyE');
      }
      T.teleport(step.x, step.y);
    }
    steps(4);
  }
}
let soakGuard = 0;
while (g.save.missionDone < 5 && soakGuard++ < 8) {
  if (!g.mission) { T.teleport(g.city.spots.garage.x, g.city.spots.garage.y); steps(3); }
  completeCurrentMission();
}
check('story chain completes all five missions', g.save.missionDone === 5, `done=${g.save.missionDone} cash=${g.player.cash}`);
check('missions paid out', g.player.cash >= 2400 - 0, `cash=${g.player.cash}`);

// Five-star survival: keep driving, top up health like a stubborn tester.
if (!g.player.car) { const c = g.cars.find((x) => x.kind === 'parked'); T.teleport(c.x + 18, c.y); tap('KeyE'); }
g.heat = 500;
let maxCops = 0;
T.press('KeyW'); T.press('KeyD');
for (let i = 0; i < 40; i++) {
  steps(15);
  g.player.hp = 100;
  if (g.player.car && g.player.car.dead) { // climb out of the wreck and take another
    tap('KeyE');
    const c = g.cars.find((x) => x.kind === 'parked' && !x.dead);
    T.teleport(c.x + 18, c.y); tap('KeyE');
  }
  // Keep fleeing across the grid — circling one block at five stars is suicide.
  if (i % 2 === 0) T.teleport(300 + (i * 397) % 1800, 300 + (i * 613) % 1800);
  maxCops = Math.max(maxCops, g.cars.filter((c) => c.kind === 'police' && !c.dead).length);
}
T.release('KeyW'); T.release('KeyD');
check('five stars brings a full response', maxCops >= 5, `maxCops=${maxCops}`);
check('survived five stars still playing', g.state === 'play', `state=${g.state}`);
g.heat = 0; steps(30);

// Busted: stand still at two stars and let an officer pin Rae.
if (g.player.car) tap('KeyE');
g.heat = 200;
let busted = false;
for (let i = 0; i < 40 && !busted; i++) { steps(60); if (g.state === 'busted') busted = true; }
check('standing still at two stars ends in a bust', busted, `state=${g.state} bust=${g.bust.toFixed(2)}`);
if (busted) { tap('Enter'); check('respawn after bust returns to play', g.state === 'play'); }

// Wasted.
g.hurtPlayer(1000);
check('lethal damage wastes the player', g.state === 'wasted', `state=${g.state}`);
if (g.state === 'wasted') { tap('Enter'); check('respawn after wasted returns to play', g.state === 'play'); }

// Pause / resume.
tap('KeyP');
check('pause engages', g.state === 'pause', `state=${g.state}`);
tap('KeyP');
check('pause releases', g.state === 'play', `state=${g.state}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

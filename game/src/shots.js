// Deterministic posed scenes for the maker's screenshots. The parent
// loads game/index.html?shot=<name>&seed=7, waits for the title to become
// "SHOT <name> READY — Coral Bay Heat", and captures the frozen frame.
// Each pose builds a little diorama of real game state — a four-star
// chase mid-delivery, the title menu, Rae on foot at Coral Plaza, and a
// delivery drive — then main.js settles it for a few steps and freezes.

import { makeCar } from './vehicles.js';
import { missionDefs, currentObjective } from './missions.js';

function placePlayerCar(g, model, x, y, angle, kmh, color) {
  const car = makeCar(g.rng, 'mission', model, x, y, angle, color);
  car.vx = Math.cos(angle) * (kmh / 0.36);
  car.vy = Math.sin(angle) * (kmh / 0.36);
  g.cars.push(car);
  g.player.car = car;
  g.player.x = x; g.player.y = y;
  g.cam.x = x; g.cam.y = y; g.cam.zoom = 1; // open already framed on the car
  return car;
}

function trafficNear(g, x, y) {
  const a = makeCar(g.rng, 'traffic', 'pico', x + 330, y - 42, Math.PI, '#57b06a');
  const b = makeCar(g.rng, 'traffic', 'tortuga', x - 420, y + 120, 0, '#e6e6e6');
  a.driverOut = true; b.driverOut = true; // parked scenery: no AI in a frozen frame
  g.cars.push(a, b);
}

export function setupShot(g, name) {
  const s = g.city.spots;
  g.shotMode = true;
  if (name === 'title') {
    g.state = 'title';
    g.cam.x = s.plaza.x; g.cam.y = s.plaza.y;
    return true;
  }
  g.state = 'play';
  if (name === 'onfoot') {
    g.player.x = s.plaza.x + 26; g.player.y = s.plaza.y + 96;
    g.player.angle = -0.6;
    g.cam.x = g.player.x; g.cam.y = g.player.y;
    return true;
  }
  if (name === 'chase') {
    const y = 1500 - 21; // eastbound lane of the hotel row
    placePlayerCar(g, 'ventana', 1250, y, 0, 79, '#d94f3d');
    for (const [dx, dy] of [[-195, -16], [-310, 14], [-445, -30]]) {
      const cop = makeCar(g.rng, 'police', 'interceptor', 1250 + dx, y + dy, 0, '#eef1f4');
      cop.vx = 190; cop.officerOut = false;
      g.cars.push(cop);
    }
    trafficNear(g, 1250, y);
    g.heat = 320; g.lastSeenT = 0; // four stars, and they can see her
    const defs = missionDefs(g);
    g.mission = { def: defs[1], steps: defs[1].build({}), idx: 1, timerLeft: 141, rt: {}, story: true };
    g.talk('Mari', 'They are right behind you, Rae — do NOT stop. Hotel Solana, go!', 9999);
    g.objective = currentObjective(g);
    return true;
  }
  if (name === 'mission') {
    const y = 1500 - 21;
    placePlayerCar(g, 'marlin', 1500, y, 0, 63, '#3d7bd9');
    trafficNear(g, 1600, y);
    const defs = missionDefs(g);
    g.mission = { def: defs[1], steps: defs[1].build({}), idx: 1, timerLeft: 97, rt: {}, story: true };
    g.talk('Mari', 'Hotel Solana. Fast, Rae — and keep the package in one piece.', 9999);
    g.objective = currentObjective(g);
    return true;
  }
  return false;
}

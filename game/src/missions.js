// missions.js — the story of Coral Bay Heat: five jobs from fixer Marisol
// "Mari" Vega, run from her garage. Each mission is a small state machine of
// stages (go somewhere, steal a marked car, deliver against the clock,
// collect the drops, one last fare under a locked three-star heat), with
// SMS briefings on Rae's phone and a live objective for the HUD banner.

import { dist } from './rng.js';
import { createCar } from './entities.js';

export const MISSION_DEFS = [
  {
    id: 'first-wheels', title: 'First Wheels', reward: 150,
    intro: ['Mari: Rae. A Ventana coupe is sitting in the east lot, keys in. Bring it to my garage.', 'Mari: Clean hands, quick feet. Go.'],
    done: 'Mari: She runs sweet. $150 wired. You drive like you mean it.',
  },
  {
    id: 'special-delivery', title: 'Special Delivery', reward: 300,
    intro: ['Mari: Package at the warehouse dock. Then Hotel Solana, fast.', 'Mari: The guest tips well when the bag is early.'],
    done: 'Mari: Early and intact. $300. The Solana loves us now.',
  },
  {
    id: 'borrowed-ride', title: 'Borrowed Ride', reward: 450,
    intro: ['Mari: A Marlin sedan in the west lot belongs to a man who owes me.', 'Mari: Take it. Bring it home unbent, amor.'],
    done: 'Mari: Not a scratch worth naming. $450. He will understand.',
  },
  {
    id: 'three-drops', title: 'Three Drops', reward: 600,
    intro: ['Mari: Three cash drops: Palmetto Park, Coral Plaza, the pier end.', 'Mari: All three before the tide turns. Clock is running.'],
    done: 'Mari: All three, dry and counted. $600. Beautiful work.',
  },
  {
    id: 'the-long-fare', title: 'The Long Fare', reward: 900,
    intro: ['Mari: My cousin Leo is at Hotel Solana. The CBPD wants a word with him.', 'Mari: Get him to the pier boat. Do NOT stop, Rae.'],
    done: 'Mari: He made the boat. We are square, and then some. $900.',
  },
];

export function initMissions(game) {
  game.mission = { active: null, stageIdx: 0, stageT: 0, collect: [], failed: false };
  game.phone = [];
  game.missionHeatFloor = 0;
  game.objective = null;
}

export function sms(game, text) {
  game.phone.push({ text, t: game.time });
  if (game.phone.length > 6) game.phone.shift();
  game.sound.phoneBuzz();
}

function garagePoint(game) { return game.world.pois.garage; }

function spawnMissionCar(game, typeKey, spotIdx) {
  // Find a free parking spot at or after the requested one: a target car
  // stacked inside somebody's parked runabout helps nobody.
  const spots = game.world.parkSpots;
  let spot = spots[spotIdx % spots.length];
  for (let i = 0; i < spots.length; i++) {
    const candidate = spots[(spotIdx + i) % spots.length];
    const taken = game.cars.some((c) => Math.hypot(c.x - candidate.x, c.y - candidate.y) < 46);
    if (!taken) { spot = candidate; break; }
  }
  const car = createCar(typeKey, spot.x, spot.y, spot.angle, 'mission', game.rng);
  car.hot = true;
  game.cars.push(car);
  return car;
}

function startMission(game, idx) {
  const def = MISSION_DEFS[idx];
  const m = game.mission;
  m.active = def; m.stageIdx = 0; m.failed = false; m.collect = []; m.fareWarned = false;
  for (const line of def.intro) sms(game, line);
  game.sound.stinger(false);
  const pois = game.world.pois;
  if (def.id === 'first-wheels') {
    m.targetCar = spawnMissionCar(game, 'ventana', 3);
    m.stages = [
      { kind: 'steal', car: m.targetCar, label: 'Steal the Ventana coupe' },
      { kind: 'deliverCar', car: m.targetCar, x: pois.garage.x, y: pois.garage.y, r: 74, label: 'Bring it to Vega\'s Garage' },
    ];
  } else if (def.id === 'special-delivery') {
    m.stages = [
      { kind: 'goto', x: pois.warehouse.x, y: pois.warehouse.y, r: 62, label: 'Pick up the package at the warehouse' },
      { kind: 'goto', x: pois.hotel.x, y: pois.hotel.y, r: 66, label: 'Deliver to Hotel Solana — fast', time: 150 },
    ];
  } else if (def.id === 'borrowed-ride') {
    m.targetCar = spawnMissionCar(game, 'marlin', 12);
    m.stages = [
      { kind: 'steal', car: m.targetCar, label: 'Steal the Marlin sedan' },
      { kind: 'deliverCar', car: m.targetCar, x: pois.garage.x, y: pois.garage.y, r: 74, label: 'Deliver it to Vega\'s Garage unbent' },
    ];
  } else if (def.id === 'three-drops') {
    const pier = game.world.pier;
    m.collect = [
      { x: pois.park.x, y: pois.park.y, got: false, name: 'Palmetto Park' },
      { x: game.world.fountain.x, y: game.world.fountain.y + 58, got: false, name: 'Coral Plaza' },
      { x: pier.x + pier.w - 30, y: pier.y + pier.h / 2, got: false, name: 'the pier end' },
    ];
    m.stages = [{ kind: 'collect', label: 'Collect the cash drops', time: 260 }];
  } else if (def.id === 'the-long-fare') {
    m.stages = [
      { kind: 'goto', x: pois.hotel.x, y: pois.hotel.y, r: 66, label: 'Pick up Leo at Hotel Solana' },
      { kind: 'goto', x: game.world.pier.x + game.world.pier.w - 30, y: game.world.pier.y + 26, r: 60, label: 'Get Leo to the pier boat — do NOT stop', heatFloor: 300 },
    ];
  }
  m.stageT = m.stages[0].time || 0;
}

function failMission(game, why) {
  const m = game.mission;
  sms(game, 'Mari: ' + why);
  cleanupMission(game);
  m.active = null; m.failed = true;
  game.missionHeatFloor = 0;
  game.sound.stinger(false);
}

function cleanupMission(game) {
  const m = game.mission;
  if (m.targetCar && game.player.car !== m.targetCar && game.cars.includes(m.targetCar)) {
    game.cars.splice(game.cars.indexOf(m.targetCar), 1);
  }
  m.targetCar = null; m.collect = [];
}

function completeMission(game) {
  const def = game.mission.active;
  game.save.cash += def.reward;
  game.save.missionsDone++;
  game.save.stats.missions++;
  sms(game, def.done);
  game.sound.stinger(true);
  game.sound.cash();
  cleanupMission(game);
  game.mission.active = null;
  game.missionHeatFloor = 0;
  if (game.save.missionsDone >= MISSION_DEFS.length) {
    game.save.storyComplete = true;
    game.showStoryComplete();
  }
  game.persist();
}

export function updateMissions(game, dt) {
  const m = game.mission;
  const p = game.player;
  const pois = game.world.pois;
  if (!m.active) {
    if (game.save.missionsDone < MISSION_DEFS.length) {
      const g = garagePoint(game);
      game.objective = { title: 'Vega\'s Garage', text: 'See Mari at Vega\'s Garage — next job: ' + MISSION_DEFS[game.save.missionsDone].title, x: g.x, y: g.y };
      if (dist(p.x, p.y, g.x, g.y) < 52 && game.state === 'playing') startMission(game, game.save.missionsDone);
    } else {
      game.objective = { title: 'Coral Bay', text: 'Story complete — the city is yours. Cause some noise.', x: p.x, y: p.y };
    }
    return;
  }
  const stage = m.stages[m.stageIdx];
  if (!stage) { completeMission(game); return; }
  // Timers and heat floors ride on the stage.
  if (stage.time) {
    m.stageT -= dt;
    if (m.stageT <= 0) { failMission(game, 'Too slow, amor. Come back to the garage and we try again.'); return; }
  }
  game.missionHeatFloor = stage.heatFloor || 0;
  if (stage.heatFloor && m.stageIdx === 1 && m.active.id === 'the-long-fare' && !m.fareWarned) {
    m.fareWarned = true;
    sms(game, 'Leo: They are right behind you, Rae — do NOT stop. Pier, go!');
  }

  let advance = false;
  let obj = { title: m.active.title, text: stage.label, timeLeft: stage.time ? m.stageT : null };
  if (stage.kind === 'goto') {
    obj.x = stage.x; obj.y = stage.y;
    if (dist(p.x, p.y, stage.x, stage.y) < stage.r) advance = true;
  } else if (stage.kind === 'steal') {
    obj.x = stage.car.x; obj.y = stage.car.y;
    if (stage.car.wrecked) { failMission(game, 'The car is scrap. Come back to the garage, we start over.'); return; }
    if (p.car === stage.car) advance = true;
  } else if (stage.kind === 'deliverCar') {
    obj.x = stage.x; obj.y = stage.y;
    if (stage.car.wrecked) { failMission(game, 'The car is scrap. Come back to the garage, we start over.'); return; }
    if (p.car === stage.car && dist(p.x, p.y, stage.x, stage.y) < stage.r) {
      if (m.active.id === 'borrowed-ride' && stage.car.hp < stage.car.maxHp * 0.25) {
        failMission(game, 'You brought me a wreck, not a car. Again, and gently this time.');
        return;
      }
      advance = true;
    }
  } else if (stage.kind === 'collect') {
    const next = m.collect.find((c) => !c.got);
    if (!next) advance = true;
    else {
      obj.x = next.x; obj.y = next.y;
      obj.text = 'Collect the cash drops (' + m.collect.filter((c) => c.got).length + '/3) — next: ' + next.name;
      if (dist(p.x, p.y, next.x, next.y) < 46) {
        next.got = true;
        game.sound.cash();
        sms(game, 'Drop secured: ' + next.name + ' (' + m.collect.filter((c) => c.got).length + '/3)');
        if (m.collect.every((c) => c.got)) advance = true;
      }
    }
  }
  game.objective = obj;
  if (advance) {
    m.stageIdx++;
    const nextStage = m.stages[m.stageIdx];
    if (!nextStage) completeMission(game);
    else {
      m.stageT = nextStage.time || 0;
      game.sound.pickup();
      if (m.active.id === 'special-delivery' && m.stageIdx === 1) sms(game, 'Mari: Package is in. Hotel Solana, fast · do not dent the bag.');
      if (m.active.id === 'the-long-fare' && m.stageIdx === 1) sms(game, 'Leo: I am in! Drive, drive!');
    }
  }
}

// Where the beacon / minimap blip for a mission target car sits (rendering aid).
export function missionCarMark(game) {
  const m = game.mission;
  if (m.active && m.targetCar && game.player.car !== m.targetCar) return m.targetCar;
  return null;
}

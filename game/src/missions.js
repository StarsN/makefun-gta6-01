// Mari Vega's jobs: a five-mission story chain run out of Vega's Garage,
// plus endless side deliveries once the story is done. Missions are small
// step machines — reach a place, take a car, beat a clock — with SMS
// intros, on-screen objectives and cash rewards.

import { dist } from './random.js';
import { makeCar } from './vehicles.js';
import { makePed } from './people.js';
import { floatText } from './fx.js';

export function missionDefs(g) {
  const s = g.city.spots;
  const lot = g.city.lots[0];
  const lotC = { x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 };
  return [
    {
      name: 'First Wheels', reward: 150, timer: 0,
      intro: ['Rae, it is Mari. I need a car moved and I need it clean.', 'The blue Marlin at my garage. Park it at the Palma Court lot. Easy money.'],
      outro: ['Clean work. $150 wired. Come by the garage, there is more.'],
      build(rt) {
        rt.car = makeCar(g.rng, 'mission', 'marlin', s.garageDoor.x, s.garageDoor.y + 16, Math.PI, '#3d7bd9');
        g.cars.push(rt.car);
        return [
          { type: 'enterCar', car: rt.car, x: rt.car.x, y: rt.car.y, text: "Get in Mari's Marlin" },
          { type: 'goto', x: lotC.x, y: lotC.y, r: 46, needCar: rt.car, text: 'Park the Marlin at the Palma Court lot' },
        ];
      },
    },
    {
      name: 'Special Delivery', reward: 300, timer: 150,
      intro: ['A package at Pierpoint Storage needs to reach Hotel Solana.', 'Do not be late, and do not open it. Especially do not open it.'],
      outro: ['On time and sealed. $300. You are making me look good, Rae.'],
      build() {
        return [
          { type: 'goto', x: s.warehouse.x, y: s.warehouse.y, r: 30, text: 'Pick up the package at Pierpoint Storage', pickup: true },
          { type: 'goto', x: s.hotel.x, y: s.hotel.y, r: 34, text: 'Deliver to Hotel Solana — fast' },
        ];
      },
    },
    {
      name: 'Borrowed Ride', reward: 450, timer: 0,
      intro: ['A Ventana at the beach lot has an owner who owes me.', 'Take it. Bring it to the garage. If the CBPD notice, lose them or do not. I pay either way.'],
      outro: ['Ha! He will be walking for a month. $450, as agreed.'],
      build(rt) {
        rt.car = makeCar(g.rng, 'mission', 'ventana', s.beachLot.x + 26, s.beachLot.y - 30, -Math.PI / 2, '#e8b93c');
        g.cars.push(rt.car);
        return [
          { type: 'enterCar', car: rt.car, x: rt.car.x, y: rt.car.y, text: 'Steal the yellow Ventana at the beach lot', hot: 200 },
          { type: 'goto', x: s.garage.x, y: s.garage.y, r: 40, needCar: rt.car, text: 'Bring the Ventana to Vega\'s Garage' },
        ];
      },
    },
    {
      name: 'Three Drops', reward: 600, timer: 0,
      intro: ['Three cash drops, three corners of the bay. Palma Park, the pier, Coral General.', 'Pick them all up. No questions, no receipts.'],
      outro: ['All three. You know this city like a tide chart. $600.'],
      build() {
        return [
          { type: 'goto', x: s.park.x, y: s.park.y, r: 30, text: 'Drop one: Palma Park', pickup: true },
          { type: 'goto', x: s.pierEnd.x, y: s.pierEnd.y, r: 30, text: 'Drop two: end of the pier', pickup: true },
          { type: 'goto', x: s.hospital.x, y: s.hospital.y, r: 30, text: 'Drop three: Coral General entrance', pickup: true },
        ];
      },
    },
    {
      name: 'The Long Fare', reward: 900, timer: 240,
      intro: ['Last one, Rae. A guest at Hotel Solana needs the pier, and half the CBPD wants a word with him.', 'Three stars of trouble, door to door. Get him there and we are even with this city.'],
      outro: ['He made his boat. We made our name. $900 — and Rae? The garage is yours whenever you need it.'],
      build(rt) {
        const cab = makeCar(g.rng, 'mission', 'solcab', s.hotel.x + 30, s.hotel.y + 24, Math.PI, '#e8b93c');
        g.cars.push(cab);
        rt.car = cab;
        rt.passenger = makePed(g.rng, s.hotel.x, s.hotel.y, 'ped');
        g.peds.push(rt.passenger);
        return [
          { type: 'goto', x: s.hotel.x, y: s.hotel.y, r: 36, text: 'Pick up the guest at Hotel Solana', board: true },
          { type: 'goto', x: s.pierEnd.x, y: s.pierEnd.y, r: 34, text: 'Get him to the end of the pier' },
        ];
      },
    },
  ];
}

function sideJob(g) {
  const s = g.city.spots;
  const places = [
    ['Coral General', s.hospital], ['Hotel Solana', s.hotel], ['Pierpoint Storage', s.warehouse],
    ['the pier', s.pierEnd], ['CBPD HQ', s.police], ['Coral Plaza', s.plaza],
  ];
  const a = places[Math.floor(g.rng() * places.length)];
  let b = places[Math.floor(g.rng() * places.length)];
  if (b === a) b = places[(places.indexOf(a) + 2) % places.length];
  return {
    name: 'Side Work', reward: 200, timer: 170,
    intro: [`Quick one: a parcel at ${a[0]} goes to ${b[0]}. Clock is running.`],
    outro: ['Done and dusted. $200.'],
    build() {
      return [
        { type: 'goto', x: a[1].x, y: a[1].y, r: 32, text: `Pick up at ${a[0]}`, pickup: true },
        { type: 'goto', x: b[1].x, y: b[1].y, r: 34, text: `Deliver to ${b[0]}` },
      ];
    },
  };
}

export function startMission(g) {
  const defs = missionDefs(g);
  const def = g.save.missionDone < defs.length ? defs[g.save.missionDone] : sideJob(g);
  const rt = { car: null, passenger: null };
  const steps = def.build(rt);
  g.mission = { def, steps, idx: 0, timerLeft: def.timer || 0, rt, story: g.save.missionDone < defs.length };
  for (const line of def.intro) g.say('Mari', line);
  g.talk('Mari', def.intro[0], 5);
  g.sound.phone();
}

export function failMission(g, why) {
  if (!g.mission) return;
  g.say('Mari', why || 'That job fell apart. Come back to the garage and we will run it again.');
  g.sound.fail();
  if (g.mission.rt.car && g.mission.rt.car.kind === 'mission') g.mission.rt.car.kind = 'parked';
  if (g.mission.rt.passenger) g.mission.rt.passenger.state = 'wander';
  g.heatFloor = 0;
  g.mission = null;
}

function completeMission(g) {
  const m = g.mission;
  g.player.cash += m.def.reward;
  g.save.cash = g.player.cash;
  g.save.stats.earned += m.def.reward;
  if (m.story) g.save.missionDone += 1;
  g.persist();
  for (const line of m.def.outro) g.say('Mari', line);
  g.sound.stinger(); g.sound.cash();
  floatText(g, g.player.x, g.player.y - 30, `+$${m.def.reward}`, '#7be382');
  if (m.rt.passenger) { m.rt.passenger.dead = false; m.rt.passenger.hp = 30; m.rt.passenger.x = g.city.spots.pierEnd.x; m.rt.passenger.y = g.city.spots.pierEnd.y; m.rt.passenger.state = 'wander'; }
  if (m.rt.car && m.rt.car.kind === 'mission') m.rt.car.kind = 'parked';
  g.heatFloor = 0;
  g.mission = null;
}

export function onPlayerEnterCar(g, car) {
  const m = g.mission;
  if (!m) return;
  const step = m.steps[m.idx];
  if (step && step.type === 'enterCar' && step.car === car) {
    if (step.hot) g.heat = Math.max(g.heat, step.hot); // the owner called it in
    advanceStep(g);
  }
}

function advanceStep(g) {
  const m = g.mission;
  m.idx += 1;
  g.sound.pickup();
  if (m.idx >= m.steps.length) completeMission(g);
}

export function updateMissions(g, dt) {
  const m = g.mission;
  if (!m) {
    // Standing at Mari's marker with no job on: she hands over the next one.
    const s = g.city.spots;
    const px = g.player.car ? g.player.car.x : g.player.x, py = g.player.car ? g.player.car.y : g.player.y;
    if (dist(px, py, s.garage.x, s.garage.y) < 42) startMission(g);
    return;
  }
  if (m.def.timer) {
    m.timerLeft -= dt;
    if (m.timerLeft <= 0) { failMission(g, 'Out of time. The job is off — come back to the garage.'); return; }
  }
  if (m.def.name === 'The Long Fare') g.heatFloor = 300;
  const step = m.steps[m.idx];
  if (!step) return;
  if (step.type === 'goto') {
    if (step.needCar && g.player.car !== step.needCar) {
      if (step.needCar.dead) { failMission(g, 'The car is wrecked. That job is done for.'); return; }
    } else if (dist(g.player.x, g.player.y, step.x, step.y) < step.r || (g.player.car && dist(g.player.car.x, g.player.car.y, step.x, step.y) < step.r)) {
      if (step.pickup) { g.sound.pickup(); floatText(g, step.x, step.y - 18, 'PICKED UP', '#ffe27a'); }
      if (step.board && m.rt.passenger) {
        m.rt.passenger.dead = true; // he climbs in; the ped leaves the street
        g.talk('Guest', 'The pier. Fast, please — and keep the package in one piece.', 4.5);
      }
      advanceStep(g);
    }
  }
  if (step.type === 'enterCar' && step.car.dead) failMission(g, 'The car is wrecked. That job is done for.');
}

// What the HUD banner and minimap show right now.
export function currentObjective(g) {
  const s = g.city.spots;
  const m = g.mission;
  if (!m) {
    const defs = missionDefs(g);
    const next = g.save.missionDone < defs.length ? defs[g.save.missionDone].name : 'Side Work';
    const px = g.player.car ? g.player.car.x : g.player.x, py = g.player.car ? g.player.car.y : g.player.y;
    const d = Math.round(dist(px, py, s.garage.x, s.garage.y) / 10);
    return { title: '', text: `See Mari at Vega's Garage — next job: ${next} · ${d}m`, x: s.garage.x, y: s.garage.y, timerLeft: 0, garage: true };
  }
  const step = m.steps[m.idx];
  if (!step) return null;
  let text = step.text;
  let tx = step.x, ty = step.y;
  if (step.type === 'goto' && step.needCar && g.player.car !== step.needCar) {
    text = `Get back in the ${step.needCar.spec.name}`;
    tx = step.needCar.x; ty = step.needCar.y;
  }
  if (step.type === 'enterCar') { tx = step.car.x; ty = step.car.y; }
  const px = g.player.car ? g.player.car.x : g.player.x, py = g.player.car ? g.player.car.y : g.player.y;
  return { title: m.def.name.toUpperCase(), text, x: tx, y: ty, d: Math.round(dist(px, py, tx, ty) / 10), timerLeft: m.def.timer ? m.timerLeft : 0, garage: false };
}

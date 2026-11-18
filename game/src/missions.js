// The story: five jobs for fixer Marisol "Mari" Vega, run as data. Each mission is a
// list of stages — go somewhere, get in a particular car, pick something (or someone)
// up, lose the police, deliver — and this file walks the player through them, pays
// out, and tells the HUD what the current objective is. Between jobs the objective
// points back to Vega's Garage, where the next one starts.

import { audio } from './audio.js';
import { floatText } from './combat.js';
import { makePed } from './people.js';
import { addHeat } from './police.js';
import { makeCar } from './vehicles.js';

export const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 150,
    intro: [
      { from: 'Mari', text: 'Rae. Got a little driving job, pays cash. Come by the garage.' },
      { from: 'Mari', text: 'My yellow Ventana is out front. Take it to the Marina Lookout, nice and legal.' },
    ],
    setup(state) {
      const g = state.city.places.garage;
      const car = makeCar(state, 'ventana', g.x + 46, g.y - 64, 0, { kind: 'mission', color: '#f7e463', owner: 'mari' });
      state.mission.car = car;
    },
    stages: [
      { kind: 'enterCar', label: "Get in Mari's Ventana" },
      { kind: 'goto', place: 'marina', r: 78, needCar: 'mission', label: 'Drive to the Marina Lookout' },
    ],
    outro: [{ from: 'Mari', text: 'Clean and quick. I knew you still had it. More work soon.' }],
  },
  {
    id: 'special-delivery',
    title: 'Special Delivery',
    reward: 300,
    intro: [
      { from: 'Mari', text: 'A package is waiting at the Dockyards. No names, no questions.' },
      { from: 'Mari', text: 'Take it to the Hotel Solana. And Rae — do not let them stop you.' },
    ],
    stages: [
      { kind: 'pickup', place: 'docks', r: 84, label: 'Pick up the package at the Dockyards', heat: 95, note: 'Package on board. The CBPD just got a tip — move!' },
      { kind: 'goto', place: 'hotel', r: 84, time: 165, label: 'Deliver to Hotel Solana — fast' },
    ],
    outro: [{ from: 'Mari', text: 'The hotel is happy, the package is gone, and so are you. Good.' }],
  },
  {
    id: 'borrowed-ride',
    title: 'Borrowed Ride',
    reward: 450,
    intro: [
      { from: 'Mari', text: 'A gold Ventana is parked up in Palm Heights. Its owner owes me.' },
      { from: 'Mari', text: 'Bring it to my garage. Lose any heat before you roll in.' },
    ],
    setup(state) {
      const h = state.city.places.heights;
      const car = makeCar(state, 'ventana', h.x + 30, h.y - 40, Math.PI / 2, { kind: 'mission', color: '#e6c229' });
      state.mission.car = car;
    },
    stages: [
      { kind: 'goto', place: 'heights', r: 95, label: 'Find the gold Ventana in Palm Heights' },
      { kind: 'enterCar', label: 'Take the Ventana' },
      { kind: 'escape', label: 'Lose the police' },
      { kind: 'goto', place: 'garage', r: 88, needCar: 'mission', label: "Deliver it to Vega's Garage" },
    ],
    outro: [{ from: 'Mari', text: 'One gold Ventana, as promised. The drinks are on me.' }],
  },
  {
    id: 'three-drops',
    title: 'Three Drops',
    reward: 600,
    intro: [
      { from: 'Mari', text: 'Three cash drops around the bay. Marina, the Plaza, the Docks.' },
      { from: 'Mari', text: 'Pick them all up. People will notice — keep moving.' },
    ],
    stages: [
      {
        kind: 'collect',
        label: 'Collect the cash drops',
        points: ['marina', 'plaza', 'docks'],
        r: 58,
        heatPerDrop: 45,
      },
    ],
    outro: [{ from: 'Mari', text: 'All three. You are making me look good, Rae.' }],
  },
  {
    id: 'long-fare',
    title: 'The Long Fare',
    reward: 900,
    intro: [
      { from: 'Mari', text: 'Last one. A client at Coral Plaza needs the pier, urgently.' },
      { from: 'Mari', text: 'Every cop in Coral Bay will want a word. Do not stop for them.' },
    ],
    setup(state) {
      const p = state.city.places.plaza;
      const client = makePed(state, p.x + 26, p.y + 18, { kind: 'ped', color: '#fdfdfd' });
      client.state = 'wait';
      client.waitT = 99999;
      state.mission.client = client;
    },
    stages: [
      { kind: 'pickupClient', place: 'plaza', r: 74, label: 'Pick up the client at Coral Plaza' },
      { kind: 'goto', place: 'pier', r: 88, needCar: 'any', label: 'Drive the client to Coral Pier — do not stop', wantedFloor: 3 },
    ],
    outro: [
      { from: 'Client', text: 'You drive like the devil is renting you the car. Thank you.' },
      { from: 'Mari', text: 'That is the last of it. Coral Bay is yours again, Rae.' },
    ],
  },
];

export function newMissionState() {
  return { index: 0, phase: 'offer', stage: 0, timer: null, car: null, client: null, drops: [] };
}

function pushMessages(state, list) {
  for (const msg of list ?? []) {
    state.messages.push({ from: msg.from, text: msg.text, ttl: 7 });
  }
  if (list && list.length) audio.phone();
}

function stageTarget(state, stage) {
  if (!stage) return null;
  if (stage.kind === 'enterCar') {
    return state.mission.car ? { x: state.mission.car.x, y: state.mission.car.y } : null;
  }
  if (stage.kind === 'collect') {
    let best = null;
    let bestD = Infinity;
    for (const drop of state.mission.drops) {
      const d = Math.hypot(drop.x - state.player.x, drop.y - state.player.y);
      if (d < bestD) { bestD = d; best = drop; }
    }
    return best;
  }
  if (stage.kind === 'escape') return state.city.places.garage;
  if (stage.place) return state.city.places[stage.place];
  return null;
}

function beginStage(state) {
  const def = MISSION_DEFS[state.mission.index];
  const stage = def?.stages[state.mission.stage];
  state.mission.timer = stage?.time ?? null;
  if (stage?.wantedFloor) state.wantedFloor = stage.wantedFloor;
  if (stage?.kind === 'collect') {
    state.mission.drops = stage.points.map((id) => {
      const p = state.city.places[id];
      return { x: p.x, y: p.y, id };
    });
  }
}

function startMission(state) {
  const mission = state.mission;
  const def = MISSION_DEFS[mission.index];
  if (!def) return;
  mission.phase = 'active';
  mission.stage = 0;
  mission.car = null;
  mission.client = null;
  def.setup?.(state);
  pushMessages(state, def.intro);
  beginStage(state);
  state.announce = { title: def.title, sub: 'New job from Mari', ttl: 2.6 };
}

function completeMission(state) {
  const mission = state.mission;
  const def = MISSION_DEFS[mission.index];
  state.money += def.reward;
  state.stats.missionsDone += 1;
  pushMessages(state, def.outro);
  floatText(state, state.player.x, state.player.y - 26, `+$${def.reward}`, '#7bed6f');
  audio.missionDone();
  state.announce = { title: 'JOB COMPLETE', sub: `${def.title} · +$${def.reward}`, ttl: 3 };
  state.wantedFloor = 0;
  mission.index += 1;
  mission.stage = 0;
  mission.car = null;
  mission.client = null;
  mission.drops = [];
  if (mission.index >= MISSION_DEFS.length) {
    mission.phase = 'done';
    state.storyDone = true;
    state.announce = { title: 'STORY COMPLETE', sub: 'Coral Bay is yours. Free roam — the garage always has work.', ttl: 5 };
  } else {
    mission.phase = 'offer';
  }
  state.saveGame();
}

function stageDone(state) {
  const mission = state.mission;
  const def = MISSION_DEFS[mission.index];
  mission.stage += 1;
  if (mission.stage >= def.stages.length) {
    completeMission(state);
  } else {
    beginStage(state);
  }
}

export function updateMissions(state, dt) {
  const mission = state.mission;
  if (mission.phase === 'done') return;
  const garage = state.city.places.garage;

  if (mission.phase === 'offer') {
    if (Math.hypot(state.player.x - garage.x, state.player.y - garage.y) < 66) startMission(state);
    return;
  }

  const def = MISSION_DEFS[mission.index];
  const stage = def.stages[mission.stage];
  if (!stage) return;

  if (mission.timer !== null) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      mission.timer = stage.time;
      state.messages.push({ from: 'Mari', text: 'Too slow — the job resets. Go again.', ttl: 6 });
      audio.phone();
    }
  }

  const player = state.player;
  const target = stageTarget(state, stage);
  const dist = target ? Math.hypot(player.x - target.x, player.y - target.y) : Infinity;

  switch (stage.kind) {
    case 'enterCar':
      if (mission.car && player.car === mission.car) stageDone(state);
      break;
    case 'goto': {
      const carOk = !stage.needCar
        || (stage.needCar === 'any' && player.car)
        || (stage.needCar === 'mission' && player.car === mission.car);
      if (dist < stage.r && carOk) stageDone(state);
      break;
    }
    case 'pickup':
      if (dist < stage.r) {
        if (stage.heat) {
          addHeat(state, stage.heat);
          if (stage.note) state.messages.push({ from: 'Mari', text: stage.note, ttl: 7 });
        }
        stageDone(state);
      }
      break;
    case 'escape':
      if (state.wanted.stars === 0) stageDone(state);
      break;
    case 'collect': {
      for (let i = mission.drops.length - 1; i >= 0; i -= 1) {
        const drop = mission.drops[i];
        if (Math.hypot(player.x - drop.x, player.y - drop.y) < stage.r) {
          mission.drops.splice(i, 1);
          addHeat(state, stage.heatPerDrop ?? 0);
          audio.cash();
          floatText(state, drop.x, drop.y - 18, 'DROP COLLECTED', '#7bed6f');
        }
      }
      if (mission.drops.length === 0) stageDone(state);
      break;
    }
    case 'pickupClient':
      if (dist < stage.r && player.car) {
        if (mission.client) {
          const at = state.peds.indexOf(mission.client);
          if (at >= 0) state.peds.splice(at, 1);
          mission.client = null;
        }
        state.messages.push({ from: 'Client', text: 'Pier. Fast. Please — do not stop for anyone.', ttl: 7 });
        audio.phone();
        stageDone(state);
      }
      break;
    default:
      break;
  }
}

export function currentObjective(state) {
  const mission = state.mission;
  if (mission.phase === 'done') return null;
  if (mission.phase === 'offer') {
    const def = MISSION_DEFS[mission.index];
    if (!def) return null;
    const g = state.city.places.garage;
    return { x: g.x, y: g.y, title: 'WORK', text: `See Mari at Vega's Garage — next job: ${def.title}` };
  }
  const def = MISSION_DEFS[mission.index];
  const stage = def.stages[mission.stage];
  const target = stageTarget(state, stage);
  if (!target) return null;
  let text = stage.label;
  if (stage.kind === 'collect') text = `${stage.label} (${state.mission.drops.length} left)`;
  return { x: target.x, y: target.y, title: def.title.toUpperCase(), text, timer: state.mission.timer };
}

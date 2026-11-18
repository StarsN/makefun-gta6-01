# Coral Bay Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/StarsN/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/StarsN/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the browser, built for make.fun's "Make GTA 6" bounty.
Explore the sun-soaked city of **Coral Bay** on foot and by car: steal rides, run jobs for a
beachfront fixer, dodge or outrun the Coral Bay PD, and work your way through a five-mission
story — all in one static page with no build step and no network calls.

You are **Rae Solano**, a courier who knows every alley in Coral Bay. When fixer **Marisol Vega**
offers cash for "simple driving jobs", the money is too good to ask questions — until the whole
police force is looking for you.

## Play it

Open `game/index.html` from any static file server (for example `node serve.ts`, then visit
http://localhost:8080). Desktop Chrome, keyboard and mouse.

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk or drive |
| Mouse | Aim (on foot) |
| Mouse click / hold | Shoot |
| E or F | Enter / exit a car |
| Shift | Sprint (on foot) |
| Space | Handbrake (in a car) |
| R | Reload |
| P or Esc | Pause |
| M | Mute |
| Enter | Start / confirm |

## What's in the game

- A full city: road grid with lane traffic, sidewalks with pedestrians, pastel tower blocks,
  a marina, dockyards, a beach with animated surf, palm trees, parked cars and named districts.
- Cars to steal and drive, each with its own handling, damage, smoke and engine note.
- A five-star wanted system: commit crimes and the Coral Bay PD responds — patrol cars give
  chase, officers get out and come for you, and a bust meter fills if they pin you down.
- A five-mission story from Mari Vega, plus cash drops, health pickups and free-roam mayhem.
- Combat on foot with mouse aim, muzzle flash, tracers and hit reactions.
- HUD with health, cash, wanted stars, objective banner, speedometer and a live minimap
  (player, police, objectives and the garage).
- Start screen, pause, busted/wasted screens, and a localStorage save with Continue.
- Synthesized WebAudio sound: engines, sirens, gunfire, pickups, phone pings and a music loop.

Everything — city, characters, vehicles, names, story, art and sound — is original to this
entry and generated in code at runtime. No assets are loaded; the whole game is the handful of
ES modules under `game/src/`, one job each: `world.js` builds the city, `entities.js` runs the
traffic and crowds, `police.js` runs the wanted system, `missions.js` holds the story,
`player.js` walks and drives Rae, `render.js` draws the world, `hud.js` draws the interface,
and `main.js` ties it together.

## Handing it in

`main.ts` (Node 22+, standard library only) copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with the vendored `vendor/makefun-game.ts` library:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are real renders of this game in a browser, staged through the
game's own `?shot=` scenes (see `shots.json`).

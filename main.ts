// Coral Bay Heat — hand-in program for the make.fun "Make GTA 6" bounty.
// The game is the game/ folder beside this file: plain static files that a
// desktop browser plays offline, no build step and no network. This
// program copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the vendored make.fun library, exactly
// as the bounty requires.
//
// Locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for the grader's /output.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps mirror the scorer's gate: the dossier text is capped at
// 163,840 bytes; at most 4 screenshots of at most 256 KiB each; game/
// holds at most 993 entries and 48 MiB, with no path over 1,000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`dossier written to ${join(out, 'dossier.json')}`);

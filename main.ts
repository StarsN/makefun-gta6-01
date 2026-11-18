// Coral Bay Heat — hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a
// desktop browser, no build step, no network). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json there with
// the vendored make.fun library, mirroring the gate's own caps so a hand-in
// that would be refused fails here first.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, checked up front with plain language.
const shots = existsSync(join(repoDir, 'screenshots'))
  ? readdirSync(join(repoDir, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}
for (const name of shots) {
  const bytes = statSync(join(repoDir, 'screenshots', name)).size;
  if (bytes > 262144) throw new Error(`screenshot ${name} is ${bytes} bytes, over the 256 KiB cap`);
}
if (!existsSync(join(repoDir, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: the game must live under game/');
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Coral Bay Heat handed in: game/ + ${shots.length} screenshots + dossier.json -> ${outDir}`);

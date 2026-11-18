// render.js — paints Coral Bay and everything in it to the 2D canvas:
// ground, roads, sidewalks, buildings with shaded roofs, the plaza fountain,
// palms, the pier, then cars, pedestrians, officers, Rae, and effects.
// Everything is drawn from code; there are no image assets.

import { ROAD_W, BLOCKS, CITY_SIZE, WORLD_W, WORLD_H, PALETTE } from './config.js';
import { clamp } from './rng.js';
import { roadCenter, blockOrigin, BLOCK_INNER } from './world.js';
import { missionCarMark } from './missions.js';

export function renderWorld(ctx, game) {
  const { world, camera, view } = game;
  const vw = view.w / camera.zoom, vh = view.h / camera.zoom;
  const vx = camera.x - vw / 2, vy = camera.y - vh / 2;
  const inView = (x, y, pad) => x > vx - pad && x < vx + vw + pad && y > vy - pad && y < vy + vh + pad;

  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(vx, vy, vw, vh);
  // Sand and the city ground.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(CITY_SIZE, 0, WORLD_W - CITY_SIZE, WORLD_H);
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, CITY_SIZE, CITY_SIZE);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(CITY_SIZE + 250, 0, WORLD_W - CITY_SIZE - 250, WORLD_H);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(CITY_SIZE, 0, 250, WORLD_H);

  // Sidewalk rings around every block, with plain grass inside.
  ctx.fillStyle = PALETTE.sidewalk;
  for (let bx = 0; bx < BLOCKS; bx++) for (let by = 0; by < BLOCKS; by++) {
    ctx.fillRect(blockOrigin(bx) - 9, blockOrigin(by) - 9, BLOCK_INNER + 18, BLOCK_INNER + 18);
  }
  ctx.fillStyle = PALETTE.grass;
  for (let bx = 0; bx < BLOCKS; bx++) for (let by = 0; by < BLOCKS; by++) {
    ctx.fillRect(blockOrigin(bx), blockOrigin(by), BLOCK_INNER, BLOCK_INNER);
  }
  // Special grounds on top: plaza paving, park lawn, parking lots.
  if (world.plaza) { ctx.fillStyle = PALETTE.plaza; ctx.fillRect(world.plaza.x, world.plaza.y, world.plaza.w, world.plaza.h); }
  if (world.park) { ctx.fillStyle = PALETTE.grassDark; ctx.fillRect(world.park.x, world.park.y, world.park.w, world.park.h); }
  ctx.fillStyle = '#5b6067';
  for (const lot of world.lotRects) ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (const lot of world.lotRects) for (const spot of game.world.parkSpots) {
    if (spot.x > lot.x && spot.x < lot.x + lot.w && spot.y > lot.y && spot.y < lot.y + lot.h) {
      ctx.strokeRect(spot.x - 15, spot.y - 24, 30, 48);
    }
  }

  // Roads: asphalt strips, then dashed centre lines.
  ctx.fillStyle = PALETTE.asphalt;
  for (let i = 0; i <= BLOCKS; i++) {
    ctx.fillRect(roadCenter(i) - ROAD_W / 2, 0, ROAD_W, CITY_SIZE);
    ctx.fillRect(0, roadCenter(i) - ROAD_W / 2, CITY_SIZE, ROAD_W);
  }
  ctx.strokeStyle = PALETTE.lane; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (let i = 0; i <= BLOCKS; i++) {
    ctx.moveTo(roadCenter(i), 0); ctx.lineTo(roadCenter(i), CITY_SIZE);
    ctx.moveTo(0, roadCenter(i)); ctx.lineTo(CITY_SIZE, roadCenter(i));
  }
  ctx.stroke(); ctx.setLineDash([]);

  // The pier: planks over the water.
  const pier = world.pier;
  ctx.fillStyle = PALETTE.pierDark;
  ctx.fillRect(pier.x - 6, pier.y - 6, pier.w + 12, pier.h + 12);
  ctx.fillStyle = PALETTE.pier;
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
  for (let x = pier.x + 16; x < pier.x + pier.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, pier.y); ctx.lineTo(x, pier.y + pier.h); ctx.stroke(); }

  drawFountain(ctx, world);
  for (const t of world.trees) if (inView(t.x, t.y, 40)) drawTree(ctx, t);
  for (const b of world.buildings) if (inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) drawBuilding(ctx, b);

  drawObjectiveBeacon(ctx, game);
  // Skid marks under the cars.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of game.fx.skids) {
    ctx.globalAlpha = Math.max(0, s.life) * 0.55;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const mark = missionCarMark(game);
  const sortedCars = [...game.cars].sort((a, b) => a.renderY - b.renderY);
  for (const car of sortedCars) if (inView(car.renderX, car.renderY, 90)) drawCar(ctx, car, car === mark, game.time);
  for (const ped of game.peds) if (inView(ped.x, ped.y, 30)) drawPed(ctx, ped);
  for (const off of game.officers) if (inView(off.x, off.y, 30)) drawOfficer(ctx, off);
  if (!game.player.car && game.state !== 'title') drawPlayer(ctx, game);
  drawFx(ctx, game);
}

function drawFountain(ctx, world) {
  const f = world.fountain;
  if (!f) return;
  ctx.fillStyle = '#b8b1a1';
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#39b8d4';
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#aee9f5';
  ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8e2d2';
  ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, Math.PI * 2); ctx.fill();
}

function drawTree(ctx, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath(); ctx.arc(t.x + 4, t.y + 5, t.r + 3, 0, Math.PI * 2); ctx.fill();
  if (t.kind === 'palm') {
    ctx.strokeStyle = '#8a6b42'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + 3, t.y - 4); ctx.stroke();
    ctx.strokeStyle = '#3f9e4d'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t.x * 0.01;
      ctx.beginPath(); ctx.moveTo(t.x + 3, t.y - 4);
      ctx.quadraticCurveTo(t.x + 3 + Math.cos(a) * 12, t.y - 10 + Math.sin(a) * 5, t.x + 3 + Math.cos(a) * 19, t.y - 2 + Math.sin(a) * 11);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#3f9e4d';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#55b567';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBuilding(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  const inset = Math.min(13, b.w * 0.12);
  ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);
  // Windows: a deterministic scatter from the building's own seed.
  ctx.fillStyle = 'rgba(255,255,220,0.5)';
  let s = b.seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cols = Math.max(2, Math.floor(b.w / 30)), rows = Math.max(2, Math.floor(b.h / 30));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (rnd() < 0.45) ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 9, 6);
  }
  if (b.name) {
    ctx.fillStyle = 'rgba(20,24,32,0.82)';
    const label = b.name.toUpperCase();
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 18;
    ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y + b.h / 2 - 12, tw, 24);
    ctx.fillStyle = '#ffd76a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}

function drawObjectiveBeacon(ctx, game) {
  const obj = game.objective;
  if (!obj || game.state !== 'playing') return;
  const pulse = 0.55 + 0.3 * Math.sin(game.time * 4);
  const grad = ctx.createLinearGradient(obj.x, obj.y - 320, obj.x, obj.y);
  grad.addColorStop(0, 'rgba(255,209,102,0)');
  grad.addColorStop(1, 'rgba(255,209,102,' + (0.5 * pulse + 0.25) + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(obj.x - 13, obj.y - 320, 26, 320);
  ctx.strokeStyle = 'rgba(255,209,102,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(obj.x, obj.y, 24 + 5 * Math.sin(game.time * 4), 0, Math.PI * 2); ctx.stroke();
  // Un-collected cash drops get their own green markers.
  if (game.mission.active && game.mission.collect) {
    for (const c of game.mission.collect) {
      if (c.got) continue;
      ctx.fillStyle = '#1f9d55';
      ctx.fillRect(c.x - 9, c.y - 7, 18, 14);
      ctx.fillStyle = '#b8f5cd';
      ctx.fillRect(c.x - 9, c.y - 2, 18, 4);
    }
  }
}

export function drawCar(ctx, car, isMarked, time) {
  const t = car.type;
  ctx.save();
  ctx.translate(car.renderX, car.renderY);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(3, 5, t.len * 0.52, t.wid * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.renderAngle);
  // Wheels
  ctx.fillStyle = '#15181c';
  const wx = t.len * 0.32, wy = t.wid * 0.5;
  for (const [x, y] of [[-wx, -wy], [wx, -wy], [-wx, wy], [wx, wy]]) ctx.fillRect(x - 6, y - 3, 12, 6);
  // Body
  ctx.fillStyle = car.wrecked ? '#3a3f45' : car.color;
  roundRect(ctx, -t.len / 2, -t.wid / 2, t.len, t.wid, 7); ctx.fill();
  if (t.kind === 'cop') {
    ctx.fillStyle = '#22406e';
    ctx.fillRect(-t.len * 0.1, -t.wid / 2, t.len * 0.34, t.wid);
    // Light bar: red / blue, flashing.
    const phase = Math.floor(time * 5) % 2;
    ctx.fillStyle = phase ? '#ff4040' : '#7a1010';
    ctx.fillRect(-7, -t.wid * 0.28, 13, t.wid * 0.26);
    ctx.fillStyle = phase ? '#1250ff' : '#0a2a7a';
    ctx.fillRect(-7, t.wid * 0.02, 13, t.wid * 0.26);
  }
  if (t.kind === 'cab') {
    ctx.fillStyle = '#ffd83d';
    roundRect(ctx, -t.len / 2, -t.wid / 2, t.len, t.wid, 7); ctx.fill();
    ctx.fillStyle = '#22252a';
    ctx.fillRect(-6, -8, 12, 16);
    ctx.fillStyle = '#ffd83d';
    ctx.fillRect(-4, -6, 8, 12);
  }
  // Cabin and glass
  ctx.fillStyle = 'rgba(24,32,44,0.88)';
  roundRect(ctx, -t.len * 0.16, -t.wid * 0.38, t.len * 0.36, t.wid * 0.76, 4); ctx.fill();
  ctx.fillStyle = 'rgba(160,220,245,0.5)';
  ctx.fillRect(t.len * 0.13, -t.wid * 0.34, 4, t.wid * 0.68);
  // Headlights
  ctx.fillStyle = '#fff6bf';
  ctx.fillRect(t.len / 2 - 3, -t.wid * 0.32, 3, 6);
  ctx.fillRect(t.len / 2 - 3, t.wid * 0.32 - 6, 3, 6);
  if (car.brakeLight) {
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-t.len / 2, -t.wid * 0.32, 3, 6);
    ctx.fillRect(-t.len / 2, t.wid * 0.32 - 6, 3, 6);
  }
  ctx.restore();
  if (isMarked) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const bob = Math.sin(time * 5) * 4;
    ctx.fillText('▼', car.renderX, car.renderY - 34 + bob);
    ctx.textAlign = 'left';
  }
  if (car.wrecked && !car.exploded) {
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.beginPath(); ctx.arc(car.renderX, car.renderY, 16, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -13, -5, 26, 10, 5); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(16, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const step = Math.sin(ped.walkPhase) * 3.4;
  ctx.strokeStyle = ped.pants; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ped.angle + 2.6) * (5 + step * 0.4), Math.sin(ped.angle + 2.6) * (5 + step * 0.4));
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ped.angle - 2.6) * (5 - step * 0.4), Math.sin(ped.angle - 2.6) * (5 - step * 0.4));
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 2.5, Math.sin(ped.angle) * 2.5, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawOfficer(ctx, off) {
  ctx.save();
  ctx.translate(off.x, off.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22406e';
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(Math.cos(off.angle) * 2.5, Math.sin(off.angle) * 2.5, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16283f';
  ctx.beginPath(); ctx.arc(Math.cos(off.angle) * 2.5, Math.sin(off.angle) * 2.5, 4.8, off.angle - 0.4, off.angle + Math.PI + 0.4); ctx.fill();
  ctx.restore();
}

export function drawPlayer(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  const step = Math.sin(p.walkPhase) * 3.6;
  ctx.strokeStyle = '#263238'; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(p.angle + 2.6) * (5 + step * 0.4), Math.sin(p.angle + 2.6) * (5 + step * 0.4));
  ctx.moveTo(0, 0); ctx.lineTo(Math.cos(p.angle - 2.6) * (5 - step * 0.4), Math.sin(p.angle - 2.6) * (5 - step * 0.4));
  ctx.stroke();
  ctx.fillStyle = '#0e9594'; // Rae's teal jacket
  ctx.beginPath(); ctx.arc(0, 0, 8.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d5524';
  ctx.beginPath(); ctx.arc(Math.cos(p.angle) * 2.5, Math.sin(p.angle) * 2.5, 5, 0, Math.PI * 2); ctx.fill();
  // Pistol in hand, pointed at the aim.
  ctx.rotate(p.angle);
  ctx.fillStyle = '#191c20';
  ctx.fillRect(6, 3.4, 11, 3.4);
  if (p.muzzleT > 0) {
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(20, 5, 5.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFx(ctx, game) {
  const fx = game.fx;
  for (const t of fx.tracers) {
    ctx.strokeStyle = t.hostile ? 'rgba(255,90,90,' + t.life + ')' : 'rgba(255,224,138,' + t.life + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const r of fx.rings) {
    ctx.strokeStyle = 'rgba(255,180,90,' + (1 - r.t) + ')';
    ctx.lineWidth = 5 * (1 - r.t) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, 12 + r.t * 90, 0, Math.PI * 2); ctx.stroke();
  }
  for (const p of fx.parts) {
    const a = 1 - p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { clamp };

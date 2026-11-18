// Drawing the world. The static city (roads, sidewalks, roofs, beach,
// pier) is painted once onto an offscreen canvas; every frame then only
// blits that layer and draws the moving things: cars, people, bullets,
// effects and the objective beacon.

import { PITCH, GRID, ROAD_HALF, CITY_EDGE, BEACH_X, WORLD_W, WORLD_H, PALETTE } from './config.js';
import { blockRect, roadCenter } from './city.js';

let staticLayer = null;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildStaticLayer(g) {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const x = c.getContext('2d');
  const city = g.city;
  // Land base and beach.
  x.fillStyle = PALETTE.blockGround; x.fillRect(0, 0, BEACH_X + 130, WORLD_H);
  x.fillStyle = PALETTE.sand; x.fillRect(BEACH_X, 0, WORLD_W - BEACH_X, WORLD_H);
  x.fillStyle = PALETTE.sandWet; x.fillRect(BEACH_X + 118, 0, 16, WORLD_H);
  // Block grounds: sidewalk ring, then the inner ground by kind.
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const b = blockRect(i, j);
    x.fillStyle = PALETTE.sidewalk; x.fillRect(b.x, b.y, b.w, b.h);
    const key = `${i},${j}`;
    let inner = PALETTE.blockGround;
    if (key === '2,4') inner = PALETTE.grass;
    if (key === '4,3') inner = PALETTE.plaza;
    if (key === '5,2' || key === '2,2') inner = '#5b6067';
    x.fillStyle = inner; x.fillRect(b.x + 13, b.y + 13, b.w - 26, b.h - 26);
    if (key === '5,2' || key === '2,2') { // parking bays
      x.strokeStyle = 'rgba(240,240,230,0.5)'; x.lineWidth = 2;
      for (let k = 0; k < 4; k++) { x.strokeRect(b.x + 24 + k * 52, b.y + 30, 44, 62); x.strokeRect(b.x + 24 + k * 52, b.y + 122, 44, 62); }
    }
  }
  // Roads: full-length strips, then dashed centre lines.
  x.fillStyle = PALETTE.asphalt;
  for (let i = 0; i <= GRID; i++) {
    x.fillRect(roadCenter(i) - ROAD_HALF, -20, ROAD_HALF * 2, CITY_EDGE + 40);
    x.fillRect(-20, roadCenter(i) - ROAD_HALF, CITY_EDGE + 40, ROAD_HALF * 2);
  }
  x.fillStyle = PALETTE.asphaltEdge;
  for (let i = 0; i <= GRID; i++) { x.fillRect(roadCenter(i) - ROAD_HALF, -20, 3, CITY_EDGE + 40); x.fillRect(roadCenter(i) + ROAD_HALF - 3, -20, 3, CITY_EDGE + 40); }
  x.strokeStyle = PALETTE.lane; x.lineWidth = 3; x.setLineDash([22, 26]);
  for (let i = 0; i <= GRID; i++) {
    x.beginPath(); x.moveTo(roadCenter(i), 0); x.lineTo(roadCenter(i), CITY_EDGE); x.stroke();
    x.beginPath(); x.moveTo(0, roadCenter(i)); x.lineTo(CITY_EDGE, roadCenter(i)); x.stroke();
  }
  x.setLineDash([]);
  // Pier deck.
  const p = city.pier;
  x.fillStyle = '#9a744c'; x.fillRect(p.x, p.y, p.w, p.h);
  x.strokeStyle = 'rgba(70,50,26,0.55)'; x.lineWidth = 2;
  for (let px = p.x; px < p.x + p.w; px += 18) { x.beginPath(); x.moveTo(px, p.y); x.lineTo(px, p.y + p.h); x.stroke(); }
  // Buildings: roof, parapet line, label.
  for (const b of city.buildings) {
    x.fillStyle = b.color; x.fillRect(b.x, b.y, b.w, b.h);
    x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 3; x.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    x.strokeStyle = 'rgba(255,255,255,0.20)'; x.lineWidth = 2; x.strokeRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    if (b.kind === 'hospital') {
      x.fillStyle = '#e8e8e8'; x.fillRect(b.x + b.w / 2 - 16, b.y + 12, 32, 32);
      x.fillStyle = '#d23c2e'; x.fillRect(b.x + b.w / 2 - 4, b.y + 17, 8, 22); x.fillRect(b.x + b.w / 2 - 11, b.y + 24, 22, 8);
    }
    if (b.kind === 'police') { x.fillStyle = '#274b73'; x.fillRect(b.x, b.y, b.w, 20); }
    if (b.kind === 'garage') { x.fillStyle = '#37414a'; x.fillRect(b.x, b.y + b.h - 24, b.w, 24); x.fillStyle = '#e8b93c'; x.fillRect(b.x + 8, b.y + b.h - 18, b.w - 16, 4); }
    if (b.label && b.w >= 86) {
      x.fillStyle = 'rgba(20,24,30,0.72)';
      x.font = 'bold 12px system-ui, sans-serif'; x.textAlign = 'center';
      x.fillText(b.label.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Trees sit in the static layer too (trunk + canopy); they never move.
  for (const t of city.trees) {
    x.fillStyle = PALETTE.trunk; x.beginPath(); x.arc(t.x, t.y, 4, 0, 7); x.fill();
    x.fillStyle = t.palm ? PALETTE.palm : PALETTE.grassDark;
    x.beginPath(); x.arc(t.x, t.y, t.palm ? 15 : 17, 0, 7); x.fill();
    x.fillStyle = t.palm ? PALETTE.palmDark : PALETTE.grass;
    x.beginPath(); x.arc(t.x - 3, t.y - 3, 9, 0, 7); x.fill();
  }
  return c;
}

export function drawWorld(ctx, g) {
  const v = g.view;
  // Animated sea under everything.
  ctx.fillStyle = PALETTE.water; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const wy = v.y0 + ((i * 173 + g.time * 26) % Math.max(1, v.y1 - v.y0));
    ctx.beginPath();
    for (let wx = Math.max(BEACH_X + 170, v.x0); wx < v.x1; wx += 46) ctx.lineTo(wx, wy + Math.sin(wx * 0.05 + g.time * 2 + i) * 3);
    ctx.stroke();
  }
  if (!staticLayer) staticLayer = buildStaticLayer(g);
  ctx.drawImage(staticLayer, 0, 0);
  // Fountain (animated sparkle over the static basin ring).
  const f = g.city.spots.fountain;
  ctx.fillStyle = '#8d9299'; ctx.beginPath(); ctx.arc(f.x, f.y, 30, 0, 7); ctx.fill();
  ctx.fillStyle = '#57b7dd'; ctx.beginPath(); ctx.arc(f.x, f.y, 23, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) { const a = g.time * 2.4 + i * 1.256; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 10, f.y + Math.sin(a) * 10, 2.2, 0, 7); ctx.fill(); }
  // Skid marks.
  for (const s of g.skids) { ctx.fillStyle = `rgba(24,24,28,${s.a})`; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }
  // Objective beacon.
  const obj = g.objective;
  if (obj && g.state === 'play') {
    const pulse = 12 + Math.sin(g.time * 5) * 4;
    ctx.strokeStyle = obj.garage ? '#39d0d8' : '#ffd83c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(obj.x, obj.y, pulse + 8, 0, 7); ctx.stroke();
    ctx.fillStyle = obj.garage ? 'rgba(57,208,216,0.25)' : 'rgba(255,216,60,0.25)';
    ctx.beginPath(); ctx.arc(obj.x, obj.y, pulse + 8, 0, 7); ctx.fill();
    ctx.fillStyle = obj.garage ? '#39d0d8' : '#ffd83c';
    ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(obj.garage ? 'MARI' : '▼', obj.x, obj.y - pulse - 14);
  }
  for (const car of g.cars) drawCar(ctx, g, car);
  for (const p of g.peds) drawPed(ctx, g, p);
  if (!g.player.car && g.state !== 'title') drawPlayer(ctx, g);
  // Bullets as tracers.
  ctx.lineWidth = 2;
  for (const b of g.bullets) {
    ctx.strokeStyle = b.fromCop ? 'rgba(255,120,90,0.9)' : 'rgba(255,240,170,0.95)';
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Particles.
  for (const p of g.fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floating texts.
  ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const t of g.texts) { ctx.globalAlpha = Math.min(1, t.life); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
  ctx.globalAlpha = 1;
}

function drawCar(ctx, g, car) {
  const { spec } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = spec.l, W = spec.w;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  rr(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 8); ctx.fill();
  const body = car.dead ? '#33302e' : car.color;
  ctx.fillStyle = body;
  rr(ctx, -L / 2, -W / 2, L, W, 8); ctx.fill();
  if (car.kind === 'police' && !car.dead) {
    ctx.fillStyle = '#22262c'; ctx.fillRect(-L * 0.08, -W / 2, L * 0.2, W);
    const flash = Math.sin(g.time * 11) > 0;
    ctx.fillStyle = flash ? '#ff4444' : '#7a1d1d'; ctx.fillRect(-2, -W / 2 + 3, 7, 9);
    ctx.fillStyle = flash ? '#3a5f9e' : '#4488ff'; ctx.fillRect(-2, W / 2 - 12, 7, 9);
  }
  // Cabin and glass.
  ctx.fillStyle = car.dead ? '#1d1b1a' : '#20262e';
  rr(ctx, -L * 0.16, -W / 2 + 5, L * 0.36, W - 10, 5); ctx.fill();
  ctx.fillStyle = car.dead ? '#262422' : '#39434e';
  rr(ctx, -L * 0.13, -W / 2 + 7, L * 0.3, W - 14, 4); ctx.fill();
  // Nose glass and lights.
  ctx.fillStyle = '#aebfd0'; ctx.fillRect(L * 0.24, -W / 2 + 6, 4, W - 12);
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(L / 2 - 3, -W / 2 + 4, 3, 7); ctx.fillRect(L / 2 - 3, W / 2 - 11, 3, 7);
  ctx.fillStyle = '#c23b2e'; ctx.fillRect(-L / 2, -W / 2 + 4, 3, 7); ctx.fillRect(-L / 2, W / 2 - 11, 3, 7);
  // Wheels.
  ctx.fillStyle = '#14161a';
  for (const [wx, wy] of [[L * 0.3, -W / 2 - 2], [L * 0.3, W / 2 - 3], [-L * 0.3, -W / 2 - 2], [-L * 0.3, W / 2 - 3]]) ctx.fillRect(wx - 6, wy, 13, 5);
  if (car === g.player.car) { // a soft ring so your ride is never lost in traffic
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    rr(ctx, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, 10); ctx.stroke();
  }
  ctx.restore();
}

function drawPed(ctx, g, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.dead) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#7a4a3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0.6, 0, 7); ctx.fill();
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(11, -6, 5, 0, 7); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(1, 3, 9, 5, 0, 0, 7); ctx.fill();
  ctx.rotate(p.angle);
  const stride = Math.sin(g.time * 10 + p.id * 2.1) * 3;
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(-3 + stride * 0.4, -6, 5, 4); ctx.fillRect(-3 - stride * 0.4, 2, 5, 4);
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
  if (p.role === 'officer') {
    ctx.fillStyle = '#16283e'; ctx.beginPath(); ctx.arc(1, 0, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd83c'; ctx.fillRect(3, -2, 3, 3);
  }
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(2.5, 0, 4.6, 0, 7); ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, g) {
  const p = g.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 3, 10, 6, 0, 0, 7); ctx.fill();
  ctx.rotate(p.angle);
  const moving = Math.hypot(p.vx || 0, p.vy || 0) > 12;
  const stride = moving ? Math.sin(g.time * 12) * 3.4 : 0;
  ctx.fillStyle = '#2c3440';
  ctx.fillRect(-3 + stride * 0.4, -6.5, 5.5, 4.5); ctx.fillRect(-3 - stride * 0.4, 2, 5.5, 4.5);
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#e09112';
  ctx.beginPath(); ctx.arc(-1, 0, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = p.skin || '#c98d5f';
  ctx.beginPath(); ctx.arc(3, 0, 4.8, 0, 7); ctx.fill();
  if (g.mouseWorld) { // pistol in hand, pointed at the cursor
    ctx.fillStyle = '#191c20';
    ctx.fillRect(6, -1.6, 11, 3.2);
  }
  ctx.restore();
}

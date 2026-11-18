// Rendering the world: the sun-soaked ground, road grid with markings and
// crosswalks, pastel buildings with roofs and signs, the park and plaza, the beach
// with animated surf and the pier — then every car, person, pickup, effect and the
// mission beacon, all culled to what the camera can see.

import { CITY, COLORS } from './config.js';

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export function viewRect(state) {
  const { w, h } = state.view;
  const z = state.camera.zoom;
  return {
    x: state.camera.x - w / 2 / z - 60,
    y: state.camera.y - h / 2 / z - 60,
    w: w / z + 120,
    h: h / z + 120,
  };
}

function inView(v, x, y, pad = 0) {
  return x >= v.x - pad && x <= v.x + v.w + pad && y >= v.y - pad && y <= v.y + v.h + pad;
}

export function drawScene(ctx, state) {
  const city = state.city;
  const view = viewRect(state);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(view.x, view.y, view.w, view.h);

  drawBlocks(ctx, state, view);
  drawBeach(ctx, state, view);
  drawRoads(ctx, state, view);
  drawDistricts(ctx, state, view);
  drawBuildings(ctx, state, view);
  drawTrees(ctx, state, view);
  drawPickups(ctx, state);
  drawObjectiveBeacon(ctx, state);

  const sortedCars = state.cars.filter((car) => inView(view, car.x, car.y, 80));
  for (const car of sortedCars) drawCar(ctx, state, car);
  for (const ped of state.peds) {
    if (inView(view, ped.x, ped.y, 40)) drawPed(ctx, state, ped);
  }
  if (!state.player.car) drawPlayer(ctx, state);
  drawFx(ctx, state);
}

function drawBlocks(ctx, state, view) {
  for (const block of state.city.blocks) {
    if (!inView(view, block.x + block.size / 2, block.y + block.size / 2, block.size)) continue;
    if (block.kind === 'park') {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(block.x - 6, block.y - 6, block.size + 12, block.size + 12);
    } else if (block.kind === 'plaza') {
      ctx.fillStyle = '#e6dcc0';
      ctx.fillRect(block.x - 6, block.y - 6, block.size + 12, block.size + 12);
      ctx.strokeStyle = '#cfc39f';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(block.x + block.size / 2, block.y + block.size / 2, i * 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Fountain: stone rim, water, a bright centre.
      const fx = block.x + block.size / 2;
      const fy = block.y + block.size / 2;
      ctx.fillStyle = '#b8ab8d';
      ctx.beginPath(); ctx.arc(fx, fy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.water;
      ctx.beginPath(); ctx.arc(fx, fy, 23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.foam;
      ctx.beginPath(); ctx.arc(fx, fy, 6 + Math.sin(state.time * 3) * 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (block.kind === 'parking') {
      ctx.fillStyle = '#5b5b63';
      ctx.fillRect(block.x + 6, block.y + 6, block.size - 12, block.size - 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (const spot of state.city.parkingSpots) {
        if (Math.abs(spot.x - (block.x + block.size / 2)) > block.size / 2) continue;
        ctx.strokeRect(spot.x - 17, spot.y - 22, 34, 44);
      }
    } else {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(block.x - 7, block.y - 7, block.size + 14, block.size + 14);
      ctx.strokeStyle = COLORS.sidewalkEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(block.x - 7, block.y - 7, block.size + 14, block.size + 14);
    }
  }
}

function drawBeach(ctx, state, view) {
  const city = state.city;
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(CITY.sandX, view.y, CITY.waterX - CITY.sandX, view.h);
  ctx.fillStyle = COLORS.sandWet;
  ctx.fillRect(CITY.waterX - 26, view.y, 26, view.h);
  const grad = ctx.createLinearGradient(CITY.waterX, 0, CITY.width, 0);
  grad.addColorStop(0, COLORS.water);
  grad.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(CITY.waterX, view.y, CITY.width - CITY.waterX, view.h);
  // Animated surf: two foam lines breathing in and out.
  ctx.strokeStyle = COLORS.foam;
  ctx.lineWidth = 3;
  for (const [phase, amp] of [[0, 7], [2.2, 12]]) {
    ctx.beginPath();
    for (let y = view.y; y <= view.y + view.h; y += 26) {
      const x = CITY.waterX + Math.sin(y * 0.02 + state.time * 1.3 + phase) * amp;
      if (y === view.y) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The pier: a wooden deck out over the water.
  const pier = city.pier;
  ctx.fillStyle = 'rgba(43,32,20,0.18)';
  ctx.fillRect(pier.x + 6, pier.y + 10, pier.w, pier.h);
  ctx.fillStyle = '#a9805a';
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.strokeStyle = 'rgba(90,60,35,0.55)';
  ctx.lineWidth = 2;
  for (let x = pier.x + 16; x < pier.x + pier.w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, pier.y + 4);
    ctx.lineTo(x, pier.y + pier.h - 4);
    ctx.stroke();
  }
  // Beach umbrellas.
  for (const u of city.umbrellas) {
    if (!inView(view, u.x, u.y, 30)) continue;
    ctx.fillStyle = 'rgba(43,32,20,0.15)';
    ctx.beginPath(); ctx.ellipse(u.x + 4, u.y + 5, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.moveTo(u.x - 14, u.y + 2);
    ctx.lineTo(u.x, u.y - 11);
    ctx.lineTo(u.x + 14, u.y + 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRoads(ctx, state, view) {
  const city = state.city;
  ctx.fillStyle = COLORS.road;
  for (const cx of city.vRoads) {
    if (cx + 48 < view.x || cx - 48 > view.x + view.w) continue;
    ctx.fillRect(cx - 48, view.y, 96, view.h);
  }
  for (const cy of city.hRoads) {
    if (cy + 48 < view.y || cy - 48 > view.y + view.h) continue;
    ctx.fillRect(view.x, cy - 48, view.w, 96);
  }
  ctx.fillStyle = COLORS.roadEdge;
  for (const cx of city.vRoads) {
    if (cx + 48 < view.x || cx - 48 > view.x + view.w) continue;
    ctx.fillRect(cx - 48, view.y, 3, view.h);
    ctx.fillRect(cx + 45, view.y, 3, view.h);
  }
  for (const cy of city.hRoads) {
    if (cy + 48 < view.y || cy - 48 > view.y + view.h) continue;
    ctx.fillRect(view.x, cy - 48, view.w, 3);
    ctx.fillRect(view.x, cy + 45, view.w, 3);
  }
  // Dashed centre lines.
  ctx.fillStyle = COLORS.roadLine;
  for (const cx of city.vRoads) {
    if (cx + 48 < view.x || cx - 48 > view.x + view.w) continue;
    for (let y = Math.floor(view.y / 46) * 46; y < view.y + view.h; y += 46) {
      if (nearIntersection(city, cx, y + 11)) continue;
      ctx.fillRect(cx - 2, y, 4, 22);
    }
  }
  for (const cy of city.hRoads) {
    if (cy + 48 < view.y || cy - 48 > view.y + view.h) continue;
    for (let x = Math.floor(view.x / 46) * 46; x < view.x + view.w; x += 46) {
      if (nearIntersection(city, x + 11, cy)) continue;
      ctx.fillRect(x, cy - 2, 22, 4);
    }
  }
  // Crosswalks at intersections in view.
  ctx.fillStyle = COLORS.crosswalk;
  for (const cx of city.vRoads) {
    for (const cy of city.hRoads) {
      if (!inView(view, cx, cy, 90)) continue;
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(cx + i * 16 - 5, cy - 62, 10, 12);
        ctx.fillRect(cx + i * 16 - 5, cy + 50, 10, 12);
        ctx.fillRect(cx - 62, cy + i * 16 - 5, 12, 10);
        ctx.fillRect(cx + 50, cy + i * 16 - 5, 12, 10);
      }
    }
  }
}

function nearIntersection(city, x, y) {
  for (const cx of city.vRoads) if (Math.abs(x - cx) < 62) {
    for (const cy of city.hRoads) if (Math.abs(y - cy) < 62) return true;
  }
  return false;
}

function drawDistricts(ctx, state, view) {
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#5d4a2f';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const d of state.city.districts) {
    if (inView(view, d.x, d.y, 260)) ctx.fillText(d.name, d.x, d.y);
  }
  ctx.restore();
}

function drawBuildings(ctx, state, view) {
  for (const b of state.city.buildings) {
    if (!inView(view, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(b.x + 10, b.y + 14, b.w, b.h);
    ctx.fillStyle = shade(b.color, -34);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = shade(b.color, 18);
    ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
    // Roof clutter, placed by a hash of the position so it never flickers.
    const hash = Math.abs(Math.floor(b.x * 7 + b.y * 13)) % 3;
    ctx.fillStyle = shade(b.color, -52);
    if (hash !== 0) ctx.fillRect(b.x + 18, b.y + 16, 20, 14);
    if (hash !== 1) ctx.fillRect(b.x + b.w - 42, b.y + b.h - 34, 22, 16);
    if (b.name) {
      ctx.fillStyle = 'rgba(30, 30, 40, 0.85)';
      ctx.fillRect(b.x + 8, b.y + b.h - 26, b.w - 16, 18);
      ctx.fillStyle = '#ffe66d';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - 13);
    }
  }
}

function drawTrees(ctx, state, view) {
  for (const t of state.city.trees) {
    if (!inView(view, t.x, t.y, 40)) continue;
    ctx.fillStyle = 'rgba(43,32,20,0.16)';
    ctx.beginPath(); ctx.ellipse(t.x + 5, t.y + 6, t.r + 3, (t.r + 3) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#8a6b42';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.quadraticCurveTo(t.x + 3, t.y - 6, t.x + 5, t.y - 10);
      ctx.stroke();
      ctx.strokeStyle = '#3e9b4f';
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(t.x + 5, t.y - 10);
        ctx.quadraticCurveTo(
          t.x + 5 + Math.cos(a) * t.r * 0.8, t.y - 10 + Math.sin(a) * t.r * 0.5 - 3,
          t.x + 5 + Math.cos(a) * t.r * 1.15, t.y - 10 + Math.sin(a) * t.r * 0.8 + 5,
        );
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#4d8f3f';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5da34c';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.25, t.r * 0.62, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPickups(ctx, state) {
  for (const p of state.pickups) {
    if (p.taken) continue;
    const bob = Math.sin(state.time * 3 + p.x) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (p.kind === 'cash') {
      ctx.fillStyle = 'rgba(46, 204, 113, 0.25)';
      ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(state.time * 4) * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4.5);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(state.time * 4) * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8f9fa';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.fillRect(-7, -2.5, 14, 5);
    }
    ctx.restore();
  }
}

function drawObjectiveBeacon(ctx, state) {
  const objective = state.objective;
  if (!objective || state.mode !== 'play') return;
  const pulse = 0.55 + Math.sin(state.time * 4) * 0.2;
  const grad = ctx.createLinearGradient(0, objective.y - 300, 0, objective.y);
  grad.addColorStop(0, 'rgba(255, 214, 64, 0)');
  grad.addColorStop(1, `rgba(255, 214, 64, ${pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(objective.x - 7, objective.y - 300, 14, 300);
  ctx.strokeStyle = `rgba(255, 214, 64, ${pulse + 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(objective.x, objective.y, 30 + Math.sin(state.time * 4) * 4, 18 + Math.sin(state.time * 4) * 2.4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawCar(ctx, state, car) {
  const m = car.model;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(5, 7, m.len * 0.52, m.wid * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const body = car.burned ? '#2b2b30' : car.color;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-m.len / 2, -m.wid / 2, m.len, m.wid, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (!car.burned) {
    // Cabin, windscreen and rear window.
    ctx.fillStyle = shade(body, -26);
    ctx.beginPath();
    ctx.roundRect(-m.len * 0.16, -m.wid / 2 + 3, m.len * 0.34, m.wid - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 38, 52, 0.88)';
    ctx.fillRect(m.len * 0.13, -m.wid / 2 + 4, m.len * 0.09, m.wid - 8);
    ctx.fillRect(-m.len * 0.24, -m.wid / 2 + 4, m.len * 0.07, m.wid - 8);
    // Headlights and tail lights.
    ctx.fillStyle = '#fff7c0';
    ctx.fillRect(m.len / 2 - 3, -m.wid / 2 + 3, 3, 5);
    ctx.fillRect(m.len / 2 - 3, m.wid / 2 - 8, 3, 5);
    ctx.fillStyle = car.braking ? '#ff2e2e' : '#a92424';
    ctx.fillRect(-m.len / 2, -m.wid / 2 + 3, 3, 5);
    ctx.fillRect(-m.len / 2, m.wid / 2 - 8, 3, 5);
  }
  // Wheels.
  ctx.fillStyle = '#15151a';
  const wx = m.len * 0.32;
  const wy = m.wid / 2 - 1;
  ctx.fillRect(wx - 6, -wy - 2, 12, 4.6);
  ctx.fillRect(wx - 6, wy - 2.6, 12, 4.6);
  ctx.fillRect(-wx - 6, -wy - 2, 12, 4.6);
  ctx.fillRect(-wx - 6, wy - 2.6, 12, 4.6);
  if (car.kind === 'police') drawPoliceLivery(ctx, state, car);
  if (car.modelId === 'taxi') {
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#ffe66d';
    ctx.font = '700 6.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.4);
  }
  if (state.player.car === car) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-m.len / 2 - 3, -m.wid / 2 - 3, m.len + 6, m.wid + 6, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPoliceLivery(ctx, state, car) {
  const m = car.model;
  ctx.fillStyle = '#22242c';
  ctx.fillRect(m.len * 0.3, -m.wid / 2, m.len * 0.2, m.wid);
  ctx.fillRect(-m.len / 2, -m.wid / 2, m.len * 0.16, m.wid);
  ctx.fillStyle = '#2e6fd8';
  ctx.fillRect(-m.len * 0.16, -3, m.len * 0.46, 6);
  // Light bar, flashing with the game clock.
  const phase = Math.floor(state.time * 2.6 + car.id) % 2 === 0;
  ctx.fillStyle = phase ? '#ff3b30' : '#5b2a28';
  ctx.fillRect(-7, -m.wid / 2 + 3, 6, 6);
  ctx.fillStyle = phase ? '#2a3f66' : '#3b82f6';
  ctx.fillRect(1, -m.wid / 2 + 3, 6, 6);
  ctx.fillStyle = phase ? '#3b82f6' : '#2a3f66';
  ctx.fillRect(1, m.wid / 2 - 9, 6, 6);
  ctx.fillStyle = phase ? '#5b2a28' : '#ff3b30';
  ctx.fillRect(-7, m.wid / 2 - 9, 6, 6);
}

export function drawPed(ctx, state, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(43,32,20,0.20)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(11, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = ped.speed > 4 ? Math.sin(ped.walkPhase) * 1.6 : 0;
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  const hx = Math.cos(ped.angle) * 2.5;
  const hy = Math.sin(ped.angle) * 2.5;
  ctx.beginPath();
  ctx.arc(hx, hy + bob * 0.3, 4.4, 0, Math.PI * 2);
  ctx.fill();
  if (ped.kind === 'officer') {
    ctx.fillStyle = '#1d2735';
    ctx.beginPath();
    ctx.arc(hx, hy + bob * 0.3, 4.6, Math.PI * 0.9, Math.PI * 1.9);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-1.5, -8.5, 3, 2);
  }
  ctx.restore();
}

export function drawPlayer(ctx, state) {
  const player = state.player;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(43,32,20,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = player.moving ? Math.sin(player.walkPhase) * 1.7 : 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#0e7c86';
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f6cfae';
  const hx = Math.cos(player.angle) * 3;
  const hy = Math.sin(player.angle) * 3;
  ctx.beginPath();
  ctx.arc(hx, hy + bob * 0.3, 4.8, 0, Math.PI * 2);
  ctx.fill();
  // The pistol, when the mouse is aiming it.
  if (state.inputRef.mouse.down) {
    ctx.strokeStyle = '#22242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(player.angle) * 8, Math.sin(player.angle) * 8);
    ctx.lineTo(Math.cos(player.angle) * 17, Math.sin(player.angle) * 17);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFx(ctx, state) {
  for (const t of state.tracers) {
    ctx.strokeStyle = `rgba(255, 230, 140, ${Math.min(1, t.life / 0.07)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

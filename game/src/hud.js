// The interface: HUD (health, cash, wanted stars, objective banner, phone messages,
// speedometer, ammunition, arrest meter), the live minimap, and the full-screen
// states — title menu, help, pause, busted, wasted. Everything here is screen space;
// render.js draws the world underneath.

import { CITY } from './config.js';
import { carSpeed } from './vehicles.js';

function pill(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(16, 20, 28, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
}

function star(ctx, cx, cy, r, filled, flash) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = flash ? '#ffe66d' : '#ffd60a';
    ctx.shadowColor = 'rgba(255, 214, 10, 0.8)';
    ctx.shadowBlur = flash ? 14 : 5;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
  }
}

export function drawHUD(ctx, state) {
  const { w, h } = state.view;
  drawCashAndHealth(ctx, state, w, h);
  drawStarsAndMap(ctx, state, w, h);
  drawObjective(ctx, state, w);
  drawVehicleOrWeapon(ctx, state, w, h);
  drawMessages(ctx, state, h);
  drawAnnounce(ctx, state, w, h);
  drawEdgeArrow(ctx, state, w, h);
  if (!state.player.car && state.mode === 'play') drawCrosshair(ctx, state);
  if (state.damageFlash > 0) {
    ctx.fillStyle = `rgba(200, 30, 40, ${state.damageFlash * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawCashAndHealth(ctx, state, w, h) {
  pill(ctx, 16, 16, 168, 40);
  ctx.fillStyle = '#7bed6f';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${state.money.toLocaleString('en-US')}`, 30, 44);

  // Health, bottom-left.
  const bw = 224;
  const bx = 16;
  const by = h - 40;
  pill(ctx, bx - 4, by - 6, bw + 8, 30, 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(bx, by, bw, 13);
  const pct = Math.max(0, state.player.hp / state.player.maxHp);
  ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(bx, by, bw * pct, 13);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText('HEALTH', bx + 2, by - 10);

  // The arrest meter, above health, only while it is filling.
  if (state.wanted.bust > 0.02) {
    const flash = Math.floor(state.time * 6) % 2 === 0;
    pill(ctx, bx - 4, by - 40, bw + 8, 26, 0.6);
    ctx.fillStyle = flash ? '#3b82f6' : '#e74c3c';
    ctx.fillRect(bx, by - 33, bw * state.wanted.bust, 11);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('THEY ARE TAKING YOU IN…', bx + 2, by - 44);
  }
}

function drawStarsAndMap(ctx, state, w) {
  const stars = state.wanted.stars;
  const flash = state.wanted.flashT > 0;
  for (let i = 0; i < 5; i += 1) {
    star(ctx, w - 196 + i * 38, 34, flash && i < stars ? 17 : 14.5, i < stars, flash);
  }
  drawMinimap(ctx, state, w - 202, 56, 186);
}

export function drawMinimap(ctx, state, mx, my, size) {
  const city = state.city;
  const scale = size / CITY.width;
  ctx.save();
  pill(ctx, mx - 5, my - 5, size + 10, size * (CITY.height / CITY.width) + 10, 0.6);
  ctx.beginPath();
  ctx.rect(mx, my, size, size * (CITY.height / CITY.width));
  ctx.clip();
  ctx.fillStyle = '#177e96';
  ctx.fillRect(mx, my, size, size * (CITY.height / CITY.width));
  ctx.fillStyle = '#c9bd9f';
  ctx.fillRect(mx, my, CITY.grid * scale, CITY.height * scale);
  ctx.fillStyle = '#eed9a0';
  ctx.fillRect(mx + CITY.sandX * scale, my, (CITY.waterX - CITY.sandX) * scale, CITY.height * scale);
  ctx.strokeStyle = 'rgba(70, 70, 80, 0.85)';
  ctx.lineWidth = 2.4;
  for (const cx of city.vRoads) {
    ctx.beginPath();
    ctx.moveTo(mx + cx * scale, my);
    ctx.lineTo(mx + cx * scale, my + CITY.height * scale);
    ctx.stroke();
  }
  for (const cy of city.hRoads) {
    ctx.beginPath();
    ctx.moveTo(mx, my + cy * scale);
    ctx.lineTo(mx + CITY.grid * scale, my + cy * scale);
    ctx.stroke();
  }
  const px = (x) => mx + x * scale;
  const py = (y) => my + y * scale;
  // Pickups.
  for (const p of state.pickups) {
    if (p.taken) continue;
    ctx.fillStyle = p.kind === 'cash' ? '#2ecc71' : '#ff5b5b';
    ctx.fillRect(px(p.x) - 1.6, py(p.y) - 1.6, 3.2, 3.2);
  }
  // Police, flashing.
  if (Math.floor(state.time * 2.4) % 2 === 0) {
    ctx.fillStyle = '#3b82f6';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(px(car.x), py(car.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3b82f6';
    for (const ped of state.peds) {
      if (ped.kind !== 'officer' || ped.state === 'down') continue;
      ctx.beginPath();
      ctx.arc(px(ped.x), py(ped.y), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The garage, when it is not the objective.
  const g = city.places.garage;
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(px(g.x) - 2.4, py(g.y) - 2.4, 4.8, 4.8);
  // Objective.
  if (state.objective) {
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(px(state.objective.x), py(state.objective.y), 4 + Math.sin(state.time * 5) * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
  }
  // Player arrow.
  const player = state.player;
  ctx.save();
  ctx.translate(px(player.x), py(player.y));
  ctx.rotate(player.car ? player.car.angle : player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6.4, 0);
  ctx.lineTo(-4.4, -4);
  ctx.lineTo(-4.4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '700 9.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CORAL BAY', mx + 2, my - 8);
}

function drawObjective(ctx, state, w) {
  const objective = state.objective;
  if (!objective || state.mode !== 'play') return;
  const dist = Math.hypot(objective.x - state.player.x, objective.y - state.player.y);
  let text = `${objective.text} · ${Math.round(dist / 10)}m`;
  if (objective.timer !== null && objective.timer !== undefined) {
    const t = Math.max(0, Math.ceil(objective.timer));
    const mm = Math.floor(t / 60);
    const ss = String(t % 60).padStart(2, '0');
    text += ` · ${mm}:${ss}`;
  }
  ctx.font = '600 14.5px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const bw = Math.max(tw + 34, 210);
  pill(ctx, (w - bw) / 2, 14, bw, 46, 0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a';
  ctx.font = '700 10.5px system-ui, sans-serif';
  ctx.fillText(objective.title, w / 2, 31);
  ctx.fillStyle = objective.timer !== null && objective.timer !== undefined && objective.timer < 30 ? '#ff6b6b' : '#ffffff';
  ctx.font = '600 14.5px system-ui, sans-serif';
  ctx.fillText(text, w / 2, 51);
}

function drawVehicleOrWeapon(ctx, state, w, h) {
  const player = state.player;
  ctx.textAlign = 'right';
  if (player.car) {
    const kmh = Math.round(Math.abs(carSpeed(player.car)) * 0.32);
    pill(ctx, w - 196, h - 86, 180, 70, 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(`${kmh}`, w - 58, h - 44);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', w - 24, h - 44);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText(player.car.model.name, w - 24, h - 24);
    const pct = Math.max(0, player.car.hp / player.car.maxHp);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(w - 182, h - 62, 100, 5);
    ctx.fillStyle = pct > 0.4 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(w - 182, h - 62, 100 * pct, 5);
  } else if (state.mode === 'play') {
    pill(ctx, w - 196, h - 62, 180, 46, 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(player.reloadT > 0 ? 'RELOADING…' : `PISTOL ${player.ammo} / ∞`, w - 26, h - 32);
  }
  ctx.textAlign = 'left';
}

function drawMessages(ctx, state, h) {
  const msgs = state.messages.slice(-3);
  let y = h - 118;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const msg = msgs[i];
    const alpha = Math.min(1, msg.ttl / 1.2);
    ctx.globalAlpha = Math.max(0, alpha);
    const lines = wrapText(ctx, msg.text, 300);
    const bh = 26 + lines.length * 16;
    y -= bh + 8;
    pill(ctx, 16, y, 336, bh, 0.62);
    ctx.fillStyle = '#ffd60a';
    ctx.font = '700 11.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`☎ ${msg.from}`, 28, y + 17);
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 12.5px system-ui, sans-serif';
    lines.forEach((line, li) => ctx.fillText(line, 28, y + 36 + li * 16));
  }
  ctx.globalAlpha = 1;
}

function wrapText(ctx, text, maxWidth) {
  ctx.font = '400 12.5px system-ui, sans-serif';
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawAnnounce(ctx, state, w, h) {
  const a = state.announce;
  if (!a || a.ttl <= 0) return;
  const alpha = Math.min(1, a.ttl / 0.8, (3 - a.ttl) * 2 + 0.4);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillText(a.title, w / 2, h * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(a.sub, w / 2, h * 0.3 + 34);
  ctx.restore();
}

function drawEdgeArrow(ctx, state, w, h) {
  const objective = state.objective;
  if (!objective || state.mode !== 'play') return;
  const sx = (objective.x - state.camera.x) * state.camera.zoom + w / 2;
  const sy = (objective.y - state.camera.y) * state.camera.zoom + h / 2;
  if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40) return;
  const cx = Math.max(36, Math.min(w - 36, sx));
  const cy = Math.max(36, Math.min(h - 36, sy));
  const angle = Math.atan2(sy - h / 2, sx - w / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffd60a';
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCrosshair(ctx, state) {
  const { x, y } = state.inputRef.mouse;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd60a';
  ctx.fillRect(x - 1, y - 1, 2, 2);
}

// ----- Full-screen states -------------------------------------------------

export function titleItems(state) {
  const { w, h } = state.view;
  const items = [{ id: 'new', label: 'NEW GAME' }];
  if (state.hasSave) items.push({ id: 'continue', label: 'CONTINUE' });
  items.push({ id: 'help', label: 'HOW TO PLAY' });
  return items.map((item, i) => ({
    ...item,
    x: w / 2 - 130,
    y: h * 0.52 + i * 52,
    w: 260,
    h: 42,
  }));
}

export function drawTitle(ctx, state) {
  const { w, h } = state.view;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20, 24, 44, 0.42)');
  grad.addColorStop(0.55, 'rgba(20, 24, 44, 0.18)');
  grad.addColorStop(1, 'rgba(20, 24, 44, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a';
  ctx.font = '800 74px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText('CORAL BAY', w / 2, h * 0.3);
  ctx.fillStyle = '#ff6b81';
  ctx.fillText('HEAT', w / 2, h * 0.3 + 72);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('An open-world crime story in a city of sun, sand and sirens.', w / 2, h * 0.3 + 108);
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('You are Rae Solano, courier. Mari Vega has work. The CBPD has opinions.', w / 2, h * 0.3 + 132);

  const items = titleItems(state);
  items.forEach((item, i) => {
    const selected = state.ui.selected === i;
    const hover = state.inputRef.mouse.x >= item.x && state.inputRef.mouse.x <= item.x + item.w
      && state.inputRef.mouse.y >= item.y && state.inputRef.mouse.y <= item.y + item.h;
    ctx.fillStyle = selected || hover ? 'rgba(255, 214, 10, 0.92)' : 'rgba(16, 20, 28, 0.66)';
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.w, item.h, 10);
    ctx.fill();
    ctx.fillStyle = selected || hover ? '#1c2430' : '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(item.label, w / 2, item.y + 27);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '400 12.5px system-ui, sans-serif';
  ctx.fillText('WASD drive & walk · E enter car · mouse aim & shoot · P pause · M mute', w / 2, h - 26);
}

export function drawHelp(ctx, state) {
  const { w, h } = state.view;
  ctx.fillStyle = 'rgba(10, 13, 20, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd60a';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', w / 2, 90);
  const rows = [
    ['W A S D / arrows', 'Walk, drive, steer'],
    ['Shift', 'Sprint on foot'],
    ['E or F', 'Enter / exit the nearest car'],
    ['Mouse', 'Aim on foot'],
    ['Click / hold', 'Shoot (pistol)'],
    ['R', 'Reload'],
    ['Space', 'Handbrake'],
    ['P or Esc', 'Pause'],
    ['M', 'Mute'],
    ['', ''],
    ['Do jobs for Mari at Vega\'s Garage.', 'Follow the yellow marker.'],
    ['Stars mean the CBPD is coming.', 'Lose them by breaking sight — or hide at the garage.'],
    ['Cash drops and health packs', 'are scattered around the bay.'],
  ];
  ctx.font = '400 15.5px system-ui, sans-serif';
  rows.forEach((row, i) => {
    const y = 140 + i * 30;
    ctx.fillStyle = '#ffd60a';
    ctx.textAlign = 'right';
    ctx.font = '700 15.5px system-ui, sans-serif';
    ctx.fillText(row[0], w / 2 - 18, y);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = '400 15.5px system-ui, sans-serif';
    ctx.fillText(row[1], w / 2 + 18, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Click or press Esc to go back', w / 2, h - 40);
}

export function drawPause(ctx, state) {
  const { w, h } = state.view;
  ctx.fillStyle = 'rgba(10, 13, 20, 0.66)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.38);
  ctx.font = '400 16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Cash $${state.money.toLocaleString('en-US')} · Jobs done ${state.stats.missionsDone} · Cars taken ${state.stats.stolen}`, w / 2, h * 0.38 + 42);
  ctx.fillText('Press P or Esc to keep driving. Progress saves after every job.', w / 2, h * 0.38 + 70);
}

export function drawBustedWasted(ctx, state) {
  const { w, h } = state.view;
  const busted = state.mode === 'busted';
  ctx.fillStyle = busted ? 'rgba(18, 30, 66, 0.62)' : 'rgba(66, 14, 18, 0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = busted ? '#7db4ff' : '#ff6b6b';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', w / 2, h * 0.42);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 17px system-ui, sans-serif';
  ctx.fillText(busted
    ? 'The CBPD thanks you for stopping. Bail and fines come out of your cash.'
    : 'St. Coral Hospital patched you up. The bill comes out of your cash.', w / 2, h * 0.42 + 40);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Press ENTER to continue', w / 2, h * 0.42 + 76);
}

// hud.js — everything drawn in screen space: cash and health, wanted stars,
// the objective banner with distance and countdown, the phone with Mari's
// texts, the speedometer, the bust meter, the minimap, and every menu
// (title, help, pause, BUSTED, WASTED, story complete).

import { WORLD_W, WORLD_H } from './config.js';
import { clamp } from './rng.js';
import { roundRect } from './render.js';

function txt(ctx, text, x, y, font, color, align = 'left') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export function registerButton(game, id, x, y, w, h) {
  game.buttons.push({ id, x, y, w, h });
}

function drawButton(ctx, game, id, x, y, w, h, label, accent) {
  const hover = game.input.mouse.x >= x && game.input.mouse.x <= x + w && game.input.mouse.y >= y && game.input.mouse.y <= y + h;
  ctx.fillStyle = hover ? (accent || '#ffd166') : 'rgba(16,20,28,0.85)';
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = accent || '#ffd166'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();
  txt(ctx, label, x + w / 2, y + h / 2 + 7, 'bold 19px system-ui, sans-serif', hover ? '#14181f' : '#f5f1e6', 'center');
  registerButton(game, id, x, y, w, h);
}

export function drawHud(ctx, game) {
  const { view, player } = game;
  const W = view.w;
  // Cash and health, top-left.
  txt(ctx, '$' + game.save.cash.toLocaleString('en-US'), 22, 40, 'bold 27px system-ui, sans-serif', '#ffd166');
  ctx.fillStyle = 'rgba(10,12,16,0.55)';
  roundRect(ctx, 20, 52, 184, 15, 4); ctx.fill();
  ctx.fillStyle = player.hp > 30 ? '#43d17c' : '#e74c3c';
  roundRect(ctx, 22, 54, 180 * clamp(player.hp / 100, 0, 1), 11, 3); ctx.fill();
  txt(ctx, 'RAE SOLANO', 22, 84, 'bold 11px system-ui, sans-serif', 'rgba(255,255,255,0.75)');

  // Wanted stars, top-right.
  for (let i = 0; i < 5; i++) {
    const x = W - 34 - i * 34, y = 36;
    txt(ctx, '★', x, y, '26px system-ui, sans-serif', i < game.stars ? '#ffd166' : 'rgba(255,255,255,0.25)', 'center');
  }
  if (game.stars > 0) txt(ctx, game.seen ? 'CBPD — IN PURSUIT' : 'CBPD — SEARCHING', W - 22, 62, 'bold 11px system-ui, sans-serif', game.seen ? '#ff8a80' : 'rgba(255,255,255,0.7)', 'right');

  drawObjectiveBanner(ctx, game);
  drawMinimap(ctx, game);
  drawPhone(ctx, game);

  // Bottom-right cluster: speedometer in a car, pistol readout on foot.
  if (player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
    txt(ctx, kmh + '', W - 30, view.h - 58, 'bold 44px system-ui, sans-serif', '#ffffff', 'right');
    txt(ctx, 'km/h · ' + player.car.type.name, W - 30, view.h - 34, 'bold 13px system-ui, sans-serif', 'rgba(255,255,255,0.8)', 'right');
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    roundRect(ctx, W - 190, view.h - 26, 160, 9, 4); ctx.fill();
    ctx.fillStyle = player.car.hp > player.car.maxHp * 0.3 ? '#43d17c' : '#e74c3c';
    roundRect(ctx, W - 189, view.h - 25, 158 * clamp(player.car.hp / player.car.maxHp, 0, 1), 7, 3); ctx.fill();
  } else {
    txt(ctx, 'PISTOL  ' + player.ammo + ' / ∞', W - 30, view.h - 36, 'bold 19px system-ui, sans-serif', player.ammo === 0 ? '#ff8a80' : '#ffffff', 'right');
    if (player.reloadT > 0) txt(ctx, 'RELOADING…', W - 30, view.h - 58, 'bold 12px system-ui, sans-serif', '#ffd166', 'right');
  }

  // Bust meter, bottom-centre, only while the cuffs are closing in.
  if (game.bust > 0.02) {
    const w = 260;
    txt(ctx, 'BUSTED?', view.w / 2, view.h - 66, 'bold 14px system-ui, sans-serif', '#ff8a80', 'center');
    ctx.fillStyle = 'rgba(10,12,16,0.6)';
    roundRect(ctx, view.w / 2 - w / 2, view.h - 58, w, 13, 5); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    roundRect(ctx, view.w / 2 - w / 2 + 2, view.h - 56, (w - 4) * game.bust, 9, 4); ctx.fill();
  }

  // Early-game control hints.
  if (game.playT < 24 && game.state === 'playing') {
    txt(ctx, player.car ? 'WASD drive · SPACE handbrake · E exit car · P pause' : 'WASD move · SHIFT sprint · E enter car · MOUSE aim · CLICK shoot · R reload',
      view.w / 2, view.h - 14, '13px system-ui, sans-serif', 'rgba(255,255,255,0.65)', 'center');
  }

  // Damage flash.
  if (player.hurtT > 0) {
    ctx.fillStyle = 'rgba(200,30,30,' + (player.hurtT * 0.28) + ')';
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

function drawObjectiveBanner(ctx, game) {
  const obj = game.objective;
  if (!obj) return;
  const label = obj.title.toUpperCase();
  const distM = Math.max(0, Math.round(Math.hypot(obj.x - game.player.x, obj.y - game.player.y) / 10));
  let right = distM + 'm';
  if (obj.timeLeft !== null && obj.timeLeft !== undefined) {
    const s = Math.max(0, Math.ceil(obj.timeLeft));
    right += ' · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  ctx.font = 'bold 12px system-ui, sans-serif';
  const wTitle = ctx.measureText(label).width;
  ctx.font = '15px system-ui, sans-serif';
  const wText = ctx.measureText(obj.text).width;
  ctx.font = 'bold 15px system-ui, sans-serif';
  const wRight = ctx.measureText(right).width;
  const w = Math.min(game.view.w - 320, wTitle + 14 + wText + 22 + wRight + 30);
  const x = game.view.w / 2 - w / 2, y = 14;
  ctx.fillStyle = 'rgba(12,15,22,0.78)';
  roundRect(ctx, x, y, w, 44, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(255,209,102,0.6)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, 44, 9); ctx.stroke();
  let cx = x + 14;
  txt(ctx, label, cx, y + 28, 'bold 12px system-ui, sans-serif', '#ffd166');
  cx += wTitle + 14;
  txt(ctx, obj.text, cx, y + 29, '15px system-ui, sans-serif', '#f5f1e6');
  txt(ctx, right, x + w - 14, y + 29, 'bold 15px system-ui, sans-serif', obj.timeLeft !== null && obj.timeLeft !== undefined && obj.timeLeft < 30 ? '#ff8a80' : '#9fd8ef', 'right');
}

function drawMinimap(ctx, game) {
  const S = 172, x = 20, y = game.view.h - S - 20;
  const scale = S / WORLD_W;
  ctx.fillStyle = 'rgba(10,16,20,0.78)';
  roundRect(ctx, x - 4, y - 4, S + 8, S + 8, 8); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip();
  ctx.fillStyle = '#2c6e49'; ctx.fillRect(x, y, S, S);
  ctx.fillStyle = '#1789a3';
  ctx.fillRect(x + 3790 * scale, y, S, S);
  ctx.fillStyle = '#f6e3ae';
  ctx.fillRect(x + 3546 * scale, y, 244 * scale, S);
  ctx.strokeStyle = 'rgba(230,230,230,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const gx = x + (i * 430 + 52) * scale;
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + S); ctx.stroke();
    const gy = y + (i * 430 + 52) * scale;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + S, gy); ctx.stroke();
  }
  const dot = (wx, wy, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + wx * scale, y + wy * scale, r, 0, Math.PI * 2); ctx.fill(); };
  const pois = game.world.pois;
  if (pois.garage) dot(pois.garage.x, pois.garage.y, '#ffd166', 3.4);
  if (pois.hospital) dot(pois.hospital.x, pois.hospital.y, '#ffffff', 3);
  if (pois.police) dot(pois.police.x, pois.police.y, '#5b8cff', 3);
  if (pois.hotel) dot(pois.hotel.x, pois.hotel.y, '#fd79a8', 3);
  if (game.stars > 0) for (const u of game.units) dot(u.car.x, u.car.y, Math.floor(game.time * 3) % 2 ? '#ff5252' : '#5b8cff', 2.6);
  if (game.objective) {
    const pulse = 2.6 + Math.sin(game.time * 5) * 0.9;
    dot(game.objective.x, game.objective.y, '#ffd166', pulse + 1.6);
  }
  // Player arrow.
  const px = x + game.player.x * scale, py = y + game.player.y * scale;
  const a = game.player.car ? game.player.car.angle : game.player.angle;
  ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
  txt(ctx, 'CORAL BAY', x + 2, y - 9, 'bold 10px system-ui, sans-serif', 'rgba(255,255,255,0.65)');
}

function drawPhone(ctx, game) {
  const msgs = game.phone.slice(-2);
  if (!msgs.length) return;
  const x = 20, w = 302;
  let y = game.view.h - 172 - 20 - msgs.length * 70 - 6;
  for (const m of msgs) {
    const fresh = game.time - m.t < 10;
    ctx.globalAlpha = fresh ? 0.95 : 0.55;
    ctx.fillStyle = 'rgba(14,17,24,0.88)';
    roundRect(ctx, x, y, w, 64, 9); ctx.fill();
    ctx.fillStyle = '#43d17c';
    ctx.beginPath(); ctx.arc(x + 16, y + 15, 6, 0, Math.PI * 2); ctx.fill();
    txt(ctx, 'MARI · VEGA\'S GARAGE', x + 28, y + 19, 'bold 10px system-ui, sans-serif', '#9fd8ef');
    wrapText(ctx, m.text.replace(/^Mari: /, ''), x + 12, y + 37, w - 22, 12.5, '#f5f1e6');
    ctx.globalAlpha = 1;
    y += 70;
  }
}

function wrapText(ctx, text, x, y, maxW, size, color) {
  ctx.font = size + 'px system-ui, sans-serif';
  ctx.fillStyle = color;
  const words = text.split(' ');
  let line = '', lines = 0;
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && line) {
      ctx.fillText(line, x, y + lines * (size + 2.5));
      line = word; lines++;
      if (lines >= 2) return;
    } else line = trial;
  }
  if (line && lines < 2) ctx.fillText(line, x, y + lines * (size + 2.5));
}

// --- menus -------------------------------------------------------------------

function dim(ctx, game, alpha) {
  ctx.fillStyle = 'rgba(8,10,16,' + alpha + ')';
  ctx.fillRect(0, 0, game.view.w, game.view.h);
}

export function drawMenus(ctx, game) {
  const W = game.view.w, H = game.view.h, cx = W / 2;
  if (game.state === 'title') {
    dim(ctx, game, 0.45);
    txt(ctx, 'CORAL BAY', cx, H * 0.3, 'bold 84px system-ui, sans-serif', '#ffd166', 'center');
    txt(ctx, 'H E A T', cx, H * 0.3 + 74, 'bold 40px system-ui, sans-serif', '#ff8a5c', 'center');
    txt(ctx, 'An original open-world crime caper — steal cars, run jobs for Mari, outrun the CBPD.', cx, H * 0.3 + 112, '16px system-ui, sans-serif', '#f5f1e6', 'center');
    const bw = 300, bx = cx - bw / 2;
    let by = H * 0.52;
    drawButton(ctx, game, 'new', bx, by, bw, 52, 'NEW GAME', '#ffd166'); by += 66;
    if (game.hasSave) { drawButton(ctx, game, 'continue', bx, by, bw, 52, 'CONTINUE', '#9fd8ef'); by += 66; }
    drawButton(ctx, game, 'help', bx, by, bw, 52, 'HOW TO PLAY', '#9fd8ef');
    txt(ctx, 'WASD + mouse · M mute · a game drawn entirely by code', cx, H - 26, '13px system-ui, sans-serif', 'rgba(255,255,255,0.6)', 'center');
  } else if (game.state === 'help') {
    dim(ctx, game, 0.78);
    txt(ctx, 'HOW TO PLAY', cx, 110, 'bold 38px system-ui, sans-serif', '#ffd166', 'center');
    const lines = [
      'You are Rae Solano, courier of Coral Bay. Mari Vega runs jobs from her garage —',
      'follow the gold beacon, and the banner up top always tells you the next step.',
      '',
      'MOVE  WASD / arrows      SPRINT  Shift      ENTER / EXIT CAR  E',
      'AIM  mouse      SHOOT  click      RELOAD  R      HANDBRAKE  Space      PAUSE  P / Esc',
      '',
      'Crimes only raise your wanted stars when someone sees or hears them.',
      'Break line of sight and the heat cools. If officers pin you down, the bust',
      'meter fills — a full meter means BUSTED, and the hospital means WASTED.',
      'Five jobs tell the whole story. After that, the city is yours.',
    ];
    lines.forEach((l, i) => txt(ctx, l, cx, 170 + i * 27, '16px system-ui, sans-serif', '#f5f1e6', 'center'));
    drawButton(ctx, game, 'back', cx - 110, H - 130, 220, 50, 'BACK', '#ffd166');
  } else if (game.state === 'paused') {
    dim(ctx, game, 0.62);
    txt(ctx, 'PAUSED', cx, H * 0.34, 'bold 52px system-ui, sans-serif', '#ffffff', 'center');
    const bw = 300, bx = cx - bw / 2;
    let by = H * 0.44;
    drawButton(ctx, game, 'resume', bx, by, bw, 52, 'RESUME', '#ffd166'); by += 66;
    drawButton(ctx, game, 'mute', bx, by, bw, 52, game.save.muted ? 'SOUND: OFF' : 'SOUND: ON', '#9fd8ef'); by += 66;
    drawButton(ctx, game, 'restart', bx, by, bw, 52, 'RESTART STORY', '#ff8a80'); by += 66;
    drawButton(ctx, game, 'quit', bx, by, bw, 52, 'QUIT TO TITLE', '#9fd8ef');
  } else if (game.state === 'busted') {
    dim(ctx, game, 0.55);
    txt(ctx, 'BUSTED', cx, H * 0.4, 'bold 76px system-ui, sans-serif', '#ff5252', 'center');
    txt(ctx, 'The CBPD impounds your ride and fines you $' + game.lastFine + '.', cx, H * 0.4 + 52, '17px system-ui, sans-serif', '#f5f1e6', 'center');
    drawButton(ctx, game, 'respawn', cx - 130, H * 0.58, 260, 52, 'RESPAWN', '#ffd166');
  } else if (game.state === 'wasted') {
    dim(ctx, game, 0.6);
    txt(ctx, 'WASTED', cx, H * 0.4, 'bold 76px system-ui, sans-serif', '#e8e8e8', 'center');
    txt(ctx, 'Coral Bay General patches you up for $' + game.lastFine + '.', cx, H * 0.4 + 52, '17px system-ui, sans-serif', '#f5f1e6', 'center');
    drawButton(ctx, game, 'respawn', cx - 130, H * 0.58, 260, 52, 'RESPAWN', '#ffd166');
  } else if (game.state === 'story') {
    dim(ctx, game, 0.6);
    txt(ctx, 'THE CITY IS YOURS', cx, H * 0.36, 'bold 54px system-ui, sans-serif', '#ffd166', 'center');
    const s = game.save.stats;
    txt(ctx, 'All five of Mari\'s jobs are done. Cash earned, cars borrowed, legends made.', cx, H * 0.36 + 48, '16px system-ui, sans-serif', '#f5f1e6', 'center');
    txt(ctx, 'Cars stolen ' + s.stolen + ' · Busted ' + s.busts + ' · Wasted ' + s.wasted + ' · Shots fired ' + s.shots + ' · ' + s.distanceKm.toFixed(1) + ' km driven', cx, H * 0.36 + 80, '15px system-ui, sans-serif', '#9fd8ef', 'center');
    drawButton(ctx, game, 'freeroam', cx - 140, H * 0.58, 280, 52, 'KEEP PLAYING', '#ffd166');
  }
}

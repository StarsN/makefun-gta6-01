// Everything drawn in screen space: the minimap, health and cash, wanted
// stars, the objective banner, Mari's phone messages and dialogue, the
// speedometer and bust meter — plus the title, help, pause, BUSTED and
// WASTED screens.

import { PITCH, GRID, WORLD_W, WORLD_H, BEACH_X } from './config.js';
import { starsFor } from './police.js';
import { speedKmh } from './vehicles.js';
import { hasSave } from './save.js';

function panel(ctx, x, y, w, h, alpha = 0.62, r = 10) {
  ctx.fillStyle = `rgba(12,16,22,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function drawMinimap(ctx, g, x, y, w) {
  const h = w * (WORLD_H / WORLD_W);
  const sx = w / WORLD_W, sy = h / WORLD_H;
  panel(ctx, x - 4, y - 4, w + 8, h + 8, 0.55, 8);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#2f9dc4'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#c9cdd2'; ctx.fillRect(x, y, BEACH_X * sx, h);
  ctx.fillStyle = '#ecd9a0'; ctx.fillRect(x + BEACH_X * sx, y, (WORLD_W - BEACH_X) * sx, h);
  ctx.strokeStyle = 'rgba(40,44,50,0.65)'; ctx.lineWidth = 2;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * PITCH * sx, y); ctx.lineTo(x + i * PITCH * sx, y + WORLD_H * sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + i * PITCH * sy); ctx.lineTo(x + WORLD_W * sx, y + i * PITCH * sy); ctx.stroke();
  }
  const dot = (wx, wy, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + wx * sx, y + wy * sy, r, 0, 7); ctx.fill(); };
  dot(g.city.spots.garage.x, g.city.spots.garage.y, '#39d0d8', 3.5);
  dot(g.city.spots.hospital.x, g.city.spots.hospital.y, '#ffffff', 3);
  if (g.objective && !g.objective.garage && Math.sin(g.time * 6) > -0.4) dot(g.objective.x, g.objective.y, '#ffd83c', 4);
  if (g.heat > 0) for (const c of g.cars) if (c.kind === 'police' && !c.dead) dot(c.x, c.y, '#ff5040', 2.6);
  // Player arrow.
  const px = x + (g.player.car ? g.player.car.x : g.player.x) * sx;
  const py = y + (g.player.car ? g.player.car.y : g.player.y) * sy;
  const pa = g.player.car ? g.player.car.angle : g.player.angle;
  ctx.translate(px, py); ctx.rotate(pa);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawHUD(ctx, g) {
  const W = g.screen.w, H = g.screen.h;
  drawMinimap(ctx, g, 16, 16, 148);
  // Health (and the car's, while driving).
  const hpW = 148;
  ctx.fillStyle = 'rgba(10,12,16,0.6)'; ctx.fillRect(16, 152, hpW, 11);
  const hpFrac = Math.max(0, g.player.hp / 100);
  ctx.fillStyle = hpFrac > 0.35 ? '#57c84f' : '#e0483c';
  ctx.fillRect(17, 153, (hpW - 2) * hpFrac, 9);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 20, 161);
  if (g.player.car) {
    const cf = Math.max(0, g.player.car.health / g.player.car.maxHealth);
    ctx.fillStyle = 'rgba(10,12,16,0.6)'; ctx.fillRect(16, 166, hpW, 8);
    ctx.fillStyle = '#7fb2e0'; ctx.fillRect(17, 167, (hpW - 2) * cf, 6);
  }
  // Cash and wanted stars, top right.
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#7be382';
  ctx.fillText(`$${g.player.cash.toLocaleString('en-US')}`, W - 18, 40);
  const stars = starsFor(g.heat);
  ctx.font = '24px system-ui, sans-serif';
  for (let i = 0; i < 5; i++) {
    const active = i < stars;
    ctx.fillStyle = active ? (g.time - g.lastCrimeT < 2 ? '#ff5040' : '#ffd83c') : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', W - 22 - (4 - i) * 26, 72);
  }
  if (g.heat > 0 && g.time - g.lastSeenT > 2 && stars > 0) {
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('lose the cops…', W - 18, 92);
  }
  ctx.textAlign = 'left';
  // Objective banner, top centre.
  const obj = g.objective;
  if (obj) {
    const bw = Math.min(600, W - 380);
    if (bw > 260) {
      const bx = (W - bw) / 2;
      panel(ctx, bx, 14, bw, obj.title ? 58 : 42, 0.6);
      if (obj.title) {
        ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = '#ffd83c';
        ctx.fillText(obj.title, bx + 14, 32);
      }
      ctx.font = '15px system-ui, sans-serif'; ctx.fillStyle = '#f2f4f6';
      const label = obj.garage ? obj.text : `${obj.text} · ${obj.d}m`;
      ctx.fillText(label, bx + 14, obj.title ? 56 : 42);
      if (obj.timerLeft > 0) {
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.fillStyle = obj.timerLeft < 20 ? '#ff5040' : '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(fmtTime(obj.timerLeft), bx + bw - 14, obj.title ? 56 : 42);
        ctx.textAlign = 'left';
      }
    }
  }
  // Phone messages, bottom left.
  const msgs = g.messages.slice(-3);
  let my = H - 26 - msgs.length * 44;
  ctx.font = '13px system-ui, sans-serif';
  for (const m of msgs) {
    const age = g.time - m.t;
    if (age > 11) continue;
    const lines = wrap(ctx, m.text, 268).slice(0, 2);
    panel(ctx, 16, my, 300, 40, 0.55 * Math.min(1, (11 - age) / 2 + 0.3), 8);
    ctx.fillStyle = '#ffd83c'; ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(m.from.toUpperCase(), 26, my + 14);
    ctx.fillStyle = '#eef1f4'; ctx.font = '12.5px system-ui, sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, 26, my + 28 + i * 13 - (lines.length > 1 ? 6 : 0)));
    my += 44;
  }
  // Dialogue line, bottom centre.
  if (g.dialogue && g.time < g.dialogue.until) {
    const dw = Math.min(640, W - 380);
    if (dw > 280) {
      const dx = (W - dw) / 2, dy = H - 84;
      panel(ctx, dx, dy, dw, 58, 0.68);
      ctx.fillStyle = '#ffd83c'; ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(g.dialogue.who.toUpperCase(), dx + 14, dy + 18);
      ctx.fillStyle = '#f2f4f6'; ctx.font = '14.5px system-ui, sans-serif';
      wrap(ctx, g.dialogue.text, dw - 28).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, dx + 14, dy + 38 + i * 16));
    }
  }
  // Speedometer or ammo, bottom right.
  ctx.textAlign = 'right';
  if (g.player.car) {
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText(String(speedKmh(g.player.car)), W - 58, H - 26);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('km/h', W - 18, H - 26);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(g.player.car.spec.name, W - 18, H - 52);
  } else {
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(g.player.reloading ? 'RELOADING…' : `PISTOL  ${g.player.ammo} / ∞`, W - 18, H - 24);
  }
  ctx.textAlign = 'left';
  // Bust meter.
  if (g.bust > 0.02) {
    const bw = 240, bx = (W - bw) / 2, by = H * 0.66;
    panel(ctx, bx - 10, by - 24, bw + 20, 46, 0.6);
    ctx.fillStyle = '#ff5040'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('THE CBPD HAS YOU — BREAK FREE!', W / 2, by - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, by + 2, bw, 9);
    ctx.fillStyle = '#ff5040'; ctx.fillRect(bx, by + 2, bw * g.bust, 9);
    ctx.textAlign = 'left';
  }
  // Early-game control hints.
  if (g.playT < 26 && !g.shotMode) {
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.textAlign = 'center';
    ctx.fillText('WASD move · E/F enter or leave a car · mouse aim · click shoot · R reload · Shift run · P pause · M mute', W / 2, H - 10);
    ctx.textAlign = 'left';
  }
  if (g.muted) {
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('MUTED (M)', 16, H - 10);
  }
}

function menuItems(g) {
  const items = [{ label: 'NEW GAME', action: 'new' }];
  if (hasSave()) items.push({ label: 'CONTINUE', action: 'continue' });
  items.push({ label: 'HOW TO PLAY', action: 'howto' });
  return items;
}

export function drawMenus(ctx, g) {
  const W = g.screen.w, H = g.screen.h;
  g.menuRects = [];
  if (g.state === 'title') {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(16,32,54,0.55)');
    grad.addColorStop(0.6, 'rgba(16,32,54,0.25)');
    grad.addColorStop(1, 'rgba(10,16,26,0.72)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd83c';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('C O R A L   B A Y', W / 2, H * 0.26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillText('HEAT', W / 2, H * 0.26 + 84);
    ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Steal rides. Run jobs for Mari Vega. Outrun the CBPD.', W / 2, H * 0.26 + 122);
    const items = menuItems(g);
    items.forEach((it, i) => {
      const y = H * 0.52 + i * 52, w = 280, x = (W - w) / 2;
      const sel = g.menuIdx === i;
      panel(ctx, x, y, w, 42, sel ? 0.85 : 0.5);
      ctx.fillStyle = sel ? '#ffd83c' : '#eef1f4';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(it.label, W / 2, y + 28);
      g.menuRects.push({ x, y, w, h: 42, action: it.action });
    });
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Arrow keys + Enter, or click — an original game, drawn and sounded entirely in code', W / 2, H - 22);
    ctx.textAlign = 'left';
  }
  if (g.state === 'howto') {
    ctx.fillStyle = 'rgba(8,12,18,0.78)'; ctx.fillRect(0, 0, W, H);
    const w = Math.min(620, W - 60), x = (W - w) / 2, y = H * 0.16;
    panel(ctx, x, y, w, 430, 0.9, 14);
    ctx.fillStyle = '#ffd83c'; ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', W / 2, y + 40);
    ctx.fillStyle = '#eef1f4'; ctx.font = '15px system-ui, sans-serif'; ctx.textAlign = 'left';
    const lines = [
      'You are Rae Solano, a courier in Coral Bay. Mari Vega runs jobs',
      'out of her garage — follow the cyan marker, earn cash, stay free.',
      '',
      'WASD / arrows — move or drive        Shift — run',
      'E or F — enter / leave a car (even somebody else\'s)',
      'Mouse — aim · Click — shoot · R — reload',
      'Space — handbrake · P — pause · M — mute',
      '',
      'Crimes only count when somebody sees or hears them. Heat fades',
      'while the CBPD cannot see you — break line of sight and hide.',
      'From three stars the CBPD shoots. If they pin you, you are',
      'BUSTED; if your health runs out, you wake up at Coral General.',
      'Finish all five of Mari\'s jobs to make your name in the bay.',
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, x + 34, y + 82 + i * 24));
    ctx.fillStyle = '#ffd83c'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Press Enter or click to go back', W / 2, y + 402);
    ctx.textAlign = 'left';
    g.menuRects.push({ x, y, w, h: 430, action: 'title' });
  }
  if (g.state === 'pause') {
    ctx.fillStyle = 'rgba(8,12,18,0.66)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 54px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H * 0.36);
    ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const st = g.save.stats;
    ctx.fillText(`Cash $${g.player.cash.toLocaleString('en-US')} · Earned $${st.earned} · Cars stolen ${st.stolen} · Busted ${st.busted} · Wasted ${st.wasted}`, W / 2, H * 0.36 + 44);
    ctx.fillText('P or Esc — resume · progress saves itself as you play', W / 2, H * 0.36 + 74);
    ctx.textAlign = 'left';
  }
  if (g.state === 'busted' || g.state === 'wasted') {
    const busted = g.state === 'busted';
    ctx.fillStyle = busted ? 'rgba(16,28,54,0.72)' : 'rgba(54,14,12,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = busted ? '#7fb2e0' : '#ff6a5c';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillText(busted ? 'BUSTED' : 'WASTED', W / 2, H * 0.42);
    ctx.fillStyle = '#ffffff'; ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(busted ? `The CBPD takes a $${g.lastFine} fine. You walk out of CBPD HQ with your record — and your pride — dented.` : `You wake up at Coral General. The bill comes to $${g.lastFine}.`, W / 2, H * 0.42 + 42);
    ctx.fillStyle = '#ffd83c'; ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('Press Enter to carry on', W / 2, H * 0.42 + 76);
    ctx.textAlign = 'left';
  }
}

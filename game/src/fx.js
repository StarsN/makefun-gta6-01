// Transient visual effects: particles, skid marks and floating text.
// Everything lives on the game object (g.fx, g.skids, g.texts) and fades
// out on its own; render.js draws whatever is alive.

export function burst(g, x, y, n, color, speed = 130, life = 0.5, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.9);
    g.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.8), maxLife: life, color, size: size * (0.6 + Math.random() * 0.8), drag: 2.2, grav: 0 });
    if (g.fx.length > 420) g.fx.splice(0, g.fx.length - 420);
  }
}

export function smoke(g, x, y, dark = false) {
  g.fx.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 14, vy: -22 - Math.random() * 18, life: 1.1, maxLife: 1.1, color: dark ? 'rgba(40,40,44,0.5)' : 'rgba(200,200,205,0.45)', size: 7 + Math.random() * 7, drag: 0.4, grav: -14 });
}

export function fire(g, x, y) {
  g.fx.push({ x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 12, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 26, life: 0.42, maxLife: 0.42, color: Math.random() < 0.5 ? 'rgba(255,140,30,0.85)' : 'rgba(255,200,60,0.85)', size: 6 + Math.random() * 6, drag: 0.6, grav: -30 });
}

export function skid(g, x, y) {
  g.skids.push({ x, y, a: 0.32 });
  if (g.skids.length > 500) g.skids.splice(0, g.skids.length - 500);
}

export function floatText(g, x, y, text, color = '#ffe27a') {
  g.texts.push({ x, y, text, color, life: 1.6 });
  if (g.texts.length > 12) g.texts.shift();
}

export function updateFx(g, dt) {
  for (let i = g.fx.length - 1; i >= 0; i--) {
    const p = g.fx[i];
    p.life -= dt;
    if (p.life <= 0) { g.fx.splice(i, 1); continue; }
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy = p.vy * d + p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = g.skids.length - 1; i >= 0; i--) { g.skids[i].a -= dt * 0.05; if (g.skids[i].a <= 0) g.skids.splice(i, 1); }
  for (let i = g.texts.length - 1; i >= 0; i--) { const t = g.texts[i]; t.life -= dt; t.y -= 26 * dt; if (t.life <= 0) g.texts.splice(i, 1); }
}

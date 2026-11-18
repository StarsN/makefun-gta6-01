// input.js — keyboard and mouse state with edge detection.
// The game reads `keys` for held controls and `pressed` for one-frame taps;
// the browser shell clears `pressed` after each update.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.canvas = canvas;
    if (typeof window !== 'undefined' && canvas) this.attach();
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    const rect = () => this.canvas.getBoundingClientRect();
    this.canvas.addEventListener('mousemove', (e) => {
      const r = rect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      const r = rect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      this.mouse.down = true; this.mouse.clicked = true;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  tapped(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; }
}

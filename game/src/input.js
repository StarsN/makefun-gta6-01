// Keyboard and mouse state. The game reads this object; the self-test can
// write into it directly, which is why listeners only fill it in.

export const input = {
  keys: new Set(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  pressed: new Set(), // codes that went down since the last frame step
};

export function bindInput(target, canvas) {
  target.addEventListener('keydown', (e) => {
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  target.addEventListener('keyup', (e) => input.keys.delete(e.code));
  target.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) input.mouseDown = true; });
  target.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
}

export const down = (code) => input.keys.has(code);
export function justPressed(code) {
  if (input.pressed.has(code)) { input.pressed.delete(code); return true; }
  return false;
}
export function clearPressed() { input.pressed.clear(); }

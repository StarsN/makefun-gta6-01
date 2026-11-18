// Keyboard and mouse state for the game. `keys` holds what is down right now, `pressed`
// holds what went down this frame (main clears it after each update), and the mouse is
// tracked in screen pixels with its buttons and the world point it aims at.

export const input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldY: 0 },
};

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyM', 'KeyP',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
]);

export function attachInput(window) {
  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) input.pressed.add(event.code);
    input.keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouse.down = false;
  });
}

export function attachMouse(canvas) {
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = event.clientX - rect.left;
    input.mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.mouse.down = true;
      input.mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function down(...codes) {
  return codes.some((code) => input.keys.has(code));
}

export function justPressed(...codes) {
  return codes.some((code) => input.pressed.has(code));
}

export function endFrame() {
  input.pressed.clear();
  input.mouse.clicked = false;
}

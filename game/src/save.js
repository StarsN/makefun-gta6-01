// The save file: money, story progress, statistics and the mute setting, kept in
// localStorage so the title screen can offer Continue. Every access is wrapped — a
// browser that refuses storage simply plays without saving.

const SAVE_KEY = 'coral-bay-heat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      money: state.money,
      missionIndex: state.mission.index,
      storyDone: state.storyDone,
      stats: state.stats,
      muted: state.muted,
      player: { x: Math.round(state.player.x), y: Math.round(state.player.y) },
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: the game continues unsaved.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

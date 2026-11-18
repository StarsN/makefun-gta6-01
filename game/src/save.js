// save.js — localStorage persistence: cash, story progress, stats, mute.
// Every access is guarded so the game also runs where storage is unavailable.

const KEY = 'coral-bay-heat-save-v1';

export function defaultSave() {
  return {
    cash: 0,
    missionsDone: 0,          // index into the mission chain (0 = none done)
    storyComplete: false,
    muted: false,
    stats: { stolen: 0, busts: 0, wasted: 0, shots: 0, missions: 0, distanceKm: 0 },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...data, stats: { ...base.stats, ...(data.stats || {}) } };
  } catch { return null; }
}

export function storeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

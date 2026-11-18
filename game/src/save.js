// localStorage persistence: cash, story progress, lifetime stats, mute.
// Storage can throw (private mode, sandboxed frames), so every access is
// wrapped and the game simply plays unsaved when it has to.

import { STORE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 0,
    missionDone: 0,      // how many story missions are finished
    muted: false,
    stats: { earned: 0, stolen: 0, busted: 0, wasted: 0, shots: 0, distance: 0 },
  };
}

export function loadSave() {
  try {
    const raw = globalThis.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...data, stats: { ...base.stats, ...(data.stats || {}) } };
  } catch {
    return null;
  }
}

export function hasSave() {
  try { return !!globalThis.localStorage.getItem(STORE_KEY); } catch { return false; }
}

export function writeSave(save) {
  try { globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch { /* unsaved session */ }
}

export function wipeSave() {
  try { globalThis.localStorage.removeItem(STORE_KEY); } catch { /* nothing to wipe */ }
}

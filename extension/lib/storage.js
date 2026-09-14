/* chrome.storage wrapper for saved prospects and default preferences.
   Exposes window.MeetingStorage. Falls back gracefully if chrome.storage
   is unavailable (e.g. when a file is opened outside the extension). */

(function (global) {
  const PROSPECTS_KEY = 'mtf_prospects';
  const PREFS_KEY = 'mtf_prefs';

  const DEFAULT_PREFS = {
    durationMinutes: 30,
    userHours: { start: 9, end: 18 },
    otherHours: { start: 9, end: 18 }
  };

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  }

  function get(keys) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) return resolve({});
      chrome.storage.sync.get(keys, (result) => resolve(result || {}));
    });
  }

  function set(items) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) return resolve();
      chrome.storage.sync.set(items, () => resolve());
    });
  }

  async function getProspects() {
    const result = await get([PROSPECTS_KEY]);
    return result[PROSPECTS_KEY] || [];
  }

  async function saveProspect(prospect) {
    const prospects = await getProspects();
    const existingIdx = prospects.findIndex(
      (p) => p.name.toLowerCase() === prospect.name.toLowerCase()
    );
    if (existingIdx >= 0) {
      prospects[existingIdx] = { ...prospects[existingIdx], ...prospect };
    } else {
      prospects.unshift(prospect);
    }
    const trimmed = prospects.slice(0, 20);
    await set({ [PROSPECTS_KEY]: trimmed });
    return trimmed;
  }

  async function removeProspect(name) {
    const prospects = await getProspects();
    const filtered = prospects.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
    await set({ [PROSPECTS_KEY]: filtered });
    return filtered;
  }

  async function getPreferences() {
    const result = await get([PREFS_KEY]);
    return { ...DEFAULT_PREFS, ...(result[PREFS_KEY] || {}) };
  }

  async function savePreferences(prefs) {
    const current = await getPreferences();
    const merged = { ...current, ...prefs };
    await set({ [PREFS_KEY]: merged });
    return merged;
  }

  global.MeetingStorage = {
    DEFAULT_PREFS,
    getProspects,
    saveProspect,
    removeProspect,
    getPreferences,
    savePreferences
  };
})(typeof window !== 'undefined' ? window : globalThis);

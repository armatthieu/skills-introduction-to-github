/* chrome.storage wrapper for saved prospects and default preferences.
   Exposes window.MeetingStorage. Falls back gracefully if chrome.storage
   is unavailable (e.g. when a file is opened outside the extension). */

(function (global) {
  const PROSPECTS_KEY = 'mtf_prospects';
  const PREFS_KEY = 'mtf_prefs';

  const DEFAULT_PREFS = {
    durationMinutes: 30,
    userHours: { start: 9, end: 18 },
    otherHours: { start: 9, end: 18 },
    userTimeZone: null, // null = auto-detect from the browser
    // No account system or backend exists yet, so this is a local stand-in
    // for "which plan am I on" — not a real entitlement. See lib/plans.js.
    planId: 'free',
    theme: 'auto' // 'auto' | 'light' | 'dark' — 'auto' follows prefers-color-scheme
  };

  const LAST_SEARCH_KEY = 'mtf_last_search';
  const USAGE_KEY = 'mtf_usage';

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  }

  function hasChromeLocalStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
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

  function getLocal(keys) {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) return resolve({});
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  function setLocal(items) {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) return resolve();
      chrome.storage.local.set(items, () => resolve());
    });
  }

  async function getProspects() {
    const result = await get([PROSPECTS_KEY]);
    return result[PROSPECTS_KEY] || [];
  }

  async function saveProspect(prospect) {
    const prospects = await getProspects();
    const existingIdx = prospects.findIndex((p) => (
      prospect.email && p.email
        ? p.email.toLowerCase() === prospect.email.toLowerCase()
        : p.name.toLowerCase() === prospect.name.toLowerCase()
    ));
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

  // Resolves the zone to actually use: an explicit user override if one is
  // saved, otherwise whatever the browser detects. Centralized here so the
  // popup, the injected widget, the Gmail annotator, and the Meet badge all
  // agree on the same value.
  async function getEffectiveUserTimeZone() {
    const prefs = await getPreferences();
    return prefs.userTimeZone || global.TZKit.getUserTimeZone();
  }

  // Remembers the most recent search (inputs + results) so it survives an
  // accidental close of the popup or the in-page widget — reopening shows
  // exactly what was last found instead of a blank form. Kept in
  // chrome.storage.local (not .sync): it's written on every search and
  // sync has tight write-rate and per-item size limits meant for
  // low-frequency data like prospects/preferences. Callers own converting
  // slot.start/slot.end Date objects to/from ISO strings, since chrome.storage
  // serializes plain JSON and would otherwise silently drop them to strings
  // without round-tripping back to Date on read.
  async function getLastSearch() {
    const result = await getLocal([LAST_SEARCH_KEY]);
    return result[LAST_SEARCH_KEY] || null;
  }

  async function saveLastSearch(data) {
    await setLocal({ [LAST_SEARCH_KEY]: { ...data, savedAt: Date.now() } });
  }

  async function clearLastSearch() {
    await setLocal({ [LAST_SEARCH_KEY]: null });
  }

  // Slots carry Date objects and a few fields only needed transiently
  // (score, userLocal/otherLocal parts) — these two keep the persisted
  // shape minimal and round-trip exactly what rendering actually needs.
  function serializeSlots(slots) {
    return slots.map((s) => ({
      startIso: s.start.toISOString(),
      endIso: s.end.toISOString(),
      tier: s.tier,
      userInHours: s.userInHours,
      otherInHours: s.otherInHours
    }));
  }

  function deserializeSlots(serialized) {
    return (serialized || []).map((s) => ({
      start: new Date(s.startIso),
      end: new Date(s.endIso),
      tier: s.tier,
      userInHours: s.userInHours,
      otherInHours: s.otherInHours
    }));
  }

  // Monthly findings counter backing the free-plan limit in lib/plans.js.
  // NOTE: this is a soft, local-only cap — it lives in chrome.storage.local,
  // which the browser's own owner can inspect and edit, so it does not
  // actually prevent someone determined from exceeding it. Real enforcement
  // needs a backend that tracks usage server-side per authenticated user;
  // this is scaffolding for that, not a substitute for it.
  function currentMonthKey(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function getUsage() {
    const result = await getLocal([USAGE_KEY]);
    const usage = result[USAGE_KEY];
    const monthKey = currentMonthKey();
    if (!usage || usage.monthKey !== monthKey) return { monthKey, count: 0 };
    return usage;
  }

  async function recordFinding() {
    const usage = await getUsage();
    const updated = { monthKey: usage.monthKey, count: usage.count + 1 };
    await setLocal({ [USAGE_KEY]: updated });
    return updated;
  }

  global.MeetingStorage = {
    DEFAULT_PREFS,
    getProspects,
    saveProspect,
    removeProspect,
    getPreferences,
    savePreferences,
    getEffectiveUserTimeZone,
    getLastSearch,
    saveLastSearch,
    clearLastSearch,
    serializeSlots,
    deserializeSlots,
    getUsage,
    recordFinding
  };
})(typeof window !== 'undefined' ? window : globalThis);

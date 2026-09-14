// Minimal service worker. Seeds default preferences on first install so the
// popup and content script always have something sane to read.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.storage.sync.get(['mtf_prefs'], (result) => {
    if (result.mtf_prefs) return;
    chrome.storage.sync.set({
      mtf_prefs: {
        durationMinutes: 30,
        userHours: { start: 9, end: 18 },
        otherHours: { start: 9, end: 18 }
      }
    });
  });
});

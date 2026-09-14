/* Time zone helpers shared by the popup and the Google Calendar content script.
   Loaded as a plain script (no ES modules) so it can be used by both
   content scripts and the popup via a <script> tag. Exposes window.TZKit. */

(function (global) {
  const FALLBACK_ZONES = [
    'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
    'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'UTC',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens', 'Europe/Moscow',
    'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
    'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Sydney', 'Pacific/Auckland'
  ];

  function getAllTimeZones() {
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        const zones = Intl.supportedValuesOf('timeZone');
        if (zones && zones.length) return zones;
      }
    } catch (err) {
      // fall through to static list
    }
    return FALLBACK_ZONES;
  }

  function getUserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (err) {
      return 'UTC';
    }
  }

  function formatOffsetLabel(timeZone, date) {
    date = date || new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, timeZoneName: 'shortOffset'
      }).formatToParts(date);
      const tzPart = parts.find((p) => p.type === 'timeZoneName');
      return tzPart ? tzPart.value : '';
    } catch (err) {
      return '';
    }
  }

  function friendlyZoneName(zone) {
    return zone.replace(/_/g, ' ').split('/').pop();
  }

  // Returns { hour, minute, weekday (0=Sun..6=Sat), dateKey 'YYYY-MM-DD' } for
  // the given instant as observed in `timeZone`.
  function getZonedParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0; // some locales render midnight as 24
    return {
      hour,
      minute: parseInt(map.minute, 10),
      weekday: weekdayMap[map.weekday],
      dateKey: `${map.year}-${map.month}-${map.day}`
    };
  }

  function formatDateLabel(date, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', month: 'short', day: 'numeric'
    }).format(date);
  }

  function formatTimeLabel(date, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  // Builds a Google Calendar "quick add" render URL for a new event.
  // https://developers.google.com/calendar (render endpoint is undocumented
  // but stable and widely used for this exact purpose).
  function buildGoogleCalendarUrl({ title, details, start, end, timeZone }) {
    const toBasicUtc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title || 'Meeting',
      dates: `${toBasicUtc(start)}/${toBasicUtc(end)}`
    });
    if (details) params.set('details', details);
    if (timeZone) params.set('ctz', timeZone);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  global.TZKit = {
    getAllTimeZones,
    getUserTimeZone,
    formatOffsetLabel,
    friendlyZoneName,
    getZonedParts,
    formatDateLabel,
    formatTimeLabel,
    buildGoogleCalendarUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);

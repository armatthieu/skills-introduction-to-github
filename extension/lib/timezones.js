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

  function isValidTimeZone(zone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch (err) {
      return false;
    }
  }

  // Parses "GMT+3", "UTC-7", "+5:30", "gmt -7", bare "UTC"/"GMT" (= 0), etc.
  // into an offset in minutes, or null if `text` isn't an offset at all.
  function parseUtcOffsetInput(text) {
    const trimmed = (text || '').trim();
    if (/^(GMT|UTC)$/i.test(trimmed)) return 0;
    const m = /^(?:GMT|UTC)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(trimmed);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const hours = parseInt(m[2], 10);
    const minutes = m[3] ? parseInt(m[3], 10) : 0;
    if (hours > 14 || minutes >= 60) return null;
    return sign * (hours * 60 + minutes);
  }

  function formatOffsetLabelFromMinutes(offsetMinutes) {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }

  // Resolves free-typed text to a usable IANA (or fixed-offset) zone
  // identifier: an exact zone name, a UTC-offset shorthand like "GMT+3"
  // (mapped to a fixed-offset "Etc/GMT" zone — note IANA's Etc/GMT names
  // use POSIX-inverted signs internally, handled here so callers never see
  // that), or — for a fractional offset like "+5:30" that Etc/GMT can't
  // express — the first real zone currently sitting at that offset (which
  // can drift across a DST boundary for that zone; a reasonable "good
  // enough" match for a quick pick, not a substitute for naming the zone).
  // Returns null if nothing matches.
  function resolveTimeZoneInput(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    if (isValidTimeZone(trimmed) && getAllTimeZones().includes(trimmed)) return trimmed;

    const offsetMinutes = parseUtcOffsetInput(trimmed);
    if (offsetMinutes === null) return null;

    if (offsetMinutes === 0) return 'UTC';

    if (offsetMinutes % 60 === 0) {
      const hours = offsetMinutes / 60;
      if (hours >= -12 && hours <= 14) {
        const etcZone = `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
        if (isValidTimeZone(etcZone)) return etcZone;
      }
    }

    const label = formatOffsetLabelFromMinutes(offsetMinutes);
    return getAllTimeZones().find((z) => formatOffsetLabel(z) === label) || null;
  }

  // Display label for a zone that's friendly for both real IANA zones
  // ("Tokyo (GMT+9)") and the fixed-offset zones resolveTimeZoneInput can
  // produce (plain "GMT+3", not the confusing "Etc/GMT-3" identifier).
  function friendlyZoneLabel(zone) {
    const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone);
    if (m) return `GMT${m[1] === '-' ? '+' : '-'}${m[2]}`;
    if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
    return `${friendlyZoneName(zone)} (${formatOffsetLabel(zone)})`;
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
  function buildGoogleCalendarUrl({ title, details, start, end, timeZone, guestEmail }) {
    const toBasicUtc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title || 'Meeting',
      dates: `${toBasicUtc(start)}/${toBasicUtc(end)}`
    });
    if (details) params.set('details', details);
    if (timeZone) params.set('ctz', timeZone);
    // Pre-fills the guest list on the create-event screen Calendar opens to
    // (the "add" param the quick-add URL has supported for years). This
    // does not silently email anyone by itself — Calendar still requires
    // clicking Save, and then "Send" on its own "Send invitation emails?"
    // prompt, same as adding a guest by hand would.
    if (guestEmail) params.set('add', guestEmail);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  // Curated, deliberately short picker list: real cities all over the
  // world share the same current UTC offset (e.g. New York, Toronto, and
  // Lima are all GMT-4 right now), so listing every IANA zone (~400 of
  // them) makes the picker a long, repetitive scroll. This hand-picked set
  // covers every populated region with one well-known representative city
  // per offset, grouped by continent for browsing. The *value* used is
  // still a real IANA zone (not a fixed offset), so DST is handled
  // correctly for that city long-term — consolidation only trims the
  // display list, it doesn't change how time math works.
  const CURATED_ZONE_GROUPS = [
    {
      region: 'Americas',
      zones: [
        { tz: 'Pacific/Honolulu', cities: 'Honolulu' },
        { tz: 'America/Anchorage', cities: 'Anchorage' },
        { tz: 'America/Los_Angeles', cities: 'Los Angeles, Vancouver' },
        { tz: 'America/Denver', cities: 'Denver, Phoenix' },
        { tz: 'America/Chicago', cities: 'Chicago, Mexico City' },
        { tz: 'America/New_York', cities: 'New York, Toronto, Miami' },
        { tz: 'America/Halifax', cities: 'Halifax' },
        { tz: 'America/Sao_Paulo', cities: 'São Paulo' },
        { tz: 'America/Argentina/Buenos_Aires', cities: 'Buenos Aires' }
      ]
    },
    {
      region: 'Europe',
      zones: [
        { tz: 'Europe/London', cities: 'London, Dublin, Lisbon' },
        { tz: 'Europe/Paris', cities: 'Paris, Berlin, Madrid, Rome' },
        { tz: 'Europe/Athens', cities: 'Athens, Helsinki, Bucharest' },
        { tz: 'Europe/Moscow', cities: 'Moscow' }
      ]
    },
    {
      region: 'Africa',
      zones: [
        { tz: 'Africa/Casablanca', cities: 'Casablanca' },
        { tz: 'Africa/Lagos', cities: 'Lagos, West Africa' },
        { tz: 'Africa/Cairo', cities: 'Cairo' },
        { tz: 'Africa/Johannesburg', cities: 'Johannesburg' },
        { tz: 'Africa/Nairobi', cities: 'Nairobi' }
      ]
    },
    {
      region: 'Asia',
      zones: [
        { tz: 'Asia/Dubai', cities: 'Dubai, Abu Dhabi' },
        { tz: 'Asia/Karachi', cities: 'Karachi, Islamabad' },
        { tz: 'Asia/Kolkata', cities: 'Mumbai, New Delhi' },
        { tz: 'Asia/Dhaka', cities: 'Dhaka' },
        { tz: 'Asia/Bangkok', cities: 'Bangkok, Jakarta' },
        { tz: 'Asia/Singapore', cities: 'Singapore, Kuala Lumpur' },
        { tz: 'Asia/Shanghai', cities: 'Beijing, Shanghai, Hong Kong' },
        { tz: 'Asia/Tokyo', cities: 'Tokyo, Seoul' }
      ]
    },
    {
      region: 'Pacific & Australia',
      zones: [
        { tz: 'Australia/Perth', cities: 'Perth' },
        { tz: 'Australia/Adelaide', cities: 'Adelaide' },
        { tz: 'Australia/Sydney', cities: 'Sydney, Melbourne, Brisbane' },
        { tz: 'Pacific/Auckland', cities: 'Auckland' }
      ]
    }
  ];

  // Returns CURATED_ZONE_GROUPS with each zone's current offset label
  // computed live, plus a standalone UTC entry — ready to render as
  // <optgroup> sections in a <select>.
  function getCuratedZoneGroups() {
    return CURATED_ZONE_GROUPS.map((group) => ({
      region: group.region,
      zones: group.zones.map((z) => ({
        tz: z.tz,
        label: `${z.cities} (${formatOffsetLabel(z.tz)})`
      }))
    }));
  }

  global.TZKit = {
    getAllTimeZones,
    getUserTimeZone,
    formatOffsetLabel,
    friendlyZoneName,
    friendlyZoneLabel,
    isValidTimeZone,
    parseUtcOffsetInput,
    resolveTimeZoneInput,
    getCuratedZoneGroups,
    getZonedParts,
    formatDateLabel,
    formatTimeLabel,
    buildGoogleCalendarUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);

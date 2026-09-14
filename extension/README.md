# Meeting Time Finder — MVP Chrome Extension

A Chrome extension that takes the guesswork out of scheduling across time
zones. Pick a prospect's time zone, and it works out the best overlapping
meeting slots over the next week — so when you're on the phone with them,
you can book a time on the spot instead of mentally juggling UTC offsets.

## What it does today (MVP scope)

- **Popup UI** (click the toolbar icon): enter a prospect's name + time
  zone, pick a meeting duration and (optionally) each side's working hours,
  and get a ranked shortlist of the best times over the next 7 days.
- **Google Calendar integration**: every suggested slot has an
  **"Add to Calendar"** button that opens a prefilled Google Calendar event
  (title, date/time, and a note about the prospect's time zone) ready to
  save — no manual time-zone math required.
- **In-page widget on `calendar.google.com`**: a small floating 🕒 button
  gives you the same finder inline, so you don't have to leave the Calendar
  tab while you're on a call.
- **Remembers recent prospects**: saved name + time zone pairs sync via
  `chrome.storage` so repeat contacts are one click away next time.
- **Smart ranking**: slots are scored by how central they land in each
  side's working day (not just "does it technically overlap"), and labeled
  `recommended` / `good` / `workable`.

## What it deliberately does *not* do yet

This is an MVP focused on proving the core idea end-to-end:

- It does **not** read guest time zones automatically from an open Google
  Calendar event (Calendar's UI doesn't expose that per-guest data to
  extensions) — you enter the prospect's zone manually today.
- It does **not** auto-fill an already-open "create event" form's fields;
  instead it opens a new prefilled event via Google's calendar "quick add"
  link, which is robust to Calendar's frequently-changing internal DOM.
- No CRM integration yet (e.g. auto-pulling a prospect's time zone from
  HubSpot/Salesforce) — that's a natural next step once the core UX is
  validated.

## Project structure

```
extension/
  manifest.json          Manifest V3 config
  background/            Service worker (seeds default preferences)
  popup/                 Toolbar popup UI (HTML/CSS/JS)
  content/               Injected widget for calendar.google.com
  lib/
    timezones.js         IANA time zone list + formatting helpers (TZKit)
    engine.js            Slot-finding + scoring logic (MeetingEngine)
    storage.js           chrome.storage wrapper for prospects/preferences
  icons/                 Toolbar/extension icons
```

The scoring/formatting logic in `lib/` has no dependency on `chrome.*` or
the DOM, so it's reused as-is by both the popup and the content script, and
can be exercised with plain Node for quick sanity checks.

## Load it locally (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension from the puzzle-piece menu for quick access.
5. Click the toolbar icon, enter a prospect's time zone, and hit
   **Find best meeting times**.
6. Open `https://calendar.google.com` to see the floating 🕒 launcher in
   the corner.

No build step is required — it's plain HTML/CSS/JS.

## How the scoring works

For each candidate slot in the search window (default: next 7 days, 15
minute granularity):

1. Convert the UTC instant to local wall-clock time in both the user's and
   the prospect's time zone (via `Intl.DateTimeFormat`, so real IANA tz
   data — DST included — is used, no external tz library needed).
2. Discard slots that fall outside either party's working hours/days, or
   that cross local midnight.
3. Score the remainder by how close the meeting sits to the middle of each
   party's working day (a 9am slot is technically "in hours" but a 10am
   humans-are-awake slot usually feels better than one at the very edge).
4. Keep the best-scoring slot per calendar day, so the shortlist reads as
   "here's the best time each day" rather than a wall of 15-minute
   increments.

## Suggested next steps

- Pull a saved contact's time zone automatically from a CRM connector.
- Detect the current guest list while an event-creation panel is open on
  `calendar.google.com` and pre-select a matching saved prospect.
- Let users mark specific dates as unavailable (holidays, existing
  meetings) by reading `chrome.identity` + a read-only Calendar API scope.
- Publish to the Chrome Web Store once the manual-entry flow has been
  validated with real users.

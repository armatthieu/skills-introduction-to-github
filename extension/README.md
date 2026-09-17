# Meeting Time Finder — MVP Chrome Extension

A Chrome extension that takes the guesswork out of scheduling across time
zones — across Google Calendar, Gmail, and Google Meet. Pick a prospect's
time zone, and it works out the best overlapping meeting slots over the
next week; while you're emailing or on a call, it keeps everyone's time
zone visible and unambiguous so a meeting never gets missed or shows up an
hour off because of a time-zone mixup.

## What it does today (MVP scope)

- **Popup UI** (click the toolbar icon): enter a prospect's name + time
  zone, pick a meeting duration and (optionally) each side's working hours,
  and get a ranked shortlist of the best times over the next 7 days.
- **"Add to Calendar" everywhere**: every suggested slot has a button that
  opens a prefilled Google Calendar event (title, date/time, and a note
  about the prospect's time zone) ready to save — no manual time-zone math
  required.
- **In-page widget on `calendar.google.com`, `mail.google.com`, and
  `meet.google.com`**: the same floating 🕒 finder is available inline on
  all three surfaces, so you don't have to leave the tab to work out a time
  while drafting an email, scheduling an event, or about to join a call.
- **Gmail time-zone annotation**: while reading an email, any time mention
  that includes a zone (`3pm EST`, `15:00 UTC+2`, `9am CET`, …) is
  automatically annotated inline with the equivalent in *your* time zone —
  so a proposed time is never misread.
- **Google Meet time-zone confirmation badge**: a small, persistent badge
  in the corner of every Meet call shows your current time zone and local
  time, so anyone glancing at a shared screen can double-check everyone's
  on the same page about "when."
- **Remembers recent prospects**: saved name + time zone pairs sync via
  `chrome.storage` so repeat contacts are one click away next time.
- **Smart ranking**: slots are scored by how central they land in each
  side's working day (not just "does it technically overlap"), and labeled
  `recommended` / `good` / `workable`.
- **Editable "your time zone"**: the browser's detected zone is just the
  default — you can override it (e.g. if you're traveling, or the browser
  guesses wrong), and it's remembered for next time. Available in the popup
  and in the in-page widget.
- **Never a dead end**: if no slot falls inside both parties' normal
  working hours anywhere in the next 7 days (common for e.g. US East Coast
  ↔ India under default 9–6 hours — it's a real scheduling problem, not a
  bug), the finder falls back to the closest options instead of showing
  nothing, clearly flagging which side(s) it's outside normal hours for.
- **Paste an email, skip the typing**: enter a prospect's email address and
  their name + company are guessed from it (`jane.doe@acme.com` → "Jane
  Doe" at "Acme") into editable fields — pure pattern-matching on the
  address, no AI/network call involved, so a bad guess is a one-word edit
  away, not a redo. Personal email domains (Gmail, Yahoo, etc.) are
  detected and skipped for the company guess.
- **Editable event title**: auto-composed as `Company <> Demo` (or `Call
  with Name` if there's no company), used for the "Add to Calendar" event —
  edit it before adding if the wording isn't quite right.
- **Categorized time-zone picker**: a real `<select>` dropdown (visible
  arrow included) grouped by region — Americas, Europe, Africa, Asia,
  Pacific & Australia — with one well-known city per region+offset instead
  of every one of the ~400 IANA zones (several of which share the same
  offset, e.g. New York/Toronto/Miami are all "GMT-4" right now). Picking a
  curated entry still uses that city's real IANA zone under the hood, so
  DST keeps working correctly long-term for saved/recurring prospects. An
  "Other" option reveals a free-text field (city name or `GMT+3`-style
  offset) for anything not in the curated list.
- **Duration options match the plan**: 15/30 min on Free, 15–60 min in
  5-minute steps on Paid (`lib/plans.js`).
- **Results survive an accidental close**: the last search (inputs +
  suggested times) is remembered and restored the next time the popup or
  in-page widget opens, so closing it by mistake doesn't lose the answer.
  It's shown dimmed with a "click Find to refresh" nudge the moment any
  input is edited, rather than being wiped outright.

## What it deliberately does *not* do yet

This is an MVP focused on proving the core idea end-to-end:

- It does **not** read guest time zones automatically from an open Google
  Calendar event (Calendar's UI doesn't expose that per-guest data to
  extensions) — you enter the prospect's zone manually today.
- It does **not** auto-fill an already-open "create event" form's fields;
  instead it opens a new prefilled event via Google's calendar "quick add"
  link, which is robust to Calendar's frequently-changing internal DOM.
- The Gmail annotation is a best-effort text-pattern match, not a
  scheduling source of truth: it assumes "today" as the calendar date (an
  email rarely states one in machine-readable form) and maps zone
  abbreviations like `PST`/`IST` to a fixed UTC offset. It's meant for a
  quick sanity check while reading, and skips a mention entirely if the
  reader is already in that zone.
- No CRM integration yet (e.g. auto-pulling a prospect's time zone from
  HubSpot/Salesforce) — that's a natural next step once the core UX is
  validated.

## Project structure

```
extension/
  manifest.json          Manifest V3 config
  background/            Service worker (seeds default preferences)
  popup/                 Toolbar popup UI (HTML/CSS/JS)
  content/
    launcher.js          Floating finder widget, injected on all 3 surfaces
    gmail-annotate.js     Gmail-only: inline time-zone conversion badges
    meet-badge.js         Meet-only: persistent time-zone confirmation badge
    content.css           Shared styles for all injected UI
  lib/
    timezones.js         IANA time zone list + formatting helpers (TZKit)
    engine.js            Slot-finding + scoring logic (MeetingEngine)
    storage.js           chrome.storage wrapper for prospects/prefs/last search/usage
    contact-parser.js    Guesses name + company from an email (ContactParser)
    plans.js             Free/paid plan definitions (MeetingPlans) — see Monetization
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
6. Open `https://calendar.google.com`, `https://mail.google.com`, or
   `https://meet.google.com` to see the floating 🕒 launcher in the corner.
   Open an email with a time-zone mention (e.g. "call at 3pm EST") to see
   it annotated inline, or join/start a Meet call to see the time-zone
   confirmation badge in the top-left corner.

No build step is required — it's plain HTML/CSS/JS.

### Troubleshooting: "the file couldn't be accessed"

This means Chrome can no longer find the folder you pointed **Load
unpacked** at when you click the toolbar icon — usually because the
extracted folder was moved, renamed, or deleted after loading (a common
trap if you extracted the zip into a temp/Downloads folder that later got
cleaned up). Content scripts already injected into open Calendar/Gmail/Meet
tabs keep running from memory even after this happens, which is why the
in-page 🕒 widget can look fine while the toolbar popup is broken. Fix: keep
the extracted folder somewhere permanent, then in `chrome://extensions`
remove the extension and **Load unpacked** again pointing at that folder
(or click the refresh icon on the card if the folder is still at the same
path — that's enough if nothing moved).

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

## Monetization (planned, not live)

The product plan is a free tier with limited monthly findings and a short
search window, and a paid tier with unlimited findings and a configurable
window. `lib/plans.js` is the single place those numbers live:

| | Free | Paid |
|---|---|---|
| Findings per month | 20 *(TBD)* | Unlimited |
| Search window | 3 days *(TBD — "2 or 3")* | 7 days by default, configurable 2–15 *(TBD)* |

Every number above is a placeholder standing in for a decision that hasn't
been made yet. Change it in `lib/plans.js` and the search window + the
usage cap shown in the popup/widget update everywhere automatically.

**This is not real enforcement yet.** Everyone is on the `free` plan by
default (`chrome.storage` preference `planId`), and the monthly findings
counter lives in `chrome.storage.local` — data the browser's own owner can
inspect and edit. Making a paid tier real requires:

1. **A backend** (even a handful of serverless functions) that is the
   source of truth for who's on which plan and how many findings/credits
   they've used — not something that can live only in the browser.
2. **A way to identify the user**, e.g. "Sign in with Google" via
   `chrome.identity`.
3. **A payment processor** — Stripe is the standard choice (handles both
   subscriptions and one-time/credit purchases, hosted checkout so card
   data never touches your own code, handles tax/VAT). Note: the old
   Chrome Web Store Payments API was shut down in 2020, so there's no
   built-in alternative.

The intended flow once that exists: "Upgrade" in the popup opens a Stripe
Checkout page → Stripe notifies the backend via webhook → the backend
marks the user as paid → the extension calls the backend (not local
storage) before each search to check the real entitlement.

**Subscription vs. credits**: currently modeled as a monthly quota (reset
each month, unlimited on paid) rather than a credit wallet, since that's
simpler to build and fits continuous usage better than bursty one-off
credit purchases. A credit-pack system remains an option — it would replace
`monthlyFindingsLimit` with a spendable balance in `lib/plans.js` — but
isn't built out.

**Testing the paid-plan preview today**: since there's no upgrade flow yet,
switch plans manually from the extension's console
(`chrome://extensions` → the extension card → "service worker" / inspect
views) with:
```js
chrome.storage.sync.get('mtf_prefs', (r) =>
  chrome.storage.sync.set({ mtf_prefs: { ...r.mtf_prefs, planId: 'paid' } })
);
```

## Suggested next steps

- Pull a saved contact's time zone automatically from a CRM connector.
- Detect the current guest list while an event-creation panel is open on
  `calendar.google.com` and pre-select a matching saved prospect.
- Let users mark specific dates as unavailable (holidays, existing
  meetings) by reading `chrome.identity` + a read-only Calendar API scope.
- Build the backend + auth + Stripe integration described above once the
  free/paid numbers are finalized, so the plan gating in `lib/plans.js`
  becomes real enforcement instead of a local preview.
- Publish to the Chrome Web Store once the manual-entry flow has been
  validated with real users.

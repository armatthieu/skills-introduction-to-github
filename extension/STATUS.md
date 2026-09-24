# Project status & decisions log

This file exists so the *business/strategic* decisions behind this project
survive independently of any one Claude conversation or account. If you
ever start a fresh Claude session (same account or a different one) and
want it to pick up where this one left off, point it at this repo and
branch and have it read this file plus `README.md` — that's everything it
needs to act with full context, without you re-explaining the backstory.

**How to hand this off:** clone the repo, check out branch
`claude/timezone-meeting-booking-extension-jsnhqn`, and tell the new
Claude session something like "read STATUS.md and README.md in
`extension/`, then continue from there." A GitHub-hosted branch isn't tied
to any Claude account — anyone with repo access can pick it up.

## What this is

A Chrome extension ("Meeting Time Finder") that suggests the best meeting
time across time zones inside Google Calendar, Gmail, and Google Meet, and
one-click adds it as a prefilled Calendar event (guest included, if an
email was entered). Built for a sales/SDR-style workflow: booking calls
with prospects in different time zones without manual UTC math.

## Current build status

- Fully client-side, no backend, no accounts — everything lives in
  `chrome.storage` on the user's own device.
- Not yet published anywhere. It's only been distributed as a zip for
  manual "Load unpacked" testing.
- All code is committed and pushed to
  `claude/timezone-meeting-booking-extension-jsnhqn` in this repo — not
  merged to `main`.
- See `README.md` in `extension/` for the full feature list, architecture,
  and how the scoring engine works.

## Monetization: decisions made so far

- **Model chosen:** a monthly-quota subscription (free tier with a
  findings cap and short search window; paid tier unlimited with a longer
  window) rather than a credit-pack system. Reasoning: simpler to build
  and explain, and fits how this tool actually gets used (continuously, not
  in bursts). Credits remain an option to revisit later — it's isolated to
  `lib/plans.js` if the decision changes.
- **Plan numbers are still TBD** — free/paid limits in `lib/plans.js` are
  placeholders (free: 20 findings/month, 3-day window; paid: unlimited,
  7-day default, up to 15). A `dev` plan (unlimited, 14-day window) exists
  for whoever's actively testing/using this ahead of real enforcement.
- **Nothing is actually enforced yet.** The plan/usage gating in the
  extension today is a client-side preview only (`chrome.storage`, which
  the browser's own owner can edit) — real enforcement requires the
  backend below.

## Backend: decision made

- **Supabase**, chosen over AWS/Firebase for this use case: bundles a
  Postgres database, auth, and small serverless functions with minimal
  setup — appropriate for a solo developer validating a paid tier rather
  than building infrastructure for its own sake. AWS was ruled out as more
  machinery than a small "check plan / track usage / react to a payment
  webhook" backend needs.
- **GitHub is already connected to Supabase** (done outside this
  conversation, as of this writing) — the project on the Supabase side
  hasn't been built out yet; this is just the account linkage.
- **Not started:** the actual schema, auth flow, and the extension code
  that would call it instead of relying on local `chrome.storage` for plan
  enforcement.

## Payments: research done, no final decision

The developer is based in Madagascar, which most major payment processors
don't support for *receiving* payouts directly. Researched and found:

- **Stripe** — does not support opening a Stripe account from Madagascar
  directly.
- **PayPal** — Madagascar accounts can send but not receive.
- **Payoneer** — does not list Madagascar as a supported country.
- **Paddle** — appears to support Madagascar as a seller. Paddle is a
  "Merchant of Record" (they're legally the seller, handle global sales
  tax/VAT, then pay the developer out) — recommended as the first thing to
  try.
- **Lemon Squeezy** — similar model, plausibly supports Madagascar, lower
  confidence in the research than Paddle.
- **Fallback if both reject Madagascar at signup:** form a US LLC (e.g.
  via Stripe Atlas or Doola), run Stripe under that LLC's identity, and
  move money to Madagascar via Wise. More setup/paperwork, but a
  well-established path other developers in unsupported countries use.

**Action needed before committing:** actually start the Paddle and/or
Lemon Squeezy seller signup flow to confirm Madagascar is accepted in
practice — the research was based on search/cached docs, not a live check
of those platforms' own pages.

## Chrome Web Store: ready to publish (free tier only)

- `README.md` has the full publishing walkthrough.
- `PRIVACY.md` is written and published as a hosted page (URL is in that
  file) — required for the Store listing since the extension handles
  personal data (prospect names/emails).
- Only the free plan should go here; nothing about payment processing
  needs to be decided before this step, since it's independent of the
  extension shipping.

## Support: bug reports

A "Report a bug" link in the popup and widget footer opens a pre-filled
email to **matthieuratrimoson96@gmail.com** (extension version, browser,
and site already included) — deliberately avoids needing a new email
address or a hosted contact-form backend.

## Suggested next steps, roughly in order

1. Publish the free version to the Chrome Web Store (nothing blocking this).
2. Get more real testers using it; watch for actual usage/interest signal
   before investing in the backend.
3. If there's traction: finalize the free/paid numbers in `lib/plans.js`,
   confirm a payment processor by actually starting signup with
   Paddle/Lemon Squeezy, then build the Supabase schema + auth + webhook
   handling described above.
4. Revisit CRM integration / auto-detecting a guest list from an open
   Calendar event — both noted as "not done yet" in the README, no
   decisions made on either.

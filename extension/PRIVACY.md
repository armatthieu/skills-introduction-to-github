# Privacy Policy — Meeting Time Finder

_Effective September 23, 2026_

**Live, hosted copy of this policy (use this URL for the Chrome Web Store
listing):** https://claude.ai/artifact/NAgN78YSsNBrpvEa8Skipq

This file is the source-of-truth copy kept in the repo for version control.
If the hosted link ever changes, republish this content and update the URL
above.

## Overview

Meeting Time Finder is a Chrome extension that suggests overlapping
meeting times across time zones inside Google Calendar, Gmail, and Google
Meet. It's built and maintained by a single independent developer, not a
company with a data-processing team — so this policy describes exactly
what the extension does today, in plain terms.

**Short version:** everything you type into the extension stays on your
own device, inside your own Chrome browser. There is no server that the
extension sends your data to, because no such server exists yet.

## Data you enter

The extension stores the following, only because you typed it in:

- A prospect's name, email address, company, and time zone
- Your own time zone (auto-detected from your browser by default, or a
  manual override if you set one)
- Working-hour preferences and meeting-duration settings
- A short list of recently used prospects, for quick reuse
- The results of your most recent search, so it survives an accidental
  close of the popup or widget

None of this is required to be accurate or even real — you can use the
extension with placeholder data, and nothing is verified against any
external source.

## Where it lives

All of the above is stored using Chrome's built-in `chrome.storage` API,
directly on your device. If you're signed into Chrome, some of it may sync
across your own devices the same way your bookmarks or saved passwords
do — that sync is handled entirely by Google's Chrome sync infrastructure
under your own Google account, not by us. The extension itself has no
backend server, so it has nowhere else to send this data even if it
wanted to.

## Reading Gmail text

When you're viewing an email in Gmail, the extension scans the visible
text of that email for time-zone mentions (like "3pm EST") so it can show
you the equivalent in your own time zone. This scan happens entirely
inside your browser — the email text is never copied, transmitted, or
stored anywhere. It's read, checked against a pattern, and forgotten the
moment the annotation is drawn.

## What we don't do

- We don't run analytics or tracking of any kind inside the extension
- We don't sell, rent, or share your data — there's no one to share it
  with, since there's no server collecting it
- We don't show ads
- We don't read your calendar events or the rest of your inbox beyond the
  specific time-zone-annotation behavior described above
- We don't attempt to determine a prospect's time zone or location from
  their email address — that field only guesses a name and company from
  the address text itself

## Why each permission

- **storage** — to save your preferences and saved prospects locally, as
  described above
- **calendar.google.com** — to show the floating time-finder widget while
  you're creating a calendar event
- **mail.google.com** — to show the same widget and annotate time-zone
  mentions while you're reading or writing email
- **meet.google.com** — to show a small badge confirming your time zone
  during a call

## Your control

Uninstalling the extension removes all of its locally stored data. You
can also clear it at any time from `chrome://extensions` without
uninstalling, or remove individual saved prospects from within the
extension itself.

## Children's privacy

Meeting Time Finder is a scheduling tool intended for general
professional use and is not directed at children under 13. It does not
knowingly collect information from children.

## Changes to this policy

If this extension gains features that change how data is handled — for
example, an account system or a paid tier with server-side usage
tracking — this page will be updated first, with a new effective date
above, before that feature ships.

## Contact

Questions about this policy, or anything else about the extension:
**matthieuratrimoson96@gmail.com**

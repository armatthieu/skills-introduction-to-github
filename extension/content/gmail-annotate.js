/* Gmail-only: scans visible message text for time-zone mentions like
   "3pm EST" or "15:00 UTC+2" and appends a small inline badge converting
   them to the reader's own time zone — so a proposed time never gets
   misread and a meeting never gets missed because of a time-zone mixup.

   This is intentionally approximate: zone abbreviations map to a fixed
   UTC offset (the abbreviation itself already encodes standard-vs-daylight,
   e.g. EST vs EDT) and the conversion assumes "today" as the calendar date,
   since the surrounding email rarely gives us a machine-readable date. Good
   enough for a quick sanity check while reading, not a scheduling source
   of truth. */

(function () {
  if (location.hostname !== 'mail.google.com') return;
  if (window.__mtfGmailAnnotateInjected) return;
  window.__mtfGmailAnnotateInjected = true;

  const { TZKit } = window;
  const userTz = TZKit.getUserTimeZone();

  // Offset from UTC in minutes. The abbreviation already implies DST state,
  // so EST and EDT get distinct fixed offsets rather than being resolved
  // dynamically.
  const ZONE_OFFSETS = {
    GMT: 0, UTC: 0,
    EST: -300, EDT: -240,
    CST: -360, CDT: -300,
    MST: -420, MDT: -360,
    PST: -480, PDT: -420,
    BST: 60, CET: 60, CEST: 120,
    EET: 120, EEST: 180,
    IST: 330, JST: 540, KST: 540,
    SGT: 480, HKT: 480,
    AEST: 600, AEDT: 660,
    ACST: 570, ACDT: 630,
    AWST: 480,
    NZST: 720, NZDT: 780
  };
  const ZONE_NAMES = Object.keys(ZONE_OFFSETS).sort((a, b) => b.length - a.length);

  // Hour alternation tries the two-digit 20-23 case first — otherwise a
  // greedy-but-short match on the leading "2" of "23:00" would consume just
  // "2" and misparse the rest.
  const TIME_MENTION_RE = new RegExp(
    `\\b(2[0-3]|[01]?\\d)(?::([0-5]\\d))?\\s?([AaPp]\\.?[Mm]\\.?)?\\s+(${ZONE_NAMES.join('|')})([+-]\\d{1,2}(?::?\\d{2})?)?\\b`,
    'g'
  );

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

  function parseOffsetSuffix(suffix) {
    if (!suffix) return null;
    const sign = suffix[0] === '-' ? -1 : 1;
    const body = suffix.slice(1);
    const [h, m] = body.split(':');
    return sign * (parseInt(h, 10) * 60 + (m ? parseInt(m, 10) : 0));
  }

  function convertMention(match) {
    let [, hourStr, minuteStr, ampm, zone, gmtSuffix] = match;
    let hour = parseInt(hourStr, 10);
    const minute = minuteStr ? parseInt(minuteStr, 10) : 0;

    if (ampm) {
      const isPm = /p/i.test(ampm);
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
    }

    const explicitOffset = parseOffsetSuffix(gmtSuffix);
    const offsetMinutes = explicitOffset !== null ? explicitOffset : ZONE_OFFSETS[zone];
    if (offsetMinutes === undefined) return null;

    const now = new Date();
    const zoneLocalMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute);
    const utcMs = zoneLocalMs - offsetMinutes * 60000;
    const converted = new Date(utcMs);

    // Skip the (fairly common) case where the reader is already in that
    // zone — no point annotating "3pm EST" for someone sitting in EST.
    if (TZKit.formatOffsetLabel(userTz, converted) === offsetLabelFor(offsetMinutes)) return null;

    return TZKit.formatTimeLabel(converted, userTz);
  }

  function offsetLabelFor(offsetMinutes) {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }

  function annotateTextNode(textNode) {
    const text = textNode.nodeValue;
    TIME_MENTION_RE.lastIndex = 0;
    const matches = [...text.matchAll(TIME_MENTION_RE)];
    if (!matches.length) return;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    let annotatedAny = false;

    for (const match of matches) {
      const yourTime = convertMention(match);
      const start = match.index;
      const end = start + match[0].length;

      if (!yourTime) continue; // leave ambiguous/self-zone mentions untouched

      frag.appendChild(document.createTextNode(text.slice(cursor, start)));

      // The matched text itself is wrapped (not left as a bare text node)
      // and tagged mtf-time-annotated so the MutationObserver's own
      // insertions don't get rescanned and re-annotated forever.
      const original = document.createElement('span');
      original.className = 'mtf-time-annotated';
      original.textContent = text.slice(start, end);
      frag.appendChild(original);

      const badge = document.createElement('span');
      badge.className = 'mtf-time-convert';
      badge.textContent = ` (${yourTime} your time)`;
      badge.title = 'Converted by Meeting Time Finder';
      frag.appendChild(badge);
      cursor = end;
      annotatedAny = true;
    }

    if (!annotatedAny) return;
    frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function scan(root) {
    if (!root || root.nodeType === Node.TEXT_NODE) return;
    if (root.closest && root.closest('[contenteditable="true"], .mtf-time-convert, .mtf-time-annotated, .mtf-panel, #mtf-panel, #mtf-launcher')) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.mtf-time-convert, .mtf-time-annotated, .mtf-panel, #mtf-panel, #mtf-launcher')) {
          return NodeFilter.FILTER_REJECT;
        }
        TIME_MENTION_RE.lastIndex = 0;
        return TIME_MENTION_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodesToProcess = [];
    let current;
    while ((current = walker.nextNode())) nodesToProcess.push(current);
    nodesToProcess.forEach(annotateTextNode);
  }

  let debounceHandle = null;
  const observer = new MutationObserver((mutations) => {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        });
      }
    }, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();

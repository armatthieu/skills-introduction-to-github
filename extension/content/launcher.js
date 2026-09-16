/* Injects a small floating launcher + panel into Google Calendar, Gmail,
   and Google Meet so users can find the best meeting time without leaving
   the tab — while drafting an email, right before joining a call, or while
   creating an event. Reuses the same TZKit / MeetingEngine / MeetingStorage
   logic as the popup, just with a lighter-weight inline UI. */

(function () {
  if (window.__mtfInjected) return;
  window.__mtfInjected = true;

  const { TZKit, MeetingEngine, MeetingStorage, ContactParser, MeetingPlans } = window;
  const detectedTz = TZKit.getUserTimeZone();

  const launcher = document.createElement('button');
  launcher.id = 'mtf-launcher';
  launcher.title = 'Find the best meeting time';
  launcher.textContent = '🕒';
  document.body.appendChild(launcher);

  const panel = document.createElement('div');
  panel.id = 'mtf-panel';
  panel.className = 'mtf-hidden';
  panel.innerHTML = `
    <div class="mtf-panel-header">
      <strong>🕒 Meeting Time Finder</strong>
      <button type="button" class="mtf-close-btn" id="mtf-close">✕</button>
    </div>
    <div class="mtf-panel-body">
      <div class="mtf-field">
        <label>Your time zone</label>
        <input type="text" id="mtf-your-tz" list="mtf-tz-list" placeholder="City, zone, or GMT+3 / -7" />
        <div class="mtf-hint" id="mtf-your-hint"></div>
      </div>
      <div class="mtf-field">
        <label>Prospect email</label>
        <input type="email" id="mtf-email" placeholder="e.g. alex@acme.com" />
        <div class="mtf-hint" id="mtf-email-hint"></div>
      </div>
      <div class="mtf-field-row">
        <div class="mtf-field mtf-half">
          <label>Name</label>
          <input type="text" id="mtf-name" placeholder="Alex" />
        </div>
        <div class="mtf-field mtf-half">
          <label>Company</label>
          <input type="text" id="mtf-company" placeholder="Acme Co." />
        </div>
      </div>
      <div class="mtf-field">
        <label>Prospect's time zone</label>
        <input type="text" id="mtf-tz" list="mtf-tz-list" placeholder="City, zone, or GMT+3 / -7" />
        <datalist id="mtf-tz-list"></datalist>
        <div class="mtf-hint" id="mtf-hint"></div>
      </div>
      <div class="mtf-field">
        <label>Event title</label>
        <input type="text" id="mtf-event-title" placeholder="Auto-filled once you add a name or company" />
      </div>
      <div class="mtf-field">
        <label>Duration</label>
        <select id="mtf-duration">
          <option value="15">15 min</option>
          <option value="30" selected>30 min</option>
          <option value="45">45 min</option>
          <option value="60">60 min</option>
        </select>
      </div>
      <button type="button" class="mtf-find-btn" id="mtf-find">Find best meeting times</button>
      <div id="mtf-plan-note" class="mtf-plan-note"></div>
      <div id="mtf-limit-notice" class="mtf-limit-notice" hidden></div>
      <div id="mtf-fallback-notice" class="mtf-fallback-notice" hidden>
        ⚠ No time falls in both normal working hours in the next 7 days — showing the closest options instead.
      </div>
      <div id="mtf-stale-notice" class="mtf-stale-notice" hidden>
        Inputs changed since this search — click "Find best meeting times" to refresh.
      </div>
      <div id="mtf-results" class="mtf-results"></div>
    </div>
  `;
  document.body.appendChild(panel);

  // Some single-page apps (Gmail and Calendar both qualify) occasionally
  // tear down and rebuild large parts of <body> on navigation, which would
  // silently take our launcher/panel with it since document.body.appendChild
  // only runs once. Watching body's direct children and re-appending if
  // either goes missing keeps the widget alive across those rebuilds.
  function ensureMounted() {
    if (!document.body.contains(launcher)) document.body.appendChild(launcher);
    if (!document.body.contains(panel)) document.body.appendChild(panel);
  }
  new MutationObserver(ensureMounted).observe(document.body, { childList: true });

  const tzListEl = panel.querySelector('#mtf-tz-list');
  TZKit.getAllTimeZones().forEach((zone) => {
    const opt = document.createElement('option');
    opt.value = zone;
    opt.label = TZKit.friendlyZoneLabel(zone);
    tzListEl.appendChild(opt);
  });

  const yourTzInput = panel.querySelector('#mtf-your-tz');
  const yourTzHint = panel.querySelector('#mtf-your-hint');
  const emailInput = panel.querySelector('#mtf-email');
  const emailHint = panel.querySelector('#mtf-email-hint');
  const nameInput = panel.querySelector('#mtf-name');
  const companyInput = panel.querySelector('#mtf-company');
  const tzInput = panel.querySelector('#mtf-tz');
  const hintEl = panel.querySelector('#mtf-hint');
  const eventTitleInput = panel.querySelector('#mtf-event-title');
  const durationSelect = panel.querySelector('#mtf-duration');
  const findBtn = panel.querySelector('#mtf-find');
  const planNoteEl = panel.querySelector('#mtf-plan-note');
  const limitNoticeEl = panel.querySelector('#mtf-limit-notice');
  const fallbackNoticeEl = panel.querySelector('#mtf-fallback-notice');
  const staleNoticeEl = panel.querySelector('#mtf-stale-notice');
  const resultsEl = panel.querySelector('#mtf-results');

  MeetingStorage.getPreferences().then((prefs) => {
    durationSelect.value = String(prefs.durationMinutes);
    yourTzInput.value = prefs.userTimeZone || detectedTz;
  });

  // Plan/usage display and gating. NOTE: there's no account system or
  // backend yet — planId defaults to 'free' for everyone and the usage
  // count lives in chrome.storage.local, so this previews the UX rather
  // than enforcing a real entitlement (see lib/plans.js for why).
  async function getCurrentPlanAndUsage() {
    const [prefs, usage] = await Promise.all([
      MeetingStorage.getPreferences(),
      MeetingStorage.getUsage()
    ]);
    return { plan: MeetingPlans.getPlan(prefs.planId), usage };
  }

  async function refreshPlanNote() {
    const { plan, usage } = await getCurrentPlanAndUsage();
    planNoteEl.innerHTML = plan.monthlyFindingsLimit === Infinity
      ? `<strong>${plan.label} plan</strong> — unlimited findings · ${plan.defaultDaysAhead}-day search window`
      : `<strong>${plan.label} plan</strong> — ${usage.count}/${plan.monthlyFindingsLimit} findings used this month · ${plan.defaultDaysAhead}-day search window`;
    return { plan, usage };
  }
  refreshPlanNote();

  function tzLiveHint(input, hintEl) {
    const value = input.value.trim();
    if (!value) { hintEl.textContent = ''; hintEl.classList.remove('mtf-error'); return; }
    const resolved = TZKit.resolveTimeZoneInput(value);
    hintEl.classList.toggle('mtf-error', !resolved);
    hintEl.textContent = resolved
      ? `${TZKit.friendlyZoneLabel(resolved)} — current time: ${TZKit.formatTimeLabel(new Date(), resolved)}`
      : 'Not recognized — try a city name or an offset like GMT+3.';
  }
  tzInput.addEventListener('input', () => tzLiveHint(tzInput, hintEl));
  yourTzInput.addEventListener('input', () => tzLiveHint(yourTzInput, yourTzHint));

  function computeDefaultEventTitle() {
    const company = companyInput.value.trim();
    const name = nameInput.value.trim();
    if (company) return `${company} <> Demo`;
    if (name) return `Call with ${name}`;
    return '';
  }
  function refreshEventTitleIfNotEdited() {
    if (eventTitleInput.dataset.userEdited === 'true') return;
    eventTitleInput.value = computeDefaultEventTitle();
  }
  eventTitleInput.addEventListener('input', () => {
    eventTitleInput.dataset.userEdited = 'true';
  });

  emailInput.addEventListener('input', () => {
    const guess = ContactParser.guessFromEmail(emailInput.value.trim());
    if (!guess) { emailHint.textContent = ''; return; }
    if (!nameInput.value.trim() && guess.name) nameInput.value = guess.name;
    if (!companyInput.value.trim() && guess.company) companyInput.value = guess.company;
    refreshEventTitleIfNotEdited();
    emailHint.textContent = guess.isPersonalDomain
      ? 'Personal email address — add their company by hand.'
      : 'Guessed name & company from the email — feel free to correct.';
  });
  [nameInput, companyInput].forEach((input) => {
    input.addEventListener('input', refreshEventTitleIfNotEdited);
  });

  launcher.addEventListener('click', () => {
    panel.classList.toggle('mtf-hidden');
  });
  panel.querySelector('#mtf-close').addEventListener('click', () => {
    panel.classList.add('mtf-hidden');
  });

  function markStale() {
    if (resultsEl.dataset.hasResults !== 'true') return;
    resultsEl.classList.add('mtf-stale');
    staleNoticeEl.hidden = false;
  }
  function clearStale() {
    resultsEl.classList.remove('mtf-stale');
    staleNoticeEl.hidden = true;
  }
  [yourTzInput, emailInput, nameInput, companyInput, tzInput, durationSelect].forEach((el) => {
    el.addEventListener('input', markStale);
  });

  function renderSlots(result, userTz, prospectName, prospectTz, eventTitle) {
    const { slots, usedFallback } = result;
    fallbackNoticeEl.hidden = !usedFallback || !slots.length;
    resultsEl.innerHTML = '';
    resultsEl.dataset.hasResults = slots.length ? 'true' : 'false';
    if (!slots.length) {
      resultsEl.innerHTML = '<div class="mtf-empty">No workable time found in the next 7 days.</div>';
      return;
    }
    slots.forEach((slot) => {
      const card = document.createElement('div');
      card.className = `mtf-slot-card ${slot.tier}`;
      const warnBits = [];
      if (usedFallback) {
        if (!slot.userInHours) warnBits.push('outside your hours');
        if (!slot.otherInHours) warnBits.push(`outside ${prospectName || "their"} hours`);
      }
      card.innerHTML = `
        <div class="mtf-slot-top">
          <span class="mtf-slot-date">${TZKit.formatDateLabel(slot.start, userTz)}</span>
          <span class="mtf-badge ${slot.tier}">${slot.tier === 'outside-hours' ? 'outside hours' : slot.tier}</span>
        </div>
        <div class="mtf-slot-times">
          You: <strong>${TZKit.formatTimeLabel(slot.start, userTz)}</strong><br/>
          ${prospectName || 'Prospect'}: <strong>${TZKit.formatTimeLabel(slot.start, prospectTz)}</strong>
          ${warnBits.length ? `<div class="mtf-slot-warning">⚠ ${warnBits.join(' and ')}</div>` : ''}
        </div>
        <div class="mtf-slot-actions">
          <button type="button" class="mtf-primary" data-action="add">Add to Calendar</button>
          <button type="button" data-action="copy">Copy</button>
        </div>
      `;
      card.querySelector('[data-action="add"]').addEventListener('click', () => {
        const title = eventTitle || (prospectName ? `Call with ${prospectName}` : 'Meeting');
        const url = TZKit.buildGoogleCalendarUrl({
          title,
          start: slot.start,
          end: slot.end,
          timeZone: userTz,
          details: `Suggested by Meeting Time Finder — ${prospectName || 'prospect'} is in ${TZKit.friendlyZoneLabel(prospectTz)}.`
        });
        window.open(url, '_blank', 'noopener');
      });
      card.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
        const text = `${TZKit.formatDateLabel(slot.start, userTz)} — ${TZKit.formatTimeLabel(slot.start, userTz)} your time / ${TZKit.formatTimeLabel(slot.start, prospectTz)} ${prospectName || 'their'} time`;
        try {
          await navigator.clipboard.writeText(text);
          e.target.textContent = 'Copied!';
          setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
        } catch (err) {
          e.target.textContent = 'Copy failed';
        }
      });
      resultsEl.appendChild(card);
    });
  }

  function displayName(fields) {
    return fields.prospectName || fields.prospectCompany || fields.prospectEmail || '';
  }

  async function loadLastSearch() {
    const last = await MeetingStorage.getLastSearch();
    if (!last) return;

    emailInput.value = last.prospectEmail || '';
    nameInput.value = last.prospectName || '';
    companyInput.value = last.prospectCompany || '';
    tzInput.value = last.prospectTz || '';
    eventTitleInput.value = last.eventTitle || '';
    eventTitleInput.dataset.userEdited = last.eventTitle ? 'true' : 'false';

    const slots = MeetingStorage.deserializeSlots(last.slotsSerialized).filter((s) => s.end > new Date());
    if (!slots.length) return;

    renderSlots({ slots, usedFallback: last.usedFallback }, last.userTz, displayName(last), last.prospectTz, last.eventTitle);
  }
  loadLastSearch();

  findBtn.addEventListener('click', async () => {
    const userTz = TZKit.resolveTimeZoneInput(yourTzInput.value.trim());
    if (!userTz) {
      yourTzHint.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      yourTzHint.classList.add('mtf-error');
      yourTzInput.focus();
      return;
    }

    const prospectTz = TZKit.resolveTimeZoneInput(tzInput.value.trim());
    if (!prospectTz) {
      hintEl.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      hintEl.classList.add('mtf-error');
      tzInput.focus();
      return;
    }

    const { plan, usage } = await getCurrentPlanAndUsage();
    if (usage.count >= plan.monthlyFindingsLimit) {
      limitNoticeEl.textContent =
        `You've used all ${plan.monthlyFindingsLimit} free findings this month. It resets next month, or upgrade for unlimited findings.`;
      limitNoticeEl.hidden = false;
      return;
    }
    limitNoticeEl.hidden = true;

    findBtn.disabled = true;
    findBtn.textContent = 'Finding times…';

    const durationMinutes = parseInt(durationSelect.value, 10);
    await MeetingStorage.savePreferences({
      durationMinutes,
      userTimeZone: userTz === detectedTz ? null : userTz
    });

    const prospectEmail = emailInput.value.trim();
    const prospectName = nameInput.value.trim();
    const prospectCompany = companyInput.value.trim();
    const prospectDisplayName = prospectName || prospectCompany || prospectEmail;
    const eventTitle = eventTitleInput.value.trim() || computeDefaultEventTitle() || 'Meeting';

    if (prospectDisplayName) {
      await MeetingStorage.saveProspect({
        name: prospectDisplayName,
        company: prospectCompany,
        email: prospectEmail,
        timeZone: prospectTz
      });
    }

    const prefs = await MeetingStorage.getPreferences();
    const result = MeetingEngine.findBestSlots({
      userTz,
      otherTz: prospectTz,
      durationMinutes,
      userHours: prefs.userHours,
      otherHours: prefs.otherHours,
      daysAhead: plan.defaultDaysAhead,
      maxResults: 6
    });
    renderSlots(result, userTz, prospectDisplayName, prospectTz, eventTitle);
    clearStale();

    await MeetingStorage.saveLastSearch({
      userTz,
      prospectEmail,
      prospectName,
      prospectCompany,
      prospectTz,
      eventTitle,
      usedFallback: result.usedFallback,
      slotsSerialized: MeetingStorage.serializeSlots(result.slots)
    });
    await MeetingStorage.recordFinding();
    await refreshPlanNote();

    findBtn.disabled = false;
    findBtn.textContent = 'Find best meeting times';
  });
})();

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

  // Both the launcher button and the panel live inside this wrapper so
  // theme tokens (content.css) and the self-healing mount check below
  // only need to deal with one element instead of two.
  const root = document.createElement('div');
  root.id = 'mtf-root';

  const launcher = document.createElement('button');
  launcher.id = 'mtf-launcher';
  launcher.title = 'Find the best meeting time';
  launcher.textContent = '🕒';
  root.appendChild(launcher);

  const panel = document.createElement('div');
  panel.id = 'mtf-panel';
  panel.className = 'mtf-hidden';
  panel.innerHTML = `
    <div class="mtf-panel-header">
      <strong>🕒 Meeting Time Finder</strong>
      <div class="mtf-header-actions">
        <div class="mtf-theme-toggle" id="mtf-theme-toggle" role="group" aria-label="Theme">
          <button type="button" data-theme-value="auto" title="Match browser setting">🖥️</button>
          <button type="button" data-theme-value="light" title="Light">☀️</button>
          <button type="button" data-theme-value="dark" title="Dark">🌙</button>
        </div>
        <button type="button" class="mtf-close-btn" id="mtf-close">✕</button>
      </div>
    </div>
    <div class="mtf-panel-body">
      <div class="mtf-field">
        <label>Your time zone</label>
        <select id="mtf-your-tz-select"></select>
        <input type="text" id="mtf-your-tz-other" list="mtf-tz-list" placeholder="City, zone, or GMT+3 / -7" hidden />
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
        <select id="mtf-tz-select"></select>
        <input type="text" id="mtf-tz-other" list="mtf-tz-list" placeholder="City, zone, or GMT+3 / -7" hidden />
        <datalist id="mtf-tz-list"></datalist>
        <div class="mtf-hint" id="mtf-hint"></div>
      </div>
      <div class="mtf-field">
        <label>Event title</label>
        <input type="text" id="mtf-event-title" placeholder="Auto-filled once you add a name or company" />
      </div>
      <div class="mtf-options-row">
        <div class="mtf-field mtf-compact">
          <label>Duration</label>
          <select id="mtf-duration"></select>
        </div>
        <button type="button" class="mtf-link-btn" id="mtf-toggle-advanced">Working hours ▾</button>
      </div>
      <div class="mtf-advanced" id="mtf-advanced-panel" hidden>
        <div class="mtf-hours-row">
          <span class="mtf-hours-label">You</span>
          <select id="mtf-user-start"></select>
          <span>to</span>
          <select id="mtf-user-end"></select>
        </div>
        <div class="mtf-hours-row">
          <span class="mtf-hours-label">Prospect</span>
          <select id="mtf-other-start"></select>
          <span>to</span>
          <select id="mtf-other-end"></select>
        </div>
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
  root.appendChild(panel);
  document.body.appendChild(root);

  // Some single-page apps (Gmail and Calendar both qualify) occasionally
  // tear down and rebuild large parts of <body> on navigation, which would
  // silently take our widget with it since document.body.appendChild only
  // runs once. Watching body's direct children and re-appending the
  // (untouched, still-populated) root if it goes missing keeps the widget
  // alive across those rebuilds.
  function ensureMounted() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }
  new MutationObserver(ensureMounted).observe(document.body, { childList: true });

  const tzListEl = panel.querySelector('#mtf-tz-list');
  TZKit.getAllTimeZones().forEach((zone) => {
    const opt = document.createElement('option');
    opt.value = zone;
    opt.label = TZKit.friendlyZoneLabel(zone);
    tzListEl.appendChild(opt);
  });

  const OTHER_VALUE = '__other__';

  const yourTzSelect = panel.querySelector('#mtf-your-tz-select');
  const yourTzOther = panel.querySelector('#mtf-your-tz-other');
  const yourTzHint = panel.querySelector('#mtf-your-hint');
  const emailInput = panel.querySelector('#mtf-email');
  const emailHint = panel.querySelector('#mtf-email-hint');
  const nameInput = panel.querySelector('#mtf-name');
  const companyInput = panel.querySelector('#mtf-company');
  const tzSelect = panel.querySelector('#mtf-tz-select');
  const tzOther = panel.querySelector('#mtf-tz-other');
  const hintEl = panel.querySelector('#mtf-hint');
  const eventTitleInput = panel.querySelector('#mtf-event-title');
  const durationSelect = panel.querySelector('#mtf-duration');
  const toggleAdvancedBtn = panel.querySelector('#mtf-toggle-advanced');
  const advancedPanel = panel.querySelector('#mtf-advanced-panel');
  const userStartSelect = panel.querySelector('#mtf-user-start');
  const userEndSelect = panel.querySelector('#mtf-user-end');
  const otherStartSelect = panel.querySelector('#mtf-other-start');
  const otherEndSelect = panel.querySelector('#mtf-other-end');
  const findBtn = panel.querySelector('#mtf-find');
  const planNoteEl = panel.querySelector('#mtf-plan-note');
  const limitNoticeEl = panel.querySelector('#mtf-limit-notice');
  const fallbackNoticeEl = panel.querySelector('#mtf-fallback-notice');
  const staleNoticeEl = panel.querySelector('#mtf-stale-notice');
  const resultsEl = panel.querySelector('#mtf-results');

  // Theme: "auto" (default) follows the browser/OS setting via the CSS
  // prefers-color-scheme media query, scoped to #mtf-root (content.css) —
  // no JS needed for that case. Choosing Light or Dark sets `data-theme`
  // on #mtf-root, which content.css treats as an override.
  const themeButtons = Array.from(panel.querySelectorAll('#mtf-theme-toggle button'));
  function applyTheme(theme) {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    themeButtons.forEach((btn) => btn.classList.toggle('mtf-active', btn.dataset.themeValue === theme));
  }
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      applyTheme(btn.dataset.themeValue);
      await MeetingStorage.savePreferences({ theme: btn.dataset.themeValue });
    });
  });
  MeetingStorage.getPreferences().then((prefs) => applyTheme(prefs.theme));

  // Time zone picker: a short, categorized <select> (one well-known city
  // per region+offset) with a trailing "Other" option that reveals a
  // free-text field for anything not in the curated list.
  function populateZoneSelect(selectEl, placeholderText) {
    selectEl.innerHTML = '';
    if (placeholderText) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = placeholderText;
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.hidden = true;
      selectEl.appendChild(placeholder);
    }
    TZKit.getCuratedZoneGroups().forEach((group) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.region;
      group.zones.forEach((z) => {
        const opt = document.createElement('option');
        opt.value = z.tz;
        opt.textContent = z.label;
        optgroup.appendChild(opt);
      });
      selectEl.appendChild(optgroup);
    });
    const otherGroup = document.createElement('optgroup');
    otherGroup.label = 'Other';
    const otherOpt = document.createElement('option');
    otherOpt.value = OTHER_VALUE;
    otherOpt.textContent = 'Type a city, zone, or offset…';
    otherGroup.appendChild(otherOpt);
    selectEl.appendChild(otherGroup);
  }
  // "Your" zone always gets a real default (the detected zone) right after
  // this, so it doesn't need a placeholder. The prospect's zone has no
  // sensible default — defaulting to whatever's first in the list (e.g.
  // Honolulu) would look like a real suggestion instead of an arbitrary
  // list-order artifact, so it starts on an explicit placeholder instead.
  populateZoneSelect(yourTzSelect);
  populateZoneSelect(tzSelect, "Choose prospect's time zone…");

  function getZoneRawValue(selectEl, otherInput) {
    return selectEl.value === OTHER_VALUE ? otherInput.value.trim() : selectEl.value;
  }

  function setZoneControl(selectEl, otherInput, value) {
    const hasOption = Array.from(selectEl.options).some((o) => o.value === value);
    if (hasOption) {
      selectEl.value = value;
      otherInput.hidden = true;
      otherInput.value = '';
    } else {
      selectEl.value = OTHER_VALUE;
      otherInput.hidden = false;
      otherInput.value = value || '';
    }
  }

  function tzLiveHint(selectEl, otherInput, hintEl) {
    const value = getZoneRawValue(selectEl, otherInput);
    if (!value) { hintEl.textContent = ''; hintEl.classList.remove('mtf-error'); return; }
    const resolved = TZKit.resolveTimeZoneInput(value);
    hintEl.classList.toggle('mtf-error', !resolved);
    hintEl.textContent = resolved
      ? `${TZKit.friendlyZoneLabel(resolved)} — current time: ${TZKit.formatTimeLabel(new Date(), resolved)}`
      : 'Not recognized — try a city name or an offset like GMT+3.';
  }
  function wireZoneControl(selectEl, otherInput, hintEl) {
    selectEl.addEventListener('change', () => {
      otherInput.hidden = selectEl.value !== OTHER_VALUE;
      if (!otherInput.hidden) otherInput.focus();
      tzLiveHint(selectEl, otherInput, hintEl);
    });
    otherInput.addEventListener('input', () => tzLiveHint(selectEl, otherInput, hintEl));
  }
  wireZoneControl(yourTzSelect, yourTzOther, yourTzHint);
  wireZoneControl(tzSelect, tzOther, hintEl);

  function populateDurationOptions(plan, preferredMinutes) {
    durationSelect.innerHTML = '';
    plan.durationOptions.forEach((min) => {
      const opt = document.createElement('option');
      opt.value = String(min);
      opt.textContent = `${min} min`;
      durationSelect.appendChild(opt);
    });
    durationSelect.value = plan.durationOptions.includes(preferredMinutes)
      ? String(preferredMinutes)
      : String(plan.defaultDurationMinutes);
  }

  function populateHourOptions(select) {
    select.innerHTML = '';
    for (let h = 0; h <= 24; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      const label = h === 0 ? '12:00 AM' : h === 12 ? '12:00 PM' : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
      opt.textContent = h === 24 ? '12:00 AM (+1d)' : label;
      select.appendChild(opt);
    }
  }
  [userStartSelect, userEndSelect, otherStartSelect, otherEndSelect].forEach(populateHourOptions);

  toggleAdvancedBtn.addEventListener('click', () => {
    advancedPanel.hidden = !advancedPanel.hidden;
    toggleAdvancedBtn.textContent = advancedPanel.hidden ? 'Working hours ▾' : 'Working hours ▴';
  });

  MeetingStorage.getPreferences().then((prefs) => {
    setZoneControl(yourTzSelect, yourTzOther, prefs.userTimeZone || detectedTz);
    tzLiveHint(yourTzSelect, yourTzOther, yourTzHint);
    userStartSelect.value = String(prefs.userHours.start);
    userEndSelect.value = String(prefs.userHours.end);
    otherStartSelect.value = String(prefs.otherHours.start);
    otherEndSelect.value = String(prefs.otherHours.end);
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
    return { plan: MeetingPlans.getPlan(prefs.planId), usage, prefs };
  }

  async function refreshPlanNote() {
    const { plan, usage, prefs } = await getCurrentPlanAndUsage();
    populateDurationOptions(plan, prefs.durationMinutes);
    planNoteEl.innerHTML = plan.monthlyFindingsLimit === Infinity
      ? `<strong>${plan.label} plan</strong> — unlimited findings · ${plan.defaultDaysAhead}-day search window`
      : `<strong>${plan.label} plan</strong> — ${usage.count}/${plan.monthlyFindingsLimit} findings used this month · ${plan.defaultDaysAhead}-day search window`;
    return { plan, usage };
  }
  refreshPlanNote();

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
  [
    yourTzSelect, yourTzOther, emailInput, nameInput, companyInput, tzSelect, tzOther, durationSelect,
    userStartSelect, userEndSelect, otherStartSelect, otherEndSelect
  ].forEach((el) => {
    el.addEventListener('input', markStale);
  });

  function renderSlots(result, userTz, prospectName, prospectTz, eventTitle, prospectEmail) {
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
          details: `Suggested by Meeting Time Finder — ${prospectName || 'prospect'} is in ${TZKit.friendlyZoneLabel(prospectTz)}.`,
          guestEmail: prospectEmail
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
    setZoneControl(tzSelect, tzOther, last.prospectTz || '');
    tzLiveHint(tzSelect, tzOther, hintEl);
    eventTitleInput.value = last.eventTitle || '';
    eventTitleInput.dataset.userEdited = last.eventTitle ? 'true' : 'false';

    const slots = MeetingStorage.deserializeSlots(last.slotsSerialized).filter((s) => s.end > new Date());
    if (!slots.length) return;

    renderSlots({ slots, usedFallback: last.usedFallback }, last.userTz, displayName(last), last.prospectTz, last.eventTitle, last.prospectEmail);
  }
  loadLastSearch();

  findBtn.addEventListener('click', async () => {
    const userTz = TZKit.resolveTimeZoneInput(getZoneRawValue(yourTzSelect, yourTzOther));
    if (!userTz) {
      yourTzHint.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      yourTzHint.classList.add('mtf-error');
      (yourTzSelect.value === OTHER_VALUE ? yourTzOther : yourTzSelect).focus();
      return;
    }

    const prospectRaw = getZoneRawValue(tzSelect, tzOther);
    const prospectTz = TZKit.resolveTimeZoneInput(prospectRaw);
    if (!prospectTz) {
      hintEl.textContent = prospectRaw
        ? 'Not recognized — try a city name or an offset like GMT+3.'
        : "Please choose the prospect's time zone — ask them to confirm it if you're not sure.";
      hintEl.classList.add('mtf-error');
      (tzSelect.value === OTHER_VALUE ? tzOther : tzSelect).focus();
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
    const userHours = { start: parseInt(userStartSelect.value, 10), end: parseInt(userEndSelect.value, 10) };
    const otherHours = { start: parseInt(otherStartSelect.value, 10), end: parseInt(otherEndSelect.value, 10) };
    await MeetingStorage.savePreferences({
      durationMinutes,
      userHours,
      otherHours,
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

    const result = MeetingEngine.findBestSlots({
      userTz,
      otherTz: prospectTz,
      durationMinutes,
      userHours,
      otherHours,
      daysAhead: plan.defaultDaysAhead,
      maxResults: 6
    });
    renderSlots(result, userTz, prospectDisplayName, prospectTz, eventTitle, prospectEmail);
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

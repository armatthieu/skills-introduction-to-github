(function () {
  const { TZKit, MeetingEngine, MeetingStorage, ContactParser, MeetingPlans } = window;

  const OTHER_VALUE = '__other__';

  const yourTzSelect = document.getElementById('your-tz-select');
  const yourTzOther = document.getElementById('your-tz-other');
  const yourTzHint = document.getElementById('your-tz-hint');
  const detectTzBtn = document.getElementById('detect-tz-btn');
  const prospectEmailInput = document.getElementById('prospect-email');
  const emailHint = document.getElementById('email-hint');
  const prospectNameInput = document.getElementById('prospect-name');
  const prospectCompanyInput = document.getElementById('prospect-company');
  const prospectTzSelect = document.getElementById('prospect-tz-select');
  const prospectTzOther = document.getElementById('prospect-tz-other');
  const tzList = document.getElementById('tz-list');
  const tzHint = document.getElementById('tz-hint');
  const eventTitleInput = document.getElementById('event-title');
  const saveProspectCheckbox = document.getElementById('save-prospect');
  const recentRow = document.getElementById('recent-row');
  const recentChips = document.getElementById('recent-chips');
  const durationSelect = document.getElementById('duration');
  const toggleAdvancedBtn = document.getElementById('toggle-advanced');
  const advancedPanel = document.getElementById('advanced-panel');
  const userStartSelect = document.getElementById('user-start');
  const userEndSelect = document.getElementById('user-end');
  const otherStartSelect = document.getElementById('other-start');
  const otherEndSelect = document.getElementById('other-end');
  const findBtn = document.getElementById('find-btn');
  const planNote = document.getElementById('plan-note');
  const limitNotice = document.getElementById('limit-notice');
  const fallbackNotice = document.getElementById('fallback-notice');
  const staleNotice = document.getElementById('stale-notice');
  const resultsSection = document.getElementById('results');
  const resultsList = document.getElementById('results-list');
  const resultsHeaderLabel = document.getElementById('results-header-label');
  const emptyState = document.getElementById('empty-state');

  const detectedTz = TZKit.getUserTimeZone();

  // Theme: "auto" (default) follows the browser/OS setting via the CSS
  // prefers-color-scheme media query with no JS needed at all. Choosing
  // Light or Dark here sets `data-theme` on <html>, which the stylesheet
  // treats as an override that wins regardless of the OS setting.
  const themeButtons = Array.from(document.getElementById('theme-toggle').querySelectorAll('button'));
  function applyTheme(theme) {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    themeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.themeValue === theme));
  }
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      applyTheme(btn.dataset.themeValue);
      await MeetingStorage.savePreferences({ theme: btn.dataset.themeValue });
    });
  });
  MeetingStorage.getPreferences().then((prefs) => applyTheme(prefs.theme));

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

  function populateTzList() {
    const zones = TZKit.getAllTimeZones();
    tzList.innerHTML = '';
    zones.forEach((zone) => {
      const opt = document.createElement('option');
      opt.value = zone;
      opt.label = TZKit.friendlyZoneLabel(zone);
      tzList.appendChild(opt);
    });
  }
  populateTzList();

  // Time zone picker: a short, categorized <select> (one well-known city
  // per region+offset, so dozens of same-offset cities don't turn this
  // into a long scroll) with a trailing "Other" option that reveals a
  // free-text field for anything not in the curated list (a specific city,
  // or a typed UTC offset like "GMT+3").
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
  populateZoneSelect(prospectTzSelect, "Choose prospect's time zone…");

  function getZoneRawValue(selectEl, otherInput) {
    return selectEl.value === OTHER_VALUE ? otherInput.value.trim() : selectEl.value;
  }

  // Sets a select+other-input pair to represent `value` (a raw zone string
  // or offset text), picking the matching curated option when there is one
  // and falling back to "Other" with the raw text otherwise.
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

  function updateZoneHint(selectEl, otherInput, hintEl) {
    const raw = getZoneRawValue(selectEl, otherInput);
    if (!raw) { hintEl.textContent = ''; hintEl.classList.remove('error'); return; }
    const resolved = TZKit.resolveTimeZoneInput(raw);
    hintEl.classList.toggle('error', !resolved);
    hintEl.textContent = resolved
      ? `${TZKit.friendlyZoneLabel(resolved)} — current time: ${TZKit.formatTimeLabel(new Date(), resolved)}`
      : 'Not recognized — try a city name or an offset like GMT+3.';
  }

  function wireZoneControl(selectEl, otherInput, hintEl) {
    selectEl.addEventListener('change', () => {
      otherInput.hidden = selectEl.value !== OTHER_VALUE;
      if (!otherInput.hidden) otherInput.focus();
      updateZoneHint(selectEl, otherInput, hintEl);
    });
    otherInput.addEventListener('input', () => updateZoneHint(selectEl, otherInput, hintEl));
  }
  wireZoneControl(yourTzSelect, yourTzOther, yourTzHint);
  wireZoneControl(prospectTzSelect, prospectTzOther, tzHint);

  detectTzBtn.addEventListener('click', () => {
    setZoneControl(yourTzSelect, yourTzOther, detectedTz);
    updateZoneHint(yourTzSelect, yourTzOther, yourTzHint);
  });

  // Event title: auto-composed from company/name, but stops being
  // auto-updated the moment the user types into it directly.
  function computeDefaultEventTitle() {
    const company = prospectCompanyInput.value.trim();
    const name = prospectNameInput.value.trim();
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

  // Pasting a prospect's email guesses their name + company so there's
  // less to type by hand. It's plain pattern-matching on the address, not
  // an AI/network lookup — both guesses land in editable fields.
  prospectEmailInput.addEventListener('input', () => {
    const guess = ContactParser.guessFromEmail(prospectEmailInput.value.trim());
    if (!guess) { emailHint.textContent = ''; return; }

    if (!prospectNameInput.value.trim() && guess.name) prospectNameInput.value = guess.name;
    if (!prospectCompanyInput.value.trim() && guess.company) prospectCompanyInput.value = guess.company;
    refreshEventTitleIfNotEdited();

    emailHint.textContent = guess.isPersonalDomain
      ? 'Personal email address — add their company by hand.'
      : 'Guessed name & company from the email — feel free to correct.';
  });
  [prospectNameInput, prospectCompanyInput].forEach((input) => {
    input.addEventListener('input', refreshEventTitleIfNotEdited);
  });

  async function loadPrefs() {
    const prefs = await MeetingStorage.getPreferences();
    setZoneControl(yourTzSelect, yourTzOther, prefs.userTimeZone || detectedTz);
    updateZoneHint(yourTzSelect, yourTzOther, yourTzHint);
    userStartSelect.value = String(prefs.userHours.start);
    userEndSelect.value = String(prefs.userHours.end);
    otherStartSelect.value = String(prefs.otherHours.start);
    otherEndSelect.value = String(prefs.otherHours.end);
    return prefs;
  }

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

  // Plan/usage display and gating. NOTE: there's no account system or
  // backend yet — planId defaults to 'free' for everyone and the usage
  // count lives in chrome.storage.local, so this is a preview of the UX,
  // not a real entitlement check (see lib/plans.js for why).
  async function getCurrentPlanAndUsage() {
    const [prefs, usage] = await Promise.all([
      MeetingStorage.getPreferences(),
      MeetingStorage.getUsage()
    ]);
    return { plan: MeetingPlans.getPlan(prefs.planId), usage, prefs };
  }

  async function refreshPlanNote() {
    const { plan, usage, prefs } = await getCurrentPlanAndUsage();
    const daysAhead = plan.defaultDaysAhead;
    resultsHeaderLabel.textContent = `Best times in the next ${daysAhead} day${daysAhead === 1 ? '' : 's'}`;
    populateDurationOptions(plan, prefs.durationMinutes);

    planNote.innerHTML = plan.monthlyFindingsLimit === Infinity
      ? `<strong>${plan.label} plan</strong> — unlimited findings · ${daysAhead}-day search window`
      : `<strong>${plan.label} plan</strong> — ${usage.count}/${plan.monthlyFindingsLimit} findings used this month · ${daysAhead}-day search window`;
    return { plan, usage };
  }

  async function loadRecentProspects() {
    const prospects = await MeetingStorage.getProspects();
    recentChips.innerHTML = '';
    if (!prospects.length) { recentRow.hidden = true; return; }
    recentRow.hidden = false;
    prospects.slice(0, 6).forEach((p) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = p.name;
      chip.addEventListener('click', () => {
        prospectEmailInput.value = p.email || '';
        prospectNameInput.value = p.name || '';
        prospectCompanyInput.value = p.company || '';
        setZoneControl(prospectTzSelect, prospectTzOther, p.timeZone);
        eventTitleInput.dataset.userEdited = 'false';
        refreshEventTitleIfNotEdited();
        updateZoneHint(prospectTzSelect, prospectTzOther, tzHint);
        markStale();
      });
      recentChips.appendChild(chip);
    });
  }

  toggleAdvancedBtn.addEventListener('click', () => {
    advancedPanel.hidden = !advancedPanel.hidden;
    toggleAdvancedBtn.textContent = advancedPanel.hidden ? 'Working hours ▾' : 'Working hours ▴';
  });

  // Once results are shown, editing any input that would change them marks
  // the list "stale" (dimmed, with a nudge to re-search) rather than
  // clearing it outright — so an accidental popup close never loses the
  // last answer, but a genuinely new search doesn't look current either.
  function markStale() {
    if (resultsSection.hidden) return;
    resultsSection.classList.add('stale');
    staleNotice.hidden = false;
  }
  function clearStale() {
    resultsSection.classList.remove('stale');
    staleNotice.hidden = true;
  }
  [
    yourTzSelect, yourTzOther, prospectEmailInput, prospectNameInput, prospectCompanyInput,
    prospectTzSelect, prospectTzOther, durationSelect,
    userStartSelect, userEndSelect, otherStartSelect, otherEndSelect
  ].forEach((el) => el.addEventListener('input', markStale));

  function renderSlots(result, userTz, prospectDisplayName, prospectTz, eventTitle) {
    const { slots, usedFallback } = result;
    fallbackNotice.hidden = !usedFallback || !slots.length;
    resultsList.innerHTML = '';

    if (!slots.length) {
      resultsSection.hidden = true;
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    resultsSection.hidden = false;

    slots.forEach((slot) => {
      const card = document.createElement('div');
      card.className = `slot-card ${slot.tier}`;

      const top = document.createElement('div');
      top.className = 'slot-top';
      const dateEl = document.createElement('span');
      dateEl.className = 'slot-date';
      dateEl.textContent = TZKit.formatDateLabel(slot.start, userTz);
      const badge = document.createElement('span');
      badge.className = `badge ${slot.tier}`;
      badge.textContent = slot.tier === 'outside-hours' ? 'outside hours' : slot.tier;
      top.appendChild(dateEl);
      top.appendChild(badge);

      const times = document.createElement('div');
      times.className = 'slot-times';
      times.innerHTML = `
        <div class="slot-time-row">You: <strong>${TZKit.formatTimeLabel(slot.start, userTz)}</strong></div>
        <div class="slot-time-row">${prospectDisplayName || 'Prospect'}: <strong>${TZKit.formatTimeLabel(slot.start, prospectTz)}</strong></div>
      `;
      if (usedFallback) {
        const warnBits = [];
        if (!slot.userInHours) warnBits.push('outside your hours');
        if (!slot.otherInHours) warnBits.push(`outside ${prospectDisplayName || "the prospect's"} hours`);
        if (warnBits.length) {
          const warn = document.createElement('div');
          warn.className = 'slot-warning';
          warn.textContent = `⚠ ${warnBits.join(' and ')}`;
          times.appendChild(warn);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'slot-actions';

      const addBtn = document.createElement('button');
      addBtn.className = 'primary';
      addBtn.textContent = 'Add to Calendar';
      addBtn.addEventListener('click', () => {
        const title = eventTitle || (prospectDisplayName ? `Call with ${prospectDisplayName}` : 'Meeting');
        const url = TZKit.buildGoogleCalendarUrl({
          title,
          start: slot.start,
          end: slot.end,
          timeZone: userTz,
          details: `Suggested by Meeting Time Finder — ${prospectDisplayName || 'prospect'} is in ${TZKit.friendlyZoneLabel(prospectTz)}.`
        });
        chrome.tabs.create({ url });
      });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        const text = `${TZKit.formatDateLabel(slot.start, userTz)} — ${TZKit.formatTimeLabel(slot.start, userTz)} your time / ${TZKit.formatTimeLabel(slot.start, prospectTz)} ${prospectDisplayName || 'their'} time`;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
        } catch (err) {
          copyBtn.textContent = 'Copy failed';
        }
      });

      actions.appendChild(addBtn);
      actions.appendChild(copyBtn);

      card.appendChild(top);
      card.appendChild(times);
      card.appendChild(actions);
      resultsList.appendChild(card);
    });
  }

  async function loadLastSearch() {
    const last = await MeetingStorage.getLastSearch();
    if (!last) return;

    prospectEmailInput.value = last.prospectEmail || '';
    prospectNameInput.value = last.prospectName || '';
    prospectCompanyInput.value = last.prospectCompany || '';
    setZoneControl(prospectTzSelect, prospectTzOther, last.prospectTz || '');
    updateZoneHint(prospectTzSelect, prospectTzOther, tzHint);
    eventTitleInput.value = last.eventTitle || '';
    eventTitleInput.dataset.userEdited = last.eventTitle ? 'true' : 'false';

    const slots = MeetingStorage.deserializeSlots(last.slotsSerialized).filter((s) => s.end > new Date());
    if (!slots.length) return;

    renderSlots({ slots, usedFallback: last.usedFallback }, last.userTz, displayName(last), last.prospectTz, last.eventTitle);
  }

  function displayName(fields) {
    return fields.prospectName || fields.prospectCompany || fields.prospectEmail || '';
  }

  async function handleFind() {
    const userTz = TZKit.resolveTimeZoneInput(getZoneRawValue(yourTzSelect, yourTzOther));
    if (!userTz) {
      yourTzHint.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      yourTzHint.classList.add('error');
      (yourTzSelect.value === OTHER_VALUE ? yourTzOther : yourTzSelect).focus();
      return;
    }

    const prospectRaw = getZoneRawValue(prospectTzSelect, prospectTzOther);
    const prospectTz = TZKit.resolveTimeZoneInput(prospectRaw);
    if (!prospectTz) {
      tzHint.textContent = prospectRaw
        ? 'Not recognized — try a city name or an offset like GMT+3.'
        : "Please choose the prospect's time zone — ask them to confirm it if you're not sure.";
      tzHint.classList.add('error');
      (prospectTzSelect.value === OTHER_VALUE ? prospectTzOther : prospectTzSelect).focus();
      return;
    }

    const { plan, usage } = await getCurrentPlanAndUsage();
    if (usage.count >= plan.monthlyFindingsLimit) {
      limitNotice.textContent =
        `You've used all ${plan.monthlyFindingsLimit} free findings this month. It resets next month, or upgrade for unlimited findings.`;
      limitNotice.hidden = false;
      return;
    }
    limitNotice.hidden = true;

    findBtn.disabled = true;
    findBtn.textContent = 'Finding times…';

    const prefs = {
      userTimeZone: userTz === detectedTz ? null : userTz,
      durationMinutes: parseInt(durationSelect.value, 10),
      userHours: { start: parseInt(userStartSelect.value, 10), end: parseInt(userEndSelect.value, 10) },
      otherHours: { start: parseInt(otherStartSelect.value, 10), end: parseInt(otherEndSelect.value, 10) }
    };
    await MeetingStorage.savePreferences(prefs);

    const prospectEmail = prospectEmailInput.value.trim();
    const prospectName = prospectNameInput.value.trim();
    const prospectCompany = prospectCompanyInput.value.trim();
    const prospectDisplayName = prospectName || prospectCompany || prospectEmail;
    const eventTitle = eventTitleInput.value.trim() || computeDefaultEventTitle() || 'Meeting';

    if (saveProspectCheckbox.checked && prospectDisplayName) {
      await MeetingStorage.saveProspect({
        name: prospectDisplayName,
        company: prospectCompany,
        email: prospectEmail,
        timeZone: prospectTz
      });
      loadRecentProspects();
    }

    const result = MeetingEngine.findBestSlots({
      userTz,
      otherTz: prospectTz,
      durationMinutes: prefs.durationMinutes,
      userHours: prefs.userHours,
      otherHours: prefs.otherHours,
      daysAhead: plan.defaultDaysAhead,
      maxResults: 8
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
  }

  findBtn.addEventListener('click', handleFind);

  refreshPlanNote().then(() => loadPrefs()).then(loadLastSearch);
  loadRecentProspects();
})();

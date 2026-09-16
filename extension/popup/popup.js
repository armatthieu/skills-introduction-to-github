(function () {
  const { TZKit, MeetingEngine, MeetingStorage, ContactParser, MeetingPlans } = window;

  const yourTzInput = document.getElementById('your-tz');
  const yourTzHint = document.getElementById('your-tz-hint');
  const detectTzBtn = document.getElementById('detect-tz-btn');
  const prospectEmailInput = document.getElementById('prospect-email');
  const emailHint = document.getElementById('email-hint');
  const prospectNameInput = document.getElementById('prospect-name');
  const prospectCompanyInput = document.getElementById('prospect-company');
  const prospectTzInput = document.getElementById('prospect-tz');
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

  function tzLiveHint(input, hintEl) {
    const value = input.value.trim();
    if (!value) { hintEl.textContent = ''; hintEl.classList.remove('error'); return; }
    const resolved = TZKit.resolveTimeZoneInput(value);
    hintEl.classList.toggle('error', !resolved);
    hintEl.textContent = resolved
      ? `${TZKit.friendlyZoneLabel(resolved)} — current time: ${TZKit.formatTimeLabel(new Date(), resolved)}`
      : 'Not recognized — try a city name or an offset like GMT+3.';
  }
  prospectTzInput.addEventListener('input', () => tzLiveHint(prospectTzInput, tzHint));
  yourTzInput.addEventListener('input', () => tzLiveHint(yourTzInput, yourTzHint));

  detectTzBtn.addEventListener('click', () => {
    yourTzInput.value = detectedTz;
    tzLiveHint(yourTzInput, yourTzHint);
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
    yourTzInput.value = prefs.userTimeZone || detectedTz;
    durationSelect.value = String(prefs.durationMinutes);
    userStartSelect.value = String(prefs.userHours.start);
    userEndSelect.value = String(prefs.userHours.end);
    otherStartSelect.value = String(prefs.otherHours.start);
    otherEndSelect.value = String(prefs.otherHours.end);
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
    return { plan: MeetingPlans.getPlan(prefs.planId), usage };
  }

  async function refreshPlanNote() {
    const { plan, usage } = await getCurrentPlanAndUsage();
    const daysAhead = plan.defaultDaysAhead;
    resultsHeaderLabel.textContent = `Best times in the next ${daysAhead} day${daysAhead === 1 ? '' : 's'}`;

    if (plan.monthlyFindingsLimit === Infinity) {
      planNote.innerHTML = `<strong>${plan.label} plan</strong> — unlimited findings · ${daysAhead}-day search window`;
      return { plan, usage };
    }
    planNote.innerHTML =
      `<strong>${plan.label} plan</strong> — ${usage.count}/${plan.monthlyFindingsLimit} findings used this month · ${daysAhead}-day search window`;
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
        prospectTzInput.value = p.timeZone;
        eventTitleInput.dataset.userEdited = 'false';
        refreshEventTitleIfNotEdited();
        tzLiveHint(prospectTzInput, tzHint);
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
    yourTzInput, prospectEmailInput, prospectNameInput, prospectCompanyInput, prospectTzInput,
    durationSelect, userStartSelect, userEndSelect, otherStartSelect, otherEndSelect
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
    prospectTzInput.value = last.prospectTz || '';
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
    const userTz = TZKit.resolveTimeZoneInput(yourTzInput.value.trim());
    if (!userTz) {
      yourTzHint.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      yourTzHint.classList.add('error');
      yourTzInput.focus();
      return;
    }

    const prospectTz = TZKit.resolveTimeZoneInput(prospectTzInput.value.trim());
    if (!prospectTz) {
      tzHint.textContent = 'Not recognized — try a city name or an offset like GMT+3.';
      tzHint.classList.add('error');
      prospectTzInput.focus();
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

  loadPrefs().then(loadLastSearch);
  loadRecentProspects();
  refreshPlanNote();
})();

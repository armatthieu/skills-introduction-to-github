(function () {
  const { TZKit, MeetingEngine, MeetingStorage } = window;

  const userZoneLabel = document.getElementById('your-zone-label');
  const prospectNameInput = document.getElementById('prospect-name');
  const prospectTzInput = document.getElementById('prospect-tz');
  const tzList = document.getElementById('tz-list');
  const tzHint = document.getElementById('tz-hint');
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
  const resultsSection = document.getElementById('results');
  const resultsList = document.getElementById('results-list');
  const emptyState = document.getElementById('empty-state');

  const userTz = TZKit.getUserTimeZone();
  userZoneLabel.textContent = `${TZKit.friendlyZoneName(userTz)} (${TZKit.formatOffsetLabel(userTz)})`;

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
      opt.label = `${TZKit.friendlyZoneName(zone)} (${TZKit.formatOffsetLabel(zone)})`;
      tzList.appendChild(opt);
    });
  }
  populateTzList();

  function updateTzHint() {
    const value = prospectTzInput.value.trim();
    if (!value) { tzHint.textContent = ''; return; }
    const zones = TZKit.getAllTimeZones();
    if (zones.includes(value)) {
      tzHint.textContent = `Current time there: ${TZKit.formatTimeLabel(new Date(), value)}`;
    } else {
      tzHint.textContent = 'Pick a zone from the suggestions to continue.';
    }
  }
  prospectTzInput.addEventListener('input', updateTzHint);

  async function loadPrefs() {
    const prefs = await MeetingStorage.getPreferences();
    durationSelect.value = String(prefs.durationMinutes);
    userStartSelect.value = String(prefs.userHours.start);
    userEndSelect.value = String(prefs.userHours.end);
    otherStartSelect.value = String(prefs.otherHours.start);
    otherEndSelect.value = String(prefs.otherHours.end);
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
        prospectNameInput.value = p.name;
        prospectTzInput.value = p.timeZone;
        updateTzHint();
      });
      recentChips.appendChild(chip);
    });
  }

  toggleAdvancedBtn.addEventListener('click', () => {
    advancedPanel.hidden = !advancedPanel.hidden;
    toggleAdvancedBtn.textContent = advancedPanel.hidden ? 'Working hours ▾' : 'Working hours ▴';
  });

  function renderSlots(slots, prospectName, prospectTz) {
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
      badge.textContent = slot.tier;
      top.appendChild(dateEl);
      top.appendChild(badge);

      const times = document.createElement('div');
      times.className = 'slot-times';
      times.innerHTML = `
        <div class="slot-time-row">You: <strong>${TZKit.formatTimeLabel(slot.start, userTz)}</strong></div>
        <div class="slot-time-row">${prospectName || 'Prospect'}: <strong>${TZKit.formatTimeLabel(slot.start, prospectTz)}</strong></div>
      `;

      const actions = document.createElement('div');
      actions.className = 'slot-actions';

      const addBtn = document.createElement('button');
      addBtn.className = 'primary';
      addBtn.textContent = 'Add to Calendar';
      addBtn.addEventListener('click', () => {
        const title = prospectName ? `Call with ${prospectName}` : 'Meeting';
        const url = TZKit.buildGoogleCalendarUrl({
          title,
          start: slot.start,
          end: slot.end,
          timeZone: userTz,
          details: `Suggested by Meeting Time Finder — ${prospectName || 'prospect'} is in ${TZKit.friendlyZoneName(prospectTz)}.`
        });
        chrome.tabs.create({ url });
      });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        const text = `${TZKit.formatDateLabel(slot.start, userTz)} — ${TZKit.formatTimeLabel(slot.start, userTz)} your time / ${TZKit.formatTimeLabel(slot.start, prospectTz)} ${prospectName || 'their'} time`;
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

  async function handleFind() {
    const prospectTz = prospectTzInput.value.trim();
    const zones = TZKit.getAllTimeZones();
    if (!prospectTz || !zones.includes(prospectTz)) {
      tzHint.textContent = 'Please pick a valid time zone from the suggestions.';
      prospectTzInput.focus();
      return;
    }

    findBtn.disabled = true;
    findBtn.textContent = 'Finding times…';

    const prefs = {
      durationMinutes: parseInt(durationSelect.value, 10),
      userHours: { start: parseInt(userStartSelect.value, 10), end: parseInt(userEndSelect.value, 10) },
      otherHours: { start: parseInt(otherStartSelect.value, 10), end: parseInt(otherEndSelect.value, 10) }
    };
    await MeetingStorage.savePreferences(prefs);

    const prospectName = prospectNameInput.value.trim();
    if (saveProspectCheckbox.checked && prospectName) {
      await MeetingStorage.saveProspect({ name: prospectName, timeZone: prospectTz });
      loadRecentProspects();
    }

    const slots = MeetingEngine.findBestSlots({
      userTz,
      otherTz: prospectTz,
      durationMinutes: prefs.durationMinutes,
      userHours: prefs.userHours,
      otherHours: prefs.otherHours,
      daysAhead: 7,
      maxResults: 8
    });

    renderSlots(slots, prospectName, prospectTz);

    findBtn.disabled = false;
    findBtn.textContent = 'Find best meeting times';
  }

  findBtn.addEventListener('click', handleFind);

  loadPrefs();
  loadRecentProspects();
})();

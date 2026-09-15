/* Injects a small floating launcher + panel into Google Calendar, Gmail,
   and Google Meet so users can find the best meeting time without leaving
   the tab — while drafting an email, right before joining a call, or while
   creating an event. Reuses the same TZKit / MeetingEngine / MeetingStorage
   logic as the popup, just with a lighter-weight inline UI. */

(function () {
  if (window.__mtfInjected) return;
  window.__mtfInjected = true;

  const { TZKit, MeetingEngine, MeetingStorage } = window;
  const userTz = TZKit.getUserTimeZone();

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
        <label>Prospect name</label>
        <input type="text" id="mtf-name" placeholder="e.g. Alex from Acme Co." />
      </div>
      <div class="mtf-field">
        <label>Prospect's time zone</label>
        <input type="text" id="mtf-tz" list="mtf-tz-list" placeholder="Start typing a city or zone…" />
        <datalist id="mtf-tz-list"></datalist>
        <div class="mtf-hint" id="mtf-hint"></div>
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
      <div id="mtf-results" class="mtf-results"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const tzListEl = panel.querySelector('#mtf-tz-list');
  TZKit.getAllTimeZones().forEach((zone) => {
    const opt = document.createElement('option');
    opt.value = zone;
    opt.label = `${TZKit.friendlyZoneName(zone)} (${TZKit.formatOffsetLabel(zone)})`;
    tzListEl.appendChild(opt);
  });

  const nameInput = panel.querySelector('#mtf-name');
  const tzInput = panel.querySelector('#mtf-tz');
  const hintEl = panel.querySelector('#mtf-hint');
  const durationSelect = panel.querySelector('#mtf-duration');
  const findBtn = panel.querySelector('#mtf-find');
  const resultsEl = panel.querySelector('#mtf-results');

  MeetingStorage.getPreferences().then((prefs) => {
    durationSelect.value = String(prefs.durationMinutes);
  });

  tzInput.addEventListener('input', () => {
    const value = tzInput.value.trim();
    if (!value) { hintEl.textContent = ''; return; }
    const zones = TZKit.getAllTimeZones();
    hintEl.textContent = zones.includes(value)
      ? `Current time there: ${TZKit.formatTimeLabel(new Date(), value)}`
      : 'Pick a zone from the suggestions to continue.';
  });

  launcher.addEventListener('click', () => {
    panel.classList.toggle('mtf-hidden');
  });
  panel.querySelector('#mtf-close').addEventListener('click', () => {
    panel.classList.add('mtf-hidden');
  });

  function renderSlots(slots, prospectName, prospectTz) {
    resultsEl.innerHTML = '';
    if (!slots.length) {
      resultsEl.innerHTML = '<div class="mtf-empty">No overlapping working hours in the next 7 days.</div>';
      return;
    }
    slots.forEach((slot) => {
      const card = document.createElement('div');
      card.className = `mtf-slot-card ${slot.tier}`;
      card.innerHTML = `
        <div class="mtf-slot-top">
          <span class="mtf-slot-date">${TZKit.formatDateLabel(slot.start, userTz)}</span>
          <span class="mtf-badge ${slot.tier}">${slot.tier}</span>
        </div>
        <div class="mtf-slot-times">
          You: <strong>${TZKit.formatTimeLabel(slot.start, userTz)}</strong><br/>
          ${prospectName || 'Prospect'}: <strong>${TZKit.formatTimeLabel(slot.start, prospectTz)}</strong>
        </div>
        <div class="mtf-slot-actions">
          <button type="button" class="mtf-primary" data-action="add">Add to Calendar</button>
          <button type="button" data-action="copy">Copy</button>
        </div>
      `;
      card.querySelector('[data-action="add"]').addEventListener('click', () => {
        const title = prospectName ? `Call with ${prospectName}` : 'Meeting';
        const url = TZKit.buildGoogleCalendarUrl({
          title,
          start: slot.start,
          end: slot.end,
          timeZone: userTz,
          details: `Suggested by Meeting Time Finder — ${prospectName || 'prospect'} is in ${TZKit.friendlyZoneName(prospectTz)}.`
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

  findBtn.addEventListener('click', async () => {
    const prospectTz = tzInput.value.trim();
    const zones = TZKit.getAllTimeZones();
    if (!prospectTz || !zones.includes(prospectTz)) {
      hintEl.textContent = 'Please pick a valid time zone from the suggestions.';
      tzInput.focus();
      return;
    }
    findBtn.disabled = true;
    findBtn.textContent = 'Finding times…';

    const durationMinutes = parseInt(durationSelect.value, 10);
    await MeetingStorage.savePreferences({ durationMinutes });

    const prospectName = nameInput.value.trim();
    if (prospectName) {
      await MeetingStorage.saveProspect({ name: prospectName, timeZone: prospectTz });
    }

    const prefs = await MeetingStorage.getPreferences();
    const slots = MeetingEngine.findBestSlots({
      userTz,
      otherTz: prospectTz,
      durationMinutes,
      userHours: prefs.userHours,
      otherHours: prefs.otherHours,
      daysAhead: 7,
      maxResults: 6
    });
    renderSlots(slots, prospectName, prospectTz);

    findBtn.disabled = false;
    findBtn.textContent = 'Find best meeting times';
  });
})();

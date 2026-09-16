/* Core "best meeting time" scoring engine. Pure logic, no DOM/chrome APIs,
   so it can be unit-tested and reused by both the popup and the content
   script. Exposes window.MeetingEngine. */

(function (global) {
  const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

  function isWorkDay(weekday, workDays) {
    return workDays.includes(weekday);
  }

  // Score how central `minutesFromMidnight` sits inside [startMin, endMin).
  // 1.0 = dead center of the working day, 0 = at the very edge.
  function centerScore(minutesFromMidnight, startMin, endMin) {
    const mid = (startMin + endMin) / 2;
    const halfSpan = (endMin - startMin) / 2;
    if (halfSpan <= 0) return 0;
    const dist = Math.abs(minutesFromMidnight - mid);
    return Math.max(0, 1 - dist / halfSpan);
  }

  // How many minutes a [startMinutes, endMinutes) meeting falls outside the
  // [windowStart, windowEnd) working-hours window. 0 means it fits.
  function minutesOutside(startMinutes, endMinutes, windowStart, windowEnd) {
    if (startMinutes >= windowStart && endMinutes <= windowEnd) return 0;
    if (endMinutes <= windowStart) return windowStart - startMinutes;
    if (startMinutes >= windowEnd) return endMinutes - windowEnd;
    // Partially overlapping the window on one side.
    return Math.max(windowStart - startMinutes, endMinutes - windowEnd, 0);
  }

  function buildCandidates(opts) {
    const userTz = opts.userTz;
    const otherTz = opts.otherTz;
    const durationMinutes = opts.durationMinutes || 30;
    const daysAhead = opts.daysAhead || 7;
    const userWorkDays = opts.userWorkDays || DEFAULT_WORK_DAYS;
    const otherWorkDays = opts.otherWorkDays || DEFAULT_WORK_DAYS;
    const stepMinutes = opts.stepMinutes || 15;
    const now = opts.now || new Date();

    const stepMs = stepMinutes * 60 * 1000;
    const startTime = new Date(Math.ceil(now.getTime() / stepMs) * stepMs);
    const endTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const durationMs = durationMinutes * 60 * 1000;

    const candidates = [];

    for (let t = startTime.getTime(); t <= endTime.getTime(); t += stepMs) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMs);

      const userStart = global.TZKit.getZonedParts(slotStart, userTz);
      const userEnd = global.TZKit.getZonedParts(slotEnd, userTz);
      const otherStart = global.TZKit.getZonedParts(slotStart, otherTz);
      const otherEnd = global.TZKit.getZonedParts(slotEnd, otherTz);

      // Meeting must not cross local midnight for either party (keeps the
      // math simple and matches how people actually book calls).
      if (userEnd.dateKey !== userStart.dateKey) continue;
      if (otherEnd.dateKey !== otherStart.dateKey) continue;

      if (!isWorkDay(userStart.weekday, userWorkDays)) continue;
      if (!isWorkDay(otherStart.weekday, otherWorkDays)) continue;

      candidates.push({
        start: slotStart,
        end: slotEnd,
        userLocal: userStart,
        otherLocal: otherStart,
        userStartMinutes: userStart.hour * 60 + userStart.minute,
        userEndMinutes: userEnd.hour * 60 + userEnd.minute,
        otherStartMinutes: otherStart.hour * 60 + otherStart.minute,
        otherEndMinutes: otherEnd.hour * 60 + otherEnd.minute
      });
    }

    return candidates;
  }

  // Collapses a scored candidate list to one representative slot per
  // calendar day (from the user's perspective), preferring higher score and
  // — among ties, which happens whenever both working windows are the same
  // width — the time in the middle of the tied window rather than its edge.
  function bestPerDay(scoredCandidates, maxResults) {
    const byDayCandidates = new Map();
    for (const candidate of scoredCandidates) {
      const key = candidate.userLocal.dateKey;
      if (!byDayCandidates.has(key)) byDayCandidates.set(key, []);
      byDayCandidates.get(key).push(candidate);
    }

    const picked = [];
    for (const candidates of byDayCandidates.values()) {
      const maxScore = Math.max(...candidates.map((c) => c.score));
      const tied = candidates.filter((c) => Math.abs(c.score - maxScore) < 1e-9);
      picked.push(tied[Math.floor((tied.length - 1) / 2)]);
    }
    picked.sort((a, b) => a.start - b.start);
    return picked.slice(0, maxResults);
  }

  /**
   * Find candidate meeting slots that fall inside both parties' working
   * hours. If none exist in the search window, falls back to the slots
   * that come closest — outside normal hours for one or both sides — so
   * the caller always gets *something* actionable instead of a dead end
   * (real sales calls across e.g. US/India routinely happen early or late
   * for one side; a strict "no overlap" is rarely the useful answer).
   *
   * @param {Object} opts
   * @param {string} opts.userTz            IANA zone for "you"
   * @param {string} opts.otherTz           IANA zone for the other party
   * @param {number} [opts.durationMinutes] meeting length, default 30
   * @param {number} [opts.daysAhead]       how many days forward to search, default 7
   * @param {{start:number,end:number}} [opts.userHours]  working hours (24h), default 9-18
   * @param {{start:number,end:number}} [opts.otherHours] working hours (24h), default 9-18
   * @param {number[]} [opts.userWorkDays]  weekdays 0=Sun..6=Sat, default Mon-Fri
   * @param {number[]} [opts.otherWorkDays] weekdays 0=Sun..6=Sat, default Mon-Fri
   * @param {number} [opts.stepMinutes]     search granularity, default 15
   * @param {Date}   [opts.now]             anchor "now" (mainly for tests)
   * @param {number} [opts.maxResults]      cap on returned slots, default 7
   * @returns {{slots: Array, usedFallback: boolean}}
   */
  function findBestSlots(opts) {
    const userHours = opts.userHours || { start: 9, end: 18 };
    const otherHours = opts.otherHours || { start: 9, end: 18 };
    const userStartMin = userHours.start * 60;
    const userEndMin = userHours.end * 60;
    const otherStartMin = otherHours.start * 60;
    const otherEndMin = otherHours.end * 60;
    const maxResults = opts.maxResults || 7;

    const candidates = buildCandidates(opts);

    const inHours = [];
    for (const c of candidates) {
      const fitsUser = c.userStartMinutes >= userStartMin && c.userEndMinutes <= userEndMin;
      const fitsOther = c.otherStartMinutes >= otherStartMin && c.otherEndMinutes <= otherEndMin;
      if (!fitsUser || !fitsOther) continue;
      const userScore = centerScore((c.userStartMinutes + c.userEndMinutes) / 2, userStartMin, userEndMin);
      const otherScore = centerScore((c.otherStartMinutes + c.otherEndMinutes) / 2, otherStartMin, otherEndMin);
      inHours.push({ ...c, score: (userScore + otherScore) / 2, userInHours: true, otherInHours: true });
    }

    if (inHours.length) {
      const top = bestPerDay(inHours, maxResults);
      const bestScore = Math.max(...top.map((s) => s.score));
      return {
        usedFallback: false,
        slots: top.map((slot) => ({ ...slot, tier: tierFor(slot.score, bestScore) }))
      };
    }

    // Fallback: no slot fit both parties' normal hours anywhere in the
    // search window. Rank by combined "how far outside hours" instead, so
    // the least-bad compromise times surface (and label which side(s)
    // they're inconvenient for).
    const outside = candidates.map((c) => {
      const userOutside = minutesOutside(c.userStartMinutes, c.userEndMinutes, userStartMin, userEndMin);
      const otherOutside = minutesOutside(c.otherStartMinutes, c.otherEndMinutes, otherStartMin, otherEndMin);
      return {
        ...c,
        userInHours: userOutside === 0,
        otherInHours: otherOutside === 0,
        score: -(userOutside + otherOutside) // higher (less negative) is better
      };
    });

    const top = bestPerDay(outside, maxResults);
    return {
      usedFallback: true,
      slots: top.map((slot) => ({ ...slot, tier: 'outside-hours' }))
    };
  }

  function tierFor(score, bestScore) {
    if (score >= bestScore - 1e-6 && score >= 0.6) return 'recommended';
    if (score >= 0.35) return 'good';
    return 'workable';
  }

  global.MeetingEngine = { findBestSlots };
})(typeof window !== 'undefined' ? window : globalThis);

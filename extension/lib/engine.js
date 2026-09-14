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

  /**
   * Find candidate meeting slots that fall inside both parties' working
   * hours.
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
   * @param {number} [opts.maxResults]      cap on returned slots, default 8
   * @returns {Array} sorted list of slot descriptors
   */
  function findBestSlots(opts) {
    const userTz = opts.userTz;
    const otherTz = opts.otherTz;
    const durationMinutes = opts.durationMinutes || 30;
    const daysAhead = opts.daysAhead || 7;
    const userHours = opts.userHours || { start: 9, end: 18 };
    const otherHours = opts.otherHours || { start: 9, end: 18 };
    const userWorkDays = opts.userWorkDays || DEFAULT_WORK_DAYS;
    const otherWorkDays = opts.otherWorkDays || DEFAULT_WORK_DAYS;
    const stepMinutes = opts.stepMinutes || 15;
    const now = opts.now || new Date();

    const userStartMin = userHours.start * 60;
    const userEndMin = userHours.end * 60;
    const otherStartMin = otherHours.start * 60;
    const otherEndMin = otherHours.end * 60;

    // Round "now" up to the next step boundary and start searching from there.
    const stepMs = stepMinutes * 60 * 1000;
    const startTime = new Date(Math.ceil(now.getTime() / stepMs) * stepMs);
    const endTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const durationMs = durationMinutes * 60 * 1000;

    const results = [];

    for (let t = startTime.getTime(); t <= endTime.getTime(); t += stepMs) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMs);

      const userStart = global.TZKit.getZonedParts(slotStart, userTz);
      const userEnd = global.TZKit.getZonedParts(slotEnd, userTz);
      const otherStart = global.TZKit.getZonedParts(slotStart, otherTz);
      const otherEnd = global.TZKit.getZonedParts(slotEnd, otherTz);

      const userStartMinutes = userStart.hour * 60 + userStart.minute;
      const userEndMinutes = userEnd.hour * 60 + userEnd.minute;
      const otherStartMinutes = otherStart.hour * 60 + otherStart.minute;
      const otherEndMinutes = otherEnd.hour * 60 + otherEnd.minute;

      // Meeting must not cross local midnight for either party (keeps the
      // math simple and matches how people actually book calls).
      if (userEnd.dateKey !== userStart.dateKey) continue;
      if (otherEnd.dateKey !== otherStart.dateKey) continue;

      if (!isWorkDay(userStart.weekday, userWorkDays)) continue;
      if (!isWorkDay(otherStart.weekday, otherWorkDays)) continue;

      const fitsUser = userStartMinutes >= userStartMin && userEndMinutes <= userEndMin;
      const fitsOther = otherStartMinutes >= otherStartMin && otherEndMinutes <= otherEndMin;
      if (!fitsUser || !fitsOther) continue;

      const userScore = centerScore(
        (userStartMinutes + userEndMinutes) / 2,
        userStartMin,
        userEndMin
      );
      const otherScore = centerScore(
        (otherStartMinutes + otherEndMinutes) / 2,
        otherStartMin,
        otherEndMin
      );
      const score = (userScore + otherScore) / 2;

      results.push({
        start: slotStart,
        end: slotEnd,
        score,
        userLocal: userStart,
        otherLocal: otherStart
      });
    }

    // Collapse to a single best slot per calendar day (from the user's
    // perspective) so the shortlist reads as "here's the best time each
    // day" instead of a pile of near-duplicate 15-minute increments. When
    // both parties have equal-width working hours the score is often flat
    // across the whole overlap window (any point splits the "who's more
    // off-center" burden the same way) — in that case pick the time in the
    // middle of the tied window rather than its earliest edge, since that
    // reads as the more natural suggestion.
    const byDayCandidates = new Map();
    for (const candidate of results) {
      const key = candidate.userLocal.dateKey;
      if (!byDayCandidates.has(key)) byDayCandidates.set(key, []);
      byDayCandidates.get(key).push(candidate);
    }

    const byDay = [];
    for (const candidates of byDayCandidates.values()) {
      const maxScore = Math.max(...candidates.map((c) => c.score));
      const tied = candidates.filter((c) => Math.abs(c.score - maxScore) < 1e-9);
      byDay.push(tied[Math.floor((tied.length - 1) / 2)]);
    }
    byDay.sort((a, b) => a.start - b.start);
    const maxResults = opts.maxResults || 7;
    const top = byDay.slice(0, maxResults);

    const bestScore = top.length ? Math.max(...top.map((s) => s.score)) : 0;
    return top.map((slot) => ({
      ...slot,
      tier: tierFor(slot.score, bestScore)
    }));
  }

  function tierFor(score, bestScore) {
    if (score >= bestScore - 1e-6 && score >= 0.6) return 'recommended';
    if (score >= 0.35) return 'good';
    return 'workable';
  }

  global.MeetingEngine = { findBestSlots };
})(typeof window !== 'undefined' ? window : globalThis);

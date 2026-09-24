/* Free vs. paid plan definitions.
   IMPORTANT: nothing here is enforced server-side yet — see the
   "Monetization" section of the extension README. All limits below are
   currently checked against chrome.storage.local, which the user's own
   browser controls, so a technical user can bypass them today. This file
   exists so the rest of the code reads plan limits from one place, ready
   to be backed by a real server-side check once a backend exists.

   Every number marked TBD is a placeholder standing in for a product
   decision that hasn't been made yet — change it here and everything
   downstream (search window, usage gating) picks it up automatically. */

(function (global) {
  const PLANS = {
    free: {
      id: 'free',
      label: 'Free',
      monthlyFindingsLimit: 20, // TBD — exact cap not yet decided
      minDaysAhead: 2,          // TBD
      maxDaysAhead: 3,          // TBD — "two or three days" per the product call
      defaultDaysAhead: 3,
      durationOptions: [15, 30], // per the product call: free = 15 or 30 min only
      defaultDurationMinutes: 30
    },
    paid: {
      id: 'paid',
      label: 'Paid',
      monthlyFindingsLimit: Infinity,
      minDaysAhead: 2,          // TBD
      maxDaysAhead: 15,         // TBD — "configurable two to fifteen days"
      defaultDaysAhead: 7,
      durationOptions: [15, 20, 25, 30, 35, 40, 45, 50, 55, 60], // 5-min steps, 15-60
      defaultDurationMinutes: 30
    },
    // Not a real pricing tier — an unrestricted plan for whoever is
    // actively developing/using this ahead of any real plan enforcement.
    // Switch into it with the console snippet in the README's
    // "Monetization" section (planId defaults to 'free' for everyone else).
    dev: {
      id: 'dev',
      label: 'Dev',
      monthlyFindingsLimit: Infinity,
      minDaysAhead: 1,
      maxDaysAhead: 21,
      defaultDaysAhead: 14,
      durationOptions: [15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
      defaultDurationMinutes: 30
    }
  };

  function getPlan(planId) {
    return PLANS[planId] || PLANS.free;
  }

  function clampDaysAhead(plan, requestedDays) {
    const value = requestedDays || plan.defaultDaysAhead;
    return Math.min(plan.maxDaysAhead, Math.max(plan.minDaysAhead, value));
  }

  global.MeetingPlans = { PLANS, getPlan, clampDaysAhead };
})(typeof window !== 'undefined' ? window : globalThis);

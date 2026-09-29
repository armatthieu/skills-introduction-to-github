/* Google Meet-only: shows a small, unobtrusive badge confirming the
   current user's time zone and local time throughout the call. The goal is
   simple — everyone on a call should be able to glance over and confirm
   "yes, that's the time zone I think it is," instead of a meeting starting
   an hour early/late because someone assumed the wrong zone. */

(function () {
  if (location.hostname !== 'meet.google.com') return;
  if (window.__mtfMeetBadgeInjected) return;
  window.__mtfMeetBadgeInjected = true;

  const { TZKit, MeetingStorage } = window;
  let userTz = TZKit.getUserTimeZone();

  const badge = document.createElement('div');
  badge.id = 'mtf-meet-badge';
  badge.title = 'Your time zone, shown by Meeting Time Finder';
  document.body.appendChild(badge);

  function render() {
    const now = new Date();
    badge.textContent =
      `🌐 ${TZKit.friendlyZoneName(userTz)} (${TZKit.formatOffsetLabel(userTz, now)}) · ${TZKit.formatTimeLabel(now, userTz)}`;
  }

  MeetingStorage.getEffectiveUserTimeZone().then((tz) => {
    userTz = tz;
    render();
  });

  render();
  setInterval(render, 15000);
})();

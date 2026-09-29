/* Best-effort guesses of a contact's name and company from their email
   address, so a prospect's email can be pasted in once instead of typing
   their name and company separately. This is plain pattern-matching, not
   an AI/LLM call — no network request is made and no data leaves the
   browser. Both guesses are meant to be shown in editable fields so a bad
   guess costs one small edit, not a re-do. Exposes window.ContactParser. */

(function (global) {
  const PERSONAL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com',
    'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com', 'me.com',
    'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com'
  ]);

  function titleCase(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word;
  }

  /**
   * @param {string} email
   * @returns {{name: string, company: string, isPersonalDomain: boolean}|null}
   */
  function guessFromEmail(email) {
    const match = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec((email || '').trim());
    if (!match) return null;
    const [, localPart, domain] = match;

    const nameParts = localPart
      .split(/[._+-]+/)
      .map((p) => p.replace(/\d+$/, '')) // drop trailing digits, e.g. "jdoe123"
      .filter(Boolean);

    const name = nameParts.length >= 2
      ? nameParts.slice(0, 2).map(titleCase).join(' ')
      : titleCase(nameParts[0] || '');

    const domainLower = domain.toLowerCase();
    const isPersonalDomain = PERSONAL_DOMAINS.has(domainLower);
    // Taking the first label handles the common "company.com" and
    // "company.co.uk" cases; a real subdomain (e.g. "sales.acme.com") would
    // guess "Sales" instead of "Acme" — an accepted MVP limitation.
    const company = isPersonalDomain
      ? ''
      : domainLower.split('.')[0].split('-').map(titleCase).join('-');

    return { name, company, isPersonalDomain };
  }

  global.ContactParser = { guessFromEmail };
})(typeof window !== 'undefined' ? window : globalThis);

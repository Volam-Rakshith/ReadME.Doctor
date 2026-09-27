/**
 * README Doctor — shared utilities.
 * Pure functions only; safe to import in Node (tests) and the browser.
 */

export const VERSION = '1.0.0';
export const BRAND = 'README Doctor';
export const VENDOR = 'VR Developments';
export const TAGLINE = 'Diagnose documentation. Don\u2019t blindly generate it.';
export const QUOTE = 'Your README doesn\u2019t need another generator. It needs a diagnosis.';

/** Escape a string for safe interpolation into HTML text content. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Alias — attributes use the same escaping rules as text content here. */
export const escapeAttr = escapeHtml;

/** Escape a string for embedding inside a RegExp. */
export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Count newlines in a string (used to keep token line numbers accurate). */
export function countNewlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/** Normalise a reference link label (CommonMark: collapse whitespace, fold case). */
export function normalizeLabel(label) {
  return String(label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Leading space count of a line (tabs count as 4). */
export function leadingSpaces(line) {
  const m = /^[ \t]*/.exec(line)[0];
  let count = 0;
  for (const ch of m) count += ch === '\t' ? 4 : 1;
  return count;
}

/** Is this an absolute http(s) URL? */
export function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s ?? ''));
}

/** Strip a fragment (#...) and query (?...) from a URL-ish string. */
export function stripHashAndQuery(s) {
  return String(s ?? '').split('#')[0].split('?')[0];
}

/** Levenshtein distance — used to suggest "did you mean" anchors. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** The closest match from `candidates` to `target`, or null when nothing is close. */
export function closestMatch(target, candidates, maxDistance = 4) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = levenshtein(target.toLowerCase(), c.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  return bestScore <= maxDistance ? best : null;
}

/** Truncate a string to `max` characters with an ellipsis. */
export function truncate(s, max = 120) {
  const str = String(s ?? '').replace(/\s+/g, ' ').trim();
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Human-readable "n of total" progress label. */
export function progressLabel(done, total) {
  return total ? `${done}/${total}` : '0';
}

/** Format a Date as a compact local stamp, e.g. "27 Sep 2026, 14:03". */
export function formatStamp(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** True when the string looks like a placeholder username (badge templates etc.). */
export function looksLikePlaceholderToken(s) {
  return /your[-_. ]?(username|repo|project|package|name|token|key)|<your-[a-z-]+>|\[username\]|CHANGE[- ]?ME/i.test(
    String(s ?? ''),
  );
}

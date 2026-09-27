/**
 * GitHub-compatible heading slugger.
 *
 * Reproduces the anchors GitHub generates for headings, so that internal
 * links like [Installation](#installation) can be verified locally:
 *   - lowercase
 *   - strip punctuation (keep letters, numbers, spaces, hyphens)
 *   - spaces collapse to single hyphens
 *   - duplicates get "-1", "-2", ... suffixes
 */
export class Slugger {
  constructor() {
    this.seen = new Map();
    this._issued = [];
  }

  slug(rawText) {
    // GitHub's algorithm: lowercase → strip punctuation (keep letters, numbers,
    // spaces, hyphens) → each remaining space becomes a hyphen (no collapsing:
    // "Docs & Community" → "docs--community").
    const base = String(rawText ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/ /g, '-');
    const clean = base || 'section';
    const count = this.seen.get(clean) ?? 0;
    this.seen.set(clean, count + 1);
    const slug = count === 0 ? clean : `${clean}-${count}`;
    this._issued.push(slug);
    return slug;
  }

  /** All slugs issued so far (for anchor validation). */
  slugs() {
    return [...this._issued];
  }
}

/** Slug a single string without de-duplication state (used for suggestions). */
export function slugOnce(rawText) {
  return (
    String(rawText ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/ /g, '-') || 'section'
  );
}

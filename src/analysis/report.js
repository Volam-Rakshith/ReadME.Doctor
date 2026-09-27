/**
 * README Doctor — diagnostic report model.
 *
 * Severities (documented in docs/METHODOLOGY.md and the in-app methodology
 * dialog — no arbitrary numeric scores):
 *
 *   critical     Blocks understanding, adoption, or legal clarity.
 *   important    Significant friction, or a defect with direct evidence.
 *   improvement  Polish. Worth doing, not urgent.
 *   good         Verified strengths, worth keeping.
 *   unverified   Something we could not verify (no repo context / network
 *                blocked). Never reported as broken — evidence first.
 */

import { RULES } from './rules.js';

export const SEVERITY_ORDER = ['critical', 'important', 'improvement', 'good', 'unverified'];

export const SEVERITIES = {
  critical: { label: 'Critical', rank: 0, color: 'var(--critical)', glyph: '●', blurb: 'Blocks understanding, adoption or trust.' },
  important: { label: 'Important', rank: 1, color: 'var(--important)', glyph: '●', blurb: 'Significant friction or an evidenced defect.' },
  improvement: { label: 'Improvement', rank: 2, color: 'var(--improvement)', glyph: '●', blurb: 'Polish worth doing.' },
  good: { label: 'Good', rank: 3, color: 'var(--good)', glyph: '✓', blurb: 'Verified strengths — keep these.' },
  unverified: { label: 'Unverified', rank: 4, color: 'var(--unverified)', glyph: '?', blurb: 'Could not be verified from here. Check manually.' },
};

export const CATEGORIES = ['Structure', 'Consistency', 'Contributor friction', 'Links'];

let seq = 0;

/**
 * Create a finding. Every finding explains: what was detected, why it
 * matters, the evidence, and a suggested improvement.
 */
export function finding(ruleId, opts) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule id: ${ruleId}`);
  const severity = opts.severity ?? rule.severity;
  const evidence = (opts.evidence ?? []).map((e) => ({
    line: e.line ?? null,
    lines: e.lines ?? null,
    snippet: e.snippet ?? null,
    note: e.note ?? null,
  }));
  return {
    id: `f${++seq}`,
    ruleId,
    rule,
    severity,
    category: rule.category,
    title: opts.title ?? rule.title,
    what: opts.what ?? '',
    why: rule.why,
    evidence,
    suggestion: opts.suggestion ?? rule.suggestion ?? '',
    /** Preferred jump target: the README line the finding is about. */
    line: opts.line ?? evidence.find((e) => e.line !== null)?.line ?? null,
    /** Section key this finding relates to (used for jump-to-section). */
    section: opts.section ?? null,
    meta: opts.meta ?? {},
  };
}

/** Count findings per severity. */
export function summarize(findings) {
  const counts = { critical: 0, important: 0, improvement: 0, good: 0, unverified: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/** De-duplicate (same rule + same primary line) and sort by severity, then line. */
export function finalize(findings) {
  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const key = `${f.ruleId}|${f.section ?? ''}|${f.line ?? ''}|${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }
  unique.sort((a, b) => {
    const s = SEVERITIES[a.severity].rank - SEVERITIES[b.severity].rank;
    if (s !== 0) return s;
    const la = a.line ?? Number.MAX_SAFE_INTEGER;
    const lb = b.line ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.title.localeCompare(b.title);
  });
  return unique;
}

/** A short snippet of the source line for evidence displays. */
export function lineSnippet(lines, line, max = 100) {
  if (line === null || line === undefined || line < 0 || line >= lines.length) return null;
  return (lines[line] ?? '').trim().slice(0, max);
}

/** Grouped view of findings by severity, in canonical order. */
export function groupBySeverity(findings) {
  const groups = {};
  for (const sev of Object.keys(SEVERITIES)) groups[sev] = [];
  for (const f of findings) groups[f.severity]?.push(f);
  return groups;
}

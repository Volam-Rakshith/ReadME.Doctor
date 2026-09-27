/**
 * README Doctor — structure analysis.
 *
 * Detects canonical sections (title, description, installation, usage, …),
 * measures their substance, and reports what is missing, empty, or thin.
 * Section detection is heading-synonym based (English-first; documented
 * limitation in the methodology).
 */

import { inlineToText } from '../markdown/parser.js';
import { finding, lineSnippet } from './report.js';
import { truncate } from '../util.js';

/** Canonical sections, in the order they usually appear in a README. */
export const CANONICAL_SECTIONS = [
  { key: 'description', label: 'Description', synonyms: /^(about|description|overview|introduction|what is|what it does|summary|background)\b/i, required: false },
  { key: 'features', label: 'Features', synonyms: /^(features?|highlights?|what.s (?:new|included)|capabilities|key features)\b/i, required: false },
  { key: 'installation', label: 'Installation', synonyms: /^(installation|install(ing)?|setup|set up|getting started|quick\s?start|prerequisites?|requirements)\b/i, required: true },
  { key: 'usage', label: 'Usage', synonyms: /^(usage|how to use|using|run(ning)?|quick usage)\b/i, required: true },
  { key: 'examples', label: 'Examples', synonyms: /^(examples?|demos?|showcase|sample|playground|usage examples)\b/i, required: false },
  { key: 'configuration', label: 'Configuration', synonyms: /^(configur(ation|ing)|config|settings|options|customization)\b/i, required: false },
  { key: 'environment', label: 'Environment variables', synonyms: /^(environment(?:\s+variables?)?|env(ironment)?\s*vars?|\.env|secrets?)\b/i, required: false },
  { key: 'api', label: 'API documentation', synonyms: /^(api|api reference|endpoints?|reference|sdk)\b/i, required: false },
  { key: 'architecture', label: 'Architecture', synonyms: /^(architect(ure|ing)|design|how it works|internals|technical (overview|details))\b/i, required: false },
  { key: 'contributing', label: 'Contributing', synonyms: /^(contribut(ion|ing)|how to contribute|pull requests?|development|developing|dev\s?setup|hacking)\b/i, required: true },
  { key: 'testing', label: 'Testing', synonyms: /^(tests?|testing|quality|running tests)\b/i, required: false },
  { key: 'changelog', label: 'Changelog', synonyms: /^(changelog|changes|release notes|version history|releases)\b/i, required: false },
  { key: 'license', label: 'License', synonyms: /^(licen[cs]e|legal|copyright)\b/i, required: true },
  { key: 'contact', label: 'Contact / support', synonyms: /^(contact|support|community|help|questions|getting help|discussion|chat|reach (?:us|out)|feedback|social)\b/i, required: false },
  { key: 'project-structure', label: 'Project structure', synonyms: /^(project structure|structure|repository layout|folder (structure|layout)|directory (structure|layout)|codebase layout)\b/i, required: false },
];

/** Severity used when a required section is absent (callers may override). */
const MISSING_SEVERITY = {
  installation: 'important',
  usage: 'important',
  contributing: 'improvement',
  license: 'important',
};

export function analyzeStructure(ctx) {
  const { doc, findings } = ctx;
  const lines = doc.lines;

  /* ---------- Title ---------- */
  const headings = doc.headings;
  const h1s = headings.filter((h) => h.level === 1);
  const firstContentLine = firstMeaningfulLine(doc);

  if (h1s.length === 0 && !hasHtmlTitle(doc)) {
    // A leading logo image is a visual title — soften the finding but keep it:
    // text H1s matter for browser tabs, search results and screen readers.
    const hasLeadingLogo = doc.blocks.slice(0, 3).some(
      (b) => b.type === 'html' && /<(img|picture)\b/i.test(b.raw),
    );
    findings.push(
      finding('structure.title-missing', {
        severity: hasLeadingLogo ? 'improvement' : 'critical',
        title: hasLeadingLogo ? 'No text title (logo only)' : 'No title',
        what:
          'The document has no level-1 heading. The first heading found is ' +
          (headings.length ? `\u201c${truncate(headings[0].text, 40)}\u201d (H${headings[0].level})` : 'none at all') +
          (hasLeadingLogo ? '. A leading logo image acts as the visual title, but a text H1 also feeds browser tabs, search results and screen readers.' : '.'),
        evidence: [{ line: headings[0]?.line ?? 0, snippet: lineSnippet(lines, headings[0]?.line ?? 0), note: 'first heading' }],
      }),
    );
  } else {
    if (h1s.length > 1) {
      findings.push(
        finding('structure.multiple-h1', {
          what: `${h1s.length} level-1 headings: ${h1s.map((h) => `L${h.line + 1} \u201c${h.text}\u201d`).join(', ')}.`,
          evidence: h1s.slice(1).map((h) => ({ line: h.line, snippet: lineSnippet(lines, h.line) })),
          suggestion: 'Keep one H1 (the project name) and demote the rest to H2.',
        }),
      );
    }
    if (firstContentLine !== null && h1s[0] && h1s[0].line > firstContentLine) {
      findings.push(
        finding('structure.title-not-first', {
          what: 'The H1 appears on line ' + (h1s[0].line + 1) + ' but other content starts at line ' + (firstContentLine + 1) + '.',
          evidence: [{ line: firstContentLine, snippet: lineSnippet(lines, firstContentLine) }, { line: h1s[0].line, snippet: lineSnippet(lines, h1s[0].line) }],
        }),
      );
    }
  }

  /* ---------- Sections ---------- */
  const sections = detectSections(doc);
  ctx.sections = sections;

  // Duplicate sections: the same *heading text* appearing more than once.
  // (Different headings mapping to the same canonical section — e.g.
  // "Installation" + "Quick Start" — is a synonym hit, not a duplicate.)
  const byHeadingText = new Map();
  for (const h of headings) {
    const key = h.text.toLowerCase().replace(/[:.]$/, '');
    byHeadingText.set(key, [...(byHeadingText.get(key) ?? []), h]);
  }
  for (const [key, hs] of byHeadingText) {
    if (hs.length > 1 && key) {
      findings.push(
        finding('structure.duplicate-section', {
          title: `Duplicate section: ${hs[0].text}`,
          what: `The section heading \u201c${hs[0].text}\u201d appears ${hs.length} times in the document.`,
          evidence: hs.map((h) => ({ line: h.line, snippet: lineSnippet(lines, h.line) })),
        }),
      );
    }
  }

  /* ---------- Description (intro before first H2) ---------- */
  const intro = collectIntro(doc);
  ctx.intro = intro;
  const hasDescriptionSection = sections.some((s) => s.key === 'description');
  if (!hasDescriptionSection && intro.words < 5) {
    findings.push(
      finding('structure.description-missing', {
        what:
          intro.words === 0
            ? 'There is no text between the title and the first section heading — the document jumps straight into sections.'
            : `Only ${intro.words} word${intro.words === 1 ? '' : 's'} of introductory text appear before the first section (excluding badges and images).`,
        evidence: intro.lines.length
          ? [{ lines: [intro.lines[0], intro.lines[intro.lines.length - 1]], note: 'intro paragraph(s)' }]
          : [{ line: firstHeadingLine(doc), snippet: lineSnippet(lines, firstHeadingLine(doc)), note: 'document jumps to first heading' }],
      }),
    );
  } else if (!hasDescriptionSection && intro.words < 20) {
    findings.push(
      finding('structure.description-thin', {
        what: `The intro is only ${intro.words} words. It may not explain what the project is or who it is for.`,
        evidence: [{ lines: intro.lines, note: 'intro paragraph(s)' }],
      }),
    );
  }

  /* ---------- Missing / empty canonical sections ---------- */
  const present = new Set(sections.map((s) => s.key));
  for (const canonical of CANONICAL_SECTIONS) {
    if (present.has(canonical.key)) continue;
    if (canonical.key === 'description') continue; // handled above
    // Usage can be satisfied by Examples, and vice versa (partially).
    if (canonical.key === 'examples' && present.has('usage') && sectionHasCode(sections, 'usage')) continue;
    if (canonical.key === 'usage' && present.has('examples') && sectionHasCode(sections, 'examples')) continue;
    if (canonical.key === 'api') continue; // applicability unknown — suggested via coverage, not as a finding
    if (canonical.key === 'changelog' || canonical.key === 'contact' || canonical.key === 'architecture' || canonical.key === 'project-structure') continue; // covered by coverage matrix + friction
    if (canonical.key === 'environment') continue; // handled by consistency (env vars may not exist at all)
    if (canonical.key === 'license' && ctx.repo) continue; // consistency.js fully handles license in repo mode
    if (canonical.key === 'contributing' || canonical.key === 'testing') continue; // friction.js owns these (uses repo context)

    const usageOrExample =
      (canonical.key === 'usage' || canonical.key === 'examples') &&
      !present.has('usage') &&
      !present.has('examples');
    if (usageOrExample) {
      findings.push(
        finding('structure.usage-no-examples', {
          severity: 'critical',
          what: 'There is no Usage section and no Examples section — the README never shows how to actually use the project.',
          evidence: [{ line: lastHeadingLine(doc), snippet: lineSnippet(lines, lastHeadingLine(doc)), note: 'last heading; usage would fit near here' }],
        }),
      );
      continue;
    }
    if (canonical.key === 'examples') continue; // usage exists with code → examples optional

    findings.push(
      finding('structure.section-missing', {
        severity: MISSING_SEVERITY[canonical.key] ?? 'improvement',
        title: `Missing section: ${canonical.label}`,
        section: canonical.key,
        what: `No heading matching \u201c${canonical.label}\u201d (or common synonyms) was found.`,
        suggestion: suggestionForMissing(canonical.key, sections),
        evidence: [{ line: insertionLineFor(canonical.key, sections, doc), note: 'suggested insertion point' }],
      }),
    );
  }

  // Empty / near-empty sections (license is exempt: "## License\nMIT" is conventional)
  for (const s of sections) {
    if (s.key === 'license' || s.key === 'changelog') continue;
    if (s.words < 4 && s.codeBlocks === 0 && s.tables === 0) {
      findings.push(
        finding('structure.section-empty', {
          title: `Empty section: ${s.headingText}`,
          section: s.key,
          what: `The section \u201c${s.headingText}\u201d (line ${s.line + 1}) has ${s.words === 0 ? 'no content' : `only ${s.words} words`} and no code or tables before the next heading.`,
          evidence: [{ line: s.line, snippet: lineSnippet(lines, s.line) }, { line: s.endLine, snippet: lineSnippet(lines, s.endLine), note: 'next heading / section end' }],
        }),
      );
    }
  }

  /* ---------- Installation quality ---------- */
  const install = sections.find((s) => s.key === 'installation');
  if (install && install.codeBlocks === 0) {
    findings.push(
      finding('structure.installation-no-commands', {
        section: 'installation',
        what: `The Installation section (line ${install.line + 1}) describes setup in prose but contains no commands to copy.`,
        evidence: [{ line: install.line, snippet: lineSnippet(lines, install.line) }],
      }),
    );
  }
  if (install && install.codeBlocks > 0) {
    findings.push(
      finding('structure.section-present', {
        title: 'Installation with copy-paste commands',
        section: 'installation',
        what: `Installation section at line ${install.line + 1} includes ${install.codeBlocks} fenced command block${install.codeBlocks === 1 ? '' : 's'}.`,
        evidence: [{ line: install.line, snippet: lineSnippet(lines, install.line) }],
      }),
    );
  }

  /* ---------- Long document ---------- */
  if (lines.length > 600) {
    findings.push(
      finding('structure.long-document', {
        what: `The README is ${lines.length} lines long.`,
        evidence: [{ lines: [0, lines.length - 1] }],
      }),
    );
  }

  return sections;
}

/* ------------------------------------------------------------------ */
/* Section detection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build the section list: walk top-level blocks; a heading (level ≤ 3)
 * whose text matches a canonical synonym starts a section. Content until
 * the next same-or-higher level heading belongs to it.
 */
export function detectSections(doc) {
  const found = new Map();
  const walk = (blocks, depth = 0) => {
    for (const b of blocks) {
      if (b.type === 'heading' && b.level <= 3) {
        const text = inlineToText(b.inline ?? []).trim().replace(/[:.]$/, '');
        const canonical = CANONICAL_SECTIONS.find((c) => c.synonyms.test(text));
        if (canonical) {
          const existing = found.get(canonical.key);
          if (existing) {
            existing.occurrences++;
          } else {
            found.set(canonical.key, {
              key: canonical.key,
              label: canonical.label,
              headingText: text,
              level: b.level,
              line: b.line,
              endLine: b.line,
              words: 0,
              codeBlocks: 0,
              tables: 0,
              lists: 0,
              links: 0,
              images: 0,
              blocks: [],
              occurrences: 1,
            });
          }
        }
      } else if (b.type === 'quote' || b.type === 'list') {
        // headings inside quotes/lists don't start canonical sections; content counts
        if (b.type === 'list') {
          const sec = currentSection(found);
          if (sec) {
            sec.lists++;
            sec.words += countWords(b.raw ?? itemText(b));
          }
        } else walk(b.blocks, depth + 1);
      } else if (b.type === 'paragraph' || b.type === 'code' || b.type === 'table' || b.type === 'html') {
        const sec = currentSection(found);
        if (sec) {
          sec.blocks.push(b);
          sec.endLine = b.endLine;
          if (b.type === 'code' && !b.indented) sec.codeBlocks++;
          if (b.type === 'table') sec.tables++;
          sec.words += countWords(b.type === 'paragraph' ? inlineToText(b.inline ?? []) : b.raw ?? '');
        }
      }
    }
  };
  walk(doc.blocks);
  return [...found.values()];
}

function currentSection(found) {
  let cur = null;
  for (const s of found.values()) cur = s;
  return cur;
}

function itemText(listBlock) {
  return (listBlock.items ?? []).map((it) => it.text ?? '').join(' ');
}

export function sectionHasCode(sections, key) {
  const s = sections.find((x) => x.key === key);
  return Boolean(s && s.codeBlocks > 0);
}

/* ------------------------------------------------------------------ */
/* Intro collection                                                    */
/* ------------------------------------------------------------------ */

/** Paragraph text between the title and the first section heading (badges/images excluded). */
export function collectIntro(doc) {
  const lines = [];
  let words = 0;
  let started = false;
  for (const b of doc.blocks) {
    if (b.type === 'heading') {
      if (started) break;
      if (b.level <= 2) {
        started = true; // after title (or first heading) collect until an H2
        if (b.level === 2) break;
      }
      continue;
    }
    if (b.type === 'paragraph') {
      const text = inlineToText(b.inline ?? []).trim();
      const onlyBadges = isOnlyBadges(b);
      if (!onlyBadges && text) {
        lines.push(b.line, b.endLine);
        words += countWords(text);
      } else if (onlyBadges) {
        // badges don't count as description
      }
      continue;
    }
    if (b.type === 'html' || b.type === 'code' || b.type === 'hr' || b.type === 'table') continue;
    if (b.type === 'list' && started) {
      words += countWords(itemText(b));
      lines.push(b.line, b.endLine);
    }
  }
  return { words, lines: lines.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b) };
}

/** A paragraph that consists solely of badge images / links (common README header). */
function isOnlyBadges(paragraph) {
  const tokens = paragraph.inline ?? [];
  let badgeish = 0;
  let other = 0;
  for (const t of tokens) {
    if (t.type === 'image') badgeish++;
    else if (t.type === 'text' && !t.text.trim()) continue;
    else if (t.type === 'br') continue;
    else if (t.type === 'link') {
      // shield.io / badgen / travis style badge links containing images
      if (t.children?.some((c) => c.type === 'image')) badgeish++;
      else other++;
    } else other++;
  }
  return badgeish > 0 && other === 0;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function countWords(s) {
  return String(s ?? '').trim() ? String(s).trim().split(/\s+/).length : 0;
}

function firstMeaningfulLine(doc) {
  for (const b of doc.blocks) {
    if (b.type === 'html') continue; // comments / hidden blocks at top are common
    return b.line;
  }
  return null;
}

function firstHeadingLine(doc) {
  return doc.headings[0]?.line ?? 0;
}

function lastHeadingLine(doc) {
  const hs = doc.headings;
  return hs.length ? hs[hs.length - 1].line : 0;
}

function hasHtmlTitle(doc) {
  return doc.blocks.some((b) => b.type === 'html' && /<h1[\s>]/i.test(b.raw));
}

/** Where would this missing section best fit? After the last present section that canonically precedes it. */
export function insertionLineFor(key, sections, doc) {
  const order = CANONICAL_SECTIONS.map((c) => c.key);
  const idx = order.indexOf(key);
  let best = null;
  for (const s of sections) {
    const si = order.indexOf(s.key);
    if (si !== -1 && si < idx) best = s;
  }
  return best ? best.endLine : lastHeadingLine(doc);
}

function suggestionForMissing(key, sections) {
  switch (key) {
    case 'installation':
      return 'Add an Installation section with prerequisites and a copy-paste install command.';
    case 'usage':
      return 'Add a Usage section with at least one minimal, runnable example.';
    case 'examples':
      return 'Add an Examples section (or a usage example) — show real output, not just commands.';
    case 'configuration':
      return 'If the project has options, add a Configuration section (a table works well).';
    case 'contributing':
      return 'Add a Contributing section or a CONTRIBUTING.md — even three lines on how to submit changes helps.';
    case 'testing':
      return 'Add how to run the test suite in one command.';
    case 'license':
      return 'Add a License section naming the license and linking the LICENSE file.';
    default:
      return 'Add the missing section with concrete, copy-pasteable content.';
  }
}

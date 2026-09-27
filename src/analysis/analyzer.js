/**
 * README Doctor — analyzer orchestrator.
 *
 * analyze(markdown, {repo, sourceName}) runs every local check synchronously
 * and returns the diagnostic report plus a queue of pending network link
 * checks. The UI runs those separately (runLinkChecks) so the report
 * appears instantly and the network layer can never block diagnosis.
 */

import { parseMarkdown, collectLinks } from '../markdown/parser.js';
import { extractHtmlRefs } from '../markdown/renderer.js';
import { walkAllBlocks } from './commands.js';
import { analyzeConsistency } from './consistency.js';
import { analyzeFriction } from './friction.js';
import { analyzeStructure, CANONICAL_SECTIONS } from './structure.js';
import { finalize, summarize } from './report.js';

/**
 * @param {string} markdown
 * @param {object} [opts]
 * @param {object|null} [opts.repo] repository context from github.js (or null)
 * @param {string} [opts.sourceName] display name of the source
 */
export function analyze(markdown, opts = {}) {
  const doc = parseMarkdown(markdown);

  const ctx = {
    doc,
    lines: doc.lines,
    repo: opts.repo ?? null,
    sourceName: opts.sourceName ?? 'README',
    findings: [],
    sections: [],
    pendingLinkChecks: [],
  };

  analyzeStructure(ctx);
  analyzeConsistency(ctx);
  analyzeFriction(ctx);

  const findings = finalize(ctx.findings);
  const coverage = buildCoverage(ctx);
  const stats = buildStats(doc, ctx);

  return {
    doc,
    findings,
    coverage,
    stats,
    pendingLinkChecks: ctx.pendingLinkChecks,
    source: doc.source,
    sourceName: ctx.sourceName,
    repo: ctx.repo,
    summary: summarize(findings),
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * The coverage matrix: which canonical README sections are present,
 * partial (heading exists but thin) or absent. Factual — no scoring.
 */
export function buildCoverage(ctx) {
  const sections = ctx.sections ?? [];
  const present = new Map(sections.map((s) => [s.key, s]));
  const coverage = [];

  const alwaysRelevant = ['description', 'features', 'installation', 'usage', 'examples', 'configuration', 'environment', 'contributing', 'testing', 'license', 'contact'];
  for (const canonical of CANONICAL_SECTIONS) {
    if (!alwaysRelevant.includes(canonical.key) && canonical.key !== 'project-structure' && canonical.key !== 'api' && canonical.key !== 'architecture' && canonical.key !== 'changelog') continue;
    const sec = present.get(canonical.key);
    let status = 'absent';
    let line = null;
    if (sec) {
      status = sec.words < 4 && sec.codeBlocks === 0 && sec.tables === 0 ? 'partial' : 'present';
      line = sec.line;
    } else if (canonical.key === 'description') {
      const words = ctx.intro?.words ?? 0;
      if (words >= 30) {
        status = 'present';
      } else if (words >= 12) {
        status = 'partial';
      }
    } else if (canonical.key === 'environment') {
      const envVars = ctx.envVars;
      if (envVars && envVars.size > 0) status = 'partial';
    }
    coverage.push({ key: canonical.key, label: canonical.label, status, line });
  }
  return coverage;
}

function buildStats(doc, ctx) {
  const links = collectLinks(doc);
  const images = links.filter((l) => l.kind === 'image').length;
  let codeBlocks = 0;
  let htmlRefs = 0;
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'code') codeBlocks++;
    if (b.type === 'html' && !b.isComment) htmlRefs += extractHtmlRefs(b.raw).length;
  });
  const words = doc.source.split(/\s+/).filter(Boolean).length;
  return {
    lines: doc.lines.length,
    words,
    headings: doc.headings.length,
    codeBlocks,
    links: links.length + htmlRefs,
    images,
    sections: (ctx.sections ?? []).length,
    envVars: ctx.envVars?.size ?? 0,
    commands: ctx.commands?.length ?? 0,
  };
}

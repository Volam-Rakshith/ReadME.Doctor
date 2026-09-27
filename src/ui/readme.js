/**
 * README Doctor — README views.
 *
 * Three synchronized views over one diagnosis:
 *  - Rendered: the Markdown rendered safely, with numbered diagnostic
 *    markers attached to the blocks findings refer to.
 *  - Markdown: the original source with line numbers and per-line markers.
 *  - Coverage: the factual section-coverage matrix.
 */

import { renderMarkdown } from '../markdown/renderer.js';
import { escapeHtml } from '../util.js';

const MAX_SOURCE_LINES = 8000;

/**
 * Render all three panels.
 */
export function renderReadmeViews(analysis, { resolveAsset, onMarkerClick, onCoverageJump }) {
  renderRenderedPanel(document.getElementById('rpanel-rendered'), analysis, { resolveAsset, onMarkerClick });
  renderSourcePanel(document.getElementById('rpanel-source'), analysis, { onMarkerClick });
  renderCoveragePanel(document.getElementById('rpanel-coverage'), analysis, { onCoverageJump });
  renderStats(document.getElementById('readmeStats'), analysis);
}

/* ------------------------------------------------------------------ */
/* Rendered view                                                       */
/* ------------------------------------------------------------------ */

function renderRenderedPanel(container, analysis, { resolveAsset, onMarkerClick }) {
  container.innerHTML = renderMarkdown(analysis.doc, { resolveAsset });
  attachMarkers(container, analysis, onMarkerClick);
}

/**
 * Attach a numbered marker button to the block each finding points at.
 * Several findings on one block collapse into a count badge.
 */
export function attachMarkers(container, analysis, onMarkerClick) {
  const blockEls = [...container.querySelectorAll('[data-line]')];
  if (!blockEls.length) return;

  const targets = new Map(); // element -> findings[]
  for (const f of analysis.findings) {
    if (f.line === null || f.line === undefined) continue;
    const el = blockAtLine(blockEls, f.line);
    if (!el) continue;
    if (!targets.has(el)) targets.set(el, []);
    targets.get(el).push(f);
  }

  let n = 0;
  for (const [el, findings] of targets) {
    const worst = findings.reduce((worst, f) => (sevRank(f.severity) < sevRank(worst) ? f : worst), findings[0]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rmd-marker sev-${worst.severity}`;
    btn.dataset.findingIds = findings.map((f) => f.id).join(',');
    btn.setAttribute(
      'aria-label',
      findings.length === 1
        ? `Finding: ${findings[0].title} (${findings[0].severity})`
        : `${findings.length} findings, worst: ${worst.title} (${worst.severity})`,
    );
    btn.innerHTML = findings.length === 1 ? String(++n) : `${findings.length}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onMarkerClick?.(findings, btn);
    });
    el.appendChild(btn);
  }
}

/** The block element that contains (or most closely precedes) a source line. */
function blockAtLine(blockEls, line) {
  let best = null;
  for (const el of blockEls) {
    const l = Number(el.dataset.line);
    if (l <= line) best = el;
    else break;
  }
  return best ?? blockEls[0];
}

/* ------------------------------------------------------------------ */
/* Source view                                                         */
/* ------------------------------------------------------------------ */

function renderSourcePanel(container, analysis, { onMarkerClick }) {
  const lines = analysis.doc.lines;
  container.innerHTML = '';

  if (lines.length > MAX_SOURCE_LINES) {
    const cap = document.createElement('p');
    cap.className = 'src-caption';
    cap.textContent = `This README has ${lines.length.toLocaleString()} lines — showing the first ${MAX_SOURCE_LINES.toLocaleString()} for performance.`;
    container.appendChild(cap);
  }

  const byLine = new Map();
  for (const f of analysis.findings) {
    if (f.line === null || f.line === undefined) continue;
    if (!byLine.has(f.line)) byLine.set(f.line, []);
    byLine.get(f.line).push(f);
  }

  const frag = document.createDocumentFragment();
  const show = Math.min(lines.length, MAX_SOURCE_LINES);
  const isCodeLine = new Set();
  markCodeLines(analysis.doc, isCodeLine);
  const headingLines = new Set(analysis.doc.headings.map((h) => h.line));

  for (let i = 0; i < show; i++) {
    const row = document.createElement('div');
    row.className = 'src-line';
    row.dataset.line = i;
    if (headingLines.has(i)) row.classList.add('is-heading');
    if (isCodeLine.has(i)) row.classList.add('is-code');

    const findings = byLine.get(i);
    let dots = '';
    if (findings?.length) {
      row.classList.add('has-findings');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Line ${i + 1}: ${findings.length} finding(s). Activate to open.`);
      dots = `<span class="src-dots" aria-hidden="true">${findings
        .map((f) => `<span class="src-dot sev-${f.severity}" title="${escapeHtml(f.title)}"></span>`)
        .join('')}</span>`;
      row.addEventListener('click', () => onMarkerClick?.(findings, row));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onMarkerClick?.(findings, row);
        }
      });
    }

    row.innerHTML = `${dots}<span class="src-num">${i + 1}</span><span class="src-text"></span>`;
    row.querySelector('.src-text').textContent = lines[i] || ' ';
    frag.appendChild(row);
  }
  container.appendChild(frag);
}

function markCodeLines(doc, set) {
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'code') {
        for (let l = b.line; l <= b.endLine; l++) set.add(l);
      } else if (b.type === 'quote') walk(b.blocks);
      else if (b.type === 'list') for (const item of b.items) walk(item.blocks);
    }
  };
  walk(doc.blocks);
}

/* ------------------------------------------------------------------ */
/* Coverage view                                                       */
/* ------------------------------------------------------------------ */

function renderCoveragePanel(container, analysis, { onCoverageJump }) {
  const present = analysis.coverage.filter((c) => c.status === 'present').length;
  const partial = analysis.coverage.filter((c) => c.status === 'partial').length;
  const absent = analysis.coverage.filter((c) => c.status === 'absent').length;

  container.innerHTML = `
    <div class="coverage-head">
      <strong style="font-size:16px">Section coverage</strong>
      <p>
        A factual inventory — not a score. “Present” means a matching section with substance was found,
        “Partial” means the heading exists but is empty or thin, “Absent” means no matching heading.
        Not every project needs every section.
      </p>
    </div>
    <div class="coverage-grid"></div>
    <div class="coverage-legend">
      <span><span class="coverage-status present">✓</span> present ${present}</span>
      <span><span class="coverage-status partial">◐</span> partial ${partial}</span>
      <span><span class="coverage-status absent">—</span> absent ${absent}</span>
    </div>
  `;

  const grid = container.querySelector('.coverage-grid');
  for (const c of analysis.coverage) {
    const item = document.createElement('div');
    item.className = `coverage-item ${c.status}`;
    const icon = c.status === 'present' ? '✓' : c.status === 'partial' ? '◐' : '—';
    item.innerHTML = `
      <span class="coverage-status" aria-hidden="true">${icon}</span>
      <span>
        <span class="coverage-label">${escapeHtml(c.label)}</span>
        <span class="coverage-meta">${c.status === 'present' ? (c.line !== null ? `line ${c.line + 1}` : 'intro') : c.status === 'partial' ? 'heading exists but thin' : 'not found'}</span>
        ${c.line !== null && c.status !== 'absent' ? '<button type="button" class="coverage-jump">View section →</button>' : ''}
      </span>
    `;
    const jump = item.querySelector('.coverage-jump');
    if (jump) jump.addEventListener('click', () => onCoverageJump?.(c));
    grid.appendChild(item);
  }
}

function renderStats(el, analysis) {
  const s = analysis.stats;
  el.textContent = `${s.lines} lines · ${s.words} words · ${s.headings} headings · ${s.codeBlocks} code blocks · ${s.links} links`;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Scroll the README views to a finding and flash it.
 * Switches tab if the current one is Coverage.
 */
export function scrollToFinding(analysis, finding, { activeTab, switchTab }) {
  if (activeTab() === 'coverage') switchTab('rendered');

  if (activeTab() === 'rendered') {
    const container = document.getElementById('rpanel-rendered');
    const blockEls = [...container.querySelectorAll('[data-line]')];
    const el = finding.line !== null && finding.line !== undefined ? blockAtLine(blockEls, finding.line) : blockEls[0];
    if (el) {
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      flash(el);
    }
  } else {
    const row = document.querySelector(`#rpanel-source .src-line[data-line="${finding.line ?? 0}"]`);
    if (row) {
      row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      flash(row);
    }
  }
}

export function scrollToLine(line) {
  const container = document.getElementById('rpanel-source');
  const row = container.querySelector(`.src-line[data-line="${line}"]`);
  if (row) {
    row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    flash(row);
  }
}

function flash(el) {
  el.classList.remove('rmd-flash');
  // restart the animation
  void el.offsetWidth;
  el.classList.add('rmd-flash');
}

function sevRank(sev) {
  return { critical: 0, important: 1, improvement: 2, good: 3, unverified: 4 }[sev] ?? 5;
}

/**
 * README Doctor — report pane UI.
 * Findings list, severity filters, summary chips, and report export.
 */

import { SEVERITIES, SEVERITY_ORDER } from '../analysis/report.js';
import { escapeHtml, formatStamp, VERSION } from '../util.js';

const SEV_LABEL = {
  critical: 'Critical',
  important: 'Important',
  improvement: 'Improvement',
  good: 'Good',
  unverified: 'Unverified',
};

/**
 * Render the workbar summary chips (counts per severity).
 */
export function renderSummaryChips(container, summary, onToggleSeverity) {
  container.innerHTML = '';
  for (const sev of SEVERITY_ORDER) {
    const count = summary[sev] ?? 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'summary-chip' + (count === 0 ? ' zero' : '');
    btn.dataset.sev = sev;
    btn.setAttribute('aria-label', `${count} ${SEV_LABEL[sev]} findings — toggle filter`);
    btn.innerHTML = `<span class="count">${count}</span> ${SEV_LABEL[sev]}`;
    btn.addEventListener('click', () => onToggleSeverity(sev));
    container.appendChild(btn);
  }
}

/**
 * Render severity + category filter chips.
 */
export function renderFilters(container, { severities, categories }, onChange) {
  container.innerHTML = '';
  const group = document.createElement('div');
  group.className = 'filter-group';
  for (const sev of SEVERITY_ORDER) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.dataset.sev = sev;
    chip.setAttribute('aria-pressed', String(severities.has(sev)));
    chip.textContent = SEV_LABEL[sev];
    chip.addEventListener('click', () => onChange({ type: 'severity', value: sev }));
    group.appendChild(chip);
  }
  container.appendChild(group);
}

/**
 * Render the findings list.
 * @param {HTMLElement} container <ol class="findings">
 * @param {object} analysis result from analyze()
 * @param {Set<string>} severities enabled severity filter
 * @param {object} callbacks { onJump(finding), onToggleBody(findingId), onEvidenceLine(finding, ev) }
 */
export function renderFindings(container, analysis, severities, callbacks) {
  const findings = analysis.findings.filter((f) => severities.has(f.severity));
  container.innerHTML = '';

  if (!findings.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = '<strong>No findings match this filter.</strong>Toggle a severity chip above to see more.';
    container.appendChild(li);
    return;
  }

  let lastSeverity = null;
  for (const f of findings) {
    if (f.severity !== lastSeverity) {
      lastSeverity = f.severity;
      const header = document.createElement('li');
      header.className = 'findings-group-label';
      header.innerHTML = `<span class="sev-dot-inline" style="background:${SEVERITIES[f.severity].color}"></span>${SEV_LABEL[f.severity]} <small>(${findings.filter((x) => x.severity === f.severity).length})</small>`;
      container.appendChild(header);
    }
    container.appendChild(findingCard(f, callbacks));
  }
}

function findingCard(f, callbacks) {
  const li = document.createElement('li');
  li.className = `finding sev-${f.severity}`;
  li.dataset.findingId = f.id;
  li.setAttribute('role', 'listitem');

  const lineLabel = f.line !== null && f.line !== undefined ? `L${f.line + 1}` : '';
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'finding-head';
  head.setAttribute('aria-expanded', 'false');
  head.innerHTML = `
    <span class="sev-dot" aria-hidden="true"></span>
    <span class="finding-title-wrap">
      <span class="finding-title">${escapeHtml(f.title)}</span>
      <span class="finding-sub">
        <span class="finding-cat">${escapeHtml(f.category)}</span>
        ${lineLabel ? `<span class="finding-line">${lineLabel}</span>` : ''}
        <span class="finding-rule">${escapeHtml(f.ruleId)}</span>
      </span>
    </span>
    <svg class="finding-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  `;
  head.addEventListener('click', () => {
    const open = li.classList.toggle('open');
    head.setAttribute('aria-expanded', String(open));
    callbacks.onToggleBody?.(f.id);
  });
  li.appendChild(head);

  const body = document.createElement('div');
  body.className = 'finding-body';
  const dl = document.createElement('dl');

  const addItem = (label, html) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.innerHTML = html;
    dl.appendChild(dt);
    dl.appendChild(dd);
  };

  addItem('Detected', escapeHtml(f.what));
  addItem('Why it matters', escapeHtml(f.why));

  if (f.evidence.length) {
    const dd = document.createElement('dd');
    const wrap = document.createElement('div');
    wrap.className = 'evidence-list';
    for (const ev of f.evidence) {
      const item = document.createElement('div');
      item.className = 'evidence-item';
      let lineHtml = '';
      if (ev.line !== null && ev.line !== undefined) {
        lineHtml = `<span class="evidence-line" role="button" tabindex="0" data-ev-line="${ev.line}" title="Jump to line ${ev.line + 1}">L${ev.line + 1}</span>`;
      } else if (ev.lines) {
        lineHtml = `<span class="evidence-line">L${ev.lines[0] + 1}\u2013${ev.lines[1] + 1}</span>`;
      }
      item.innerHTML = `${lineHtml}<span>${ev.snippet ? `<code>${escapeHtml(ev.snippet)}</code>` : ''}${ev.note ? ` <span class="evidence-note">${escapeHtml(ev.note)}</span>` : ''}</span>`;
      const jumpEl = item.querySelector('[data-ev-line]');
      if (jumpEl) {
        jumpEl.addEventListener('click', () => callbacks.onEvidenceLine?.(f, Number(jumpEl.dataset.evLine)));
      }
      wrap.appendChild(item);
    }
    dd.appendChild(wrap);
    const dt = document.createElement('dt');
    dt.textContent = 'Evidence';
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  if (f.suggestion) addItem('Suggested fix', escapeHtml(f.suggestion));

  body.appendChild(dl);

  if (f.line !== null && f.line !== undefined) {
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'finding-jump';
    jump.innerHTML = `View in README <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h7M6 2.5 9.5 6 6 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    jump.addEventListener('click', () => callbacks.onJump?.(f));
    body.appendChild(jump);
  }

  li.appendChild(body);
  return li;
}

/** Open (expand) a finding card and scroll it into view. */
export function focusFinding(container, findingId, { expand = true, scroll = true } = {}) {
  const el = container.querySelector(`[data-finding-id="${findingId}"]`);
  if (!el) return null;
  container.querySelectorAll('.finding.active').forEach((x) => x.classList.remove('active'));
  el.classList.add('active');
  if (expand && !el.classList.contains('open')) {
    el.classList.add('open');
    el.querySelector('.finding-head')?.setAttribute('aria-expanded', 'true');
  }
  if (scroll) el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  return el;
}

/** Update the link-check progress bar. */
export function setLinkProgress(container, { done, total }) {
  const fill = container.querySelector('.link-progress-fill');
  const text = container.querySelector('.link-progress-text');
  if (fill) fill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  if (text) text.textContent = `Checking links ${done}/${total}`;
}

/* ------------------------------------------------------------------ */
/* Report export                                                       */
/* ------------------------------------------------------------------ */

export function reportToMarkdown(analysis) {
  const { summary } = analysis;
  const lines = [];
  lines.push('# 🩺 README Doctor — Diagnostic Report');
  lines.push('');
  lines.push(`**Source:** ${analysis.sourceName}  `);
  lines.push(`**Analyzed:** ${formatStamp(new Date(analysis.analyzedAt))}  `);
  lines.push(`**Tool:** README Doctor v${VERSION} (static analysis, no AI)`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| -------- | ----- |');
  for (const sev of ['critical', 'important', 'improvement', 'good', 'unverified']) {
    lines.push(`| ${SEV_LABEL[sev]} | ${summary[sev] ?? 0} |`);
  }
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  for (const c of analysis.coverage) {
    const icon = c.status === 'present' ? '✅' : c.status === 'partial' ? '◐' : '❌';
    lines.push(`- ${icon} ${c.label}${c.line !== null ? ` (line ${c.line + 1})` : ''}`);
  }
  lines.push('');

  const groups = {};
  for (const f of analysis.findings) (groups[f.severity] ??= []).push(f);

  const order = ['critical', 'important', 'improvement', 'good', 'unverified'];
  for (const sev of order) {
    const list = groups[sev] ?? [];
    if (!list.length) continue;
    lines.push(`## ${SEV_LABEL[sev]} (${list.length})`);
    lines.push('');
    list.forEach((f, i) => {
      lines.push(`### ${i + 1}. ${f.title} \`${f.ruleId}\``);
      lines.push('');
      lines.push(`**Detected:** ${f.what}`);
      lines.push('');
      if (f.evidence.length) {
        lines.push('**Evidence:**');
        for (const ev of f.evidence) {
          const loc = ev.line !== null && ev.line !== undefined ? ` (line ${ev.line + 1})` : ev.lines ? ` (lines ${ev.lines[0] + 1}–${ev.lines[1] + 1})` : '';
          lines.push(`- \`${ev.snippet ?? ev.note ?? ''}\`${loc}`);
        }
        lines.push('');
      }
      lines.push(`**Why it matters:** ${f.why}`);
      lines.push('');
      if (f.suggestion) {
        lines.push(`**Fix:** ${f.suggestion}`);
        lines.push('');
      }
    });
  }
  lines.push('---');
  lines.push('');
  lines.push('_Generated by [README Doctor](https://github.com/VR-Developments/readme-doctor) by VR Developments — diagnose documentation, don\u2019t blindly generate it._');
  return lines.join('\n');
}

export function reportToJson(analysis) {
  return JSON.stringify(
    {
      tool: 'README Doctor',
      vendor: 'VR Developments',
      version: VERSION,
      source: analysis.sourceName,
      analyzedAt: analysis.analyzedAt,
      summary: analysis.summary,
      stats: analysis.stats,
      coverage: analysis.coverage,
      findings: analysis.findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        rule: f.ruleId,
        category: f.category,
        title: f.title,
        detected: f.what,
        why: f.why,
        evidence: f.evidence,
        suggestion: f.suggestion,
        line: f.line,
      })),
    },
    null,
    2,
  );
}

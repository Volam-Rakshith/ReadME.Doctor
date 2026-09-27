/**
 * README Doctor — dialogs (methodology, shortcuts, export) and toast.
 */

import { RULES } from '../analysis/rules.js';
import { LINK_CHECK_BUDGET } from '../analysis/links.js';
import { escapeHtml, TAGLINE, VERSION } from '../util.js';

/* ------------------------------------------------------------------ */
/* Methodology                                                         */
/* ------------------------------------------------------------------ */

export function openMethodology() {
  const dlg = document.getElementById('dlgMethodology');
  const body = document.getElementById('methodologyBody');

  const categories = ['Structure', 'Consistency', 'Contributor friction', 'Links'];
  const sevClass = { critical: 'critical', important: 'important', improvement: 'improvement', good: 'good', unverified: 'unverified' };

  let rulesHtml = '';
  for (const cat of categories) {
    const rules = Object.entries(RULES).filter(([, r]) => r.category === cat);
    if (!rules.length) continue;
    rulesHtml += `<h3>${escapeHtml(cat)}</h3><div class="rule-group">`;
    for (const [id, rule] of rules) {
      rulesHtml += `
        <div class="rule-row">
          <span class="rule-sev ${sevClass[rule.severity]}">${rule.severity}</span>
          <span>
            <span class="rule-name">${escapeHtml(rule.title)}</span><br>
            <span class="rule-id">${escapeHtml(id)}</span>
          </span>
        </div>`;
    }
    rulesHtml += '</div>';
  }

  body.innerHTML = `
    <h2>Methodology</h2>
    <p><em>“Your README doesn't need another generator. It needs a diagnosis.”</em></p>
    <p>README Doctor performs deterministic, rule-based static analysis. There is no AI in the
    diagnosis, no quality score, and no claim without evidence: every finding cites the exact lines,
    snippets or public repository facts that triggered it.</p>

    <h3>Severities</h3>
    <div class="sev-def critical"><span class="badge">Critical</span><p>Blocks understanding, adoption or legal clarity — e.g. no description, no usage example, no license, contradictory license claims.</p></div>
    <div class="sev-def important"><span class="badge">Important</span><p>Significant friction, or a defect with direct evidence — e.g. a missing install section, a broken anchor, an <code>npm run</code> script that isn't defined, an environment variable that is never explained.</p></div>
    <div class="sev-def improvement"><span class="badge">Improvement</span><p>Polish worth doing — e.g. untagged code blocks, TODO markers, missing examples or badges, links pinned to a renamed branch.</p></div>
    <div class="sev-def good"><span class="badge">Good</span><p>Verified strengths — sections that exist and carry substance. A diagnosis should tell you what to keep, not only what to fix.</p></div>
    <div class="sev-def unverified"><span class="badge">Unverified</span><p>Something we could not verify from here (no repository context, or a server that refused to answer). Never reported as broken.</p></div>

    <h3>How checking works</h3>
    <p><strong>Local analysis (always, free):</strong> structure, anchors, environment variables, commands, stale markers and contributor friction are computed entirely in your browser from the Markdown you provide.</p>
    <p><strong>Repository cross-checks (public data only):</strong> when you give a repository URL, README Doctor reads the README, the file tree and small manifests (package.json, .env.example) through the public GitHub API — at most about 4 API requests per diagnosis — to verify referenced files, scripts, package names and licenses. It never requests any OAuth scope and cannot write anything.</p>
    <p><strong>Link checks (budgeted):</strong> at most ${LINK_CHECK_BUDGET.max} network requests per diagnosis, ${LINK_CHECK_BUDGET.concurrency} at a time, ${LINK_CHECK_BUDGET.timeoutMs / 1000}s timeout each. A CORS-visible 404/410 is “broken”; server errors, auth walls and opaque responses are “unverified”; a network failure is “unreachable”. Redirects are reported when the final URL is visible.</p>

    <h3>Privacy</h3>
    <p>Pasted or uploaded markdown is processed locally and never uploaded. Nothing you diagnose is stored — reloading the page clears everything. An optional read-only token (no scopes) is kept only in your browser and sent only to api.github.com. There is no telemetry.</p>

    <h3>Limitations (honest ones)</h3>
    <p>Section detection is heading-based and English-first. The applicability of sections like API docs or architecture depends on the project, so they appear in Coverage rather than as findings. File checks use the default branch; links pinned to other branches are flagged as fragile, not broken. In very large repositories the tree listing can be truncated by GitHub, which weakens file checks (we say so when that happens).</p>

    <h3>Rules (${Object.keys(RULES).length})</h3>
    ${rulesHtml}

    <p style="margin-top:26px;padding-top:14px;border-top:1px solid var(--border)">
      <strong>README Doctor</strong> — an open-source project by <strong>VR Developments</strong>.
      <em>${escapeHtml(TAGLINE)}</em> · v${VERSION}
    </p>
  `;
  dlg.showModal();
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                           */
/* ------------------------------------------------------------------ */

export function openShortcuts() {
  const dlg = document.getElementById('dlgShortcuts');
  document.getElementById('shortcutsBody').innerHTML = `
    <h2>Keyboard shortcuts</h2>
    <div class="shortcut-row"><span>Move between input tabs / README tabs</span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></div>
    <div class="shortcut-row"><span>Next / previous finding</span><kbd>J</kbd> <kbd>K</kbd></div>
    <div class="shortcut-row"><span>Open the focused finding</span><kbd>Enter</kbd></div>
    <div class="shortcut-row"><span>Collapse / close</span><kbd>Esc</kbd></div>
    <div class="shortcut-row"><span>This dialog</span><kbd>?</kbd></div>
    <div class="shortcut-row"><span>Methodology</span><kbd>M</kbd></div>
    <div class="shortcut-row"><span>New diagnosis</span><kbd>N</kbd></div>
  `;
  dlg.showModal();
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export function openExport(analysis, { copyReport, downloadMarkdown, downloadJson }) {
  const dlg = document.getElementById('dlgExport');
  document.getElementById('exportBody').innerHTML = `
    <h2>Export the diagnostic report</h2>
    <p>The report contains every finding with its detection, evidence, impact and suggested fix — the same content you see in the findings pane.</p>
    <div class="export-options">
      <button class="btn" id="expCopy" type="button">📋 Copy Markdown report to clipboard</button>
      <button class="btn" id="expMd" type="button">⬇ Download report.md</button>
      <button class="btn" id="expJson" type="button">⬇ Download report.json</button>
    </div>
    <p class="export-note">Downloads are generated in your browser with a Blob URL — nothing is sent anywhere.</p>
  `;
  dlg.showModal();
  dlg.querySelector('#expCopy').addEventListener('click', () => copyReport());
  dlg.querySelector('#expMd').addEventListener('click', () => downloadMarkdown());
  dlg.querySelector('#expJson').addEventListener('click', () => downloadJson());
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

let toastTimer = null;
export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

export function aboutFooter() {
  return `README Doctor v${VERSION} — ${TAGLINE}`;
}

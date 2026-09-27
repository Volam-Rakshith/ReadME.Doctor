/**
 * README Doctor — application entry point.
 * Orchestrates input → analysis → workspace, link checks, keyboard, theme.
 */

import { analyze } from './analysis/analyzer.js';
import { linkFindings, runLinkChecks, LINK_CHECK_BUDGET } from './analysis/links.js';
import { finalize, summarize } from './analysis/report.js';
import { SEVERITY_ORDER } from './analysis/report.js';
import { fetchRepoContext, GithubError } from './github.js';
import { SAMPLE_NAME, SAMPLE_README } from './sample.js';
import { escapeHtml, formatStamp, truncate, VERSION } from './util.js';
import { openExport, openMethodology, openShortcuts, toast } from './ui/dialogs.js';
import {
  focusFinding,
  renderFindings,
  renderFilters,
  renderSummaryChips,
  reportToJson,
  reportToMarkdown,
  setLinkProgress,
} from './ui/report.js';
import { renderReadmeViews, scrollToFinding, scrollToLine } from './ui/readme.js';

const $ = (id) => document.getElementById(id);

const state = {
  analysis: null,
  severities: new Set(SEVERITY_ORDER),
  activeTab: 'rendered',
  inputTab: 'repo',
  linkCheck: { running: false, done: 0, total: 0 },
  navIndex: -1,
};

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

initTheme();
bindGlobalChrome();
bindInputTabs();
bindForms();

/* ================================================================== */
/* Theme                                                               */
/* ================================================================== */

function initTheme() {
  const saved = localStorage.getItem('rmd-theme');
  if (saved) document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('rmd-theme', next);
}

/* ================================================================== */
/* Chrome                                                              */
/* ================================================================== */

function bindGlobalChrome() {
  $('btnTheme').addEventListener('click', toggleTheme);
  $('btnMethodology').addEventListener('click', openMethodology);
  $('btnShortcuts').addEventListener('click', openShortcuts);
  $('brandHome').addEventListener('click', (e) => {
    e.preventDefault();
    goHome();
  });
  $('btnNew').addEventListener('click', goHome);
  $('btnCopyReport').addEventListener('click', async () => {
    if (!state.analysis) return;
    try {
      await navigator.clipboard.writeText(reportToMarkdown(state.analysis));
      toast('Report copied to clipboard');
    } catch {
      openExportDialog();
    }
  });
  $('btnExportReport').addEventListener('click', () => openExportDialog());

  document.querySelectorAll('dialog [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  });

  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('beforeunload', () => {
    if (state.linkCheck.running) return;
  });
}

function openExportDialog() {
  if (!state.analysis) return;
  openExport(state.analysis, {
    copyReport: async () => {
      await navigator.clipboard.writeText(reportToMarkdown(state.analysis));
      toast('Report copied to clipboard');
    },
    downloadMarkdown: () => downloadFile(`${slugify(state.analysis.sourceName)}-diagnosis.md`, reportToMarkdown(state.analysis), 'text/markdown'),
    downloadJson: () => downloadFile(`${slugify(state.analysis.sourceName)}-diagnosis.json`, reportToJson(state.analysis), 'application/json'),
  });
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Downloaded ${name}`);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'readme';
}

/* ================================================================== */
/* Input tabs                                                          */
/* ================================================================== */

function bindInputTabs() {
  const tabs = [...document.querySelectorAll('.input-tab')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setInputTab(tab.dataset.panel));
    tab.addEventListener('keydown', (e) => {
      const idx = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') tabs[(idx + 1) % tabs.length].focus();
      if (e.key === 'ArrowLeft') tabs[(idx - 1 + tabs.length) % tabs.length].focus();
    });
  });
}

function setInputTab(name) {
  state.inputTab = name;
  document.querySelectorAll('.input-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.panel === name));
  });
  document.querySelectorAll('.input-panel').forEach((p) => {
    p.hidden = p.id !== `panel-${name}`;
  });
  const focusMap = { repo: 'repoInput', paste: 'pasteInput', upload: 'dropzone' };
  $(focusMap[name])?.focus();
}

/* ================================================================== */
/* Forms                                                               */
/* ================================================================== */

function bindForms() {
  $('form-repo').addEventListener('submit', async (e) => {
    e.preventDefault();
    await diagnoseRepo();
  });
  $('form-paste').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('pasteInput').value;
    if (!text.trim()) {
      showStatus('pasteStatus', 'Paste some Markdown first — or try the sample.', 'error');
      return;
    }
    diagnoseText(text, 'pasted-readme.md');
  });
  $('btnSample').addEventListener('click', () => diagnoseText(SAMPLE_README, SAMPLE_NAME));

  // Upload
  const dz = $('dropzone');
  const fi = $('fileInput');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fi.click();
    }
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
    }),
  );
  dz.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
  fi.addEventListener('change', () => {
    if (fi.files?.[0]) readFile(fi.files[0]);
  });
}

function readFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    showStatus('uploadStatus', 'That file is larger than 2 MB — is it really a README?', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => diagnoseText(String(reader.result), file.name);
  reader.onerror = () => showStatus('uploadStatus', 'Could not read that file.', 'error');
  reader.readAsText(file);
}

function showStatus(id, message, kind = 'error') {
  const el = $(id);
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle('is-progress', kind === 'progress');
}

/* ================================================================== */
/* Diagnosis flows                                                     */
/* ================================================================== */

async function diagnoseRepo() {
  const url = $('repoInput').value.trim();
  const token = $('tokenInput').value.trim() || null;
  const btn = $('repoSubmit');
  if (!url) {
    showStatus('repoStatus', 'Enter a repository URL such as https://github.com/owner/repo', 'error');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Reading repository…';
  showStatus('repoStatus', 'Fetching public repository data…', 'progress');
  try {
    const repo = await fetchRepoContext(url, {
      token,
      onProgress: (msg) => showStatus('repoStatus', msg + ' (public data, read-only)', 'progress'),
    });
    const sourceName = `${repo.owner}/${repo.repo}`;
    const result = analyze(repo.markdown, { repo, sourceName });
    enterWorkspace(result, {
      meta: `${repo.branch} · analyzed ${formatStamp()}`,
      resolveAsset: (href) => {
        const path = href.replace(/^\.\//, '').replace(/^\//, '');
        return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(repo.branch)}/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`;
      },
    });
  } catch (err) {
    const msg = err instanceof GithubError ? err.message : 'Something went wrong while reading the repository.';
    showStatus('repoStatus', msg, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Diagnose';
  }
}

function diagnoseText(markdown, name) {
  const result = analyze(markdown, { sourceName: name });
  enterWorkspace(result, { meta: `local analysis · ${formatStamp()}` });
}

/* ================================================================== */
/* Workspace                                                           */
/* ================================================================== */

function enterWorkspace(result, { meta, resolveAsset } = {}) {
  state.analysis = result;
  state.navIndex = -1;
  state.linkCheck = { running: false, done: 0, total: 0 };

  $('view-home').hidden = true;
  $('view-work').hidden = false;
  $('srcName').textContent = result.sourceName;
  $('srcMeta').textContent = meta ?? '';

  setReadmeTab('rendered');

  renderReadmeViews(result, {
    resolveAsset: resolveAsset ?? (() => null),
    onMarkerClick: (findings) => {
      focusFinding($('findingsList'), findings[0].id);
      state.navIndex = flatFindings().findIndex((f) => f.id === findings[0].id);
    },
    onCoverageJump: (c) => {
      if (c.line === null || c.line === undefined) return;
      setReadmeTab('rendered');
      const el = [...document.querySelectorAll('#rpanel-rendered [data-line]')].find((x) => Number(x.dataset.line) >= c.line);
      el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    },
  });

  refreshReport();
  window.scrollTo({ top: 0 });

  // Budgeted link checks run after the report is on screen.
  if (result.pendingLinkChecks.length) {
    runLinkCheckPhase();
  } else {
    $('linkProgress').hidden = true;
  }
}

function refreshReport() {
  const analysis = state.analysis;
  renderSummaryChips($('summaryChips'), analysis.summary, (sev) => {
    toggleSeverity(sev);
  });
  renderFilters($('reportFilters'), { severities: state.severities, categories: null }, (evt) => {
    if (evt?.type === 'severity') toggleSeverity(evt.value);
  });
  renderFindings($('findingsList'), analysis, state.severities, {
    onJump: (f) => {
      setReadmeTab(state.activeTab === 'coverage' ? 'rendered' : state.activeTab);
      scrollToFinding(analysis, f, {
        activeTab: () => state.activeTab,
        switchTab: setReadmeTab,
      });
    },
    onEvidenceLine: (f, line) => {
      setReadmeTab('source');
      scrollToLine(line);
      focusFinding($('findingsList'), f.id, { scroll: false });
    },
  });
}

function toggleSeverity(sev) {
  const all = new Set(SEVERITY_ORDER);
  if (state.severities.size === all.size) {
    // everything on → solo this one
    state.severities = new Set([sev]);
  } else if (state.severities.has(sev)) {
    state.severities.delete(sev);
    if (state.severities.size === 0) state.severities = new Set(SEVERITY_ORDER);
  } else {
    state.severities.add(sev);
    if (state.severities.size === all.size) {
      /* fine */
    }
  }
  refreshReport();
}

/* ---------- link checking phase ---------- */

async function runLinkCheckPhase() {
  const analysis = state.analysis;
  const checks = analysis.pendingLinkChecks;
  state.linkCheck = { running: true, done: 0, total: checks.length };
  const progress = $('linkProgress');
  progress.hidden = false;
  setLinkProgress(progress, { done: 0, total: checks.length });

  let results = [];
  let skipped = [];
  try {
    const outcome = await runLinkChecks(checks, {
      onProgress: (done, total) => {
        state.linkCheck.done = done;
        setLinkProgress(progress, { done, total });
      },
    });
    results = outcome.results;
    skipped = outcome.skipped;
  } catch {
    results = [];
    skipped = checks;
  }

  const newFindings = linkFindings(results, skipped, analysis.doc.lines);
  analysis.findings = finalize([...analysis.findings.filter((f) => !isNetworkFinding(f)), ...newFindings]);
  analysis.summary = summarize(analysis.findings);

  state.linkCheck.running = false;
  progress.hidden = true;
  if (state.analysis === analysis) refreshReport();
}

function isNetworkFinding(f) {
  return [
    'consistency.link-broken',
    'consistency.link-redirect',
    'consistency.link-unreachable',
    'consistency.link-not-checked',
    'consistency.links-ok',
  ].includes(f.ruleId);
}

/* ---------- readme tabs ---------- */

function setReadmeTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.readme-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.panel === name));
  });
  document.querySelectorAll('.readme-panel').forEach((p) => {
    p.hidden = p.id !== `rpanel-${name}`;
  });
  if (name === 'rendered') $('rpanel-rendered').focus?.({ preventScroll: true });
  if (name === 'source') $('rpanel-source').focus?.({ preventScroll: true });
}

function bindReadmeTabs() {
  const tabs = [...document.querySelectorAll('.readme-tab')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setReadmeTab(tab.dataset.panel));
    tab.addEventListener('keydown', (e) => {
      const idx = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') tabs[(idx + 1) % tabs.length].focus();
      if (e.key === 'ArrowLeft') tabs[(idx - 1 + tabs.length) % tabs.length].focus();
    });
  });
}
bindReadmeTabs();

/* ---------- home / reset ---------- */

function goHome() {
  state.analysis = null;
  $('view-work').hidden = true;
  $('view-home').hidden = false;
  ['repoStatus', 'pasteStatus', 'uploadStatus'].forEach((id) => ($(id).hidden = true));
  window.scrollTo({ top: 0 });
}

/* ================================================================== */
/* Keyboard                                                            */
/* ================================================================== */

function flatFindings() {
  return state.analysis?.findings.filter((f) => state.severities.has(f.severity)) ?? [];
}

function onGlobalKeydown(e) {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const anyDialogOpen = document.querySelector('dialog[open]');

  if (e.key === 'Escape' && anyDialogOpen) return; // native dialog handles it
  if (inField || anyDialogOpen) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key.toLowerCase();

  if (k === '?' || (e.shiftKey && k === '/')) {
    e.preventDefault();
    openShortcuts();
    return;
  }
  if (k === 'm') {
    e.preventDefault();
    openMethodology();
    return;
  }
  if (state.analysis) {
    if (k === 'n') {
      e.preventDefault();
      goHome();
      return;
    }
    if (k === 'j' || k === 'k') {
      e.preventDefault();
      navigateFindings(k === 'j' ? 1 : -1);
      return;
    }
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      setReadmeTab(['rendered', 'source', 'coverage'][Number(e.key) - 1]);
      return;
    }
  } else {
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      setInputTab(['repo', 'paste', 'upload'][Number(e.key) - 1]);
    }
  }
}

function navigateFindings(dir) {
  const list = flatFindings();
  if (!list.length) return;
  state.navIndex = Math.max(0, Math.min(list.length - 1, state.navIndex + dir));
  const f = list[state.navIndex];
  focusFinding($('findingsList'), f.id, { expand: true });
  scrollToFinding(state.analysis, f, {
    activeTab: () => state.activeTab,
    switchTab: setReadmeTab,
  });
}

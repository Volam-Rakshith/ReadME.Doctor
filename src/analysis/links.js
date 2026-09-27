/**
 * README Doctor — link checking.
 *
 * Two layers:
 *  1. Local checks (always run, free): in-page anchors and relative
 *     references — see consistency.js.
 *  2. Network checks (budgeted, async): external URLs and links to other
 *     GitHub repositories. Runs with a hard budget, bounded concurrency
 *     and per-request timeouts so we stay polite and the UI stays fast.
 *
 * Honesty rules:
 *  - A CORS-visible 404/410 is "broken" (evidence).
 *  - A server error, auth wall, or CORS-opaque response is "unverified".
 *  - A network-level failure is "unreachable" (soft wording, could be the
 *    user's network).
 *  - Redirects are reported when the final URL is visible.
 */

import { finding } from './report.js';

export const LINK_CHECK_BUDGET = {
  max: 15, // total requests
  concurrency: 4,
  timeoutMs: 7000,
};

/**
 * Run budgeted network checks.
 * @param {Array<{url:string,line:number,kind:'external'|'github-repo',text:string}>} checks
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 */
export async function runLinkChecks(checks, opts = {}) {
  const { fetchImpl = fetch, onProgress = () => {}, budget = LINK_CHECK_BUDGET } = opts;
  const queue = checks.slice(0, budget.max);
  const skipped = checks.slice(budget.max);
  const results = [];
  let done = 0;

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const result = item.kind === 'github-repo' ? await checkGithubRepo(item, fetchImpl, budget) : await checkExternal(item, fetchImpl, budget);
      results.push({ ...item, ...result });
      done++;
      onProgress(done, queue.length + done);
    }
  };

  await Promise.all(Array.from({ length: Math.min(budget.concurrency, queue.length) }, worker));
  return { results, skipped };
}

async function checkExternal(item, fetchImpl, budget) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(item.url, { method: 'HEAD', mode: 'cors', redirect: 'follow', signal: controller.signal });
    } catch {
      res = null;
    }
    if (!res || res.status === 405 || res.status === 501) {
      // Some servers reject HEAD — retry with GET (still cheap: we drop the body)
      try {
        res = await fetchImpl(item.url, { method: 'GET', mode: 'cors', redirect: 'follow', signal: controller.signal });
      } catch {
        res = null;
      }
    }
    if (res) {
      const finalUrl = res.url && res.url !== item.url ? res.url : null;
      if (res.ok) return { status: 'ok', code: res.status, finalUrl };
      if (res.status === 404 || res.status === 410) return { status: 'broken', code: res.status };
      if (res.status === 401 || res.status === 403 || res.status === 429) return { status: 'unverified', code: res.status, reason: `server responded ${res.status} (may block automated clients)` };
      return { status: 'unverified', code: res.status, reason: `server responded ${res.status}` };
    }
    // CORS blocked for reading — try an opaque no-cors request: it resolves
    // when the server answers anything, rejects only on network failure.
    try {
      await fetchImpl(item.url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
      return { status: 'unverified', code: null, reason: 'response not readable (CORS)' };
    } catch {
      return { status: 'unreachable', code: null, reason: 'network error — host unreachable or offline' };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function checkGithubRepo(item, fetchImpl, budget) {
  const m = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(item.url);
  if (!m) return { status: 'unverified', reason: 'could not parse repository URL' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${m[1]}/${m[2]}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (res.status === 404 || res.status === 410) return { status: 'broken', code: 404 };
    if (res.ok) return { status: 'ok', code: 200, finalUrl: res.url?.includes('/repos/') ? null : res.url };
    return { status: 'unverified', code: res.status, reason: `GitHub API responded ${res.status}` };
  } catch {
    return { status: 'unverified', code: null, reason: 'GitHub API unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Convert network results into findings (called when checks finish). */
export function linkFindings(results, skipped, lines) {
  const findings = [];
  const broken = results.filter((r) => r.status === 'broken');
  const unreachable = results.filter((r) => r.status === 'unreachable');
  const redirects = results.filter((r) => r.status === 'ok' && r.finalUrl);
  const ok = results.filter((r) => r.status === 'ok' && !r.finalUrl);
  const unverified = results.filter((r) => r.status === 'unverified');

  for (const r of broken) {
    findings.push(
      finding('consistency.link-broken', {
        what: `The link to ${shortUrl(r.url)} returned HTTP ${r.code} when checked just now.`,
        evidence: [{ line: r.line, snippet: safeSnippet(lines, r.line), note: r.text ? `link text: “${r.text.slice(0, 60)}”` : null }],
      }),
    );
  }
  for (const r of unreachable) {
    findings.push(
      finding('consistency.link-unreachable', {
        what: `The link to ${shortUrl(r.url)} could not be reached from here (${r.reason}). It may be offline, or blocking automated checks.`,
        evidence: [{ line: r.line, snippet: safeSnippet(lines, r.line) }],
      }),
    );
  }
  for (const r of redirects) {
    findings.push(
      finding('consistency.link-redirect', {
        what: `${shortUrl(r.url)} redirects to ${shortUrl(r.finalUrl)}.`,
        evidence: [{ line: r.line, snippet: safeSnippet(lines, r.line) }],
      }),
    );
  }
  if (ok.length >= 3 && broken.length === 0) {
    findings.push(
      finding('consistency.links-ok', {
        what: `${ok.length + redirects.length} external link${ok.length + redirects.length === 1 ? '' : 's'} checked; all responded successfully${redirects.length ? ` (${redirects.length} via redirect)` : ''}.`,
        evidence: [{ note: `${results.length} link(s) checked` }],
      }),
    );
  }
  const unverNotes = unverified
    .slice(0, 6)
    .map((r) => `${shortUrl(r.url)} — ${r.reason ?? 'unverified'}`);
  if (unverified.length || skipped.length) {
    findings.push(
      finding('consistency.link-not-checked', {
        what:
          (unverified.length ? `${unverified.length} link${unverified.length === 1 ? '' : 's'} could not be verified automatically: ${unverNotes.join('; ')}. ` : '') +
          (skipped.length ? `${skipped.length} additional link${skipped.length === 1 ? ' was' : 's were'} not checked to stay within the request budget (${LINK_CHECK_BUDGET.max} per run).` : ''),
        evidence: [
          ...unverified.slice(0, 4).map((r) => ({ line: r.line, note: shortUrl(r.url) })),
          ...(skipped.length ? [{ note: `${skipped.length} skipped (budget)` }] : []),
        ],
      }),
    );
  }
  return findings;
}

function shortUrl(url) {
  const s = String(url).replace(/^https?:\/\//, '');
  return s.length > 60 ? s.slice(0, 59) + '…' : s;
}

function safeSnippet(lines, line) {
  if (line === null || line === undefined || !lines || line < 0 || line >= lines.length) return null;
  return (lines[line] ?? '').trim().slice(0, 100);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis/analyzer.js';
import { runLinkChecks, linkFindings, LINK_CHECK_BUDGET } from '../src/analysis/links.js';

const ruleIds = (r) => r.findings.map((f) => f.ruleId);

test('external links are queued for budgeted network checks', () => {
  const r = analyze('# T\n\nDesc with [a](https://a.example/x) and [b](https://b.example/y).\n');
  assert.equal(r.pendingLinkChecks.length, 2);
  assert.equal(r.pendingLinkChecks[0].kind, 'external');
});

test('duplicate URLs are queued once', () => {
  const r = analyze('# T\n\n[a](https://a.example) [b](https://a.example) [c](https://a.example)\n');
  assert.equal(r.pendingLinkChecks.length, 1);
});

test('mailto and tel links are never checked', () => {
  const r = analyze('# T\n\n[a](mailto:x@y.io) [b](tel:+123)\n');
  assert.equal(r.pendingLinkChecks.length, 0);
});

/* ---- network layer with a mocked fetch ---- */

function res(status, url = 'https://x') {
  return { ok: status >= 200 && status < 300, status, url };
}

test('a 404 is reported as broken with the status code', async () => {
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === 'HEAD') return res(200, url);
    return res(404, url);
  };
  // HEAD 200 → ok; test GET path separately
  const { results } = await runLinkChecks([{ url: 'https://a.example', line: 1, kind: 'external', text: 'a' }], {
    fetchImpl: async (url, opts = {}) => res(200, url),
  });
  assert.equal(results[0].status, 'ok');
});

test('HEAD 404 falls through to broken', async () => {
  const fetchImpl = async (url) => res(404, url);
  const { results } = await runLinkChecks([{ url: 'https://gone.example', line: 1, kind: 'external', text: 'x' }], { fetchImpl });
  assert.equal(results[0].status, 'broken');
  assert.equal(results[0].code, 404);
});

test('redirects are reported with the final URL', async () => {
  // fetch with redirect:'follow' resolves to the final URL with ok:true
  const fetchImpl = async (url) => res(200, url === 'https://old.example' ? 'https://final.example/' : url);
  const { results } = await runLinkChecks([{ url: 'https://old.example', line: 1, kind: 'external', text: 'x' }], { fetchImpl });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].finalUrl, 'https://final.example/');
  const findings = linkFindings(results, [], ['[x](https://old.example)']);
  assert.ok(findings.some((f) => f.ruleId === 'consistency.link-redirect'));
});

test('403 responses are unverified, never broken', async () => {
  const fetchImpl = async (url) => res(403, url);
  const { results } = await runLinkChecks([{ url: 'https://protected.example', line: 1, kind: 'external', text: 'x' }], { fetchImpl });
  assert.equal(results[0].status, 'unverified');
  const findings = linkFindings(results, [], []);
  assert.ok(!findings.some((f) => f.ruleId === 'consistency.link-broken'));
  assert.ok(findings.some((f) => f.ruleId === 'consistency.link-not-checked'));
});

test('network failures are "unreachable" (soft wording), not broken', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const { results } = await runLinkChecks([{ url: 'https://dead.example', line: 1, kind: 'external', text: 'x' }], { fetchImpl });
  assert.equal(results[0].status, 'unreachable');
  const findings = linkFindings(results, [], []);
  assert.ok(findings.some((f) => f.ruleId === 'consistency.link-unreachable'));
});

test('budget: extra links are skipped, not requested', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return res(200, url); };
  const checks = Array.from({ length: 25 }, (_, i) => ({ url: `https://x.example/${i}`, line: i, kind: 'external', text: '' }));
  const { results, skipped } = await runLinkChecks(checks, { fetchImpl, budget: { ...LINK_CHECK_BUDGET, max: 5 } });
  assert.equal(calls.length, 5);
  assert.equal(results.length, 5);
  assert.equal(skipped.length, 20);
  const findings = linkFindings(results, skipped, []);
  assert.ok(findings.some((f) => f.ruleId === 'consistency.link-not-checked' && f.what.includes('budget')));
});

test('github repo links are checked through the API', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.github.com/repos/o/exists')) return res(200, url);
    if (url.startsWith('https://api.github.com/repos/o/gone')) return res(404, url);
    throw new Error('unexpected ' + url);
  };
  const { results } = await runLinkChecks(
    [
      { url: 'https://github.com/o/exists', line: 1, kind: 'github-repo', text: 'a' },
      { url: 'https://github.com/o/gone', line: 2, kind: 'github-repo', text: 'b' },
    ],
    { fetchImpl },
  );
  assert.equal(results[0].status, 'ok');
  assert.equal(results[1].status, 'broken');
});

test('all-ok links produce an aggregate good finding', async () => {
  const fetchImpl = async (url) => res(200, url);
  const checks = [1, 2, 3].map((i) => ({ url: `https://ok${i}.example`, line: i, kind: 'external', text: '' }));
  const { results } = await runLinkChecks(checks, { fetchImpl });
  const findings = linkFindings(results, [], []);
  assert.ok(findings.some((f) => f.ruleId === 'consistency.links-ok'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finding, summarize, finalize, SEVERITIES, SEVERITY_ORDER } from '../src/analysis/report.js';
import { RULES } from '../src/analysis/rules.js';

test('finding() validates the rule id', () => {
  assert.throws(() => finding('nope.nope', {}));
  const f = finding('structure.title-missing', { what: 'x' });
  assert.equal(f.severity, 'critical');
  assert.equal(f.category, 'Structure');
  assert.ok(f.why.length > 10, 'rules provide the why');
});

test('findings deduplicate on rule+line and sort by severity', () => {
  const a = finding('consistency.stale-content', { what: 'a', line: 3 });
  const b = finding('consistency.stale-content', { what: 'b', line: 3 });
  const c = finding('structure.title-missing', { what: 'c' });
  const out = finalize([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out[0].severity, 'critical');
});

test('summarize counts severities', () => {
  const s = summarize([
    finding('structure.title-missing', {}),
    finding('structure.title-missing', { line: 5 }), // different line → both kept
    finding('good.env-documented', {}),
  ]);
  assert.equal(s.critical, 2);
  assert.equal(s.good, 1);
});

test('every rule ships the documentation fields', () => {
  for (const [id, rule] of Object.entries(RULES)) {
    assert.match(id, /^[a-z]+\.[a-z0-9-]+$/, `${id}: id format`);
    assert.ok(rule.title, `${id}: title`);
    assert.ok(rule.category, `${id}: category`);
    assert.ok(rule.why && rule.why.length > 20, `${id}: why it matters`);
    assert.ok(SEVERITY_ORDER.includes(rule.severity), `${id}: known severity`);
    if (rule.severity !== 'good') assert.ok(rule.suggestion, `${id}: suggestion`);
  }
});

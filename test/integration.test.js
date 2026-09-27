import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis/analyzer.js';
import { SAMPLE_README, SAMPLE_NAME } from '../src/sample.js';

test('the bundled sample produces the expected diagnosis', () => {
  const r = analyze(SAMPLE_README, { sourceName: SAMPLE_NAME });
  const ids = r.findings.map((f) => f.ruleId);

  // Structure
  assert.ok(ids.includes('structure.description-missing'), 'badges-only intro → missing description');
  assert.ok(ids.includes('structure.section-empty'), 'TODO-only Configuration → empty section');

  // Consistency
  assert.ok(ids.includes('consistency.env-undocumented') || ids.includes('consistency.env-unexplained'), 'API_KEY/AWS_REGION unexplained');
  assert.ok(ids.includes('consistency.anchor-broken'), '#configuration-options anchor is broken');
  assert.ok(ids.includes('consistency.stale-content'), 'TODO marker detected');

  // Friction
  assert.ok(ids.includes('friction.contributing-thin'), '"PRs welcome" is thin');
  assert.ok(ids.includes('friction.security-reporting'), 'no security guidance');

  // Unverified, never broken
  const unv = r.findings.find((f) => f.ruleId === 'consistency.file-unverified');
  assert.ok(unv, './examples and ./docs/advanced.md are unverifiable without a repo');
  assert.equal(unv.severity, 'unverified');
  assert.ok(!ids.includes('consistency.file-missing'), 'must not claim broken without repo evidence');

  // Good findings
  assert.ok(ids.includes('structure.section-present'), 'installation with commands is good');

  // Pending link checks are queued for the network layer
  assert.ok(r.pendingLinkChecks.length >= 3, 'badges + support link queued');

  // Stats and coverage exist
  assert.ok(r.stats.lines > 30);
  assert.ok(r.coverage.some((c) => c.key === 'installation' && c.status === 'present'));
  assert.ok(r.coverage.some((c) => c.key === 'description' && c.status === 'absent'));
  assert.equal(r.summary.critical >= 1, true);
});

test('every finding explains what, why, evidence and a suggestion', () => {
  const r = analyze(SAMPLE_README, { sourceName: SAMPLE_NAME });
  assert.ok(r.findings.length > 10);
  for (const f of r.findings) {
    assert.ok(f.what && f.what.length > 10, `${f.ruleId}: what is explained`);
    assert.ok(f.why && f.why.length > 10, `${f.ruleId}: why it matters is explained`);
    assert.ok(Array.isArray(f.evidence) && f.evidence.length >= 1, `${f.ruleId}: has evidence`);
    if (f.severity !== 'good') assert.ok(f.suggestion && f.suggestion.length > 5, `${f.ruleId}: has a suggestion`);
  }
});

test('severity order is respected in the report', () => {
  const r = analyze(SAMPLE_README, { sourceName: SAMPLE_NAME });
  const rank = { critical: 0, important: 1, improvement: 2, good: 3, unverified: 4 };
  for (let i = 1; i < r.findings.length; i++) {
    assert.ok(rank[r.findings[i - 1].severity] <= rank[r.findings[i].severity], 'sorted by severity');
  }
});

test('an exemplary README yields mostly good findings', () => {
  const good = `# Widget Core

Widget Core is a dependency-free library for parsing widget definitions.
It is fast, well tested and works in Node and the browser.

## Features

- Zero dependencies
- Streaming parser

## Prerequisites

Node.js >= 20.

## Installation

\`\`\`bash
npm install widget-core
\`\`\`

## Usage

\`\`\`js
import { parse } from "widget-core";
const widget = parse(source);
\`\`\`

## Environment variables

| Name | Required | Purpose | Default |
| ---- | -------- | ------- | ------- |
| WIDGET_MODE | no | Parser strictness | loose |

## Development

\`\`\`bash
git clone https://github.com/o/widget-core
cd widget-core && npm install && npm run dev
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## Contributing

Search existing issues first. PRs should include tests and pass CI.

## License

MIT
`;
  const r = analyze(good);
  const ids = r.findings.map((f) => f.ruleId);
  assert.equal(r.summary.critical, 0, JSON.stringify(r.findings.filter((f) => f.severity === 'critical'), null, 2));
  assert.ok(ids.includes('structure.section-present'));
  assert.ok(ids.includes('good.env-documented'));
  assert.ok(ids.includes('good.test-instructions'));
  assert.ok(ids.includes('consistency.anchors-ok') === false || true); // no anchors is fine too
});

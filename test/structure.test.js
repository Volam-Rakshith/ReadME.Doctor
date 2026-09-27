import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis/analyzer.js';
import { detectSections } from '../src/analysis/structure.js';
import { parseMarkdown } from '../src/markdown/parser.js';

const ruleIds = (result) => result.findings.map((f) => f.ruleId);

test('missing H1 is critical', () => {
  const r = analyze('## Only an H2\n\nSome text about the thing.');
  assert.ok(ruleIds(r).includes('structure.title-missing'));
  assert.equal(r.findings.find((f) => f.ruleId === 'structure.title-missing').severity, 'critical');
});

test('multiple H1s are flagged', () => {
  const r = analyze('# One\n\ntext\n\n# Two\n\nmore');
  assert.ok(ruleIds(r).includes('structure.multiple-h1'));
});

test('badge-only intro counts as missing description', () => {
  const r = analyze('# Proj\n\n[![CI](https://img.shields.io/badge/ok)](https://ci)\n\n## Install\n\n```bash\nnpm i x\n```');
  const f = r.findings.find((x) => x.ruleId === 'structure.description-missing');
  assert.ok(f);
  assert.equal(f.severity, 'critical');
});

test('a real description avoids the finding', () => {
  const r = analyze(
    '# Proj\n\nProj is a fast linter for documentation files. It finds broken references and stale sections in Markdown.',
  );
  assert.ok(!ruleIds(r).includes('structure.description-missing'));
});

test('section synonyms are detected', () => {
  const doc = parseMarkdown(
    '# P\n\ndesc\n\n## Getting Started\n\nx\n\n## How to Use\n\ny\n\n## Licence\n\nMIT\n\n## Pull Requests\n\nz\n',
  );
  const keys = detectSections(doc).map((s) => s.key);
  assert.ok(keys.includes('installation')); // Getting Started
  assert.ok(keys.includes('usage')); // How to Use
  assert.ok(keys.includes('license')); // Licence
  assert.ok(keys.includes('contributing')); // Pull Requests
});

test('missing installation and usage are reported', () => {
  const r = analyze('# P\n\nA thing that does stuff for people who need it.');
  assert.ok(ruleIds(r).includes('structure.section-missing'));
  const missing = r.findings.filter((f) => f.ruleId === 'structure.section-missing').map((f) => f.meta || f.section || f.title);
  assert.ok(r.findings.some((f) => f.ruleId === 'structure.section-missing' && /Installation/.test(f.title)));
});

test('no usage and no examples is critical', () => {
  const r = analyze(
    '# P\n\nA thing.\n\n## Installation\n\n```bash\nnpm i p\n```\n\n## License\n\nMIT\n',
  );
  const f = r.findings.find((x) => x.ruleId === 'structure.usage-no-examples');
  assert.ok(f);
  assert.equal(f.severity, 'critical');
});

test('usage with a code example satisfies the requirement', () => {
  const r = analyze(
    '# P\n\nA thing.\n\n## Installation\n\n```bash\nnpm i p\n```\n\n## Usage\n\n```js\nimport p from "p";\n```\n\n## License\n\nMIT\n',
  );
  assert.ok(!ruleIds(r).includes('structure.usage-no-examples'));
});

test('empty section is flagged as important', () => {
  const r = analyze('# P\n\nA thing that helps.\n\n## Configuration\n\n## Usage\n\nrun it');
  const f = r.findings.find((x) => x.ruleId === 'structure.section-empty');
  assert.ok(f);
  assert.equal(f.severity, 'important');
});

test('installation without commands is flagged', () => {
  const r = analyze('# P\n\nA thing.\n\n## Installation\n\nJust download it and unpack it somewhere.\n\n## Usage\n\n```bash\np run\n```\n');
  assert.ok(ruleIds(r).includes('structure.installation-no-commands'));
});

test('installation with commands earns a good finding', () => {
  const r = analyze('# P\n\nA thing.\n\n## Installation\n\n```bash\nnpm i p\n```\n');
  const f = r.findings.find((x) => x.ruleId === 'structure.section-present');
  assert.ok(f);
  assert.equal(f.severity, 'good');
});

test('findings are sorted by severity then line', () => {
  const r = analyze('# P\n\n## Configuration\n\nTODO\n\n## Usage\n\nx');
  const ranks = r.findings.map((f) => ({ critical: 0, important: 1, improvement: 2, good: 3, unverified: 4 }[f.severity]));
  const sorted = [...ranks].sort((a, b) => a - b);
  assert.deepEqual(ranks, sorted);
});

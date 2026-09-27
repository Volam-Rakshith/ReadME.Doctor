import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis/analyzer.js';

const ruleIds = (r) => r.findings.map((f) => f.ruleId);

function repoCtx(overrides = {}) {
  return {
    owner: 'o',
    repo: 'r',
    branch: 'main',
    tree: new Set(['package.json', 'src/index.js', 'LICENSE']),
    treeLower: new Map(),
    ...overrides,
  };
}

test('missing development instructions are important with repo context', () => {
  const r = analyze('# T\n\nDesc\n\n## Usage\n\n```bash\ncli run\n```\n', { repo: repoCtx() });
  const f = r.findings.find((x) => x.ruleId === 'friction.dev-setup-missing');
  assert.ok(f);
  assert.equal(f.severity, 'important');
});

test('development commands satisfy the check', () => {
  const r = analyze(
    '# T\n\nDesc\n\n## Development\n\n```bash\ngit clone https://github.com/o/r\ncd r\nnpm install\nnpm run dev\n```\n',
    { repo: repoCtx() },
  );
  assert.ok(!ruleIds(r).includes('friction.dev-setup-missing'));
});

test('test infra in repo without README instructions is important', () => {
  const r = analyze('# T\n\nDesc\n\n## Usage\n\n```bash\ncli run\n```\n', {
    repo: repoCtx({ tree: new Set(['package.json', 'test/app.test.js', 'LICENSE']), packageJson: { scripts: { test: 'vitest' } } }),
  });
  const f = r.findings.find((x) => x.ruleId === 'friction.tests-undocumented');
  assert.ok(f);
  assert.equal(f.severity, 'important');
});

test('documented tests earn a good finding', () => {
  const r = analyze('# T\n\nDesc\n\n## Testing\n\n```bash\nnpm test\n```\n', { repo: repoCtx() });
  assert.ok(ruleIds(r).includes('good.test-instructions'));
});

test('CONTRIBUTING file in repo is recognised', () => {
  const r = analyze('# T\n\nDesc\n\n', { repo: repoCtx({ tree: new Set(['package.json', '.github/contributing.md']) }) });
  assert.ok(ruleIds(r).includes('good.contributing-file'));
});

test('issue/PR expectations notice is enough', () => {
  const r = analyze(
    '# T\n\nDesc\n\n## Contributing\n\nPlease search existing issues before opening a new one, and include a minimal reproduction.\n',
  );
  assert.ok(!ruleIds(r).includes('friction.issue-expectations'));
});

test('security guidance in README satisfies the check', () => {
  const r = analyze('# T\n\nDesc\n\n## Security\n\nReport a vulnerability to security@example.com.\n');
  assert.ok(!ruleIds(r).includes('friction.security-reporting'));
});

test('CI workflows without a badge are flagged', () => {
  const r = analyze('# T\n\nDesc\n\n', {
    repo: repoCtx({ tree: new Set(['package.json', '.github/workflows/ci.yml', 'LICENSE']) }),
  });
  assert.ok(ruleIds(r).includes('friction.ci-status-missing'));
});

test('CI badge shown earns a good finding', () => {
  const r = analyze(
    '# T\n\n[![CI](https://img.shields.io/github/actions/workflow/o/r/ci.yml)](https://github.com/o/r)\n\nDesc\n',
    { repo: repoCtx({ tree: new Set(['package.json', '.github/workflows/ci.yml', 'LICENSE']) }) },
  );
  assert.ok(ruleIds(r).includes('good.ci-visible'));
});

test('large unexplained repo layout is flagged', () => {
  const r = analyze('# T\n\nDesc\n\n', {
    repo: repoCtx({ tree: new Set(['package.json', 'src/a.js', 'docs/x.md', 'test/t.js', 'scripts/s.sh', 'LICENSE']) }),
  });
  assert.ok(ruleIds(r).includes('friction.structure-undocumented'));
});

test('prerequisites are detected from version mentions', () => {
  const r = analyze('# T\n\nRequires Node 20+.\n\n## Installation\n\n```bash\nnpm i x\n```\n');
  assert.ok(!ruleIds(r).includes('friction.prerequisites-unclear'));
});

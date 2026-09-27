import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis/analyzer.js';

const ruleIds = (r) => r.findings.map((f) => f.ruleId);

/* ---------------- anchors ---------------- */

test('broken anchors are detected with evidence', () => {
  const r = analyze('# T\n\nSee [options](#options) for details.');
  const f = r.findings.find((x) => x.ruleId === 'consistency.anchor-broken');
  assert.ok(f);
  assert.equal(f.severity, 'important');
  assert.ok(f.evidence.some((e) => e.line === 2));
});

test('valid anchors pass and earn a good finding', () => {
  const r = analyze('# T\n\nSee [options](#options).\n\n## Options\n\nAll options.');
  assert.ok(!ruleIds(r).includes('consistency.anchor-broken'));
  assert.ok(ruleIds(r).includes('consistency.anchors-ok'));
});

test('anchor matching is case-sensitive like GitHub', () => {
  const r = analyze('# T\n\nSee [x](#Options).\n\n## options\n\nAll options.');
  assert.ok(ruleIds(r).includes('consistency.anchor-broken'));
});

/* ---------------- env vars ---------------- */

test('env vars used in commands but never documented', () => {
  const r = analyze(
    '# T\n\ndesc text here\n\n## Usage\n\n```bash\nexport API_KEY=abc\nexport REGION=eu\ncli run\n```\n',
  );
  const f = r.findings.find((x) => x.ruleId === 'consistency.env-undocumented');
  assert.ok(f);
  assert.ok(f.what.includes('API_KEY'));
  assert.ok(f.what.includes('REGION'));
});

test('env vars documented in a table are fine', () => {
  const r = analyze(
    `# T\n\nDesc\n\n## Environment variables\n\n| Name | Required | Purpose |\n| ---- | -------- | ------- |\n| API_KEY | yes | Service key |\n| REGION | no | Deployment region |\n\n## Usage\n\n\`\`\`bash\nexport API_KEY=abc\ncli run\n\`\`\`\n`,
  );
  assert.ok(!ruleIds(r).includes('consistency.env-undocumented'));
  assert.ok(!ruleIds(r).includes('consistency.env-unexplained'));
  assert.ok(ruleIds(r).includes('good.env-documented'));
});

test('process.env and os.environ mentions are detected', () => {
  const r = analyze(
    '# T\n\nDesc\n\n## Usage\n\n```js\nconst k = process.env.SECRET_TOKEN;\n```\n\n```python\nv = os.environ["PRIVATE_KEY"]\n```\n',
  );
  assert.ok(ruleIds(r).includes('consistency.env-undocumented'));
});

test('.env.example mismatch is detected with repo context', () => {
  const r = analyze(
    '# T\n\nDesc\n\n## Usage\n\n```bash\nexport API_KEY=abc\ncli run\n```\n',
    {
      repo: {
        owner: 'o', repo: 'r', branch: 'main', tree: new Set(['.env.example']), treeLower: new Map(),
        envExample: 'API_KEY=abc\nEXTRA_VAR=1\n',
      },
    },
  );
  assert.ok(ruleIds(r).includes('consistency.env-example-mismatch'));
});

/* ---------------- commands vs manifests ---------------- */

function repoCtx(overrides = {}) {
  return {
    owner: 'o',
    repo: 'r',
    branch: 'main',
    tree: new Set(['package.json', 'src/index.js', 'LICENSE']),
    treeLower: new Map([['package.json', 'package.json'], ['license', 'LICENSE']]),
    ...overrides,
  };
}

test('npm run of a missing script is flagged', () => {
  const pkg = { name: 'r', scripts: { start: 'node .', test: 'node --test' } };
  const r = analyze('# T\n\nDesc\n\n## Usage\n\n```bash\nnpm run build\n```\n', { repo: repoCtx({ packageJson: pkg }) });
  const f = r.findings.find((x) => x.ruleId === 'consistency.script-missing');
  assert.ok(f);
  assert.ok(f.what.includes('build'));
});

test('npm run of an existing script passes', () => {
  const pkg = { name: 'r', scripts: { build: 'vite build' } };
  const r = analyze('# T\n\nDesc\n\n```bash\nnpm run build\n```\n', { repo: repoCtx({ packageJson: pkg }) });
  assert.ok(!ruleIds(r).includes('consistency.script-missing'));
});

test('install command with the wrong package name is flagged', () => {
  const pkg = { name: 'real-package', scripts: {} };
  const r = analyze('# T\n\nDesc\n\n```bash\nnpm install wrong-package\n```\n', { repo: repoCtx({ packageJson: pkg }) });
  const f = r.findings.find((x) => x.ruleId === 'consistency.package-name-mismatch');
  assert.ok(f);
  assert.ok(f.evidence.some((e) => e.line !== null), 'evidence carries the command line');
});

test('companion tool packages sharing the project name are not flagged', () => {
  const pkg = { name: 'express', scripts: { test: 'mocha' } };
  const r = analyze(
    '# T\n\nDesc\n\n```bash\nnpm install express\nnpx express-generator@4 myapp\n```\n',
    { repo: repoCtx({ packageJson: pkg }) },
  );
  assert.ok(!ruleIds(r).includes('consistency.package-name-mismatch'));
});

test('bare npm start is not checked (tutorial READMEs refer to the reader\'s app)', () => {
  const pkg = { name: 'express', scripts: { test: 'mocha' } };
  const r = analyze('# T\n\nDesc\n\n```bash\nnpm start\n```\n', { repo: repoCtx({ packageJson: pkg }) });
  assert.ok(!ruleIds(r).includes('consistency.script-missing'));
});

test('a short License section is conventional and not "empty"', () => {
  const r = analyze('# T\n\nDesc\n\n## License\n\n[MIT](LICENSE)\n');
  assert.ok(!ruleIds(r).includes('structure.section-empty'));
});

test('toolchain mismatch: npm commands but no package.json', () => {
  const r = analyze('# T\n\nDesc\n\n```bash\nnpm install foo\n```\n', {
    repo: repoCtx({ tree: new Set(['src/index.js']), treeLower: new Map() }),
  });
  assert.ok(ruleIds(r).includes('consistency.toolchain-mismatch'));
});

test('toolchain mismatch: pip install but no requirements file', () => {
  const r = analyze('# T\n\nDesc\n\n```bash\npip install foo\n```\n', { repo: repoCtx({ tree: new Set(['foo.py']), treeLower: new Map() }) });
  assert.ok(ruleIds(r).includes('consistency.toolchain-mismatch'));
});

test('node version claim conflicting with engines is flagged', () => {
  const pkg = { name: 'r', engines: { node: '>=20' }, scripts: {} };
  const r = analyze('# T\n\nRequires Node 16.\n\n```bash\nnpm run dev\n```\n', { repo: repoCtx({ packageJson: pkg }) });
  assert.ok(ruleIds(r).includes('consistency.node-version-mismatch'));
});

/* ---------------- files & images ---------------- */

/** Build a realistic repo context: tree + case-insensitive lookup map. */
function mkRepo(paths, overrides = {}) {
  const tree = new Set(paths);
  const treeLower = new Map([...tree].map((p) => [p.toLowerCase(), p]));
  return { owner: 'o', repo: 'r', branch: 'main', tree, treeLower, ...overrides };
}

test('missing repo file reference has evidence', () => {
  const r = analyze('# T\n\nDesc\n\nSee [guide](docs/guide.md).\n', { repo: mkRepo(['package.json', 'README.md']) });
  const f = r.findings.find((x) => x.ruleId === 'consistency.file-missing');
  assert.ok(f);
  assert.equal(f.severity, 'important');
  assert.ok(f.what.includes('docs/guide.md'));
});

test('case mismatch between link and tree is detected', () => {
  const r = analyze('# T\n\nDesc\n\nSee [readme](Readme.md).\n', { repo: mkRepo(['package.json', 'README.md']) });
  const f = r.findings.find((x) => x.ruleId === 'consistency.file-case-mismatch');
  assert.ok(f);
  assert.ok(f.what.includes('README.md') || f.suggestion.includes('README.md'));
});

test('directory references validate against the tree', () => {
  const r = analyze('# T\n\nDesc\n\nSee [examples](examples/).\n', {
    repo: mkRepo(['examples/a.js', 'examples/b.js']),
  });
  assert.ok(!ruleIds(r).includes('consistency.file-missing'));
});

test('same-repo blob links resolve through the tree', () => {
  const r = analyze('# T\n\nDesc\n\nSee [file](https://github.com/o/r/blob/main/src/index.js).\n', { repo: repoCtx() });
  assert.ok(!ruleIds(r).includes('consistency.file-missing'));
});

test('blob link pinned to a non-default branch is flagged, not claimed broken', () => {
  const r = analyze('# T\n\nDesc\n\nSee [file](https://github.com/o/r/blob/master/src/index.js).\n', { repo: repoCtx() });
  const f = r.findings.find((x) => x.ruleId === 'consistency.branch-mismatch');
  assert.ok(f);
  assert.equal(f.severity, 'improvement');
});

test('relative references without repo context are unverified, never broken', () => {
  const r = analyze('# T\n\nDesc\n\nSee [guide](docs/guide.md) and ![img](img/a.png).\n');
  assert.ok(!ruleIds(r).includes('consistency.file-missing'));
  const unv = r.findings.find((x) => x.ruleId === 'consistency.file-unverified');
  assert.ok(unv);
  assert.equal(unv.severity, 'unverified');
});

/* ---------------- license ---------------- */

test('license mismatch between README and repo is critical', () => {
  const r = analyze('# T\n\nDesc\n\n## License\n\nMIT\n', { repo: repoCtx({ license: 'Apache-2.0' }) });
  const f = r.findings.find((x) => x.ruleId === 'consistency.license-mismatch');
  assert.ok(f);
  assert.equal(f.severity, 'critical');
});

test('no license anywhere is critical in repo mode', () => {
  const r = analyze('# T\n\nDesc\n\nno license mention\n', {
    repo: repoCtx({ license: null, tree: new Set(['src/a.js']), treeLower: new Map() }),
  });
  const f = r.findings.find((x) => x.ruleId === 'consistency.license-missing');
  assert.ok(f);
  assert.equal(f.severity, 'critical');
});

test('consistent license earns a good finding', () => {
  const r = analyze('# T\n\nDesc\n\n## License\n\nMIT\n', { repo: repoCtx({ license: 'MIT' }) });
  assert.ok(ruleIds(r).includes('good.license-consistent'));
});

/* ---------------- stale content & misc ---------------- */

test('TODO markers are reported as stale', () => {
  const r = analyze('# T\n\nDesc\n\n## Configuration\n\nTODO: document this\n');
  assert.ok(ruleIds(r).includes('consistency.stale-content'));
});

test('many stale markers escalate to important', () => {
  const r = analyze('# T\n\nDesc\n\nTODO one\n\nFIXME two\n\nWIP three\n\nTBD four\n');
  const f = r.findings.find((x) => x.ruleId === 'consistency.stale-content');
  assert.equal(f.severity, 'important');
});

test('duplicate headings are flagged', () => {
  const r = analyze('# T\n\nDesc\n\n## Setup\n\nx\n\n## Setup\n\ny\n');
  assert.ok(ruleIds(r).includes('consistency.duplicate-heading'));
});

test('untagged code blocks are noted', () => {
  const r = analyze('# T\n\nDesc\n\n```\nls -la\n```\n\n```\ncat x\n```\n');
  assert.ok(ruleIds(r).includes('consistency.code-no-language'));
});

test('images without alt text are flagged', () => {
  const r = analyze('# T\n\nDesc\n\n![](img/a.png)\n');
  assert.ok(ruleIds(r).includes('consistency.image-no-alt'));
});

test('stale markers inside URLs are not flagged', () => {
  const r = analyze('# T\n\nDesc\n\nSee [docs](https://example.com/todo-list).\n');
  assert.ok(!ruleIds(r).includes('consistency.stale-content'));
});

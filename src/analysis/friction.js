/**
 * README Doctor — contributor friction analysis.
 *
 * Everything that makes it harder for a new contributor to go from
 * "I want to help" to "my PR is open": prerequisites, local setup,
 * tests, contribution conventions, project layout, security reporting.
 */

import { inlineToText } from '../markdown/parser.js';
import { finding, lineSnippet } from './report.js';

const RUNTIME_VERSION_RE = /\b(node(?:\.?js)?\s*v?\d+|python\s*v?\d+(?:\.\d+)?|ruby\s*v?\d|go\s*1\.\d+|rust\s*\d|java\s*\d+|\.net\s*\d|\bdeno\s*v?\d|\bbun\s*v?\d)\b/i;
const PREREQ_HINT_RE = /(prerequisite|requirement|you (?:will )?need|requires?|make sure (?:you )?have|before you (?:start|begin))/i;
const TEST_INFRA_FILES = [
  'jest.config.js', 'jest.config.mjs', 'jest.config.cjs', 'vitest.config.js', 'vitest.config.mjs',
  'vitest.config.ts', 'karma.conf.js', 'pytest.ini', 'tox.ini', 'phpunit.xml', '.mocharc.yml',
  '.mocharc.json', 'pytest.ini', 'Cargo.toml', 'go.mod', 'Makefile',
];
const TEST_DIR_RE = /^(test|tests|spec|specs|__tests__|e2e)\//;

export function analyzeFriction(ctx) {
  const { doc, findings, lines, repo } = ctx;
  const sections = ctx.sections ?? [];
  const get = (key) => sections.find((s) => s.key === key);

  /* ---------- Prerequisites ---------- */
  const install = get('installation');
  const introText = collectAllProse(doc);
  const hasVersionPin = RUNTIME_VERSION_RE.test(install ? sectionText(install) : '') || RUNTIME_VERSION_RE.test(introText);
  const hasPrereqHeading = sections.some((s) => /^(prerequisites?|requirements)$/i.test(s.headingText));
  if (install && !hasVersionPin && !hasPrereqHeading) {
    const isCodeProject = (ctx.commands?.length ?? 0) > 0 || Boolean(repo?.packageJson) || codeBlocks(doc) > 0;
    if (isCodeProject) {
      findings.push(
        finding('friction.prerequisites-unclear', {
          what: 'The Installation section does not mention which runtime (and version) is required before installing.',
          evidence: [{ line: install.line, snippet: lineSnippet(lines, install.line) }],
        }),
      );
    }
  }

  /* ---------- Local development setup ---------- */
  const dev = get('contributing'); // "Development" headings map here too
  const hasDevCommands =
    dev && sectionText(dev).match(/\b(clone|npm install|npm ci|yarn|pnpm|pip install|cargo build|go build|make|docker compose)\b/i);
  if (!dev || !hasDevCommands) {
    findings.push(
      finding('friction.dev-setup-missing', {
        severity: repo ? 'important' : 'improvement',
        what: 'There are no local development instructions (clone → install dependencies → run) for contributors.',
        evidence: dev ? [{ line: dev.line, snippet: lineSnippet(lines, dev.line), note: 'section exists but has no setup commands' }] : [{ line: lastLine(doc), note: 'a Development section would fit here' }],
      }),
    );
  }

  /* ---------- Test instructions ---------- */
  const testing = get('testing');
  const testMentionedElsewhere = /\b(npm (?:run )?test|yarn test|pnpm test|pytest|cargo test|go test|make test|jest|vitest|rspec|phpunit|dotnet test)\b/i.test(doc.source);
  const repoHasTests = repo
    ? Boolean(repo.packageJson?.scripts?.test && !/^echo .*(no test|not set)/i.test(repo.packageJson.scripts.test)) ||
      [...(repo.tree ?? [])].some((p) => TEST_DIR_RE.test(p) || TEST_INFRA_FILES.includes(p.split('/').pop()))
    : false;
  if (testing && /\b(test|spec)\b/i.test(sectionText(testing))) {
    findings.push(
      finding('good.test-instructions', {
        what: `Testing instructions present (line ${testing.line + 1}).`,
        evidence: [{ line: testing.line, snippet: lineSnippet(lines, testing.line) }],
      }),
    );
  } else if (!testMentionedElsewhere) {
    findings.push(
      finding('friction.tests-undocumented', {
        severity: repoHasTests ? 'important' : 'improvement',
        what:
          repoHasTests && repo
            ? 'The repository contains test infrastructure, but the README never explains how to run the tests.'
            : 'The README does not explain how to run the test suite (or whether one exists).',
        evidence: repoHasTests ? [{ note: 'test files/config detected in the repository tree' }] : [{ line: lastLine(doc), note: 'a Testing section would fit here' }],
      }),
    );
  }

  /* ---------- Contribution process ---------- */
  const contributingFile = repo
    ? [...(repo.tree ?? [])].some((p) => /^\.github\/contributing(\.\w+)?$/i.test(p) || /^contributing(\.\w+)?$/i.test(p))
    : null;
  if (contributingFile) {
    findings.push(
      finding('good.contributing-file', {
        what: 'A CONTRIBUTING guide exists in the repository' + (dev ? '' : ' (consider linking it from the README).'),
        evidence: [{ note: 'CONTRIBUTING file detected in repository tree' }],
      }),
    );
  } else if (!dev) {
    findings.push(
      finding('friction.contributing-missing', {
        severity: repo ? 'important' : 'improvement',
        what: 'The README has no Contributing section and the repository has no CONTRIBUTING file, so contributors must guess the process.',
        evidence: [{ line: lastLine(doc), note: 'a Contributing section would fit here' }],
      }),
    );
  } else {
    const words = sectionText(dev).split(/\s+/).filter(Boolean).length;
    if (words < 15) {
      findings.push(
        finding('friction.contributing-thin', {
          what: `The contribution guidance is only ${words} words — too short to answer how to set up, what to work on, or what a good PR looks like.`,
          evidence: [{ line: dev.line, snippet: lineSnippet(lines, dev.line) }],
        }),
      );
    }
  }

  /* ---------- Issue / PR expectations ---------- */
  const issueTemplates = repo ? [...(repo.tree ?? [])].some((p) => /^\.github\/(issue_template|ISSUE_TEMPLATE)\//i.test(p)) : false;
  const issueGuidance = /(search (?:existing|open|closed) issues|before opening|before submitting|good (?:first )?issue|issue template|bug report|feature request|minimal (?:reproduc|work))/i.test(doc.source);
  if (issueTemplates || issueGuidance) {
    // positive — no finding needed, coverage shows it
  } else {
    findings.push(
      finding('friction.issue-expectations', {
        what: 'The README does not set expectations for issues or pull requests (search first, templates, reproduction steps).',
        evidence: [{ line: lastLine(doc) }],
      }),
    );
  }

  /* ---------- Project structure ---------- */
  if (repo?.tree) {
    const topDirs = new Set([...repo.tree].map((p) => p.split('/')[0]).filter((d) => d && !d.startsWith('.')));
    const structureSection = get('project-structure') || get('architecture');
    if (topDirs.size >= 4 && !structureSection) {
      findings.push(
        finding('friction.structure-undocumented', {
          what: `The repository has ${topDirs.size} top-level directories (${[...topDirs].slice(0, 6).join(', ')}), but the README never explains the layout.`,
          evidence: [{ note: `repository top-level: ${[...topDirs].slice(0, 8).join(', ')}` }],
        }),
      );
    }
  }

  /* ---------- Security reporting ---------- */
  const securitySection = sections.some((s) => s.key === 'security' || /^security/i.test(s.headingText));
  const securityFile = repo
    ? [...(repo.tree ?? [])].some((p) => /^security(\.md)?$/i.test(p) || /^\.github\/security(\.md)?$/i.test(p))
    : false;
  const securityMention = /(report (?:a )?vulnerab|security policy|responsibly disclos|security@|huntr\.dev)/i.test(doc.source);
  if (!securitySection && !securityFile && !securityMention) {
    findings.push(
      finding('friction.security-reporting', {
        what: 'There is no guidance on where to report security vulnerabilities.',
        evidence: [{ line: lastLine(doc) }],
      }),
    );
  }

  /* ---------- CI badge ---------- */
  if (repo?.tree) {
    const hasWorkflows = [...repo.tree].some((p) => /^\.github\/workflows\/.+\.(yml|yaml)$/i.test(p));
    const hasBadge = /img\.shields\.io\/github\/(actions|workflow)/i.test(doc.source) || /github\.com\/.*\/actions\/workflows\/.+\.svg/i.test(doc.source);
    if (hasWorkflows && !hasBadge) {
      findings.push(
        finding('friction.ci-status-missing', {
          what: 'The repository defines GitHub Actions workflows, but the README does not show their status.',
          evidence: [{ note: 'workflows detected in .github/workflows/' }],
        }),
      );
    } else if (hasWorkflows && hasBadge) {
      findings.push(finding('good.ci-visible', { what: 'CI status badge shown in the README.', evidence: [{ line: 1, note: 'badge block' }] }));
    }
  }
}

/* ------------------------------------------------------------------ */

function sectionText(section) {
  return (section.blocks ?? [])
    .map((b) => {
      if (b.type === 'paragraph' || b.type === 'heading') return inlineToText(b.inline ?? []);
      if (b.type === 'code') return b.raw;
      if (b.type === 'table') return [b.header, ...b.rows].map((r) => (r ?? []).map((c) => c.text ?? '').join(' ')).join(' ');
      if (b.type === 'list') return (b.items ?? []).map((i) => i.text ?? '').join(' ');
      return b.raw ?? '';
    })
    .join('\n');
}

function collectAllProse(doc) {
  let out = '';
  for (const b of doc.blocks) {
    if (b.type === 'paragraph') out += ' ' + inlineToText(b.inline ?? []);
    else if (b.type === 'list') out += ' ' + (b.items ?? []).map((i) => i.text ?? '').join(' ');
    else if (b.type === 'quote') for (const q of b.blocks) if (q.type === 'paragraph') out += ' ' + inlineToText(q.inline ?? []);
  }
  return out;
}

function codeBlocks(doc) {
  let n = 0;
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'code') n++;
      if (b.type === 'quote') walk(b.blocks);
      if (b.type === 'list') for (const it of b.items) walk(it.blocks);
    }
  };
  walk(doc.blocks);
  return n;
}

function lastLine(doc) {
  const nonBlank = doc.lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  return nonBlank.length ? nonBlank[nonBlank.length - 1] : 0;
}

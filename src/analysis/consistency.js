/**
 * README Doctor — technical consistency analysis.
 *
 * Compares the README's claims against the document itself (anchors,
 * structure) and — when a repository context exists — against public
 * repository data (file tree, package.json, .env.example, license).
 *
 * Principle: never claim something is broken without evidence. When there
 * is no repo context or the network refuses to answer, findings are filed
 * as "unverified" instead of "broken".
 */

import { collectLinks } from '../markdown/parser.js';
import { extractHtmlRefs } from '../markdown/renderer.js';
import { closestMatch, looksLikePlaceholderToken, stripHashAndQuery, truncate } from '../util.js';
import { extractCommands, installedPackageOf, scriptNameOf, walkAllBlocks, walkInline } from './commands.js';
import { finding, lineSnippet } from './report.js';

const SPDX_RE =
  /\b(MIT|Apache[- ]2\.0|Apache License 2\.0|GPL-?2\.0|GPL-?3\.0|AGPL-?3\.0|LGPL-?2\.1|LGPL-?3\.0|BSD-?2[- ]Clause|BSD-?3[- ]Clause|MPL-?2\.0|ISC|Unlicense|Creative Commons Zero|CC0|CC-BY-4\.0|Beerware|WTFPL)\b/i;

const STALE_RE =
  /\b(TODO|FIXME|WIP|TBD|coming soon|under construction|to be (?:filled|written|added|documented)|insert (?:your|the) [a-z ]+ here|lorem ipsum|placeholder text|docs? coming)\b/i;

const ENV_CODE_PATTERNS = [
  [/(?:^|\s)export\s+([A-Z][A-Z0-9_]{2,})\s*=/g, 'export'],
  [/(?:^|\s)([A-Z][A-Z0-9_]{2,})=(?:"[^"]*"|'[^']*'|[^\s#]+)/g, 'assignment'],
  [/process\.env\.([A-Z][A-Z0-9_]{2,})/g, 'process.env'],
  [/os\.environ(?:\.get)?[[(]["']([A-Z][A-Z0-9_]{2,})["']\]]?/g, 'os.environ'],
  [/os\.getenv\(["']([A-Z][A-Z0-9_]{2,})["']\)/g, 'os.getenv'],
  [/os\.Getenv\(["']([A-Z][A-Z0-9_]{2,})["']\)/g, 'os.Getenv'],
  [/System\.getenv\(["']([A-Z][A-Z0-9_]{2,})["']\)/g, 'System.getenv'],
  [/ENV\[['"]([A-Z][A-Z0-9_]{2,})['"]\]/g, 'ENV[]'],
];

const LICENSE_FILES = ['license', 'licence', 'copying', 'copying.txt', 'license.md', 'license.txt', 'licence.md', 'unlicense'];

export function analyzeConsistency(ctx) {
  ctx.pendingLinkChecks = [];
  analyzeAnchors(ctx);
  analyzeReferences(ctx);
  analyzeEnvVars(ctx);
  analyzeCommands(ctx);
  analyzeLicense(ctx);
  analyzeStaleContent(ctx);
  analyzeMisc(ctx);
}

/* ------------------------------------------------------------------ */
/* Anchors (#section links)                                            */
/* ------------------------------------------------------------------ */

function analyzeAnchors(ctx) {
  const { doc, findings, lines } = ctx;
  const links = collectLinks(doc);
  const anchors = links.filter((l) => l.href.startsWith('#') && l.href.length > 1);
  if (!anchors.length) return;

  const validIds = new Set(doc.slugger.slugs());
  // GitHub also honours explicit <a id/name> anchors.
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'html') {
      const re = /<(?:a|span|div)\b[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(b.raw))) validIds.add(m[1]);
    }
  });

  const broken = [];
  for (const a of anchors) {
    let id = a.href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    if (validIds.has(id)) continue;
    broken.push(a);
  }

  if (broken.length === 0) {
    findings.push(
      finding('consistency.anchors-ok', {
        what: `All ${anchors.length} in-page anchor link${anchors.length === 1 ? '' : 's'} resolve to headings in this document.`,
        evidence: [{ line: anchors[0].line, note: `${anchors.length} anchor link(s) checked` }],
      }),
    );
    return;
  }

  const headingIds = [...validIds];
  for (const b of broken.slice(0, 8)) {
    const wanted = b.href.slice(1);
    const guess = closestMatch(wanted, headingIds, Math.max(3, Math.floor(wanted.length / 3)));
    findings.push(
      finding('consistency.anchor-broken', {
        what: `The link \u201c${truncate(b.text, 40)}\u201d points to #${wanted}, but no heading in this README produces that anchor.`,
        evidence: [{ line: b.line, snippet: lineSnippet(lines, b.line) }],
        suggestion: guess
          ? `Fix the anchor to match the heading — did you mean #${guess}?`
          : 'Fix the anchor to match the heading id, or update the heading text.',
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* File / image / external references                                  */
/* ------------------------------------------------------------------ */

function analyzeReferences(ctx) {
  const { doc, findings, lines, repo } = ctx;
  const links = collectLinks(doc);

  // Raw HTML <img src> / <a href> references
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'html' && !b.isComment) {
      for (const ref of extractHtmlRefs(b.raw)) {
        links.push({ kind: /^(src)/i.test(ref) ? 'image' : 'link', href: ref, text: '(raw HTML)', line: b.line, fromHtml: true });
      }
    }
  });

  const unverified = [];
  const seen = new Set();

  for (const link of links) {
    const href = String(link.href ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:)/i.test(href)) continue;

    /* ---- Same-repo GitHub links → resolve against the tree ---- */
    const gh = repo ? parseSameRepoGithubUrl(href, repo) : null;
    if (gh) {
      if (gh.branch !== repo.branch) {
        pushOnce(
          ctx,
          finding('consistency.branch-mismatch', {
            what: `The link \u201c${truncate(link.text, 40)}\u201d targets branch \u201c${gh.branch}\u201d, but this repository\u2019s default branch is \u201c${repo.branch}\u201d.`,
            evidence: [{ line: link.line, snippet: lineSnippet(lines, link.line) }],
          }),
        );
        continue;
      }
      checkPathInTree(ctx, gh.path, link, unverified, seen);
      continue;
    }
    if (repo && /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//.test(href)) {
      const branch = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//.exec(href)[1];
      if (branch !== repo.branch && branch !== 'refs' && branch !== 'master~') {
        pushOnce(
          ctx,
          finding('consistency.branch-mismatch', {
            what: `A raw content link targets branch \u201c${branch}\u201d, but the default branch is \u201c${repo.branch}\u201d.`,
            evidence: [{ line: link.line, snippet: lineSnippet(lines, link.line) }],
          }),
        );
      }
      continue;
    }

    /* ---- Absolute URLs → budgeted network check ---- */
    if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
      const url = href.startsWith('//') ? 'https:' + href : href;
      if (isGitHubRepoLink(url) && repo) {
        const key = `repo:${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          ctx.pendingLinkChecks.push({ url, line: link.line, kind: 'github-repo', text: link.text });
        }
      } else if (!seen.has(url)) {
        seen.add(url);
        ctx.pendingLinkChecks.push({ url, line: link.line, kind: 'external', text: link.text });
      }
      continue;
    }

    /* ---- Relative references → tree check or unverified ---- */
    checkPathInTree(ctx, href, link, unverified, seen);
  }

  if (unverified.length) {
    findings.push(
      finding('consistency.file-unverified', {
        what: `${unverified.length} relative reference${unverified.length === 1 ? '' : 's'} could not be verified because no repository context was provided: ${unverified
          .slice(0, 10)
          .map((u) => `\`${u.path}\``)
          .join(', ')}${unverified.length > 10 ? ', …' : ''}`,
        evidence: unverified.slice(0, 6).map((u) => ({ line: u.line, snippet: lineSnippet(lines, u.line), note: u.path })),
      }),
    );
  }
}

function checkPathInTree(ctx, rawHref, link, unverified, seen) {
  const { repo, findings, lines } = ctx;
  let path = normalizeRepoPath(rawHref, repo);
  if (!path) return;
  if (path.endsWith('/')) path = path.slice(0, -1); // directory reference

  if (!repo || !repo.tree) {
    unverified.push({ path: rawHref, line: link.line });
    return;
  }

  const isImage = link.kind === 'image';
  if (repo.tree.has(path)) return; // exact hit

  // Directory reference: docs/ exists if any file lives under it
  if (!isImage && repo.tree.has(path + '/')) return;
  if (!isImage && [...repo.tree].some((p) => p.startsWith(path + '/'))) return;

  const actual = repo.treeLower?.get(path.toLowerCase());
  if (actual && actual !== path) {
    findings.push(
      finding(isImage ? 'consistency.image-missing' : 'consistency.file-case-mismatch', {
        title: isImage ? `Image path case mismatch: ${truncate(path, 50)}` : `File case mismatch: ${truncate(path, 50)}`,
        what: `The README references \u201c${path}\u201d but the repository contains \u201c${actual}\u201d. Links work on case-insensitive systems but 404 on GitHub and Linux.`,
        evidence: [{ line: link.line, snippet: lineSnippet(lines, link.line), note: `repo has: ${actual}` }],
        suggestion: `Change the reference to \u201c${actual}\u201d.`,
      }),
    );
    return;
  }

  findings.push(
    finding(isImage ? 'consistency.image-missing' : 'consistency.file-missing', {
      title: isImage ? `Missing image: ${truncate(path, 60)}` : `Missing reference: ${truncate(path, 60)}`,
      what: `The README ${isImage ? 'displays an image from' : 'links to'} \u201c${path}\u201d, which does not exist in the repository (checked the full file tree of branch \u201c${repo.branch}\u201d${repo.treeTruncated ? ' — note: the tree listing was truncated by GitHub, this may be a false positive for very large repos' : ''}).`,
      evidence: [{ line: link.line, snippet: lineSnippet(lines, link.line), note: `referenced path: ${path}` }],
    }),
  );
}

/** Normalise a relative href to a repo-root-relative path. */
function normalizeRepoPath(href, repo) {
  let path = stripHashAndQuery(String(href));
  if (!path || /^(https?:|mailto:|tel:)/i.test(path)) return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  path = path.replace(/\\/g, '/');
  if (path.startsWith('/')) path = path.slice(1);
  // Relative to the README's directory (usually root)
  const baseDir = repo?.readmeDir || '';
  if (path.startsWith('./') || path.startsWith('../') || !path.includes('/')) {
    const segments = (baseDir + '/' + path).split('/');
    const out = [];
    for (const seg of segments) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    path = out.join('/');
  }
  return path || null;
}

function parseSameRepoGithubUrl(href, repo) {
  const m = new RegExp(
    `^https?://github\\.com/${escapeReForRegex(repo.owner)}/${escapeReForRegex(repo.repo)}/(blob|tree|raw)/([^/]+)/(.+?)(?:[?#].*)?$`,
    'i',
  ).exec(href);
  if (!m) return null;
  return { branch: m[2], path: m[3] };
}

function escapeReForRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isGitHubRepoLink(url) {
  return /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.split('#')[0].split('?')[0]);
}

function pushOnce(ctx, f) {
  const key = `${f.ruleId}|${f.line}|${f.title}`;
  if (ctx._pushedOnce?.has(key)) return;
  (ctx._pushedOnce ??= new Set()).add(key);
  ctx.findings.push(f);
}

/* ------------------------------------------------------------------ */
/* Environment variables                                               */
/* ------------------------------------------------------------------ */

function analyzeEnvVars(ctx) {
  const { doc, findings, lines } = ctx;
  const occurrences = new Map(); // var -> [{line, context, sectionKey, text, explained}]

  const record = (name, line, context, sectionKey, text, explained) => {
    if (!/^[A-Z][A-Z0-9_]{2,}$/.test(name)) return;
    const list = occurrences.get(name) ?? [];
    list.push({ line, context, sectionKey, text, explained });
    occurrences.set(name, list);
  };

  const envishSections = new Set(['environment', 'configuration']);

  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'code') {
      b.raw.split('\n').forEach((raw, idx) => {
        for (const [re] of ENV_CODE_PATTERNS) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(raw))) record(m[1], b.line + 1 + idx, 'code', null, raw, false);
        }
      });
    } else if (b.type === 'paragraph' || b.type === 'heading') {
      // Backticked ALL_CAPS tokens are deliberate mentions anywhere in the doc.
      walkInline(b.inline ?? [], (t) => {
        if (t.type !== 'codespan') return;
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(t.code)) record(t.code, t.line, 'prose', sectionKeyAt(ctx, t.line), '', false);
      });
    } else if (b.type === 'table') {
      // Tables elsewhere (contributors, roadmaps…) mention plain ALL-CAPS words
      // that are not environment variables — only env/config tables count.
      const sectionKey = sectionKeyAt(ctx, b.line);
      if (!envishSections.has(sectionKey)) return;
      const cells = [b.header, ...b.rows];
      for (let r = 0; r < cells.length; r++) {
        for (const cell of cells[r]) {
          const vars = cell.text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
          for (const v of vars) record(v, b.line + r, 'table', sectionKey, cell.text, true);
        }
      }
    } else if (b.type === 'list') {
      const sectionKey = sectionKeyAt(ctx, item0Line(b));
      if (!envishSections.has(sectionKey)) return;
      for (const item of b.items) {
        const text = (item.blocks ?? []).map((x) => x.raw ?? '').join(' ').trim();
        const vars = text.match(/`?[A-Z][A-Z0-9_]{2,}`?/g) ?? [];
        const extraWords = text.replace(/[`A-Z0-9_]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        for (const v of vars) {
          const clean = v.replace(/`/g, '');
          record(clean, item.line, 'list', sectionKey, text, extraWords >= 3);
        }
      }
    }
  });

  if (occurrences.size === 0) return;
  ctx.envVars = occurrences;

  const hasEnvSection = ctx.sections?.some((s) => envishSections.has(s.key));
  const documented = new Set();
  const unexplained = new Map();

  for (const [name, occ] of occurrences) {
    const isExplained = occ.some(
      (o) =>
        o.context === 'table' ||
        (o.context === 'list' && o.explained) ||
        (o.context === 'prose' && proseExplains(occ)),
    );
    if (isExplained) documented.add(name);
    else unexplained.set(name, occ);
  }

  if (!hasEnvSection && unexplained.size > 0) {
    const list = [...unexplained.entries()].slice(0, 8);
    findings.push(
      finding('consistency.env-undocumented', {
        what: `${unexplained.size} environment variable${unexplained.size === 1 ? ' is' : 's are'} referenced in commands but the README has no Environment variables section explaining them: ${list
          .map(([n]) => `\`${n}\``)
          .join(', ')}${unexplained.size > 8 ? ', …' : ''}.`,
        evidence: list.flatMap(([n, occ]) => occ.slice(0, 1).map((o) => ({ line: o.line, snippet: lineSnippet(lines, o.line), note: `${n} used in ${o.context}` }))),
        suggestion: 'Add an "Environment variables" section with a table: name, required, purpose, default value.',
      }),
    );
  } else if (unexplained.size > 0) {
    const list = [...unexplained.entries()].slice(0, 8);
    findings.push(
      finding('consistency.env-unexplained', {
        what: `${unexplained.size} variable${unexplained.size === 1 ? ' is' : 's are'} only ever shown inside commands, never described: ${list.map(([n]) => `\`${n}\``).join(', ')}${unexplained.size > 8 ? ', …' : ''}.`,
        evidence: list.flatMap(([n, occ]) => occ.slice(0, 1).map((o) => ({ line: o.line, snippet: lineSnippet(lines, o.line), note: `${n} appears only in ${o.context}` }))),
      }),
    );
  }

  if (documented.size > 0 && (hasEnvSection || unexplained.size === 0)) {
    findings.push(
      finding('good.env-documented', {
        what: `${documented.size} environment variable${documented.size === 1 ? '' : 's'} documented in a table or annotated list.`,
        evidence: [{ line: ctx.sections?.find((s) => envishSections.has(s.key))?.line ?? 0, note: [...documented].slice(0, 8).join(', ') }],
      }),
    );
  }

  // Cross-check with .env.example when available
  if (ctx.repo?.envExample) {
    const exampleVars = new Set();
    for (const line of ctx.repo.envExample.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=/.exec(line);
      if (m) exampleVars.add(m[1]);
    }
    const inReadmeNotExample = [...occurrences.keys()].filter((v) => !exampleVars.has(v));
    const inExampleNotReadme = [...exampleVars].filter((v) => !occurrences.has(v));
    if (inReadmeNotExample.length || inExampleNotReadme.length) {
      findings.push(
        finding('consistency.env-example-mismatch', {
          what:
            (inReadmeNotExample.length ? `README documents ${inReadmeNotExample.map((v) => `\`${v}\``).join(', ')} but .env.example does not include ${inReadmeNotExample.length === 1 ? 'it' : 'them'}. ` : '') +
            (inExampleNotReadme.length ? `.env.example defines ${inExampleNotReadme.map((v) => `\`${v}\``).join(', ')} which the README never mentions.` : ''),
          evidence: [{ note: '.env.example (repository)' }],
        }),
      );
    }
  }
}

function proseExplains(occ) {
  // A prose mention counts as an explanation when the variable appears
  // outside of an assignment and the document has a dedicated section.
  return occ.some((o) => o.context === 'prose' && o.sectionKey && ['environment', 'configuration'].includes(o.sectionKey));
}

/* ------------------------------------------------------------------ */
/* Commands vs repository manifests                                    */
/* ------------------------------------------------------------------ */

function analyzeCommands(ctx) {
  const { repo } = ctx;
  const commands = extractCommands(ctx.doc);
  ctx.commands = commands;
  if (!commands.length || !repo) return;
  const { findings, lines } = ctx;

  const pkg = repo.packageJson || null;
  const tree = repo.tree;

  /* npm/yarn/pnpm script references */
  if (pkg) {
    const scripts = Object.keys(pkg.scripts ?? {});
    const missing = new Map();
    for (const c of commands) {
      const script = scriptNameOf(c);
      if (!script) continue;
      if (!scripts.includes(script)) missing.set(script, c);
    }
    if (missing.size) {
      const list = [...missing.entries()].slice(0, 6);
      findings.push(
        finding('consistency.script-missing', {
          what: `The README tells readers to run ${list.map(([s]) => `\`${list.length === 1 && list[0][1].cmd} run ${s}\``).join(', ') || ''} but package.json does not define ${list.length === 1 ? 'that script' : 'those scripts'}${scripts.length ? ` (available: ${scripts.slice(0, 12).map((s) => `\`${s}\``).join(', ')}${scripts.length > 12 ? ', …' : ''})` : ' (no scripts defined at all)'}.`,
          evidence: list.map(([, c]) => ({ line: c.line, snippet: lineSnippet(lines, c.line), note: `${c.cmd} ${c.args.join(' ')}` })),
        }),
      );
    }
    /* package name in install command */
    const installs = [];
    for (const c of commands) {
      const p = installedPackageOf(c);
      if (p && p.name && !p.name.startsWith('.') && p.name !== 'install') {
        installs.push({ ...p, line: c.line, cmd: c.cmd });
      }
    }
    // The project's own name (or a companion tool that extends it, like
    // "express-generator" for "express") is fine; anything else is suspect.
    const baseName = String(pkg.name ?? '').replace(/^@[^/]+\//, '').toLowerCase();
    const wrongNames = installs.filter((p) => baseName && !p.name.toLowerCase().startsWith(baseName));
    if (baseName && wrongNames.length) {
      const uniq = [...new Set(wrongNames.map((p) => p.name))];
      findings.push(
        finding('consistency.package-name-mismatch', {
          what: `The README installs ${uniq.map((n) => `\`${n}\``).join(', ')}, but the package is named \u201c${pkg.name}\u201d in package.json.`,
          evidence: wrongNames.slice(0, 4).map((p) => ({
            line: p.line,
            snippet: lineSnippet(lines, p.line),
            note: `${p.cmd} … ${p.name}`,
          })),
        }),
      );
    }
    /* Node version claims */
    const engineNode = pkg.engines?.node;
    const readmeNode = /node(?:\.?js)?\s*v?(\d+)/i.exec(ctx.doc.source);
    if (engineNode && readmeNode) {
      const engineMajor = Number(/(\d+)/.exec(engineNode)?.[1] ?? 0);
      const readmeMajor = Number(readmeNode[1]);
      if (engineMajor && readmeMajor && readmeMajor !== engineMajor) {
        findings.push(
          finding('consistency.node-version-mismatch', {
            what: `The README mentions Node ${readmeMajor}, but package.json requires \u201c${engineNode}\u201d.`,
            evidence: [{ note: `package.json engines.node: ${engineNode}` }, { line: findLineOf(/node(?:\.?js)?\s*v?\d+/i, ctx), snippet: lineSnippet(lines, findLineOf(/node(?:\.?js)?\s*v?\d+/i, ctx)) }],
          }),
        );
      }
    }
  }

  /* Toolchain presence checks */
  const usesNpm = commands.some((c) => ['npm', 'npx', 'yarn', 'pnpm', 'bun'].includes(c.cmd));
  const usesPip = commands.some((c) => ['pip', 'pip3'].includes(c.cmd));
  const usesMake = commands.some((c) => c.cmd === 'make');
  const usesDockerCompose = commands.some((c) => c.cmd === 'docker' && /compose/.test(c.args[0] ?? '')) || commands.some((c) => c.cmd === 'docker-compose');
  const usesGo = commands.some((c) => c.cmd === 'go');
  const usesCargo = commands.some((c) => c.cmd === 'cargo');

  const mismatches = [];
  if (usesNpm && tree && !tree.has('package.json')) mismatches.push(['npm/yarn/pnpm commands', 'no package.json in the repository']);
  if (usesPip && tree && !['requirements.txt', 'pyproject.toml', 'setup.py'].some((f) => tree.has(f)))
    mismatches.push(['pip install instructions', 'no requirements.txt / pyproject.toml / setup.py']);
  if (usesMake && tree && !tree.has('Makefile')) mismatches.push(['make commands', 'no Makefile']);
  if (usesDockerCompose && tree && !['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].some((f) => tree.has(f)) && !tree.has('Dockerfile'))
    mismatches.push(['docker compose instructions', 'no compose file or Dockerfile']);
  if (usesGo && tree && !tree.has('go.mod')) mismatches.push(['go commands', 'no go.mod']);
  if (usesCargo && tree && !tree.has('Cargo.toml')) mismatches.push(['cargo commands', 'no Cargo.toml']);

  if (mismatches.length) {
    findings.push(
      finding('consistency.toolchain-mismatch', {
        what: mismatches.map(([a, b]) => `The README contains ${a}, but the repository contains ${b}`).join('; ') + '.',
        evidence: [{ note: 'checked against the repository file tree' }, ...commands.slice(0, 2).map((c) => ({ line: c.line, snippet: lineSnippet(lines, c.line) }))],
      }),
    );
  }
}

function findLineOf(re, ctx) {
  for (let i = 0; i < ctx.doc.lines.length; i++) if (re.test(ctx.doc.lines[i])) return i;
  return null;
}

/* ------------------------------------------------------------------ */
/* License consistency                                                 */
/* ------------------------------------------------------------------ */

function analyzeLicense(ctx) {
  const { repo, findings, lines } = ctx;
  const licenseSection = ctx.sections?.find((s) => s.key === 'license');
  const readmeClaim = extractLicenseClaim(ctx);

  if (!repo) {
    // Paste mode: report only what the document itself can prove.
    if (!licenseSection && !readmeClaim) return; // structure.js reports the missing section
    return;
  }

  const repoLicense = repo.license || null; // SPDX id from the GitHub API
  const licenseFileInTree = LICENSE_FILES.some((f) => repo.tree?.has(f)) ||
    [...(repo.tree ?? [])].some((p) => /^licen[cs]e(\.|$)|^copying(\.|$)/i.test(p));

  const claimed = readmeClaim?.normalized ?? null;

  if (claimed && repoLicense && repoLicense !== 'NOASSERTION' && !sameLicense(claimed, repoLicense)) {
    findings.push(
      finding('consistency.license-mismatch', {
        what: `The README states the project is ${readmeClaim.raw}, but GitHub detects the repository license as ${repoLicense}.`,
        evidence: [
          licenseSection ? { line: licenseSection.line, snippet: lineSnippet(lines, licenseSection.line), note: 'README license section' } : { note: 'license mentioned in README text' },
          { note: `GitHub API reports license: ${repoLicense}` },
        ],
      }),
    );
    return;
  }

  if (claimed && !licenseFileInTree && !repoLicense) {
    findings.push(
      finding('consistency.license-file-missing', {
        what: `The README claims ${readmeClaim.raw}, but no LICENSE file was found in the repository and GitHub reports no license.`,
        evidence: [licenseSection ? { line: licenseSection.line, snippet: lineSnippet(lines, licenseSection.line) } : { note: 'license mentioned in README text' }, { note: 'checked repository file tree' }],
      }),
    );
    return;
  }

  if (!claimed && !licenseFileInTree && !repoLicense) {
    findings.push(
      finding('consistency.license-missing', {
        what: 'No license is declared anywhere: not in the README, not as a LICENSE file, and GitHub reports none.',
        evidence: [{ note: 'checked README text, repository tree and the GitHub API' }],
      }),
    );
    return;
  }

  if (repoLicense && repoLicense !== 'NOASSERTION' && (claimed || licenseFileInTree)) {
    findings.push(
      finding('good.license-consistent', {
        what: `Repository and README agree: ${claimed ? readmeClaim.raw : ''} ${repoLicense ? `(${repoLicense})` : ''}`.trim() + '.',
        evidence: [licenseSection ? { line: licenseSection.line, snippet: lineSnippet(lines, licenseSection.line) } : { note: 'LICENSE file present in repository' }],
      }),
    );
  }
}

function extractLicenseClaim(ctx) {
  const licenseSection = ctx.sections?.find((s) => s.key === 'license');
  const text = licenseSection
    ? sectionText(licenseSection) || ctx.doc.source
    : ctx.doc.source;
  const m = SPDX_RE.exec(text);
  if (!m) return null;
  return { raw: m[1], normalized: normalizeSpdx(m[1]) };
}

function sectionText(section) {
  return (section.blocks ?? []).map((b) => b.raw ?? b.text ?? '').join('\n');
}

function normalizeSpdx(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-').replace('apache-license-2.0', 'apache-2.0').replace('apache-2.0', 'apache-2.0');
}

function sameLicense(a, b) {
  const map = { 'mit': 'mit', 'isc': 'isc', 'apache-2.0': 'apache-2.0', 'apache license 2.0': 'apache-2.0', 'gpl-3.0': 'gpl-3.0', 'gpl-3': 'gpl-3.0', 'gpl-2.0': 'gpl-2.0', 'gpl-2': 'gpl-2.0', 'agpl-3.0': 'agpl-3.0', 'bsd-2-clause': 'bsd-2-clause', 'bsd-3-clause': 'bsd-3-clause', 'mpl-2.0': 'mpl-2.0', 'unlicense': 'unlicense', 'cc0': 'cc0-1.0' };
  const na = map[String(a).toLowerCase()] ?? String(a).toLowerCase();
  const nb = map[String(b).toLowerCase()] ?? String(b).toLowerCase();
  return na === nb;
}

/* ------------------------------------------------------------------ */
/* Stale content & misc                                                */
/* ------------------------------------------------------------------ */

function analyzeStaleContent(ctx) {
  const { doc, findings, lines } = ctx;
  const hits = [];
  doc.lines.forEach((line, idx) => {
    const noUrls = line.replace(/\([^)]*\)|<[^>]*>/g, ' '); // don't flag inside URLs/html attrs
    const m = STALE_RE.exec(noUrls);
    if (m) hits.push({ line: idx, match: m[0], snippet: line.trim().slice(0, 90) });
    if (looksLikePlaceholderToken(line)) hits.push({ line: idx, match: 'placeholder', snippet: line.trim().slice(0, 90) });
  });

  if (!hits.length) return;
  findings.push(
    finding('consistency.stale-content', {
      severity: hits.length > 3 ? 'important' : 'improvement',
      what: `${hits.length} stale or placeholder marker${hits.length === 1 ? '' : 's'} found: ${hits.slice(0, 5).map((h) => `\u201c${h.match}\u201d on line ${h.line + 1}`).join(', ')}${hits.length > 5 ? ', …' : ''}.`,
      evidence: hits.slice(0, 6).map((h) => ({ line: h.line, snippet: h.snippet, note: h.match })),
    }),
  );
}

function analyzeMisc(ctx) {
  const { doc, findings, lines } = ctx;

  /* Duplicate heading text */
  const byText = new Map();
  for (const h of doc.headings) {
    const key = h.text.toLowerCase();
    byText.set(key, [...(byText.get(key) ?? []), h]);
  }
  for (const [key, hs] of byText) {
    if (hs.length > 1 && key) {
      findings.push(
        finding('consistency.duplicate-heading', {
          what: `The heading \u201c${hs[0].text}\u201d appears ${hs.length} times; GitHub will suffix its anchors (-1, -2 …), so in-page links may land on the wrong one.`,
          evidence: hs.map((h) => ({ line: h.line, snippet: lineSnippet(lines, h.line) })),
        }),
      );
    }
  }

  /* Untagged fenced code blocks */
  const untagged = [];
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'code' && !b.indented && !b.lang && b.raw.trim()) untagged.push(b);
  });
  if (untagged.length >= 2) {
    findings.push(
      finding('consistency.code-no-language', {
        what: `${untagged.length} fenced code blocks have no language tag, so they render without highlighting.`,
        evidence: untagged.slice(0, 4).map((b) => ({ line: b.line, snippet: lineSnippet(lines, b.line + 1) })),
      }),
    );
  }

  /* Images without alt text */
  const noAlt = [];
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'paragraph' || b.type === 'heading') {
      walkInline(b.inline ?? [], (t) => {
        if (t.type === 'image' && !String(t.alt ?? '').trim()) noAlt.push(t);
      });
    }
  });
  if (noAlt.length) {
    findings.push(
      finding('consistency.image-no-alt', {
        what: `${noAlt.length} image${noAlt.length === 1 ? '' : 's'} have no alt text.`,
        evidence: noAlt.slice(0, 4).map((t) => ({ line: t.line, snippet: lineSnippet(lines, t.line), note: `![](${truncate(t.href, 50)})` })),
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function sectionKeyAt(ctx, line) {
  const sections = ctx.sections ?? [];
  let current = null;
  for (const s of sections) if (s.line <= line) current = s.key;
  return current;
}

function item0Line(listBlock) {
  return listBlock?.items?.[0]?.line ?? listBlock?.line ?? 0;
}

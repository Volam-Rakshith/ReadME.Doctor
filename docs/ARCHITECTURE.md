# Architecture

> README Doctor — a VR Developments project. Diagnose documentation. Don't blindly generate it.

README Doctor is a **dependency-free** browser application backed by a pure-ES-module analysis engine. The engine never touches the DOM, which is what makes it fully testable in Node (`node --test`) while running unchanged in the browser.

## Design principles

1. **Diagnosis, not generation.** The tool never writes documentation; it explains, with evidence, where existing documentation fails the reader.
2. **Evidence or silence.** No finding may claim something is broken without a verifiable cause (a 404, a missing tree path, an undefined script). Unprovable observations are filed as *Unverified*.
3. **Local-first.** Everything that can be computed from the provided Markdown is computed in the browser. Network access is opt-in by nature (repository mode / link checks) and always budgeted.
4. **No AI, no keys.** The core diagnosis is deterministic rule-based static analysis.
5. **Zero dependencies.** The Markdown parser, renderer, sanitizer and UI are hand-written and small enough to audit in an afternoon.

## Module map

```text
src/
├── markdown/
│   ├── parser.js     Markdown → blocks + inline tokens, every token carries its source line
│   ├── renderer.js   tokens → safe HTML (data-line attrs, strict HTML sanitizer)
│   └── slugger.js    GitHub-compatible heading anchors (dedupe with -1/-2 suffixes)
├── analysis/
│   ├── analyzer.js   orchestrator: parse → run analyzers → report + coverage + stats
│   ├── structure.js  section detection (heading synonyms), substance measurement
│   ├── consistency.js anchors, file references, env vars, commands, license, staleness
│   ├── friction.js   contributor friction (prereqs, dev setup, tests, process)
│   ├── links.js      budgeted network link checker (fetch-injectable for tests)
│   ├── commands.js   shell command extraction from code blocks / inline code
│   ├── report.js     finding model, severities, de-duplication, ordering
│   └── rules.js      single source of truth for rule metadata (methodology is generated from it)
├── ui/
│   ├── report.js     findings pane, filters, summary chips, Markdown/JSON export
│   ├── readme.js     rendered view + markers, source view, coverage matrix, navigation
│   └── dialogs.js    methodology, shortcuts, export dialogs, toast
├── github.js         public GitHub API client (parseRepoInput, fetchRepoContext)
├── main.js           application orchestration, keyboard, theme
├── sample.js         the bundled flawed demo README
└── util.js           pure helpers (escape, levenshtein, truncate, …)
```

## Data flow

### Local diagnosis (paste / upload)

```text
markdown ──parseMarkdown()──▶ doc {blocks, headings, linkDefs, slugger, lines}
        └▶ analyze(md) ─▶ findings[] + coverage[] + stats + pendingLinkChecks[]
```

`analyze()` is **synchronous and pure**: same input, same findings, every time. The UI renders the report immediately, then (and only if external links exist) starts the async link phase.

### Repository diagnosis

```text
repo URL ──parseRepoInput()──▶ {owner, repo, branch?, readmePath?}
        └─ fetchRepoContext()                                    [budget]
             ├─ GET /repos/:owner/:repo                          (1 req)  metadata, default branch, license
             ├─ GET /repos/:owner/:repo/readme  (raw)            (1 req)  README content
             ├─ GET /repos/:owner/:repo/git/trees/:branch?recursive=1 (1 req) full file tree
             └─ raw fetches: package.json, .env.example          (no API quota)
                                                        │
                                                        ▼
                             analyze(readme, {repo}) ─▶ report …
```

Hard budget: **≤ 4 API requests per diagnosis** (plus raw.githubusercontent.com fetches, which are not rate-limited). Rate-limit responses (`403` with `x-ratelimit-remaining: 0`) are surfaced as a friendly error with an optional read-only token escape hatch.

### Link checking

`analyze()` classifies every link:

| Kind | How it is checked | Cost |
| ---- | ----------------- | ---- |
| In-page anchor `#x` | matched against the slugger's issued slugs + explicit `<a id>` | free, local |
| Relative file/image | looked up in the repo tree (exact, then case-insensitive, then directory prefix) | free, local |
| Same-repo GitHub blob/tree URL | parsed, branch-compared, then tree lookup | free, local |
| Other GitHub repo | `GET api.github.com/repos/o/r` existence check | budgeted |
| Any other http(s) URL | `fetch` HEAD → GET fallback → no-cors probe | budgeted |

The network runner is injectable (`fetchImpl`) so the whole classification → result → finding pipeline is covered by tests without sockets. Budget: 15 requests, 4 concurrent, 7 s timeout (see `links.js`).

Result honesty table:

| Observation | Status | Finding |
| ----------- | ------ | ------- |
| CORS-readable 404/410 | `broken` | Important |
| Server 401/403/429/5xx | `unverified` | Unverified (server may block bots) |
| Opaque no-cors success | `unverified` | Unverified |
| Network-level failure | `unreachable` | Improvement (soft wording) |
| Final URL ≠ requested | `redirect` | Improvement |
| 2xx | `ok` | aggregated Good when ≥3 ok |

## The Markdown parser

A hand-rolled CommonMark-subset parser (plus GFM tables, strikethrough, autolinks). Two-pass design:

1. **Block pass** — fences, ATX/setext headings, lists (with nesting and lazy continuation), tables, blockquotes, HTML blocks/comments, link reference definitions.
2. **Inline pass** (`hydrateInline`) — runs after all link definitions are known, because references may be defined after use.

Everything carries a **source line number**: blocks have `line`/`endLine`, inline tokens have `line`. This is the backbone of the product — diagnostic markers, jump-to-finding, evidence snippets and the source view all key off these positions. Generic parsers don't provide this reliably; that's why the parser exists.

The renderer emits `data-line` on every block element and passes raw HTML through a whitelist sanitizer (no `on*` handlers, no `style`, no `javascript:` URLs, dangerous elements dropped with content). Relative images are rewritten through a `resolveAsset` hook (repo raw URL) or replaced by a visible placeholder.

## The rule system

- `rules.js` is the **single source of truth**: rule id, default severity, category, why-it-matters text, suggested fix. The in-app Methodology dialog and `docs/METHODOLOGY.md` derive from it, so documentation can never drift from implementation.
- `report.js#finding()` validates every rule id at creation time (a typo throws).
- `finalize()` de-duplicates (rule + line + title) and orders by severity rank, then line.

### Severity model

| Severity | Meaning |
| -------- | ------- |
| Critical | Blocks understanding, adoption or legal clarity |
| Important | Significant friction, or an evidenced defect |
| Improvement | Polish |
| Good | Verified strengths |
| Unverified | Could not be verified — check manually (never "broken") |

There is deliberately **no numeric score**. Severity counts plus the coverage matrix are factual; a weighted score would be arbitrary.

### Ownership between analyzers

Sections can be detected by several analyzers; each finding has exactly one owner to avoid duplicates:

- `structure.js` — title, description, section presence/emptiness, install/usage substance, document length. (License is deferred to `consistency.js` in repo mode; contributing/testing are deferred to `friction.js`.)
- `consistency.js` — everything comparing the document against itself or the repository.
- `friction.js` — contributor workflow concerns; uses repository facts (test infra, CONTRIBUTING file, workflows) when available.

## Performance notes

- Analysis is O(document) and synchronous; a 5,000-line README analyses in single-digit milliseconds.
- The source view caps rendering at 8,000 lines with a notice.
- Link checks never block the first paint of the report — they run after the UI is interactive.
- No virtual DOM, no framework, no external assets: first load is one HTML file, one CSS file and a handful of ES modules (~100 KB total, uncompressed).

## Testing strategy

- **Engine tests** (`test/*.test.js`) import the pure modules directly: parser positions, slugger, sanitizer, every analyzer, mocked-fetch link checker, report model, plus integration tests over the bundled sample.
- **UI smoke tests** (run ad hoc with jsdom) drive the real DOM: tab switching, sample diagnosis, filters, dialogs, export.
- CI (`.github/workflows/ci.yml`) runs the suite on Node 18/20/22 across Linux/macOS/Windows.

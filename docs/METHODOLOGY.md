# Methodology

> README Doctor — a VR Developments project. *Your README doesn't need another generator. It needs a diagnosis.*

README Doctor performs **deterministic, rule-based static analysis**. There is no AI in the diagnosis, no quality score, and no claim without evidence: every finding cites the exact lines, snippets, or public repository facts that triggered it.

This document is the reference for how findings are produced and classified. The in-app *Methodology* dialog renders the same content from `src/analysis/rules.js` — the code is the catalog.

## Severities

| Severity | Meaning |
| -------- | ------- |
| **Critical** | Blocks understanding, adoption, or legal clarity — e.g. no description, no usage example anywhere, no license at all, contradictory license claims between README and repository. |
| **Important** | Significant friction, or a defect with direct evidence — e.g. a missing installation section, a broken in-page anchor, an `npm run` script that isn't defined in `package.json`, an environment variable that is used but never explained. |
| **Improvement** | Polish worth doing — e.g. untagged code blocks, TODO markers, missing examples, links pinned to a renamed branch, no alt text on images. |
| **Good** | Verified strengths. A diagnosis should tell you what to keep, not only what to fix. |
| **Unverified** | Something that could not be verified from here (no repository context, or a server that refused to answer). **Never** reported as broken. |

Severity is a *default per rule* and can be escalated by evidence (for example, a single stale marker is an Improvement; five of them become Important because the document is clearly unmaintained).

## What gets analyzed

### 1. Structure

The document's canonical sections are detected by matching headings (level ≤ 3) against a synonym table — e.g. *Installation* also matches *Setup*, *Getting Started*, *Quickstart*, *Prerequisites*. The analyzer measures:

- **Title** — presence of an H1, whether it comes first, uniqueness.
- **Description** — words of real prose between title and first section (badges and images excluded).
- **Section presence and substance** — a heading with fewer than four words and no code or table is "near-empty".
- **Installation quality** — an installation section without a single copy-paste command is a finding; one with commands is a Good finding.
- **Usage/examples** — no usage *and* no examples section at all is Critical: the reader cannot reach a first success.
- **Coverage matrix** — a factual inventory (present / partial / absent) of 15 canonical sections. Not every project needs every section; the matrix does not judge.

### 2. Technical consistency

Everything that compares the README's claims against itself or against public repository data:

- **Anchors** — every `#fragment` link is resolved against the GitHub-compatible slug set (including dedupe suffixes and explicit `<a id>` anchors). Broken ones get a closest-match suggestion.
- **File references** — relative links and images are looked up in the repository's full file tree: exact match, then case-insensitive match (case mismatches are reported as such — they work on macOS and 404 on GitHub/Linux), then directory prefix. Without a repository, references are listed as Unverified, never broken.
- **Environment variables** — variables are collected from shell commands (`export X=`, `X=value`), code (`process.env.X`, `os.environ["X"]`, `os.getenv`, `System.getenv`, `ENV[...]`), inline code spans and tables. A variable is *explained* when it appears in a table, in an annotated list item, or in prose inside a dedicated section. Cross-checked against `.env.example` when present.
- **Commands** — shell commands are extracted from fenced blocks and inline code, then compared with the repository's `package.json` (`npm run` / `yarn` / `pnpm` scripts, package name in install commands, `engines.node` claims) and the file tree (`make` without a Makefile, `pip install` without a requirements file, `npm` without a `package.json`, …).
- **License** — the README's SPDX claim is compared with the license GitHub detects for the repository and with the presence of a LICENSE file. Contradiction is Critical; absence everywhere is Critical; a README claim without a file is Important.
- **Staleness** — TODO/FIXME/WIP/TBD/"coming soon"/"insert your … here"/lorem-ipsum markers, and template placeholder tokens (e.g. `your-username` in badge URLs).
- **Hygiene** — duplicate heading texts (ambiguous anchors), fenced code blocks without a language tag, images without alt text, very long documents.

### 3. Contributor friction

Prerequisites (are runtime versions stated?), local development instructions (clone → install → run), test instructions (escalated to Important when the repository clearly contains test infrastructure), contribution process (thin "PRs welcome" is called out; a CONTRIBUTING file is recognized), issue/PR expectations, project structure explanation (only when the repository actually has a non-trivial layout), security reporting guidance, and CI status visibility.

### 4. Links

Anchors and relative references are checked locally (free, exact). External URLs go through a **budgeted** network phase:

- Budget: **15 requests** per diagnosis, 4 concurrent, 7 s timeout each, de-duplicated URLs, `mailto:`/`tel:` skipped.
- Classification is honest by design:

| Observation | Classification |
| ----------- | --------------- |
| CORS-readable 404/410 | **Broken** (Important) |
| 401/403/429/5xx | **Unverified** — many servers block automated clients |
| Opaque no-cors response | **Unverified** — the resource exists but its status can't be read |
| Network-level failure | **Unreachable** (Improvement) — could be the user's network |
| Redirect observed via final URL | **Redirects** (Improvement) |
| 2xx | **OK** (aggregated Good finding when ≥ 3) |

- Links beyond the budget are listed as *not checked*, with the reason. Re-running checks another batch is free — GitHub rate limits are respected because repo-link checks go through the API, not the site.

## Network & privacy budget

| Action | Requests | Notes |
| ------ | -------- | ----- |
| Local diagnosis (paste/upload) | 0 | Everything runs in your browser |
| Repository diagnosis | ≤ 4 GitHub API + a few raw fetches | metadata, README, file tree, optional manifests |
| Link checks | ≤ 15 | only when external links exist |

- Pasted/uploaded Markdown never leaves the browser; nothing is stored server-side (there is no server).
- Repository mode reads public data only; **no OAuth scope is ever requested** — the tool cannot write anything.
- An optional personal access token (no scopes) raises the 60 req/h unauthenticated limit; it is kept in your browser and sent only to `api.github.com`.
- Zero telemetry, zero third-party requests, zero cookies.

## Known limitations

Stated plainly, because a diagnostic tool that overclaims is worse than no tool:

- Section detection is heading-based and **English-first**. Translated synonym tables are a welcome contribution.
- File checks use the **default branch**. Links pinned to other branches are flagged as fragile (Improvement), not broken, because we can't prove the path doesn't exist on that branch.
- In very large repositories GitHub may truncate the recursive tree listing; when that happens, file-existence findings are annotated as potentially weakened.
- Applicability of sections like *API documentation* or *Architecture* depends on the project, so they appear in the Coverage matrix rather than as findings.
- The Markdown parser covers the CommonMark subset real READMEs use; exotic constructs (e.g. link reference labels inside emphasis inside tables) may render imperfectly — but never crash the analysis.
- Redirects can only be observed when the response is CORS-readable; opaque redirects are invisible by browser design.

## Rule catalog

Rendered from `src/analysis/rules.js` (52 rules at v1.0.0). The authoritative, always-current list is the in-app **Methodology** dialog — it is generated from the same module that enforces the rules, so it can never drift.

# README Doctor

**Diagnose documentation. Don't blindly generate it.**

> *Your README doesn't need another generator. It needs a diagnosis.*

[![CI](https://github.com/VR-Developments/readme-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/VR-Developments/readme-doctor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2dd4a7.svg)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-0-62a9ff.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ffb224.svg)](CONTRIBUTING.md)

README Doctor is an open-source developer tool that examines the README you **already have** and reports what makes your project harder to **understand, install, use, contribute to, or trust**. It does not generate documentation for you — it tells you, with evidence, where yours is failing the reader.

Every finding explains four things:

1. **What** was detected
2. **Why** it matters
3. **Evidence** — exact lines, snippets, or public repository facts
4. A **suggested fix**

---

## Features

- **Three input modes** — a public GitHub repository URL, pasted Markdown, or an uploaded file.
- **Structural diagnosis** — title, description, installation, usage, examples, configuration, environment variables, API, architecture, contributing, testing, license, contact and more, inventoried in a factual coverage matrix.
- **Technical consistency checks** — broken anchors, references to files that don't exist in the repository, file-name case mismatches, `npm run` scripts that aren't defined in `package.json`, install commands that name the wrong package, license contradictions between README and repository, undocumented environment variables, stale TODO/placeholder content.
- **Contributor friction analysis** — unclear prerequisites, missing development and test instructions, thin contribution guidance, unexplained project structure.
- **Budgeted link checking** — broken links, redirects and unreachable hosts, capped at 15 requests per diagnosis. A CORS-visible 404 is *broken*; anything the checker can't read is honestly labelled *unverified*, never *broken*.
- **Synchronized README views** — rendered Markdown, original source with line numbers, and a coverage matrix, with numbered diagnostic markers you can jump between in both directions.
- **Report export** — copy or download the full diagnosis as Markdown or JSON.

## Prerequisites

- To use the hosted app: any modern browser. That's it.
- To run the dev server or the test suite locally: [Node.js](https://nodejs.org) ≥ 18.

## Installation

```bash
git clone https://github.com/VR-Developments/readme-doctor.git
cd readme-doctor
npm start
```

Then open <http://localhost:3000>. There are no dependencies to install and no build step — the entire tool is dependency-free ES modules.

## Usage

1. Open README Doctor.
2. Choose an input:
   - **GitHub repository** — `https://github.com/owner/repo` or `owner/repo` (public repositories only),
   - **Paste Markdown**, or
   - **Upload a file** (`.md`, `.markdown`, `.txt`).
3. Read the diagnosis. Findings are grouped **Critical → Important → Improvement → Good**, plus an honest **Unverified** group for things that need a human.
4. Click *View in README* on any finding (or press <kbd>J</kbd>/<kbd>K</kbd> to walk the report) to jump straight to the line it refers to.
5. Export the report if you want to attach it to an issue or a PR.

There is no sign-up, no API key and no AI. The core diagnosis is deterministic static analysis.

## How it works

```text
input (repo URL | pasted markdown | file)
  │
  ├─ repo mode: public GitHub API (≤4 requests)   → README, file tree, manifests
  │
  ▼
Markdown parser (line-accurate, zero dependencies)
  │
  ▼
Analyzers
  ├─ structure     sections, substance, description
  ├─ consistency   anchors, files, env vars, commands, license, staleness
  ├─ friction      prerequisites, dev setup, tests, contribution process
  └─ links         anchors locally · external URLs budgeted, async
  │
  ▼
Diagnostic report — severity, what, why, evidence, fix
```

Full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the rule catalog in [docs/METHODOLOGY.md](docs/METHODOLOGY.md) (also available in-app under *Methodology*).

## Privacy

- Pasted or uploaded Markdown is **analyzed entirely in your browser** and never uploaded.
- Nothing you diagnose is stored; reloading the page clears everything.
- Repository mode reads **public data only** through the GitHub API. README Doctor never requests any OAuth scope and cannot write anything.
- An optional read-only personal access token (no scopes) is kept only in your browser and sent only to `api.github.com`.
- Zero telemetry, zero third-party requests, zero cookies.

## Why no quality score?

Arbitrary "87/100 README" scores are noise. README Doctor reports severity counts and a factual coverage matrix instead. The full, documented methodology — every rule, its default severity and its reasoning — lives in [docs/METHODOLOGY.md](docs/METHODOLOGY.md). If a rule can't show evidence, it doesn't make a claim.

## Testing

```bash
npm test          # 109 unit + integration tests (node:test, zero deps)
npm run test:watch
```

The test suite covers the parser, every analyzer, the link checker (with a mocked `fetch`), the report model, and the bundled sample README.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, the rule-adding guide and what a good PR looks like. Before opening an issue, please search existing ones first. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please do not open public issues for security problems.

## Project structure

```text
.
├── index.html              the app shell
├── server.mjs              zero-dependency dev server
├── assets/css/main.css     design system (dark-first, no external assets)
├── src/
│   ├── markdown/           parser, renderer, slugger (line-accurate)
│   ├── analysis/           structure / consistency / friction / links / report / rules
│   ├── ui/                 report pane, README views, dialogs
│   ├── github.js           public GitHub API client (budgeted, read-only)
│   ├── sample.js           the bundled demo README
│   └── util.js             shared helpers
├── test/                   node:test suite
└── docs/                   architecture & methodology
```

## License

[MIT](LICENSE) © 2026 VR Developments

---

*README Doctor is built by [VR Developments](https://github.com/VR-Developments). Diagnose documentation. Don't blindly generate it.*

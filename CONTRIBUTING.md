# Contributing to README Doctor

First: thank you for considering a contribution. README Doctor exists because documentation deserves the same care as code.

## Before you open an issue

- **Search existing issues** (open and closed) — the thing you found may already be tracked.
- If you're reporting a false positive or false negative, include the README (or a minimal excerpt) that triggers it. README Doctor is an evidence-based tool; bug reports should be too.

## What a good issue looks like

- A title that states the symptom, not the conclusion ("Broken-link check flags a 200 URL", not "link check is broken").
- Steps to reproduce: the input (repo URL or Markdown), what you expected, what you got.
- For rule proposals: the rule's *what*, *why it matters*, *evidence*, and *suggested fix* — findings have four parts and proposals should too.

## What a good pull request looks like

- Small and focused. One rule, one fix, one screen.
- A test that fails before the change and passes after it.
- No new runtime dependencies — the zero-dependency engine is a design guarantee (see `docs/ARCHITECTURE.md`).
- If you add or change a rule, update `src/analysis/rules.js` metadata; the methodology docs and the in-app dialog are generated from it.

## Development setup

```bash
git clone https://github.com/VR-Developments/readme-doctor.git
cd readme-doctor
npm start        # dev server on http://localhost:3000 (zero dependencies)
npm test         # run the suite
npm run test:watch
```

Requirements: Node.js ≥ 18. There is no build step and nothing to install.

## Adding a diagnostic rule

1. **Decide the evidence contract first.** Under what exact, checkable condition does the rule fire? If the answer is "probably", it's not ready — evidence or silence is the project's core promise.
2. Add rule metadata to `src/analysis/rules.js`: id (`<category>.<name>`), title, default severity, category, why-it-matters, suggested fix.
3. Implement the check in the owning analyzer:
   - `structure.js` — document shape and substance
   - `consistency.js` — document vs. itself / repository
   - `friction.js` — contributor workflow
4. Push findings with `finding('<rule-id>', { what, evidence, … })`. Every finding must carry evidence (line + snippet or a repository fact).
5. Add tests: one case that fires, one that must **not** fire (the false-positive guard matters more than the positive case).
6. Consider severity escalation rules (e.g. stale markers: one is Improvement, five are Important) — and document them here or in `docs/METHODOLOGY.md` if non-obvious.

## Code style

- ES modules everywhere; no TypeScript, no transpilation.
- Pure functions in `src/analysis/` and `src/markdown/` — no DOM access there (they run in Node tests and the browser unchanged).
- UI code lives in `src/ui/` and `src/main.js`; keep DOM logic out of the engine.
- Prefer boring, explicit code. This codebase is meant to be read.

## Commit messages

Format: `area: imperative summary` — for example `consistency: flag npm scripts missing from package.json` or `parser: keep source lines in setext headings`. Keep the body for the *why*.

## Release checklist (maintainers)

1. `npm test` green on CI (Node 18/20/22).
2. Bump `version` in `package.json` and `VERSION` in `src/util.js`.
3. Update `docs/METHODOLOGY.md` rule count if rules changed.
4. Tag `vX.Y.Z`; the Pages workflow deploys on main.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

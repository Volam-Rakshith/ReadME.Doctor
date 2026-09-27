# Security Policy

README Doctor is a VR Developments project. This policy covers the [readme-doctor](https://github.com/Volam-Rakshith/ReadME.Doctor) repository and its published GitHub Pages site.

## Supported versions

README Doctor is a static, client-side application with zero runtime dependencies. The latest release on `main` is the only supported version.

| Version | Supported |
| ------- | --------- |
| main    | ✅        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Instead, use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or email the maintainers at
`security@vrdevelopments.example` (replace with the real address before publishing).

Please include:

- A description of the issue and its impact.
- Steps or a proof of concept. For client-side issues, the browser and OS matter.
- Whether the issue is in the analysis engine (`src/markdown/`, `src/analysis/`), the
  rendered-HTML path (`src/markdown/renderer.js` sanitization), or the GitHub client
  (`src/github.js`).

We aim to acknowledge reports within 72 hours and will keep you informed about the fix
and any coordinated disclosure timeline.

## Attack surface (what we actively defend)

- **Untrusted README content is rendered.** All Markdown text is HTML-escaped; raw HTML
  blocks pass through a whitelist sanitizer (`src/markdown/renderer.js`): `script`,
  `iframe`, `object`, `embed`, `form` and friends are dropped *with their content*,
  `on*` event handlers and `style` attributes are stripped, and `javascript:`/`data:text/html`
  URLs are neutralized. External links get `rel="noopener noreferrer"`.
- **No storage of user documents.** Diagnosis happens in memory; nothing is persisted
  beyond a theme preference and (if the user opts in) a GitHub token in `localStorage`.
- **GitHub access is read-only by construction.** The client requests no OAuth scope.
  Tokens supplied by users are sent only to `api.github.com`.
- **No third-party origins** are loaded by the app: no CDNs, no fonts, no analytics.

## Scope notes

- Reports about the sample README or intentionally flawed demo content are not
  vulnerabilities.
- The dev server (`server.mjs`) is for local development only and is not intended to be
  exposed to the internet; issues that require it to be internet-facing are out of scope.

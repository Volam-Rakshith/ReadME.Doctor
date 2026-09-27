/**
 * README Doctor — rule registry.
 *
 * Single source of truth for every diagnostic rule: id, default severity,
 * category, why it matters, and the suggested fix. The methodology dialog
 * and docs/METHODOLOGY.md are generated from this table, so the product
 * never documents a rule it does not implement (and vice versa).
 *
 * Severities can be overridden per-finding when the evidence warrants it,
 * but the default lives here.
 */

export const RULES = {
  /* ---------------------------------------------------------------- */
  /* Structure                                                         */
  /* ---------------------------------------------------------------- */
  'structure.title-missing': {
    title: 'No title',
    severity: 'critical',
    category: 'Structure',
    why: 'The title is the first thing a reader and every search engine sees. Without an H1, the project is hard to identify in a browser tab, a star history, or a Google result.',
    suggestion: 'Start the README with a single `# Project Name` heading at the very top.',
  },
  'structure.title-not-first': {
    title: 'Title is not the first content',
    severity: 'improvement',
    category: 'Structure',
    why: 'Readers scan the top of the page first; a title buried below badges or HTML blocks is easy to miss.',
    suggestion: 'Move the H1 to the first line, then badges and description below it.',
  },
  'structure.multiple-h1': {
    title: 'Multiple H1 headings',
    severity: 'improvement',
    category: 'Structure',
    why: 'GitHub and most Markdown renderers generate a document outline; multiple H1s flatten it and produce ambiguous anchors.',
    suggestion: 'Use a single H1 for the project name and H2/H3 for sections.',
  },
  'structure.description-missing': {
    title: 'No project description',
    severity: 'critical',
    category: 'Structure',
    why: 'A visitor decides within seconds whether to keep reading. Without 1–3 sentences describing what this is and who it is for, most will bounce.',
    suggestion: 'Add 1–3 sentences directly under the title: what it does, who it is for, and the key differentiator.',
  },
  'structure.description-thin': {
    title: 'Project description is very thin',
    severity: 'improvement',
    category: 'Structure',
    why: 'One or two words under the title does not tell a reader what problem the project solves.',
    suggestion: 'Expand the intro to at least a full sentence or two, and mention the primary use case.',
  },
  'structure.section-missing': {
    title: 'Missing section',
    severity: 'important',
    category: 'Structure',
    why: 'Readers arrive with specific questions (how do I install it? how do I use it? can I trust it?). Missing sections force them to read your source code instead.',
    suggestion: 'Add the missing section with concrete, copy-pasteable content.',
  },
  'structure.section-empty': {
    title: 'Empty or near-empty section',
    severity: 'important',
    category: 'Structure',
    why: 'A heading with no content looks unfinished and makes the whole README feel unpolished — readers start doubting the rest.',
    suggestion: 'Fill the section in, or remove the heading until the content exists.',
  },
  'structure.installation-no-commands': {
    title: 'Installation has no commands',
    severity: 'important',
    category: 'Structure',
    why: 'Installation instructions that cannot be copy-pasted are the number one source of "doesn\u2019t work" issues.',
    suggestion: 'Add a fenced code block with the exact install command(s) (e.g. `npm install your-package`).',
  },
  'structure.usage-no-examples': {
    title: 'No runnable usage example',
    severity: 'critical',
    category: 'Structure',
    why: 'Without at least one copy-pasteable example, a new user cannot get to a first success — the strongest predictor of abandonment.',
    suggestion: 'Add a minimal but complete usage example in a fenced code block.',
  },
  'structure.section-present': {
    title: 'Well-covered section',
    severity: 'good',
    category: 'Structure',
    why: 'This section answers the reader\u2019s question directly — keep it maintained.',
    suggestion: '',
  },
  'structure.duplicate-section': {
    title: 'Duplicate section headings',
    severity: 'improvement',
    category: 'Structure',
    why: 'Two sections with the same purpose split the information and produce ambiguous anchors.',
    suggestion: 'Merge the duplicates into a single section.',
  },
  'structure.long-document': {
    title: 'Very long README',
    severity: 'improvement',
    category: 'Structure',
    why: 'READMEs beyond ~600 lines are hard to navigate; detailed guides usually belong in a docs/ folder.',
    suggestion: 'Split detailed content into separate docs/ files and link to them from the README.',
  },

  /* ---------------------------------------------------------------- */
  /* Consistency                                                       */
  /* ---------------------------------------------------------------- */
  'consistency.anchor-broken': {
    title: 'Broken in-page anchor',
    severity: 'important',
    category: 'Links',
    why: 'The link points to a heading that does not exist in this document, so it scrolls nowhere — a broken promise to the reader.',
    suggestion: 'Fix the anchor to match the heading, or update the heading.',
  },
  'consistency.file-missing': {
    title: 'Referenced file does not exist',
    severity: 'important',
    category: 'Links',
    why: 'The README links to a file or folder that is not in the repository (on the default branch). Readers hit a 404.',
    suggestion: 'Fix the path, commit the file, or remove the reference.',
  },
  'consistency.file-case-mismatch': {
    title: 'File name case mismatch',
    severity: 'important',
    category: 'Links',
    why: 'The link\u2019s capitalisation does not match the repository (e.g. Readme.md vs README.md). It may work on case-insensitive systems and 404 on GitHub and Linux.',
    suggestion: 'Match the exact capitalisation used in the repository.',
  },
  'consistency.file-unverified': {
    title: 'Relative reference could not be verified',
    severity: 'unverified',
    category: 'Links',
    why: 'Without repository context the file cannot be checked; verify the path exists in the repo.',
    suggestion: 'Diagnose with the repository URL to verify file references automatically.',
  },
  'consistency.image-missing': {
    title: 'Referenced image is missing',
    severity: 'important',
    category: 'Links',
    why: 'The image path does not exist in the repository, so the README shows a broken image placeholder.',
    suggestion: 'Fix the path or add the image asset.',
  },
  'consistency.image-no-alt': {
    title: 'Image without alt text',
    severity: 'improvement',
    category: 'Consistency',
    why: 'Screen reader users get no information, and the image fails silently when it cannot load.',
    suggestion: 'Add descriptive alt text: `![Diagram of the build pipeline](docs/pipeline.png)`.',
  },
  'consistency.env-undocumented': {
    title: 'Environment variables used but never documented',
    severity: 'important',
    category: 'Consistency',
    why: 'Setup will fail for anyone who does not know which variables are required. Secrets in particular need explicit documentation.',
    suggestion: 'Add an "Environment variables" section with a table: name, required?, purpose, default.',
  },
  'consistency.env-unexplained': {
    title: 'Environment variables mentioned but not explained',
    severity: 'important',
    category: 'Consistency',
    why: 'A variable that appears only inside a command tells the reader nothing about its purpose, type, or default value.',
    suggestion: 'Document each variable in a table or list: name, required, purpose, default.',
  },
  'consistency.env-example-mismatch': {
    title: 'README and .env.example disagree',
    severity: 'improvement',
    category: 'Consistency',
    why: 'The .env.example is the contract for local setup; when it and the README list different variables, one of them is stale.',
    suggestion: 'Reconcile the lists — document every variable in .env.example, and remove obsolete ones.',
  },
  'consistency.script-missing': {
    title: 'README references a script that does not exist',
    severity: 'important',
    category: 'Consistency',
    why: '`npm run <script>` commands fail when the script is not defined in package.json — instant broken setup.',
    suggestion: 'Add the script to package.json or update the command.',
  },
  'consistency.package-name-mismatch': {
    title: 'Install command does not match the package name',
    severity: 'important',
    category: 'Consistency',
    why: 'Readers will copy the install command verbatim; if the package name is wrong it installs something else (or nothing).',
    suggestion: 'Update the install command to the actual package name.',
  },
  'consistency.toolchain-mismatch': {
    title: 'Commands reference a toolchain the repository does not use',
    severity: 'important',
    category: 'Consistency',
    why: 'Install instructions that do not match the repository\u2019s manifest files will not work as written.',
    suggestion: 'Align the instructions with the repository\u2019s actual package manager / manifest.',
  },
  'consistency.license-missing': {
    title: 'No license anywhere',
    severity: 'critical',
    category: 'Consistency',
    why: 'Without a license, nobody may legally use, copy or distribute the code — the project is effectively "all rights reserved", which blocks adoption.',
    suggestion: 'Add a LICENSE file (e.g. MIT) and mention it in the README.',
  },
  'consistency.license-mismatch': {
    title: 'License mismatch between README and repository',
    severity: 'critical',
    category: 'Consistency',
    why: 'Conflicting license claims make the project legally ambiguous — companies will avoid it entirely.',
    suggestion: 'Pick one license and make the README and the LICENSE file agree.',
  },
  'consistency.license-file-missing': {
    title: 'License declared in README but no LICENSE file found',
    severity: 'important',
    category: 'Consistency',
    why: 'The actual license is the file GitHub detects; a README claim alone leaves the repository marked "no license".',
    suggestion: 'Add the LICENSE file that matches the README\u2019s claim.',
  },
  'consistency.node-version-mismatch': {
    title: 'Documented runtime version conflicts with manifest',
    severity: 'important',
    category: 'Consistency',
    why: 'When the README and package.json disagree about the required runtime version, one of them is stale and users hit confusing errors.',
    suggestion: 'Update the README to match the engines field (or fix the engines field).',
  },
  'consistency.stale-content': {
    title: 'Stale or placeholder content',
    severity: 'improvement',
    category: 'Consistency',
    why: 'TODOs, "coming soon" and template placeholders tell readers the documentation is not maintained.',
    suggestion: 'Replace placeholder text with real content, or delete the marker.',
  },
  'consistency.branch-mismatch': {
    title: 'Link targets a non-default branch',
    severity: 'improvement',
    category: 'Links',
    why: 'Links pinned to a renamed or deleted branch break; the default branch is the stable reference.',
    suggestion: 'Prefer linking to the default branch, or use a tag/commit for permanence.',
  },
  'consistency.duplicate-heading': {
    title: 'Duplicate heading text',
    severity: 'improvement',
    category: 'Links',
    why: 'GitHub disambiguates duplicate headings with -1 suffixes, so anchors like #section may point at the wrong occurrence.',
    suggestion: 'Rename one of the headings to make anchors unambiguous.',
  },
  'consistency.code-no-language': {
    title: 'Code blocks without a language tag',
    severity: 'improvement',
    category: 'Consistency',
    why: 'Language tags enable syntax highlighting and tell copy-paste readers which shell to use.',
    suggestion: 'Tag fences with the language: ```bash, ```js, ```python …',
  },
  'consistency.link-broken': {
    title: 'Broken external link',
    severity: 'important',
    category: 'Links',
    why: 'A 404 in the README erodes trust in the whole document.',
    suggestion: 'Update or remove the link.',
  },
  'consistency.link-redirect': {
    title: 'Link redirects',
    severity: 'improvement',
    category: 'Links',
    why: 'Redirect chains add latency and eventually rot; the destination should be linked directly.',
    suggestion: 'Update the link to its final destination.',
  },
  'consistency.link-unreachable': {
    title: 'Link could not be reached',
    severity: 'improvement',
    category: 'Links',
    why: 'The host did not respond from here. It may be temporarily down, blocking automated clients, or gone — worth a manual check.',
    suggestion: 'Open the URL manually; if it is dead, remove or replace it.',
  },
  'consistency.link-not-checked': {
    title: 'External links not checked',
    severity: 'unverified',
    category: 'Links',
    why: 'Link checking is budgeted to stay polite; the remaining links were not verified in this run.',
    suggestion: 'Re-run the diagnosis to check another batch, or verify them manually.',
  },
  'consistency.links-ok': {
    title: 'External links respond',
    severity: 'good',
    category: 'Links',
    why: 'Every checked external link returned a successful response.',
    suggestion: '',
  },
  'consistency.anchors-ok': {
    title: 'All internal anchors resolve',
    severity: 'good',
    category: 'Links',
    why: 'In-page navigation works — small thing, big difference in perceived quality.',
    suggestion: '',
  },

  /* ---------------------------------------------------------------- */
  /* Contributor friction                                              */
  /* ---------------------------------------------------------------- */
  'friction.prerequisites-unclear': {
    title: 'Prerequisites are unclear',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'Install steps silently assume a runtime version; contributors on other versions hit confusing failures.',
    suggestion: 'State exact prerequisites (e.g. "Node.js ≥ 20, npm ≥ 10") before the install command.',
  },
  'friction.dev-setup-missing': {
    title: 'No local development instructions',
    severity: 'important',
    category: 'Contributor friction',
    why: 'Without clone → install → run steps, every potential contributor has to reverse-engineer the workflow.',
    suggestion: 'Add a "Development" section: clone, install, run, build commands.',
  },
  'friction.tests-undocumented': {
    title: 'No test instructions',
    severity: 'important',
    category: 'Contributor friction',
    why: 'Contributors cannot verify their changes without knowing how to run the test suite.',
    suggestion: 'Document how to run the tests (one command) in a "Testing" section.',
  },
  'friction.contributing-missing': {
    title: 'No contribution process',
    severity: 'important',
    category: 'Contributor friction',
    why: '"PRs welcome" is not a process. Without conventions, first-time contributors guess and their PRs bounce.',
    suggestion: 'Add a CONTRIBUTING.md (or a Contributing section) describing branch, commit and PR expectations.',
  },
  'friction.contributing-thin': {
    title: 'Contribution section is very thin',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'Two words do not answer the questions contributors actually have: what to build, how to test, what a good PR looks like.',
    suggestion: 'Expand with: how to set up, where issues are triaged, PR conventions, and how CI must pass.',
  },
  'friction.issue-expectations': {
    title: 'No issue/PR expectations',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'Clear expectations (search first, use templates, provide reproduction steps) cut maintainer triage time dramatically.',
    suggestion: 'State what a good issue/PR includes, or add .github/ISSUE_TEMPLATE files and link them.',
  },
  'friction.structure-undocumented': {
    title: 'Project structure is not explained',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'A new contributor has to guess where things live; a small tree diagram removes that friction.',
    suggestion: 'Add a short annotated `tree` of the important directories.',
  },
  'friction.security-reporting': {
    title: 'No security reporting guidance',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'If someone finds a vulnerability they need a private channel — a public GitHub issue is the wrong place.',
    suggestion: 'Add a SECURITY.md or a "Reporting vulnerabilities" note with a private contact.',
  },
  'friction.ci-status-missing': {
    title: 'CI runs but no status is shown',
    severity: 'improvement',
    category: 'Contributor friction',
    why: 'A visible CI badge tells contributors the main branch is green before they start.',
    suggestion: 'Add the workflow status badge at the top of the README.',
  },

  /* ---------------------------------------------------------------- */
  /* Positive findings                                                 */
  /* ---------------------------------------------------------------- */
  'good.env-documented': {
    title: 'Environment variables documented',
    severity: 'good',
    category: 'Consistency',
    why: 'Setup succeeds on the first try when every variable is listed with its purpose.',
    suggestion: '',
  },
  'good.license-consistent': {
    title: 'License is consistent',
    severity: 'good',
    category: 'Consistency',
    why: 'README and repository agree on the license — legally unambiguous, adoption-friendly.',
    suggestion: '',
  },
  'good.contributing-file': {
    title: 'CONTRIBUTING guide present',
    severity: 'good',
    category: 'Contributor friction',
    why: 'A dedicated contributing guide is the single biggest friction reducer for new contributors.',
    suggestion: '',
  },
  'good.test-instructions': {
    title: 'Test instructions present',
    severity: 'good',
    category: 'Contributor friction',
    why: 'Contributors can verify their work before opening a PR.',
    suggestion: '',
  },
  'good.ci-visible': {
    title: 'CI status visible',
    severity: 'good',
    category: 'Contributor friction',
    why: 'A visible pipeline status builds trust in the main branch.',
    suggestion: '',
  },
};

/**
 * README Doctor — GitHub public data client.
 *
 * Privacy contract (see docs/METHODOLOGY.md):
 *  - Reads PUBLIC repository data only, via api.github.com / raw.githubusercontent.com.
 *  - Never requests any OAuth scope; write permissions are never sought.
 *  - An optional personal access token (no scopes) may be supplied by the
 *    user to raise the rate limit; it stays in the browser (memory + the
 *    browser's own localStorage if the user opts in) and is only sent to
 *    api.github.com.
 *  - Budget: at most ~4 API requests + a handful of raw file fetches per
 *    diagnosis. Link checks have their own separate budget (links.js).
 */

import { stripHashAndQuery } from './util.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GithubError extends Error {
  constructor(message, kind, detail) {
    super(message);
    this.name = 'GithubError';
    this.kind = kind; // 'not-found' | 'rate-limit' | 'network' | 'invalid' | 'private'
    this.detail = detail;
  }
}

/**
 * Accepts: https://github.com/owner/repo, …/tree/branch, …/blob/branch/path.md,
 * raw.githubusercontent URLs, or plain "owner/repo".
 */
export function parseRepoInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new GithubError('Enter a GitHub repository URL or “owner/repo”.', 'invalid');

  let m = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob|raw)\/([^/?#]+)(?:\/([^\s?#]*))?)?/i.exec(raw);
  if (m) {
    return {
      owner: m[1],
      repo: m[2].replace(/\.git$/, ''),
      branch: m[3] ? decodeURIComponent(m[3]) : null,
      readmePath: m[4] ? stripHashAndQuery(decodeURIComponent(m[4])) : null,
    };
  }
  m = /^https?:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([^/]+)\/([^\s?#]+)/i.exec(raw);
  if (m) {
    return { owner: m[1], repo: m[2], branch: m[3], readmePath: stripHashAndQuery(m[4]) };
  }
  m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(raw);
  if (m && !raw.includes(' ')) {
    return { owner: m[1], repo: m[2], branch: null, readmePath: null };
  }
  throw new GithubError(
    'That does not look like a GitHub repository. Try https://github.com/owner/repo or owner/repo.',
    'invalid',
  );
}

/**
 * Fetch everything needed for a diagnosis from public data.
 * @param {string|object} input URL or parsed repo
 * @param {object} [opts] { token, fetchImpl, onProgress }
 */
export async function fetchRepoContext(input, opts = {}) {
  const { token, fetchImpl = fetch, onProgress = () => {} } = opts;
  const parsed = typeof input === 'string' ? parseRepoInput(input) : input;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const report = (msg) => onProgress(msg);

  /* ---- 1. Repository metadata (1 request) ---- */
  report('Fetching repository metadata…');
  let info;
  try {
    const res = await fetchImpl(`${API}/repos/${parsed.owner}/${parsed.repo}`, { headers });
    if (res.status === 404) throw new GithubError('Repository not found — it may be private. README Doctor reads public repositories only and never asks for write access.', 'not-found');
    if (res.status === 403 || res.status === 429) throw rateLimitError(res);
    if (!res.ok) throw new GithubError(`GitHub API error (${res.status}).`, 'network');
    info = await res.json();
  } catch (e) {
    if (e instanceof GithubError) throw e;
    throw new GithubError('Could not reach github.com — check your connection.', 'network', e);
  }

  const branch = parsed.branch || info.default_branch || 'main';
  const owner = info.owner?.login ?? parsed.owner;
  const repo = info.name ?? parsed.repo;

  /* ---- 2. README (1 request; honours the exact file if a blob URL was given) ---- */
  report('Fetching README…');
  let markdown = '';
  let readmePath = parsed.readmePath;
  try {
    if (readmePath) {
      const raw = await fetchImpl(`${RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${readmePath.split('/').map(encodeURIComponent).join('/')}`);
      if (!raw.ok) throw new Error(String(raw.status));
      markdown = await raw.text();
    } else {
      const res = await fetchImpl(`${API}/repos/${owner}/${repo}/readme`, {
        headers: { ...headers, Accept: 'application/vnd.github.raw+json' },
      });
      if (res.status === 403 || res.status === 429) throw rateLimitError(res);
      if (!res.ok) throw new Error(String(res.status));
      markdown = await res.text();
      readmePath = 'README.md';
    }
  } catch (e) {
    if (e instanceof GithubError) throw e;
    throw new GithubError('Could not download the README (the repository may be empty).', 'not-found', e);
  }

  /* ---- 3. File tree (1 request) ---- */
  report('Fetching file tree…');
  let tree = new Set();
  let treeTruncated = false;
  try {
    const res = await fetchImpl(`${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
    if (res.ok) {
      const data = await res.json();
      treeTruncated = Boolean(data.truncated);
      for (const entry of (data.tree ?? []).slice(0, 100000)) {
        if (entry.type === 'blob' || entry.type === 'tree') tree.add(entry.path);
      }
    }
  } catch {
    tree = new Set(); // tree checks degrade to "unverified"
  }
  const treeLower = new Map([...tree].map((p) => [p.toLowerCase(), p]));

  /* ---- 4. Manifest enrichment (raw fetches; no API quota) ---- */
  report('Fetching manifests…');
  const fetchRaw = async (path) => {
    try {
      const res = await fetchImpl(`${RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`);
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };

  let packageJson = null;
  let envExample = null;
  if (tree.has('package.json')) {
    const text = await fetchRaw('package.json');
    try {
      packageJson = text ? JSON.parse(text) : null;
    } catch {
      packageJson = null;
    }
  }
  if (tree.has('.env.example')) envExample = await fetchRaw('.env.example');

  return {
    owner,
    repo,
    branch,
    readmePath,
    readmeDir: readmePath?.includes('/') ? readmePath.replace(/\/[^/]*$/, '') : '',
    markdown,
    tree,
    treeLower,
    treeTruncated,
    license: info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION' ? info.license.spdx_id : null,
    description: info.description ?? null,
    defaultBranch: info.default_branch,
    htmlUrl: info.html_url,
    packageJson,
    envExample,
  };
}

function rateLimitError(res) {
  const remaining = res.headers?.get?.('x-ratelimit-remaining');
  const reset = res.headers?.get?.('x-ratelimit-reset');
  const when = reset ? new Date(Number(reset) * 1000) : null;
  const whenText = when ? ` Try again after ${when.toLocaleTimeString()}.` : '';
  return new GithubError(
    `GitHub API rate limit reached (60 requests/hour without a token).${whenText} You can paste a read-only personal access token (no scopes needed) in the advanced options — it never leaves your browser.`,
    'rate-limit',
    { remaining, reset },
  );
}

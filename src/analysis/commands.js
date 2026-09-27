/**
 * README Doctor — shell command extraction.
 *
 * Extracts the commands a reader would actually copy from the README:
 * fenced code blocks tagged with a shell language, and inline code spans
 * that look like commands. Used to cross-check commands against the
 * repository's manifest files (package.json scripts, …).
 */

const SHELL_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'console', 'terminal', 'shell-session', 'fish', 'sh-session',
]);

const COMMAND_STARTERS =
  /^(npm|npx|yarn|pnpm|bun|make|pip|pip3|python|python3|node|cargo|go|docker|docker-compose|composer|gem|gradle|mvn|deno|git|brew|apt|apt-get|choco|scoop)\b/;

const YARN_BUILTINS = new Set([
  'add', 'install', 'remove', 'upgrade', 'up', 'why', 'info', 'init', 'link', 'unlink', 'publish',
  'login', 'logout', 'set', 'config', 'workspaces', 'dlx', 'create', 'exec', 'run', 'cache',
  'global', 'node', 'version', 'pack', 'outdated', 'workspace', 'rebuild', 'licenses', 'constraints',
  'start', // not checked for the same reason as bare `npm start`
]);

const PNPM_BUILTINS = new Set([
  'add', 'install', 'remove', 'update', 'up', 'why', 'run', 'exec', 'dlx', 'create', 'init', 'link',
  'unlink', 'list', 'ls', 'outdated', 'store', 'fetch', 'pack', 'publish', 'test', 'build', 'dev',
  'start', 'rebuild', 'config', 'setup', 'root',
]);

/** Walk every block (recursing into quotes and list items). */
export function walkAllBlocks(blocks, visit) {
  for (const b of blocks) {
    visit(b);
    if (b.type === 'quote') walkAllBlocks(b.blocks, visit);
    if (b.type === 'list') for (const item of b.items) walkAllBlocks(item.blocks, visit);
  }
}

/** Walk inline tokens (recursing into emphasis and link children). */
export function walkInline(tokens, visit) {
  for (const t of tokens ?? []) {
    visit(t);
    if (t.children) walkInline(t.children, visit);
  }
}

/**
 * @returns {Array<{cmd: string, args: string[], line: number, source: 'block'|'inline'}>}
 */
export function extractCommands(doc) {
  const commands = [];
  walkAllBlocks(doc.blocks, (b) => {
    if (b.type === 'code' && !b.indented) {
      const isShell = SHELL_LANGS.has(b.lang.toLowerCase());
      const lines = b.raw.split('\n');
      lines.forEach((raw, idx) => {
        const line = b.line + 1 + idx;
        let text = raw.trim();
        if (!text || text.startsWith('#')) return;
        text = text.replace(/^[$>]\s+/, '').replace(/^%\s+/, '').trim();
        if (!isShell && !COMMAND_STARTERS.test(text)) return;
        if (/^(cd|echo|mkdir|cp|mv|rm|ls|curl|wget|sudo|export|set|source|cat|touch|chmod|sudo)\b/.test(text) && !COMMAND_STARTERS.test(text)) return;
        for (const part of splitCommandLine(text)) {
          const tokens = part.split(/\s+/).filter(Boolean);
          if (!tokens.length) continue;
          if (!COMMAND_STARTERS.test(tokens[0])) continue;
          commands.push({ cmd: tokens[0], args: tokens.slice(1), line, source: 'block' });
        }
      });
    }
    if (b.type === 'paragraph' || b.type === 'heading') {
      walkInline(b.inline ?? [], (t) => {
        if (t.type !== 'codespan') return;
        const text = t.code.trim();
        if (!COMMAND_STARTERS.test(text)) return;
        for (const part of splitCommandLine(text)) {
          const tokens = part.split(/\s+/).filter(Boolean);
          if (!COMMAND_STARTERS.test(tokens[0])) return;
          commands.push({ cmd: tokens[0], args: tokens.slice(1), line: t.line, source: 'inline' });
        }
      });
    }
  });
  return commands;
}

/** Split a shell line on command separators (&&, ||, ;, |) — string literals kept simple. */
function splitCommandLine(text) {
  return text
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Interpret a command: which npm-style script does it invoke? */
export function scriptNameOf(command) {
  const { cmd, args } = command;
  if (cmd === 'npm') {
    if (args[0] === 'run') return args[1] ?? null;
    // Bare `npm start` is deliberately not checked: in tutorial-style READMEs it
    // usually refers to the *reader's* app, not this repository.
    if (args[0] === 'test') return args[0];
    return null;
  }
  if (cmd === 'yarn' || cmd === 'pnpm' || cmd === 'bun') {
    const sub = args[0];
    if (!sub) return null;
    if (cmd === 'yarn' && !YARN_BUILTINS.has(sub) && sub !== 'run') return sub;
    if (cmd === 'yarn' && sub === 'run') return args[1] ?? null;
    if (cmd === 'pnpm' && !PNPM_BUILTINS.has(sub) && sub !== 'run') return sub;
    if (cmd === 'pnpm' && sub === 'run') return args[1] ?? null;
    if (cmd === 'bun' && sub === 'run') return args[1] ?? null;
    return null;
  }
  return null;
}

/** Which package does the command install (npm/yarn/pnpm/pip), if any? */
export function installedPackageOf(command) {
  const { cmd, args } = command;
  if (cmd === 'npm' && (args[0] === 'install' || args[0] === 'i')) {
    const rest = args.slice(1).filter((a) => !a.startsWith('-'));
    if (args[1] === '-g' || args[1] === '--global') return { name: args[2] ?? null, global: true };
    return { name: rest[0] ?? null, global: false };
  }
  if ((cmd === 'yarn' && args[0] === 'add') || (cmd === 'pnpm' && args[0] === 'add') || (cmd === 'bun' && args[0] === 'add')) {
    const rest = args.slice(1).filter((a) => !a.startsWith('-'));
    return { name: rest[0] ?? null, global: args.includes('-g') || args.includes('--global') };
  }
  if ((cmd === 'pip' || cmd === 'pip3') && args[0] === 'install') {
    const rest = args.slice(1).filter((a) => !a.startsWith('-'));
    return { name: rest[0] ?? null, global: false };
  }
  return null;
}

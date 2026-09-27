/**
 * README Doctor — Markdown parser.
 *
 * A dependency-free block + inline parser that covers the Markdown subset
 * real READMEs use (CommonMark + GFM tables/strikethrough), with one extra
 * guarantee generic parsers do not offer: every token carries the *source
 * line* it came from. Diagnostic annotations depend on that.
 *
 * Design notes:
 *  - Reference link definitions may appear after they are used, so inline
 *    parsing runs in a second pass (`hydrateInline`) once all definitions
 *    are known.
 *  - Block types: heading, paragraph, code, list, table, quote, html, hr.
 *  - Inline tokens: text, codespan, link, image, strong, em, del, br.
 */

import { countNewlines, escapeRe, leadingSpaces, normalizeLabel } from '../util.js';
import { Slugger } from './slugger.js';

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/;
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
const HR_RE = /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT_H1_RE = /^ {0,3}=+[ \t]*$/;
const SETEXT_H2_RE = /^ {0,3}-+[ \t]*$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;
const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const HTML_OPEN_RE = /^ {0,3}<(?!https?:\/\/|mailto:|[a-zA-Z0-9._%+-]+@)[a-zA-Z][a-zA-Z0-9-]*/;
const HTML_COMMENT_OPEN_RE = /^ {0,3}<!--/;
const LINK_DEF_RE =
  /^ {0,3}\[([^\]\n]*)\]:[ \t]*<?([^\s>]+)>?[ \t]*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?[ \t]*$/;
const TABLE_DELIM_RE = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(?:\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

const ESCAPABLE = '\\`*_{}[]()#+-.!~<>|';

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse a Markdown document.
 * @returns {{source: string, lines: string[], blocks: Array, linkDefs: Map,
 *            headings: Array<{level:number,text:string,id:string,line:number}>, slugger: Slugger}}
 */
export function parseMarkdown(source) {
  const src = String(source ?? '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const linkDefs = new Map();
  const blocks = parseBlocks(lines, 0, linkDefs);
  hydrateInline(blocks, linkDefs);

  const slugger = new Slugger();
  const headings = [];
  collectHeadings(blocks, headings, slugger);
  return { source: src, lines, blocks, linkDefs, headings, slugger };
}

/** Flatten every link/image in the document (for the link checker). */
export function collectLinks(doc, out = []) {
  walkBlocks(doc.blocks, (block) => {
    if (block.type === 'heading' || block.type === 'paragraph') {
      collectFromInline(block.inline, out);
    } else if (block.type === 'table') {
      const cells = [block.header, ...block.rows];
      for (let r = 0; r < cells.length; r++) {
        for (const cell of cells[r]) {
          if (cell && cell.inline) collectFromInline(cell.inline, out);
        }
      }
    }
  });
  return out;
}

/** Plain text of an inline token list (strips formatting). */
export function inlineToText(tokens) {
  let text = '';
  for (const t of tokens ?? []) {
    if (t.type === 'text' || t.type === 'codespan') text += t.type === 'codespan' ? t.code : t.text;
    else if (t.type === 'link') text += t.rawText ?? inlineToText(t.children);
    else if (t.type === 'image') text += t.alt || '';
    else if (t.type === 'br') text += ' ';
    else if (t.children) text += inlineToText(t.children);
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Block parsing                                                       */
/* ------------------------------------------------------------------ */

function parseBlocks(lines, offset, linkDefs) {
  const blocks = [];
  const n = lines.length;
  let i = 0;

  while (i < n) {
    const line = lines[i];

    if (/^[ \t]*$/.test(line)) {
      i++;
      continue;
    }

    // Link reference definition: [label]: dest "title"
    const def = LINK_DEF_RE.exec(line);
    if (def) {
      linkDefs.set(normalizeLabel(def[1]), {
        href: def[2],
        title: def[3] ?? def[4] ?? def[5] ?? '',
        line: offset + i,
      });
      i++;
      continue;
    }

    // Fenced code block
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const open = fence[1];
      const closeRe = open[0] === '`' ? /^ {0,3}(`{3,})[ \t]*$/ : /^ {0,3}(~{3,})[ \t]*$/;
      const info = fence[2].trim();
      const body = [];
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const cm = closeRe.exec(lines[j]);
        if (cm && cm[1].length >= open.length) {
          closed = true;
          break;
        }
        body.push(lines[j]);
        j++;
      }
      blocks.push({
        type: 'code',
        lang: firstWord(info),
        info,
        raw: body.join('\n'),
        line: offset + i,
        endLine: offset + (closed ? j : Math.max(i, j - 1)),
        closed,
      });
      i = closed ? j + 1 : j;
      continue;
    }

    // ATX heading
    const atx = ATX_RE.exec(line);
    if (atx) {
      blocks.push({
        type: 'heading',
        level: atx[1].length,
        raw: atx[2] ?? '',
        line: offset + i,
        endLine: offset + i,
      });
      i++;
      continue;
    }

    // Blockquote (recursive)
    if (QUOTE_RE.test(line)) {
      const inner = [];
      let j = i;
      while (j < n && QUOTE_RE.test(lines[j])) {
        inner.push(QUOTE_RE.exec(lines[j])[1]);
        j++;
      }
      blocks.push({
        type: 'quote',
        blocks: parseBlocks(inner, offset + i, linkDefs),
        line: offset + i,
        endLine: offset + j - 1,
      });
      i = j;
      continue;
    }

    // List
    if (LIST_RE.test(line) && !HR_RE.test(line)) {
      const result = parseList(lines, i, offset, linkDefs);
      blocks.push(result.block);
      i = result.next;
      continue;
    }

    // GFM table: header row + delimiter row
    if (line.includes('|') && i + 1 < n && TABLE_DELIM_RE.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const header = splitTableRow(line);
      const aligns = parseTableAligns(lines[i + 1]);
      const rows = [];
      let j = i + 2;
      while (j < n && lines[j].includes('|') && !/^[ \t]*$/.test(lines[j]) && !isBlockStart(lines[j], lines[j + 1], linkDefs)) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      blocks.push({ type: 'table', header, aligns, rows, line: offset + i, endLine: offset + j - 1 });
      i = j;
      continue;
    }

    // HTML block (comments end at -->, others end at a blank line)
    if (HTML_OPEN_RE.test(line) || HTML_COMMENT_OPEN_RE.test(line)) {
      const isComment = HTML_COMMENT_OPEN_RE.test(line);
      const body = [];
      let j = i;
      if (isComment) {
        while (j < n) {
          body.push(lines[j]);
          if (/-->/.test(lines[j])) {
            j++;
            break;
          }
          j++;
        }
      } else {
        while (j < n && !/^[ \t]*$/.test(lines[j])) {
          body.push(lines[j]);
          j++;
        }
      }
      blocks.push({
        type: 'html',
        raw: body.join('\n'),
        isComment,
        line: offset + i,
        endLine: offset + j - 1,
      });
      i = j;
      continue;
    }

    // Indented code block (only when it starts a block, not list continuation)
    if (/^ {4,}\S/.test(line)) {
      const body = [];
      let j = i;
      while (j < n) {
        if (/^[ \t]*$/.test(lines[j])) {
          // blank line keeps the block alive only if more indented code follows
          if (j + 1 < n && /^ {4,}\S/.test(lines[j + 1])) {
            body.push('');
            j++;
            continue;
          }
          break;
        }
        if (!/^ {4,}/.test(lines[j])) break;
        body.push(lines[j].replace(/^ {4}/, ''));
        j++;
      }
      blocks.push({
        type: 'code',
        lang: '',
        info: '',
        raw: body.join('\n'),
        line: offset + i,
        endLine: offset + j - 1,
        indented: true,
      });
      i = j;
      continue;
    }

    // Paragraph (may be terminated by a setext underline → heading)
    const para = [];
    let j = i;
    while (j < n) {
      const l = lines[j];
      if (/^[ \t]*$/.test(l)) break;
      if (SETEXT_H1_RE.test(l) || SETEXT_H2_RE.test(l)) break;
      if (isBlockStart(l, lines[j + 1], linkDefs)) break;
      para.push(l);
      j++;
    }
    if (para.length === 0) {
      // The line interrupted the paragraph immediately: hr or stray underline.
      if (HR_RE.test(line)) blocks.push({ type: 'hr', line: offset + i, endLine: offset + i });
      i++;
      continue;
    }
    if (j < n && SETEXT_H1_RE.test(lines[j])) {
      blocks.push({
        type: 'heading',
        level: 1,
        raw: para.join(' '),
        line: offset + i,
        endLine: offset + j,
        setext: true,
      });
      i = j + 1;
      continue;
    }
    if (j < n && SETEXT_H2_RE.test(lines[j])) {
      blocks.push({
        type: 'heading',
        level: 2,
        raw: para.join(' '),
        line: offset + i,
        endLine: offset + j,
        setext: true,
      });
      i = j + 1;
      continue;
    }
    blocks.push({ type: 'paragraph', raw: para.join('\n'), line: offset + i, endLine: offset + j - 1 });
    i = j;
  }

  return blocks;
}

/** Would this line start a new block (interrupting a paragraph)? */
function isBlockStart(line, nextLine, linkDefs = null) {
  if (FENCE_RE.test(line)) return true;
  if (ATX_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (SETEXT_H1_RE.test(line) || SETEXT_H2_RE.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (LIST_RE.test(line) && !HR_RE.test(line)) return true;
  if (HTML_OPEN_RE.test(line) || HTML_COMMENT_OPEN_RE.test(line)) return true;
  if (linkDefs && LINK_DEF_RE.test(line)) return true;
  if (line.includes('|') && nextLine && TABLE_DELIM_RE.test(nextLine) && /-/.test(nextLine)) return true;
  return false;
}

function parseList(lines, start, offset, linkDefs) {
  const first = LIST_RE.exec(lines[start]);
  const ordered = /\d/.test(first[2][0]);
  const baseIndent = leadingSpaces(lines[start]);
  const markerLen = first[2].length;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (/^[ \t]*$/.test(line)) {
      const next = lines[i + 1];
      const continues = next && (LIST_RE.test(next) || /^ {2,}\S/.test(next));
      if (continues) {
        i++;
        continue;
      }
      break;
    }

    const m = LIST_RE.exec(line);
    const isItem =
      m && leadingSpaces(line) <= baseIndent && /\d/.test(m[2][0]) === ordered && !HR_RE.test(line);

    if (isItem) {
      const itemLine = offset + i;
      const contentIndent = Math.max(baseIndent + markerLen + 1, 2);
      const content = [m[3] ?? ''];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (/^[ \t]*$/.test(l)) {
          const next = lines[i + 1];
          if (next && (/^ {2,}\S/.test(next) || LIST_RE.test(next))) {
            content.push('');
            i++;
            continue;
          }
          break;
        }
        const m2 = LIST_RE.exec(l);
        if (m2 && leadingSpaces(l) <= baseIndent) break; // sibling item or a new list
        const indent = leadingSpaces(l);
        if (indent >= contentIndent) {
          content.push(l.replace(/^[ \t]{1,}/, (ws) => ' '.repeat(Math.max(0, leadingSpaces(l) - contentIndent)) || ''));
          i++;
          continue;
        }
        // Lazy continuation: plain text lines extend the item.
        if (!isBlockStart(l, lines[i + 1], linkDefs) && !m2) {
          content.push(l.trimStart());
          i++;
          continue;
        }
        break;
      }
      // Sub-parse item content so nested lists, code fences and tables inside
      // items are handled; keep absolute line numbers via the offset.
      const itemBlocks = parseBlocks(content, itemLine, linkDefs);
      items.push({ line: itemLine, blocks: itemBlocks, text: content.join('\n') });
    } else {
      break;
    }
  }

  return {
    block: { type: 'list', ordered, items, line: offset + start, endLine: offset + i - 1 },
    next: i,
  };
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !/\\\|/.test(s.slice(-2))) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

function parseTableAligns(delimiter) {
  return splitTableRow(delimiter).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function firstWord(info) {
  const m = /^\S+/.exec(info);
  return m ? m[0] : '';
}

/* ------------------------------------------------------------------ */
/* Inline parsing (second pass, once link definitions are known)       */
/* ------------------------------------------------------------------ */

function hydrateInline(blocks, linkDefs) {
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      block.inline = parseInline(block.raw, block.line, linkDefs);
    } else if (block.type === 'table') {
      block.header = block.header.map((cell) => ({ text: cell, inline: parseInline(cell, block.line, linkDefs) }));
      block.rows = block.rows.map((row, r) =>
        row.map((cell) => ({ text: cell, inline: parseInline(cell, block.line + 1 + r, linkDefs) })),
      );
    } else if (block.type === 'quote') {
      hydrateInline(block.blocks, linkDefs);
    } else if (block.type === 'list') {
      for (const item of block.items) hydrateInline(item.blocks, linkDefs);
    }
  }
}

/**
 * Parse inline Markdown into tokens with line numbers.
 * @param {string} text
 * @param {number} startLine
 * @param {Map} linkDefs
 * @returns {Array} tokens
 */
export function parseInline(text, startLine = 0, linkDefs = new Map()) {
  const tokens = [];
  let buf = '';
  let line = startLine;
  const n = text.length;
  const flush = () => {
    if (buf) {
      tokens.push({ type: 'text', text: buf, line });
      buf = '';
    }
  };

  let p = 0;
  while (p < n) {
    const c = text[p];

    // Backslash escape
    if (c === '\\' && ESCAPABLE.includes(text[p + 1] ?? '')) {
      buf += text[p + 1];
      p += 2;
      continue;
    }

    // Newline (soft or hard break)
    if (c === '\n') {
      const hard = text[p - 1] === ' ' && text[p - 2] === ' ';
      if (hard) {
        buf = buf.replace(/ +$/, '');
        flush();
        tokens.push({ type: 'br', line });
      } else {
        buf += ' ';
      }
      line++;
      p++;
      continue;
    }

    // Code span
    if (c === '`') {
      const run = backtickRun(text, p);
      const close = findBacktickRun(text, p + run, run);
      if (close !== -1) {
        let code = text.slice(p + run, close);
        if (code.length >= 2 && /^ [\s\S] $|^ $/.test(code) && code.trim() !== '') {
          code = code.slice(1, -1);
        }
        flush();
        tokens.push({ type: 'codespan', code, line });
        line += countNewlines(text.slice(p, close + run));
        p = close + run;
        continue;
      }
      buf += c;
      p++;
      continue;
    }

    // Image: ![alt](src "title")
    if (c === '!' && text[p + 1] === '[') {
      const r = parseLinkTarget(text, p + 1, linkDefs);
      if (r) {
        flush();
        tokens.push({ type: 'image', href: r.href, title: r.title, alt: inlineToText(parseInline(r.label, line, linkDefs)), line });
        line += countNewlines(text.slice(p, r.end));
        p = r.end;
        continue;
      }
      buf += '!';
      p++;
      continue;
    }

    // Link: [text](dest) / [text][ref] / [shortcut]
    if (c === '[') {
      const r = parseLinkTarget(text, p, linkDefs);
      if (r) {
        flush();
        tokens.push({
          type: 'link',
          href: r.href,
          title: r.title,
          line,
          children: parseInline(r.label, line, linkDefs),
          rawText: inlineToText(parseInline(r.label, line, linkDefs)),
        });
        line += countNewlines(text.slice(p, r.end));
        p = r.end;
        continue;
      }
      buf += '[';
      p++;
      continue;
    }

    // Autolink: <https://…>, <mailto:…>, <a@b.c>
    if (c === '<') {
      const m = /^<(https?:\/\/[^ >]+|mailto:[^ >]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/.exec(text.slice(p));
      if (m) {
        const href = m[1].includes('@') && !/^mailto:|^https?:/i.test(m[1]) ? 'mailto:' + m[1] : m[1];
        flush();
        tokens.push({
          type: 'link',
          href,
          line,
          children: [{ type: 'text', text: m[1], line }],
          rawText: m[1],
          autolink: true,
        });
        p += m[0].length;
        continue;
      }
    }

    // Strikethrough
    if (c === '~' && text[p + 1] === '~') {
      const close = text.indexOf('~~', p + 2);
      if (close !== -1) {
        flush();
        tokens.push({ type: 'del', children: parseInline(text.slice(p + 2, close), line, linkDefs) });
        line += countNewlines(text.slice(p, close + 2));
        p = close + 2;
        continue;
      }
    }

    // Bare URL autolinking (GFM): https://… or www.… in plain text
    if (c === 'h' || c === 'w') {
      const rest = text.slice(p);
      const m = /^(https?:\/\/[^\s<>\u00a0]+|www\.[^\s<>\u00a0]+)/i.exec(rest);
      if (m && (c === 'h' || m[1].toLowerCase().startsWith('www.'))) {
        let url = m[1];
        // Trim trailing punctuation that is almost certainly sentence syntax
        url = url.replace(/[.,;:!?'")\]]+$/, '');
        if (url.length > 4) {
          flush();
          tokens.push({
            type: 'link',
            href: url.toLowerCase().startsWith('www.') ? 'https://' + url : url,
            line,
            children: [{ type: 'text', text: url, line }],
            rawText: url,
            autolink: true,
          });
          p += url.length;
          continue;
        }
      }
    }

    // Emphasis
    if (c === '*' || (c === '_' && !isWordChar(text[p - 1]))) {
      const dbl = text[p + 1] === c;
      const closeIdx = dbl ? text.indexOf(c + c, p + 2) : text.indexOf(c, p + 1);
      if (closeIdx > p) {
        const inner = dbl ? text.slice(p + 2, closeIdx) : text.slice(p + 1, closeIdx);
        flush();
        tokens.push({ type: dbl ? 'strong' : 'em', children: parseInline(inner, line, linkDefs) });
        line += countNewlines(text.slice(p, closeIdx + (dbl ? 2 : 1)));
        p = closeIdx + (dbl ? 2 : 1);
        continue;
      }
    }

    buf += c;
    p++;
  }
  flush();
  return tokens;
}

function parseLinkTarget(text, openIdx, linkDefs) {
  let depth = 0;
  let j = openIdx;
  while (j < text.length) {
    if (text[j] === '\\') {
      j += 2;
      continue;
    }
    if (text[j] === '[') depth++;
    else if (text[j] === ']') {
      depth--;
      if (depth === 0) break;
    }
    j++;
  }
  if (j >= text.length) return null;
  const label = text.slice(openIdx + 1, j);

  // Inline destination: [text](dest "title")
  if (text[j + 1] === '(') {
    let k = j + 2;
    let parenDepth = 1;
    let quote = null;
    while (k < text.length) {
      const ch = text[k];
      if (quote) {
        if (ch === '\\') k++;
        else if (ch === quote) quote = null;
        k++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        k++;
        continue;
      }
      if (ch === '(') parenDepth++;
      else if (ch === ')') {
        parenDepth--;
        if (parenDepth === 0) break;
      }
      k++;
    }
    if (k >= text.length) return null;
    let dest = text.slice(j + 2, k).trim();
    let title = '';
    const titleMatch = /\s+("([^"]*)"|'([^']*)'|\(([^)]*)\))\s*$/.exec(dest);
    if (titleMatch) {
      title = titleMatch[2] ?? titleMatch[3] ?? titleMatch[4] ?? '';
      dest = dest.slice(0, titleMatch.index);
    }
    dest = dest.replace(/^<(.*)>$/s, '$1');
    return { href: dest, title, label, end: k + 1 };
  }

  // Reference: [text][ref]
  if (text[j + 1] === '[') {
    const close = text.indexOf(']', j + 2);
    if (close === -1) return null;
    const def = linkDefs.get(normalizeLabel(text.slice(j + 2, close)));
    if (!def) return null;
    return { href: def.href, title: def.title, label, end: close + 1 };
  }

  // Shortcut: [text] where "text" is a defined label
  const def = linkDefs.get(normalizeLabel(label));
  if (def) return { href: def.href, title: def.title, label, end: j + 1 };
  return null;
}

function backtickRun(text, p) {
  let n = 0;
  while (text[p + n] === '`') n++;
  return n;
}

function findBacktickRun(text, from, length) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      let n = 0;
      while (text[i + n] === '`') n++;
      if (n === length) return i;
      i += n;
    } else i++;
  }
  return -1;
}

function isWordChar(c) {
  return c !== undefined && /[a-zA-Z0-9_\p{L}]/u.test(c);
}

/* ------------------------------------------------------------------ */
/* Heading collection                                                  */
/* ------------------------------------------------------------------ */

function collectHeadings(blocks, headings, slugger) {
  for (const block of blocks) {
    if (block.type === 'heading') {
      const text = inlineToText(block.inline ?? []).trim();
      const id = slugger.slug(text);
      block.id = id;
      headings.push({ level: block.level, text, id, line: block.line });
    } else if (block.type === 'quote') {
      collectHeadings(block.blocks, headings, slugger);
    } else if (block.type === 'list') {
      for (const item of block.items) collectHeadings(item.blocks, headings, slugger);
    }
  }
}

function walkBlocks(blocks, visit) {
  for (const block of blocks) {
    visit(block);
    if (block.type === 'quote') walkBlocks(block.blocks, visit);
    if (block.type === 'list') for (const item of block.items) walkBlocks(item.blocks, visit);
  }
}

function collectFromInline(tokens, out) {
  for (const t of tokens ?? []) {
    if (t.type === 'link') {
      out.push({ kind: 'link', href: t.href, title: t.title ?? '', text: t.rawText ?? '', line: t.line });
      collectFromInline(t.children, out);
    } else if (t.type === 'image') {
      out.push({ kind: 'image', href: t.href, title: t.title ?? '', text: t.alt ?? '', line: t.line });
    } else if (t.children) {
      collectFromInline(t.children, out);
    }
  }
}

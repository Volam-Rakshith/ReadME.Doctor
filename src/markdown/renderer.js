/**
 * README Doctor — Markdown renderer.
 *
 * Renders the parsed document to HTML for the "Rendered README" view.
 * Guarantees:
 *  - Every block element carries data-line so the UI can attach diagnostic
 *    markers and jump from findings to sections.
 *  - All text is escaped; raw HTML blocks pass through a strict sanitizer
 *    (whitelisted tags, no event handlers, no javascript: URLs).
 *  - Relative image sources can be resolved through ctx.resolveAsset so that
 *    repository images actually display when a repo context exists.
 */

import { escapeAttr, escapeHtml, isHttpUrl } from '../util.js';

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'dd', 'del',
  'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 'q', 'samp',
  'small', 'source', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'title', 'svg']);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'align', 'colspan', 'rowspan',
  'target', 'rel', 'id', 'class', 'name', 'open', 'start', 'reversed', 'type', 'datetime',
  'lang', 'dir', 'loading', 'decoding', 'cite',
]);

/**
 * @param {object} doc parsed document from parseMarkdown()
 * @param {object} [ctx]
 * @param {(href: string, kind: 'image') => string|null} [ctx.resolveAsset]
 *        Return a displayable URL for a relative image, or null to render a placeholder.
 */
export function renderMarkdown(doc, ctx = {}) {
  return doc.blocks.map((b) => renderBlock(b, ctx)).join('\n');
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case 'heading': {
      const inner = renderInline(b.inline ?? [], ctx);
      return `<h${b.level} id="${escapeAttr(b.id ?? '')}" data-line="${b.line}">${inner}</h${b.level}>`;
    }
    case 'paragraph':
      return `<p data-line="${b.line}">${renderInline(b.inline ?? [], ctx)}</p>`;
    case 'code':
      return `<pre data-line="${b.line}" data-lang="${escapeAttr(b.lang || '')}"><code>${escapeHtml(b.raw)}</code></pre>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = b.items
        .map((it) => `<li data-line="${it.line}">${it.blocks.map((x) => renderBlock(x, ctx)).join('')}</li>`)
        .join('');
      return `<${tag} data-line="${b.line}">${items}</${tag}>`;
    }
    case 'table': {
      const head = `<tr>${b.header
        .map((c, i) => `<th${alignStyle(b.aligns?.[i])}>${renderInline(c.inline ?? [], ctx)}</th>`)
        .join('')}</tr>`;
      const body = b.rows
        .map((row) => `<tr>${row.map((c, i) => `<td${alignStyle(b.aligns?.[i])}>${renderInline(c.inline ?? [], ctx)}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="md-table-wrap" data-line="${b.line}"><table data-line="${b.line}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    case 'quote':
      return `<blockquote data-line="${b.line}">${b.blocks.map((x) => renderBlock(x, ctx)).join('\n')}</blockquote>`;
    case 'html':
      return sanitizeHtmlBlock(b.raw, ctx);
    case 'hr':
      return `<hr data-line="${b.line}">`;
    default:
      return '';
  }
}

function alignStyle(align) {
  return align ? ` style="text-align:${align}"` : '';
}

function renderInline(tokens, ctx) {
  let out = '';
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
        out += escapeHtml(t.text);
        break;
      case 'codespan':
        out += `<code data-line="${t.line}">${escapeHtml(t.code)}</code>`;
        break;
      case 'br':
        out += '<br>';
        break;
      case 'strong':
        out += `<strong>${renderInline(t.children, ctx)}</strong>`;
        break;
      case 'em':
        out += `<em>${renderInline(t.children, ctx)}</em>`;
        break;
      case 'del':
        out += `<del>${renderInline(t.children, ctx)}</del>`;
        break;
      case 'link': {
        const href = safeUrl(t.href);
        if (!href) {
          out += `<span class="md-link-invalid" data-line="${t.line}" title="Empty or unsafe link destination">${renderInline(t.children, ctx)}</span>`;
          break;
        }
        const ext = isHttpUrl(href);
        const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
        out += `<a href="${escapeAttr(href)}"${attrs} data-line="${t.line}" class="md-link">${renderInline(t.children, ctx)}</a>`;
        break;
      }
      case 'image': {
        const alt = escapeAttr(t.alt ?? '');
        if (!t.href || /^(mailto|tel):/i.test(t.href)) {
          out += `<span class="md-img-missing" data-line="${t.line}">${escapeHtml(t.alt || 'image')}</span>`;
          break;
        }
        if (isHttpUrl(t.href)) {
          out += `<img src="${escapeAttr(t.href)}" alt="${alt}" loading="lazy" decoding="async" data-line="${t.line}">`;
          break;
        }
        const resolved = ctx.resolveAsset ? ctx.resolveAsset(t.href, 'image') : null;
        if (resolved) {
          out += `<img src="${escapeAttr(resolved)}" alt="${alt}" loading="lazy" decoding="async" data-line="${t.line}">`;
        } else {
          out += `<span class="md-img-missing" data-line="${t.line}">🖼️ ${escapeHtml(t.alt || t.href)} <small>(relative image — no repository context)</small></span>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Only allow http(s), mailto, tel, in-page anchors and relative paths. */
function safeUrl(href) {
  const s = String(href ?? '').trim();
  if (!s) return null;
  if (/^(javascript|vbscript|data|file):/i.test(s)) return null;
  if (/^\/\//.test(s)) return 'https:' + s;
  return s;
}

/**
 * Sanitize a raw HTML block from the README.
 * - Drops dangerous elements *with their content* (script, iframe, …).
 * - Keeps a whitelist of layout-ish tags, strips on* handlers and style attrs,
 *   neutralises javascript:/data: URLs, rewrites raw anchors safely.
 * - Extracts href/src of <a>/<img> so the analyzer can check them (the
 *   extraction itself happens in consistency.js on the raw text).
 */
export function sanitizeHtmlBlock(raw, ctx = {}) {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let out = '';
  let last = 0;
  let dropDepth = 0;
  let dropTag = null;
  let m;
  while ((m = tagRe.exec(raw)) !== null) {
    const between = raw.slice(last, m.index);
    if (dropDepth === 0) out += escapeHtml(between);
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === '/';

    if (dropDepth > 0) {
      if (closing && tag === dropTag) dropDepth--;
      else if (!closing && tag === dropTag && !selfClose) dropDepth++;
      continue;
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !selfClose) {
        dropDepth = 1;
        dropTag = tag;
      }
      continue;
    }
    if (tag === '!--') continue;
    if (!ALLOWED_TAGS.has(tag)) continue; // drop unknown tags, keep their text content
    if (closing) {
      out += `</${tag}>`;
      continue;
    }
    const attrs = parseAttrs(m[3]);
    let attrStr = '';
    for (const [name, value] of attrs) {
      const lname = name.toLowerCase();
      if (lname.startsWith('on') || lname === 'style') continue;
      if (!ALLOWED_ATTRS.has(lname)) continue;
      let v = value;
      if (lname === 'href' || lname === 'src' || lname === 'srcset') {
        if (lname === 'src' && !isHttpUrl(v) && !/^(data:image\/|\/|\.\/|\.\.\/|#)/.test(v)) {
          const resolved = ctx.resolveAsset ? ctx.resolveAsset(v, 'image') : null;
          if (resolved) v = resolved;
          else continue;
        }
        if (/^(javascript|vbscript|data:text\/html)/i.test(v)) continue;
      }
      attrStr += ` ${lname}="${escapeAttr(v)}"`;
    }
    if (tag === 'a' && /target=/.test(attrStr)) attrStr += ' rel="noopener noreferrer"';
    if (tag === 'a' && !/href=/.test(attrStr) && attrs.some(([nn]) => nn.toLowerCase() === 'href')) continue; // href was stripped as unsafe
    out += `<${tag}${attrStr}${selfClose ? ' /' : ''}>`;
  }
  if (dropDepth === 0) out += escapeHtml(raw.slice(last));
  return out;
}

function parseAttrs(str) {
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (!m[1]) continue;
    attrs.push([m[1], m[3] ?? m[4] ?? m[5] ?? '']);
  }
  return attrs;
}

/** Extract (href|src) values from raw HTML for analysis. */
export function extractHtmlRefs(raw) {
  const refs = [];
  const re = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (value) refs.push(value);
  }
  return refs;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/markdown/parser.js';
import { renderMarkdown, sanitizeHtmlBlock } from '../src/markdown/renderer.js';

test('rendered blocks carry data-line attributes', () => {
  const html = renderMarkdown(parseMarkdown('# T\n\ntext\n\n```bash\nls\n```\n'));
  assert.ok(html.includes('<h1 id="t" data-line="0">'));
  assert.ok(html.includes('<p data-line="2">'));
  assert.ok(html.includes('<pre data-line="4" data-lang="bash">'));
});

test('text content is escaped', () => {
  const html = renderMarkdown(parseMarkdown('Hello <script>alert(1)</script> & "quotes"'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&amp;'));
});

test('raw HTML script tags are dropped entirely', () => {
  const out = sanitizeHtmlBlock('<p>ok</p><script>alert("x")</script><p>after</p>');
  assert.ok(!out.toLowerCase().includes('script'));
  assert.ok(!out.includes('alert'));
  assert.ok(out.includes('ok'));
  assert.ok(out.includes('after'));
});

test('raw HTML event handlers are stripped', () => {
  const out = sanitizeHtmlBlock('<img src="https://cdn.example/x.png" onerror="alert(1)">');
  assert.ok(!out.includes('onerror'));
  assert.ok(out.includes('src="https://cdn.example/x.png"'));
});

test('javascript: URLs are neutralised', () => {
  const out = sanitizeHtmlBlock('<a href="javascript:alert(1)">x</a>');
  assert.ok(!out.includes('javascript:'));
});

test('iframe embeds are removed', () => {
  const out = sanitizeHtmlBlock('<iframe src="https://evil.example"></iframe>');
  assert.ok(!out.includes('iframe'));
});

test('legitimate alignment HTML is kept', () => {
  const out = sanitizeHtmlBlock('<p align="center"><img src="logo.png" alt="Logo"></p>');
  assert.ok(out.includes('align="center"'));
  assert.ok(out.includes('alt="Logo"'));
});

test('relative images resolve through ctx.resolveAsset', () => {
  const doc = parseMarkdown('![Logo](docs/logo.png)');
  const html = renderMarkdown(doc, { resolveAsset: (href) => 'https://raw.example/' + href });
  assert.ok(html.includes('src="https://raw.example/docs/logo.png"'));
});

test('unresolvable relative images render a placeholder, not a broken img', () => {
  const doc = parseMarkdown('![Logo](docs/logo.png)');
  const html = renderMarkdown(doc, { resolveAsset: () => null });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('md-img-missing'));
});

test('external links open safely', () => {
  const html = renderMarkdown(parseMarkdown('[x](https://example.com)'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('tables render with alignment and header', () => {
  const html = renderMarkdown(parseMarkdown('| A | B |\n| - | :-: |\n| 1 | 2 |'));
  assert.ok(html.includes('<thead>'));
  assert.ok(html.includes('text-align:center'));
});

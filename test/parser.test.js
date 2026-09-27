import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, collectLinks, inlineToText, parseInline } from '../src/markdown/parser.js';

test('ATX headings with levels and line numbers', () => {
  const doc = parseMarkdown('# One\n\ntext\n\n### Three\n');
  assert.deepEqual(
    doc.headings.map((h) => ({ level: h.level, text: h.text, line: h.line })),
    [
      { level: 1, text: 'One', line: 0 },
      { level: 3, text: 'Three', line: 4 },
    ],
  );
});

test('setext headings are recognized', () => {
  const doc = parseMarkdown('Title\n=====\n\nSub\n---\n');
  assert.equal(doc.headings[0].level, 1);
  assert.equal(doc.headings[0].text, 'Title');
  assert.equal(doc.headings[0].line, 0);
  assert.equal(doc.headings[1].level, 2);
  assert.equal(doc.headings[1].text, 'Sub');
});

test('a standalone --- is a thematic break, not a setext heading', () => {
  const doc = parseMarkdown('para\n\n---\n\n# H');
  assert.ok(doc.blocks.some((b) => b.type === 'hr'));
  assert.equal(doc.headings.filter((h) => h.text === 'para').length, 0);
});

test('fenced code blocks capture language and body with line span', () => {
  const doc = parseMarkdown('```bash\nnpm install\nnpm test\n```\n\nafter');
  const code = doc.blocks.find((b) => b.type === 'code');
  assert.equal(code.lang, 'bash');
  assert.equal(code.raw, 'npm install\nnpm test');
  assert.equal(code.line, 0);
  assert.equal(code.endLine, 3);
  assert.equal(code.closed, true);
});

test('unclosed fences still parse to EOF', () => {
  const doc = parseMarkdown('# T\n\n```js\nconst x = 1;');
  const code = doc.blocks.find((b) => b.type === 'code');
  assert.ok(code);
  assert.equal(code.closed, false);
  assert.ok(code.raw.includes('const x = 1;'));
});

test('tilde fences work', () => {
  const doc = parseMarkdown('~~~python\nprint(1)\n~~~');
  const code = doc.blocks.find((b) => b.type === 'code');
  assert.equal(code.lang, 'python');
});

test('inline links carry href and line', () => {
  const doc = parseMarkdown('See [docs](https://example.com/a) and\nalso [local](./file.md).');
  const links = collectLinks(doc);
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://example.com/a');
  assert.equal(links[0].line, 0);
  assert.equal(links[1].href, './file.md');
  assert.equal(links[1].line, 1);
});

test('reference links resolve, including after use', () => {
  const doc = parseMarkdown('Go [home][1] now.\n\n[1]: https://example.com "Title"');
  const links = collectLinks(doc);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com');
  assert.equal(links[0].title, 'Title');
});

test('shortcut reference links resolve', () => {
  const doc = parseMarkdown('See [the docs].\n\n[the docs]: docs/guide.md');
  const links = collectLinks(doc);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'docs/guide.md');
});

test('unresolved reference links stay literal text', () => {
  const doc = parseMarkdown('See [missing][nope] ok');
  assert.equal(collectLinks(doc).length, 0);
  assert.ok(doc.source.includes('[missing][nope]'));
});

test('images collect alt text and line', () => {
  const doc = parseMarkdown('# T\n\n![Logo](img/logo.png)');
  const links = collectLinks(doc);
  assert.equal(links[0].kind, 'image');
  assert.equal(links[0].href, 'img/logo.png');
  assert.equal(links[0].text, 'Logo');
  assert.equal(links[0].line, 2);
});

test('bare URLs are autolinked like GitHub does', () => {
  const doc = parseMarkdown('Visit https://example.com/docs today.');
  const links = collectLinks(doc);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com/docs');
});

test('angle-bracket autolinks and emails', () => {
  const doc = parseMarkdown('<https://example.com> and <a@b.io>');
  const links = collectLinks(doc).map((l) => l.href).sort();
  assert.deepEqual(links, ['https://example.com', 'mailto:a@b.io']);
});

test('a URL in angle brackets at line start is a paragraph, not an HTML block', () => {
  const doc = parseMarkdown('<https://example.com/docs>');
  assert.ok(doc.blocks.some((b) => b.type === 'paragraph'));
  assert.ok(!doc.blocks.some((b) => b.type === 'html'));
  assert.equal(collectLinks(doc).length, 1);
});

test('inline code spans keep their line', () => {
  const tokens = parseInline('run `API_KEY` now', 5, new Map());
  const span = tokens.find((t) => t.type === 'codespan');
  assert.equal(span.code, 'API_KEY');
  assert.equal(span.line, 5);
});

test('emphasis parses recursively', () => {
  const tokens = parseInline('**bold *nested* end**', 0, new Map());
  const strong = tokens.find((t) => t.type === 'strong');
  assert.ok(strong);
  assert.ok(strong.children.some((c) => c.type === 'em'));
});

test('snake_case underscores are not emphasis', () => {
  const tokens = parseInline('my_variable_name', 0, new Map());
  assert.equal(tokens.filter((t) => t.type === 'em').length, 0);
});

test('GFM tables parse header, alignment and rows with lines', () => {
  const doc = parseMarkdown(
    '| Name | Required | Default |\n| :--- | :------: | ------: |\n| A | yes | 1 |\n| B | no | 42 |\n',
  );
  const table = doc.blocks.find((b) => b.type === 'table');
  assert.ok(table);
  assert.deepEqual(table.header.map((c) => c.text), ['Name', 'Required', 'Default']);
  assert.deepEqual(table.aligns, ['left', 'center', 'right']);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[1][2].text, '42');
  assert.equal(table.line, 0);
});

test('nested lists parse with correct item lines', () => {
  const doc = parseMarkdown('- a\n- b\n  - b1\n  - b2\n- c');
  const list = doc.blocks.find((b) => b.type === 'list');
  assert.equal(list.items.length, 3);
  assert.equal(list.items[1].line, 1);
  const inner = list.items[1].blocks.find((b) => b.type === 'list');
  assert.ok(inner, 'nested list present');
  assert.equal(inner.items.length, 2);
});

test('blockquotes contain parsed children', () => {
  const doc = parseMarkdown('> quoted\n> more\n\npara');
  const quote = doc.blocks.find((b) => b.type === 'quote');
  assert.equal(quote.blocks.length, 1);
  assert.equal(quote.blocks[0].type, 'paragraph');
  assert.ok(quote.blocks[0].raw.includes('quoted'));
});

test('HTML blocks and comments', () => {
  const doc = parseMarkdown('<!-- hidden note -->\n\n<p align="center">hi</p>\n\ntext');
  const comment = doc.blocks.find((b) => b.type === 'html' && b.isComment);
  const html = doc.blocks.find((b) => b.type === 'html' && !b.isComment);
  assert.ok(comment);
  assert.ok(html);
  assert.ok(html.raw.includes('<p align="center">'));
});

test('badges paragraph is detected (badges do not count as description)', () => {
  const doc = parseMarkdown(
    '# Proj\n\n[![Build](https://img.shields.io/badge/ok)](https://ci)\n![Lic](https://img.shields.io/badge/mit)\n\n## Install',
  );
  const para = doc.blocks.find((b) => b.type === 'paragraph');
  assert.ok(para);
  const images = [];
  const walk = (tokens) => tokens.forEach((t) => { if (t.type === 'image') images.push(t); if (t.children) walk(t.children); });
  walk(para.inline);
  assert.equal(images.length, 2);
});

test('line numbers survive multi-line paragraphs', () => {
  const doc = parseMarkdown('first\nsecond line with [link](x.md)\nthird');
  const link = collectLinks(doc)[0];
  assert.equal(link.line, 1);
});

test('inlineToText strips formatting', () => {
  const tokens = parseInline('**bold** and `code` and [link text](https://x)', 0, new Map());
  assert.equal(inlineToText(tokens), 'bold and code and link text');
});

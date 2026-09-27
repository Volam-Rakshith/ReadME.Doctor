import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Slugger, slugOnce } from '../src/markdown/slugger.js';

test('slugger produces GitHub-style slugs', () => {
  assert.equal(slugOnce('Installation'), 'installation');
  assert.equal(slugOnce('Getting Started!'), 'getting-started');
  assert.equal(slugOnce('  API   Reference '), 'api---reference'); // GitHub does not collapse spaces
  assert.equal(slugOnce('What\'s New?'), 'whats-new');
  assert.equal(slugOnce('Environment Variables'), 'environment-variables');
  assert.equal(slugOnce('C++ Bindings'), 'c-bindings');
});

test('slugger keeps unicode letters', () => {
  assert.equal(slugOnce('Überblick'), 'überblick');
  assert.equal(slugOnce('日本語'), '日本語');
});

test('slugger de-duplicates with numeric suffixes', () => {
  const s = new Slugger();
  assert.equal(s.slug('Usage'), 'usage');
  assert.equal(s.slug('Usage'), 'usage-1');
  assert.equal(s.slug('Usage'), 'usage-2');
  assert.deepEqual(s.slugs(), ['usage', 'usage-1', 'usage-2']);
});

test('empty headings get a fallback slug', () => {
  const s = new Slugger();
  assert.equal(s.slug('???'), 'section');
});

test('punctuation removal does not collapse resulting hyphens (GitHub behaviour)', () => {
  // GitHub produces #docs--community for "Docs & Community"
  assert.equal(slugOnce('Docs & Community'), 'docs--community');
  assert.equal(slugOnce('What\'s New?'), 'whats-new');
  assert.equal(slugOnce('A - B'), 'a---b');
});

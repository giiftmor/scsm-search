import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('config: parses defaults when env is empty', () => {
  const c = loadConfig({});
  assert.equal(c.dbServer, '');
  assert.deepEqual(c.apiKeys, []);
  assert.equal(c.port, 3000);
  assert.equal(c.searchMode, 'fts');
});

test('config: parses api keys and search mode', () => {
  const c = loadConfig({ API_KEYS: ' n8n-secret , compass-secret ', SEARCH_MODE: 'like', PORT: '5000' });
  assert.deepEqual(c.apiKeys, ['n8n-secret', 'compass-secret']);
  assert.equal(c.searchMode, 'like');
  assert.equal(c.port, 5000);
});

test('config: empty-string db values pass through as empty strings', () => {
  const c = loadConfig({ DB_SERVER: '', DB_USER: '', DB_PASSWORD: '' });
  assert.equal(c.dbServer, '');
  assert.equal(c.dbUser, '');
  assert.equal(c.dbPassword, '');
});

test('config: rejects a non-numeric PORT', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /Invalid PORT/);
});

test('config: rejects an empty-string PORT', () => {
  assert.throws(() => loadConfig({ PORT: '' }), /Invalid PORT/);
});

test('config: rejects a PORT out of range', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /Invalid PORT/);
  assert.throws(() => loadConfig({ PORT: '65536' }), /Invalid PORT/);
  assert.throws(() => loadConfig({ PORT: '-1' }), /Invalid PORT/);
});

test('config: rejects a non-numeric PORT that looks numeric', () => {
  assert.throws(() => loadConfig({ PORT: '3000.5' }), /Invalid PORT/);
});

test('config: rejects an invalid SEARCH_MODE', () => {
  assert.throws(() => loadConfig({ SEARCH_MODE: 'bogus' }), /Invalid SEARCH_MODE/);
});

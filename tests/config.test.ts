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

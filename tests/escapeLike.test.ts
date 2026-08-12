import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike } from '../src/db/escapeLike.js';

test('escapeLike leaves plain text untouched', () => {
  assert.equal(escapeLike('printer jam'), 'printer jam');
});

test('escapeLike escapes LIKE wildcards', () => {
  assert.equal(escapeLike('50%_ok['), '50\\%\\_ok\\[');
});

test('escapeLike escapes a backslash itself', () => {
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
});

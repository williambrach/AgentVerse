import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLines } from '../server/admin/ndjson.js';

test('splits a line and keeps the partial rest', () => {
  assert.deepEqual(splitLines('', '{"a":1}\n{"b"'), { lines: [{ a: 1 }], rest: '{"b"' });
});
test('completes a line split across chunks', () => {
  assert.deepEqual(splitLines('{"b"', ':2}\n'), { lines: [{ b: 2 }], rest: '' });
});
test('skips unparseable and blank lines', () => {
  assert.deepEqual(splitLines('', 'oops\n\n{"c":3}\n'), { lines: [{ c: 3 }], rest: '' });
});
test('keeps multibyte text intact', () => {
  assert.deepEqual(splitLines('', '{"t":"→ ✕ é"}\n'), { lines: [{ t: '→ ✕ é' }], rest: '' });
});
test('handles CRLF', () => {
  assert.deepEqual(splitLines('', '{"a":1}\r\n'), { lines: [{ a: 1 }], rest: '' });
});

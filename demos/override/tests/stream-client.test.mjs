import test from 'node:test';
import assert from 'node:assert/strict';
import { readNdjson, createStreamFold, isNdjson } from '../client/stream.ts';

const enc = new TextEncoder();
const bodyOf = chunks => new ReadableStream({
  start(c) { for (const k of chunks) c.enqueue(k); c.close(); },
});
const collect = async chunks => {
  const lines = [];
  await readNdjson(bodyOf(chunks), l => lines.push(l));
  return lines;
};

test('split_chunks: a line split across chunks parses once, intact', async () => {
  const lines = await collect([enc.encode('{"t":"delta","a":"c1","te'), enc.encode('xt":"Hi"}\n{"t":"ping"}\n')]);
  assert.deepEqual(lines, [{ t: 'delta', a: 'c1', text: 'Hi' }, { t: 'ping' }]);
});

test('split_chunks: a multi-byte char split across chunks survives', async () => {
  const bytes = enc.encode('{"t":"delta","a":"c1","text":"café €"}\n');
  for (let cut = 1; cut < bytes.length; cut++) {
    const lines = await collect([bytes.slice(0, cut), bytes.slice(cut)]);
    assert.deepEqual(lines, [{ t: 'delta', a: 'c1', text: 'café €' }], `cut ${cut}`);
  }
});

test('split_chunks: a trailing line without newline is delivered', async () => {
  assert.deepEqual(await collect([enc.encode('{"t":"ping"}\n{"t":"view","x":1}')]), [{ t: 'ping' }, { t: 'view', x: 1 }]);
});

test('split_chunks: blank and non-JSON lines are skipped, not thrown', async () => {
  const lines = await collect([enc.encode('\n  \nnot json\n{"t":"ping"}\r\n[1]\n"s"\nnull\n')]);
  assert.deepEqual(lines, [{ t: 'ping' }]);
});

test('isNdjson matches the content type', () => {
  assert.equal(isNdjson('application/x-ndjson; charset=utf-8'), true);
  assert.equal(isNdjson('Application/X-NDJSON'), true);
  assert.equal(isNdjson('application/json'), false);
  assert.equal(isNdjson(null), false);
});

test('fold appends deltas of the latest label and tracks ids', () => {
  const f = createStreamFold();
  assert.equal(f.answer(), '');
  assert.equal(f.label(), null);
  assert.equal(f.questionEventId(), null);
  assert.equal(f.apply({ t: 'accepted', questionEventId: 'q1', queued: 0 }), true);
  assert.equal(f.questionEventId(), 'q1');
  assert.equal(f.apply({ t: 'start', a: 'c1', attempt: 1 }), true);
  assert.equal(f.apply({ t: 'delta', a: 'c1', text: 'Hi ' }), true);
  assert.equal(f.apply({ t: 'delta', a: 'c1', text: 'there' }), true);
  assert.equal(f.answer(), 'Hi there');
  assert.equal(f.label(), 'c1');
  assert.equal(f.apply({ t: 'reasoning', a: 'c1', text: 'hm' }), true);
  assert.equal(f.reasoning(), 'hm');
});

test('fold: ping and unknown lines change nothing', () => {
  const f = createStreamFold();
  assert.equal(f.apply({ t: 'ping' }), false);
  assert.equal(f.apply({ t: 'wat' }), false);
  assert.equal(f.apply({}), false);
  assert.equal(f.apply(null), false);
  assert.equal(f.apply({ t: 'delta', a: 'c1', text: '' }), false);
});

test('scrub_resets: scrub empties the shown answer, next label starts clean', () => {
  const f = createStreamFold();
  f.apply({ t: 'delta', a: 'c1', text: 'bad' });
  assert.equal(f.apply({ t: 'scrub', a: 'c1' }), true);
  assert.equal(f.answer(), '');
  f.apply({ t: 'delta', a: 'c2', text: 'Ok' });
  assert.equal(f.answer(), 'Ok');
  assert.equal(f.label(), 'c2');
});

test('scrub_resets: reasoning_scrub empties reasoning only', () => {
  const f = createStreamFold();
  f.apply({ t: 'delta', a: 'c1', text: 'ans' });
  f.apply({ t: 'reasoning', a: 'c1', text: 'why' });
  assert.equal(f.apply({ t: 'reasoning_scrub', a: 'c1' }), true);
  assert.equal(f.reasoning(), '');
  assert.equal(f.answer(), 'ans');
});

test('scrub_resets: text from a scrubbed label never comes back', () => {
  const f = createStreamFold();
  f.apply({ t: 'delta', a: 'c1', text: 'bad' });
  f.apply({ t: 'scrub', a: 'c1' });
  f.apply({ t: 'delta', a: 'c2', text: 'good' });
  assert.equal(f.apply({ t: 'delta', a: 'c1', text: 'late' }), false);
  assert.equal(f.answer(), 'good');
  assert.equal(f.label(), 'c2');
  f.apply({ t: 'scrub', a: 'c2' });
  assert.equal(f.apply({ t: 'delta', a: 'c2', text: 'again' }), false);
  assert.equal(f.answer(), '');
});

test('start clears that label buffers (retry on the same label)', () => {
  const f = createStreamFold();
  f.apply({ t: 'start', a: 'c2', attempt: 1 });
  f.apply({ t: 'delta', a: 'c2', text: 'half' });
  f.apply({ t: 'reasoning', a: 'c2', text: 'r' });
  assert.equal(f.apply({ t: 'start', a: 'c2', attempt: 2 }), true);
  assert.equal(f.answer(), '');
  assert.equal(f.reasoning(), '');
  f.apply({ t: 'delta', a: 'c2', text: 'full' });
  assert.equal(f.answer(), 'full');
});

test('older label deltas do not leak into the shown text', () => {
  const f = createStreamFold();
  f.apply({ t: 'delta', a: 'c1', text: 'one' });
  f.apply({ t: 'delta', a: 'c2', text: 'two' });
  assert.equal(f.apply({ t: 'delta', a: 'c1', text: 'x' }), false);
  assert.equal(f.answer(), 'two');
});

test('empty first delta of a new label does not stop it taking over later', () => {
  const f = createStreamFold();
  f.apply({ t: 'delta', a: 'c1', text: 'bad' });
  f.apply({ t: 'scrub', a: 'c1' });
  assert.equal(f.apply({ t: 'delta', a: 'c2', text: '' }), false);
  f.apply({ t: 'delta', a: 'c2', text: 'Ok' });
  assert.equal(f.label(), 'c2');
  assert.equal(f.answer(), 'Ok');
  f.apply({ t: 'start', a: 'c3', attempt: 2 });
  assert.equal(f.label(), 'c3');
  assert.equal(f.answer(), '');
});

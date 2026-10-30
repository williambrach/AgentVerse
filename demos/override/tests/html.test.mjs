import test from 'node:test';
import assert from 'node:assert/strict';
import { escape, svg, heading, mmss } from '../client/html.ts';

test('escape covers all five characters and null', () => {
  assert.equal(escape('<b>&"'), '&lt;b&gt;&amp;&quot;');
  assert.equal(escape("it's"), 'it&#39;s');
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(5), '5');
});

test('mmss formats seconds', () => {
  assert.equal(mmss(151), '2:31');
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(-5), '0:00');
});

test('svg and heading keep their markup', () => {
  assert.match(svg('<path/>'), /^<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" /);
  assert.match(svg('<path/>', 20, 2), /width="20" height="20".*stroke-width="2"/);
  assert.equal(heading('K', 'T', 'D'), '<div class="panel-heading"><span class="eyebrow">K</span><h2>T</h2><p>D</p></div>');
});

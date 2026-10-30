import test from 'node:test';
import assert from 'node:assert/strict';
import { el, pad2, mmss, isNum, num } from '../server/admin/dom.js';

class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.className = ''; this._text = ''; }
  appendChild(c) { this.children.push(c); return c; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
const doc = { createElement(t) { return new El(t, doc); } };

test('mmss, pad2, num, isNum', () => {
  assert.equal(mmss(90000), '1:30');
  assert.equal(mmss(0), '0:00');
  assert.equal(pad2(7), '07');
  assert.equal(num('x', 0), 0);
  assert.equal(num(5, 0), 5);
  assert.equal(isNum(NaN), false);
  assert.equal(isNum(3), true);
});

test('text_only: markup stays literal text', () => {
  const b = el(doc, 'b', 'x', { text: '<i>' });
  assert.equal(b.textContent, '<i>');
  assert.equal(b.className, 'x');
  assert.equal(b.children.length, 0);
});

test('el appends to the given parent', () => {
  const parent = el(doc, 'div');
  const child = el(doc, 'span', '', { parent, text: 'hi' });
  assert.equal(parent.children[0], child);
  assert.equal(parent.textContent, 'hi');
});

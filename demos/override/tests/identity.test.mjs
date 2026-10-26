import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signToken, verifyToken, clientAddress, WindowCounter } from '../server/identity.mjs';

test('token roundtrip, expiry and wrong secret', () => {
  const t = signToken('s', 2000);
  assert.equal(verifyToken('s', t, 1000), true);
  assert.equal(verifyToken('s', t, 3000), false);
  assert.equal(verifyToken('x', t, 1000), false);
  assert.equal(verifyToken('s', 'junk', 0), false);
  assert.equal(verifyToken('s', undefined, 0), false);
});

test('tampered_signature_false', () => {
  const t = signToken('s', 2000);
  const last = t.slice(-1);
  const flipped = t.slice(0, -1) + (last === 'a' ? 'b' : 'a');
  assert.equal(verifyToken('s', flipped, 1000), false);
  assert.equal(verifyToken('s', t.slice(0, -2), 1000), false);
  assert.equal(verifyToken('s', t.replace(/^2000/, '9999'), 1000), false);
});

test('non_numeric_expiry_false', () => {
  const sig = createHmac('sha256', 's').update('abc').digest('hex');
  assert.equal(verifyToken('s', `abc.${sig}`, 0), false);
});

test('clientAddress', () => {
  const req = { headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }, socket: { remoteAddress: '::1' } };
  assert.equal(clientAddress(req, true), '1.2.3.4');
  assert.equal(clientAddress(req, false), '::1');
  assert.equal(clientAddress({ headers: { 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }, socket: { remoteAddress: '::1' } }, true), '9.9.9.9');
  assert.equal(clientAddress({ headers: {}, socket: {} }, false), 'unknown');
});

test('WindowCounter take/allowed/add', () => {
  const c = new WindowCounter({ limit: 2, windowMs: 1000 });
  assert.equal(c.take('k', 0), true);
  assert.equal(c.take('k', 1), true);
  assert.equal(c.take('k', 2), false);
  assert.equal(c.allowed('k', 2), false);
  assert.equal(c.take('k', 1001), true);
  const d = new WindowCounter({ limit: 2, windowMs: 1000 });
  d.add('a', 0); d.add('a', 1);
  assert.equal(d.allowed('a', 2), false);
  assert.equal(d.allowed('b', 2), true);
});

test('prunes_expired_keys', () => {
  const c = new WindowCounter({ limit: 2, windowMs: 1000 });
  for (let i = 0; i < 5000; i++) c.take(`k${i}`, 0);
  c.take('fresh', 5000);
  assert.ok(c.size <= 1);
});

test('security regressions: domain separation, blank proxy headers, amortized prune', () => {
  
  const raw = createHmac('sha256', 's').update('100').digest('hex');
  assert.equal(verifyToken('s', `100.${raw}`, 1), false);
  const r = (h) => ({ headers: h, socket: { remoteAddress: '9.9.9.9' } });
  assert.equal(clientAddress(r({ 'cf-connecting-ip': '  ', 'x-forwarded-for': ' ' }), true), '9.9.9.9');
  assert.equal(clientAddress(r({ 'x-forwarded-for': ', 1.1.1.1' }), true), '1.1.1.1');
  assert.equal(clientAddress(r({ 'x-forwarded-for': '1.1.1.1' }), false), '9.9.9.9');
  assert.equal(verifyToken('s', `5.${'g'.repeat(64)}`, 1), false);
  assert.equal(verifyToken('s', `5.${'é'.repeat(32)}`, 1), false);
  const w = new WindowCounter({ limit: 1, windowMs: 1000 });
  for (let i = 0; i < 1100; i++) w.add(`k${i}`, 0);
  w.add('x', 1500);
  assert.ok(w.size <= 2);
});

test('xff_spoofed_left_ignored', () => {
  const r = (h) => ({ headers: h, socket: { remoteAddress: '9.9.9.9' } });
  assert.equal(clientAddress(r({ 'x-forwarded-for': '6.6.6.6, 5.6.7.8' }), true), '5.6.7.8');
  assert.equal(clientAddress(r({ 'x-forwarded-for': '1.1.1.1, 5.6.7.8' }), true), clientAddress(r({ 'x-forwarded-for': '2.2.2.2, 5.6.7.8' }), true));
});

test('max_keys_bounded', () => {
  const c = new WindowCounter({ limit: 1, windowMs: 1000000, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) c.add(`k${i}`, 5);
  assert.ok(c.size <= 100);
  assert.equal(c.allowed('k999', 5), false);
});

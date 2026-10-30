import { createHash, timingSafeEqual } from 'node:crypto';
import { RequestError } from './session.mjs';

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Collects raw bytes, so a character split across chunks survives.
export async function readJsonBody(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new RequestError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let value;
  try { value = JSON.parse(text || '{}'); } catch { throw new RequestError(400, 'Invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'Invalid JSON.');
  return value;
}

const digest = s => createHash('sha256').update(String(s)).digest();
export const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

export function integerEnv(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${name} must be an integer.`);
  return number;
}

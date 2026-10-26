import { createHmac, timingSafeEqual } from 'node:crypto';

// Domain-separated so the same secret can't forge MACs for other uses.
const mac = (secret, text) => createHmac('sha256', secret).update(`override-session-v1:${text}`).digest('hex');

export function signToken(secret, expiresAt) {
  return `${expiresAt}.${mac(secret, String(expiresAt))}`;
}

export function verifyToken(secret, token, now) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  if (!/^\d+$/.test(exp)) return false;
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(secret, exp));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  return Number(exp) > now;
}

export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const cf = String(req.headers?.['cf-connecting-ip'] ?? '').trim();
    if (cf) return cf;
    // Rightmost entry is the one our trusted proxy appended; the left is client-controlled.
    const parts = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Fixed window per key; expired keys are pruned once the map grows past 1000.
export class WindowCounter {
  constructor({ limit, windowMs, maxKeys = 10000 }) {
    this.maxKeys = maxKeys;
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
    this.nextPrune = 0;
  }
  get size() { return this.hits.size; }
  #entry(key, now) {
    const e = this.hits.get(key);
    return e && e.start + this.windowMs > now ? e : null;
  }
  #prune(now) {
    if (this.hits.size <= 1000 || now < this.nextPrune) return;
    this.nextPrune = now + Math.max(1, Math.floor(this.windowMs / 10));
    for (const [k, e] of this.hits) if (e.start + this.windowMs <= now) this.hits.delete(k);
  }
  allowed(key, now) {
    const e = this.#entry(key, now);
    return !e || e.count < this.limit;
  }
  add(key, now) {
    this.#prune(now);
    const e = this.#entry(key, now);
    if (e) { e.count++; return; }
    if (this.hits.size >= this.maxKeys && !this.hits.has(key)) {
      for (const [k, x] of this.hits) if (x.start + this.windowMs <= now) this.hits.delete(k);
      for (const k of this.hits.keys()) {
        if (this.hits.size < this.maxKeys) break;
        this.hits.delete(k);
      }
    }
    this.hits.delete(key);
    this.hits.set(key, { start: now, count: 1 });
  }
  take(key, now) {
    if (!this.allowed(key, now)) return false;
    this.add(key, now);
    return true;
  }
}

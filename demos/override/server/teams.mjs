// Team registry: one name, one team. Restored from teams.jsonl at start.
import { randomUUID } from 'node:crypto';
import { RequestError } from './session.mjs';
import { appendJsonl, readJsonl } from './dataset.mjs';

const NAME = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} '’&.\-!?#]*$/u;
export const NAME_ERROR = 'Team names are 2 to 24 letters, numbers and spaces.';
export const FULL_ERROR = 'The team list is full. Ask the organisers.';

export function teamName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = [...name].length;
  if (length < 2 || length > 24 || !NAME.test(name)) return null;
  return { name, key: name.toLowerCase() };
}

export function createTeams({ file = null, max = 1000 } = {}) {
  const byId = new Map();
  const byKey = new Map();

  function add(id, name) {
    const team = { id, name, sessionId: null };
    byId.set(id, team);
    byKey.set(name.toLowerCase(), team);
    return team;
  }

  if (file) {
    for (const r of readJsonl(file, { repair: true })) {
      if (r?.type === 'team_created' && typeof r.teamId === 'string') {
        const p = teamName(r.name);
        if (p && !byId.has(r.teamId) && !byKey.has(p.key)) add(r.teamId, p.name);
      }
      else if (r?.type === 'team_session' && byId.has(r.teamId) && typeof r.sessionId === 'string') byId.get(r.teamId).sessionId = r.sessionId;
    }
  }

  const view = (t) => ({ id: t.id, name: t.name, sessionId: t.sessionId });

  function join(raw, { join: joining = false } = {}) {
    const parsed = teamName(raw);
    if (!parsed) throw new RequestError(400, NAME_ERROR);
    const known = byKey.get(parsed.key);
    if (known) return joining ? { team: view(known), created: false } : { taken: known.name };
    if (byId.size >= max) throw new RequestError(503, FULL_ERROR);
    const id = randomUUID();
    if (file) appendJsonl(file, { type: 'team_created', teamId: id, name: parsed.name, timestamp: new Date().toISOString() }, 'teams');
    return { team: view(add(id, parsed.name)), created: true };
  }

  function find(id) {
    const t = typeof id === 'string' ? byId.get(id) : undefined;
    return t ? view(t) : null;
  }

  function exists(raw) {
    const parsed = teamName(raw);
    return parsed ? byKey.has(parsed.key) : false;
  }

  function attach(id, sessionId) {
    const t = byId.get(id);
    if (!t) return;
    t.sessionId = sessionId;
    if (!file) return;
    try { appendJsonl(file, { type: 'team_session', teamId: id, sessionId, timestamp: new Date().toISOString() }, 'teams'); } catch (error) {
      console.error('Could not record the team session.', error);
    }
  }

  return { join, find, exists, attach };
}

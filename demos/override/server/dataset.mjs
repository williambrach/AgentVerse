import { appendFileSync, mkdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let observer = null;

// One hook for write timing and failures, so metrics need no knowledge of files.
export function setWriteObserver(fn) { observer = fn; }

export function dataPaths(root) {
  const base = resolve(root);
  const sessions = resolve(base, 'sessions');
  const traces = resolve(base, 'traces');
  for (const dir of [base, sessions, traces]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return { root: base, sessions, traces, system: resolve(base, 'system.jsonl') };
}

// Write before acknowledging anything. Failed writes must not silently lose data.
export function appendJsonl(file, record, kind) {
  const started = performance.now();
  let ok = true;
  try {
    appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch (error) {
    ok = false;
    throw error;
  } finally {
    try { observer?.({ kind, durationMs: performance.now() - started, ok }); } catch { /* metrics must not break writes */ }
  }
}

// A crash can leave one partial last line. It was never acknowledged, so it is
// dropped (and with repair, cut from the file). A bad line anywhere else throws.
export function readJsonl(file, { repair = false } = {}) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const lines = text.split('\n');
  const records = [];
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch {
      if (i !== lines.length - 1) throw new Error(`Corrupt record at line ${i + 1} of ${file}.`);
      if (repair) truncateSync(file, Buffer.byteLength(lines.slice(0, i).join('\n') + (i ? '\n' : '')));
      return records;
    }
  }
  if (repair && text && !text.endsWith('\n')) writeFileSync(file, `${text}\n`);
  return records;
}

export function lastRecord(file, match) {
  const records = readJsonl(file);
  for (let i = records.length - 1; i >= 0; i--) if (match(records[i])) return records[i];
  return null;
}

/** Tells the server this tab is open: once now, every `everyMs` while visible, and on each return to visible. */
export function startHeartbeat(doc: Document, send: (tab: string) => Promise<unknown>, everyMs: number): () => void {
  const tab = crypto.randomUUID();
  const beat = () => { void send(tab).catch(() => undefined); };
  const onVisible = () => { if (doc.visibilityState === 'visible') beat(); };
  beat();
  const timer = setInterval(onVisible, everyMs);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}

/** Posts the beat; the route answers 204 with no body, so nothing is parsed and errors are swallowed. */
export async function postHeartbeat(tab: string): Promise<void> {
  try {
    await fetch('/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab }), keepalive: true });
  } catch { /* a missed beat is harmless */ }
}

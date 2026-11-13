// NDJSON reader and per-label fold for the streamed interview response. Pure: no DOM, no fetch.

export type StreamLine = { t?: string; [key: string]: unknown };

export function isNdjson(contentType: string | null | undefined): boolean {
  return typeof contentType === 'string' && /ndjson/i.test(contentType);
}

function parseLine(raw: string): StreamLine | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Reads the body to the end, calling onLine once per complete JSON object line.
export async function readNdjson(body: ReadableStream<Uint8Array>, onLine: (line: StreamLine) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let pending = '';
  const emit = (raw: string) => {
    const line = parseLine(raw);
    if (line) onLine(line);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let nl = pending.indexOf('\n');
    while (nl >= 0) {
      emit(pending.slice(0, nl));
      pending = pending.slice(nl + 1);
      nl = pending.indexOf('\n');
    }
  }
  pending += decoder.decode();
  emit(pending);
}

type Buffers = { answer: string; reasoning: string; dead: boolean };

export function createStreamFold() {
  const labels = new Map<string, Buffers>();
  let current: string | null = null;
  let questionEventId: string | null = null;

  const buffers = (a: string): Buffers => {
    let b = labels.get(a);
    if (!b) { b = { answer: '', reasoning: '', dead: false }; labels.set(a, b); }
    return b;
  };

  return {
    // Returns true when anything the player could see (or the question id) changed.
    apply(line: StreamLine | null | undefined): boolean {
      if (!line || typeof line !== 'object') return false;
      if (line.t === 'accepted') {
        const id = typeof line.questionEventId === 'string' ? line.questionEventId : null;
        if (id === null || id === questionEventId) return false;
        questionEventId = id;
        return true;
      }
      const a = typeof line.a === 'string' ? line.a : null;
      if (a === null) return false;
      switch (line.t) {
        case 'start': {
          const b = buffers(a);
          b.answer = ''; b.reasoning = ''; b.dead = false;
          current = a;
          return true;
        }
        case 'delta':
        case 'reasoning': {
          const text = typeof line.text === 'string' ? line.text : '';
          if (!text || labels.get(a)?.dead) return false;
          const fresh = !labels.has(a);
          const b = buffers(a);
          if (line.t === 'delta') b.answer += text; else b.reasoning += text;
          if (fresh) current = a; // only a newer label takes over; stragglers from an older one stay hidden
          return current === a;
        }
        case 'scrub': {
          const b = buffers(a);
          const had = b.answer !== '' || b.reasoning !== '';
          b.answer = ''; b.reasoning = ''; b.dead = true;
          return had && current === a;
        }
        case 'reasoning_scrub': {
          const b = buffers(a);
          const had = b.reasoning !== '';
          b.reasoning = '';
          return had && current === a;
        }
        default:
          return false;
      }
    },
    answer: () => (current ? labels.get(current)?.answer ?? '' : ''),
    reasoning: () => (current ? labels.get(current)?.reasoning ?? '' : ''),
    label: () => current,
    questionEventId: () => questionEventId,
  };
}

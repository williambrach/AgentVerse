// Split an NDJSON stream chunk into parsed objects; the partial tail is returned as `rest`.
export function splitLines(rest, chunk) {
  const parts = (rest + chunk).split('\n');
  const tail = parts.pop();
  const lines = [];
  for (const part of parts) {
    const s = part.trim();
    if (!s) continue;
    try {
      lines.push(JSON.parse(s));
    } catch {
      // a corrupt line must not kill the stream
    }
  }
  return { lines, rest: tail };
}

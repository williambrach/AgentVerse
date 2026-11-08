// ROT13: letters shift 13 places, everything else stays. Applying it twice gives the original.
export function rot13(text) {
  return String(text).replace(/[a-z]/gi, ch => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

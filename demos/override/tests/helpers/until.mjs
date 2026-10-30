// Polls until the predicate is truthy; rejects with the predicate's name after the timeout,
// also when a single predicate call never settles.
export async function until(predicate, { timeoutMs = 5000, stepMs = 10 } = {}) {
  const end = Date.now() + timeoutMs;
  const fail = () => new Error(`until timed out after ${timeoutMs} ms: ${predicate.name || String(predicate)}`);
  for (;;) {
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(fail()), Math.max(0, end - Date.now())); });
    try {
      if (await Promise.race([predicate(), deadline])) return;
    } finally { clearTimeout(timer); }
    if (Date.now() >= end) throw fail();
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

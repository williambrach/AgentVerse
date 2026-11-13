// Pure helpers for the streaming interview view: typed reveal pacing and a call throttle. No DOM.

/** Reveals received text a few characters at a time; never runs ahead of what was received. */
export function createTyper(reduced: boolean) {
  let received = '';
  let shown = 0;
  return {
    /** Takes the full text received so far. Text that shrank or changed under what is shown (a scrub) starts the reveal over. */
    set(text: string) {
      if (text.length < shown || !text.startsWith(received.slice(0, shown))) shown = 0;
      received = text;
      if (reduced) shown = text.length;
    },
    /** One animation step; true when more characters became visible. */
    tick(): boolean {
      const backlog = received.length - shown;
      if (backlog <= 0) return false;
      shown += Math.min(backlog, 1 + Math.floor(backlog / 24));
      return true;
    },
    revealAll() { shown = received.length; },
    shown: () => received.slice(0, shown),
    received: () => received,
    pending: () => shown < received.length,
  };
}

/** True at most once per `ms`, judged by the `now` passed in. */
export function createThrottle(ms: number) {
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

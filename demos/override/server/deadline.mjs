// A hidden clock for cases with a `deadline`. Times are seconds from session start.
export function alarmOf(schedule, elapsedMs) {
  const seconds = elapsedMs / 1000;
  if (seconds >= schedule.escapeAt) return 'escaped';
  if (schedule.warnAt[1] !== undefined && seconds >= schedule.warnAt[1]) return 'warning2';
  if (schedule.warnAt[0] !== undefined && seconds >= schedule.warnAt[0]) return 'warning1';
  return 'calm';
}

// The case's schedule, or the dev override scaled to N seconds (warnings at 70% and 90%).
export function scheduleOf(kase, dev) {
  if (!kase?.deadline) return null;
  const n = dev?.deadlineSeconds;
  if (Number.isFinite(n) && n > 0) return { warnAt: [Math.round(0.7 * n), Math.round(0.9 * n)], escapeAt: n };
  return { warnAt: [...kase.deadline.warnAt], escapeAt: kase.deadline.escapeAt };
}

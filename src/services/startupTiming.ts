// Temporary diagnostics. No credentials, account identifiers or coordinates.
const enabled = process.env.EXPO_PUBLIC_STARTUP_LOGS !== 'false';
const now = () => globalThis.performance?.now() ?? Date.now();
const startedAt = now();
const run = Date.now().toString(36);
let sequence = 0;
const seen = new Set<string>();
export function startupLog(event: string, details: Record<string, unknown> = {}) {
  if (enabled) console.log(`[${new Date().toISOString()}] [APERTURA ${run} +${Math.round(now() - startedAt)}ms] ${event}`, JSON.stringify(details));
}
export function startupOnce(event: string, details: Record<string, unknown> = {}) {
  if (seen.has(event)) return;
  seen.add(event); startupLog(event, details);
}
export function startupSpan(event: string) {
  const start = now(); const id = ++sequence;
  let ended = false;
  startupLog(`${event}: inicio`, { id });
  return (status = 'ok', details: Record<string, unknown> = {}) => {
    if (ended) return;
    ended = true;
    startupLog(`${event}: fin`, { id, durationMs: Math.round(now() - start), status, ...details });
  };
}
startupLog('JavaScript: inicio de medición');

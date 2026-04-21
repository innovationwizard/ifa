/**
 * Minimal structured logger for MVP.
 *
 * Emits a JSON line to stdout/stderr that downstream log aggregators
 * (Vercel today, Axiom or similar later) can ingest without pre-parsing.
 * Pretty-prints in development for human readability.
 *
 * Does NOT include Sentry/PII scrubbing yet — that belongs to S-11.4/11.6.
 */

export type LogLevel = 'info' | 'warn' | 'error';

interface LogFields {
  route?: string;
  message: string;
  digest?: string;
  stack?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, fields: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };

  const isDev = process.env.NODE_ENV === 'development';
  const line = isDev ? `[${level}] ${JSON.stringify(payload, null, 2)}` : JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    // info: use warn channel so next-dev doesn't strip it; acceptable
    // for the low-frequency events we log for now.
    console.warn(line);
  }
}

export function logError(fields: LogFields): void {
  emit('error', fields);
}

export function logWarn(fields: LogFields): void {
  emit('warn', fields);
}

export function logInfo(fields: LogFields): void {
  emit('info', fields);
}

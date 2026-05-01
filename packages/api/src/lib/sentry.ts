import * as Sentry from '@sentry/node';
import { env } from '@leftovers/shared';

let initialized = false;
export function initSentry(): void {
  if (initialized) return;
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // PII strip — never send user identifying details
      delete event.user;
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, unknown>;
        delete h['authorization'];
        delete h['cookie'];
      }
      return event;
    },
  });
  initialized = true;
}

export function captureError(e: unknown, context?: Record<string, unknown>): void {
  initSentry();
  if (env.sentryDsn) {
    Sentry.captureException(e, context ? { extra: context } : undefined);
  } else {
    console.error('[error]', e, context);
  }
}

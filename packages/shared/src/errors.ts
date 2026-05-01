/**
 * Typed error classes used across packages. Plain Error is reserved for truly unexpected cases.
 */

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = 'MissingEnvError';
  }
}

export class WebhookSignatureError extends Error {
  constructor(source: string) {
    super(`Webhook signature failed for ${source}`);
    this.name = 'WebhookSignatureError';
  }
}

export class UpstreamApiError extends Error {
  constructor(
    public readonly source: 'up' | 'basiq' | 'anthropic' | 'stripe' | 'apns',
    public readonly status: number,
    message: string,
  ) {
    super(`[${source} ${status}] ${message}`);
    this.name = 'UpstreamApiError';
  }
}

export class CategorisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategorisationError';
  }
}

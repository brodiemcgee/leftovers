import { MissingEnvError } from './errors.js';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new MissingEnvError(name);
  }
  return v;
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * The full set of env vars used by the backend. Each is loaded lazily — calling
 * any property that isn't set will throw MissingEnvError. This avoids gating
 * Sprint 1 builds on Brodie supplying every credential up front.
 */
export const env = {
  get supabaseUrl(): string { return requireEnv('SUPABASE_URL'); },
  get supabaseAnonKey(): string { return requireEnv('SUPABASE_ANON_KEY'); },
  get supabaseServiceRoleKey(): string { return requireEnv('SUPABASE_SERVICE_ROLE_KEY'); },

  get upClientId(): string { return requireEnv('UP_CLIENT_ID'); },
  get upClientSecret(): string { return requireEnv('UP_CLIENT_SECRET'); },
  get upWebhookSecret(): string { return requireEnv('UP_WEBHOOK_SECRET'); },
  get upRedirectUri(): string { return requireEnv('UP_REDIRECT_URI'); },

  get basiqApiKey(): string { return requireEnv('BASIQ_API_KEY'); },
  get basiqWebhookSecret(): string { return requireEnv('BASIQ_WEBHOOK_SECRET'); },

  get anthropicApiKey(): string { return requireEnv('ANTHROPIC_API_KEY'); },
  get anthropicModel(): string { return optionalEnv('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001'; },

  get stripeSecretKey(): string { return requireEnv('STRIPE_SECRET_KEY'); },
  get stripeWebhookSecret(): string { return requireEnv('STRIPE_WEBHOOK_SECRET'); },

  get apnsKeyId(): string { return requireEnv('APNS_KEY_ID'); },
  get apnsTeamId(): string { return requireEnv('APNS_TEAM_ID'); },
  get apnsBundleId(): string { return requireEnv('APNS_BUNDLE_ID'); },
  get apnsP8(): string { return requireEnv('APNS_P8_KEY'); },

  get sentryDsn(): string | undefined { return optionalEnv('SENTRY_DSN'); },

  get encryptionKey(): string { return requireEnv('ENCRYPTION_KEY'); },
};

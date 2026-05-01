import type { LeftoversSupabaseClient } from '@leftovers/shared';
import { createServiceClient, createUserClient } from '@leftovers/shared';

export interface AuthedRequest {
  userId: string;
  accessToken: string;
  supabase: LeftoversSupabaseClient;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Extract the Supabase access token from an incoming Request and verify it with
 * the service-role client. Returns a user-scoped client (RLS enforced) plus the
 * resolved user id.
 */
export async function authenticate(req: Request): Promise<AuthedRequest> {
  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const token = header.slice(7).trim();
  if (token.length === 0) throw new UnauthorizedError('Empty bearer token');

  const service = createServiceClient();
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new UnauthorizedError('Invalid token');

  return { userId: data.user.id, accessToken: token, supabase: createUserClient(token) };
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: { message } }, { status });
}

export async function readJsonBody<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
  return parse(raw);
}

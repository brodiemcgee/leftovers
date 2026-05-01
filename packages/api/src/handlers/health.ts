import { jsonResponse } from '../lib/auth.js';

export function handleHealth(_req: Request): Response {
  return jsonResponse({
    status: 'ok',
    commit: process.env['VERCEL_GIT_COMMIT_SHA'] ?? 'local',
    deployedAt: process.env['VERCEL_DEPLOYMENT_CREATED_AT'] ?? null,
    env: process.env['VERCEL_ENV'] ?? 'development',
  });
}

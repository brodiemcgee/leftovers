import { handleHealth } from '@leftovers/api';
export const runtime = 'nodejs';
export function GET(req: Request): Response {
  return handleHealth(req);
}

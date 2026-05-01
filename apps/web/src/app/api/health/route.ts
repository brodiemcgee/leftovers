import { handleHealth } from '@leftovers/api';
export const runtime = 'edge';
export function GET(req: Request): Response {
  return handleHealth(req);
}

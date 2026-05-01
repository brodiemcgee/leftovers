import { handleHeadroom } from '@leftovers/api';
export const runtime = 'nodejs';
export function GET(req: Request): Promise<Response> {
  return handleHeadroom(req);
}

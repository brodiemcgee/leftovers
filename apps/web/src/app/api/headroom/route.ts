import { handleHeadroom } from '@leftovers/api';
export const runtime = 'edge';
export function GET(req: Request): Promise<Response> {
  return handleHeadroom(req);
}

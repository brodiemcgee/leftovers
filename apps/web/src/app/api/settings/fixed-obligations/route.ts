import { handleFixedObligationUpsert } from '@leftovers/api';
export const runtime = 'edge';
export function POST(req: Request): Promise<Response> {
  return handleFixedObligationUpsert(req);
}

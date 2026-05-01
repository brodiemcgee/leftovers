import { handlePayCycleUpsert } from '@leftovers/api';
export const runtime = 'nodejs';
export function POST(req: Request): Promise<Response> {
  return handlePayCycleUpsert(req);
}

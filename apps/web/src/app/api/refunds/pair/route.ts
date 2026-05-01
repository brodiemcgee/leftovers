import { handleRefundPair } from '@leftovers/api';
export const runtime = 'nodejs';
export function POST(req: Request): Promise<Response> {
  return handleRefundPair(req);
}

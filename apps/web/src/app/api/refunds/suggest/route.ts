import { handleRefundSuggest } from '@leftovers/api';
export const runtime = 'edge';
export function GET(req: Request): Promise<Response> {
  return handleRefundSuggest(req);
}

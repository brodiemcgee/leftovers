import { handleQuickAdd } from '@leftovers/api';
export const runtime = 'nodejs';
export function POST(req: Request): Promise<Response> {
  return handleQuickAdd(req);
}

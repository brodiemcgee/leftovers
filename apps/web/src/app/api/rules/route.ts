import { handleUserRuleUpsert } from '@leftovers/api';
export const runtime = 'nodejs';
export function POST(req: Request): Promise<Response> {
  return handleUserRuleUpsert(req);
}

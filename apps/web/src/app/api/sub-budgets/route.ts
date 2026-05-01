import { handleSubBudgetsList, handleSubBudgetsUpsert } from '@leftovers/api';
export const runtime = 'nodejs';
export function GET(req: Request): Promise<Response> {
  return handleSubBudgetsList(req);
}
export function POST(req: Request): Promise<Response> {
  return handleSubBudgetsUpsert(req);
}

import { handleSubBudgetTransactions } from '@leftovers/api';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return handleSubBudgetTransactions(req, id);
}

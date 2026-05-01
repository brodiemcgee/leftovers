import { handleUserRuleDelete } from '@leftovers/api';
export const runtime = 'nodejs';
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return handleUserRuleDelete(req, id);
}

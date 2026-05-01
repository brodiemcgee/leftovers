import { handleTransactionDetail, handleTransactionUpdate } from '@leftovers/api';
export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return handleTransactionDetail(req, id);
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return handleTransactionUpdate(req, id);
}

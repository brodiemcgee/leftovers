import { handleConnectBasiqStart, handleConnectBasiqFinalise } from '@leftovers/api';
export const runtime = 'nodejs';
export function POST(req: Request): Promise<Response> {
  return handleConnectBasiqStart(req);
}
export function PUT(req: Request): Promise<Response> {
  return handleConnectBasiqFinalise(req);
}

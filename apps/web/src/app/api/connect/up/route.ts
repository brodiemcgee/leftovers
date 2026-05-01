import { handleConnectUp } from '@leftovers/api';
export const runtime = 'nodejs';
export const maxDuration = 60;
export function POST(req: Request): Promise<Response> {
  return handleConnectUp(req);
}

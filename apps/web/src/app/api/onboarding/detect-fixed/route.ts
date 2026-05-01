import { handleDetectFixedObligations } from '@leftovers/api';
export const runtime = 'nodejs';
export function GET(req: Request): Promise<Response> {
  return handleDetectFixedObligations(req);
}

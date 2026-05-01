import { handleEmailAmexWebhook } from '@leftovers/api';
export const runtime = 'nodejs';
export const maxDuration = 30;
export function POST(req: Request): Promise<Response> {
  return handleEmailAmexWebhook(req);
}

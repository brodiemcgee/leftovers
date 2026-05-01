import { handleCronSync } from '@leftovers/api';
export const runtime = 'nodejs';
export const maxDuration = 300;
export function GET(req: Request): Promise<Response> {
  return handleCronSync(req);
}

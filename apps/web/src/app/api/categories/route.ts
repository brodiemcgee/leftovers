import { handleCategoriesList } from '@leftovers/api';
export const runtime = 'nodejs';
export function GET(req: Request): Promise<Response> {
  return handleCategoriesList(req);
}

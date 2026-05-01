import { handleSettingsGet, handleSettingsPatch } from '@leftovers/api';
export const runtime = 'edge';
export function GET(req: Request): Promise<Response> {
  return handleSettingsGet(req);
}
export function PATCH(req: Request): Promise<Response> {
  return handleSettingsPatch(req);
}

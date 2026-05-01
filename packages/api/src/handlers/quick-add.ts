import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const Body = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
});

/**
 * Pre-purchase what-if (PRD §F8). Reads the live headroom number, subtracts the
 * proposed spend, and returns the projected remaining + per-day allowance.
 * Saves nothing. Records nothing.
 */
export async function handleQuickAdd(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => Body.parse(raw));

    const { data: hr, error } = await supabase
      .rpc('headroom_for_user', { p_user_id: userId })
      .single();
    if (error) throw error;

    const newHeadroomCents = hr.headroom_cents - body.amountCents;
    const dailyCents = hr.days_remaining > 0 ? Math.floor(newHeadroomCents / hr.days_remaining) : 0;

    return jsonResponse({
      proposedAmountCents: body.amountCents,
      currentHeadroomCents: hr.headroom_cents,
      projectedHeadroomCents: newHeadroomCents,
      projectedDailyAllowanceCents: dailyCents,
      daysRemaining: hr.days_remaining,
      goesNegative: newHeadroomCents < 0,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'quick-add' });
    return errorResponse(500, 'quick-add failed');
  }
}

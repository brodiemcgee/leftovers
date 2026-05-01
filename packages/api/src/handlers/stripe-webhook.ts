import Stripe from 'stripe';
import { createServiceClient, env } from '@leftovers/shared';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import type { SubscriptionStatusEnum } from '@leftovers/shared/database';

let stripeSingleton: Stripe | null = null;
function stripe(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  stripeSingleton = new Stripe(env.stripeSecretKey, { apiVersion: '2025-02-24.acacia' });
  return stripeSingleton;
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();

  let evt: Stripe.Event;
  try {
    evt = stripe().webhooks.constructEvent(rawBody, sig ?? '', env.stripeWebhookSecret);
  } catch (e) {
    captureError(e, { handler: 'stripe-webhook:verify' });
    return errorResponse(400, 'invalid signature');
  }

  try {
    const supabase = createServiceClient();
    switch (evt.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = evt.data.object as Stripe.Subscription;
        const userId = sub.metadata?.['user_id'];
        if (!userId) break;
        const status: SubscriptionStatusEnum = mapStatus(sub.status);
        await supabase
          .from('users')
          .update({
            subscription_status: status,
            subscription_current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('id', userId);
        break;
      }
      default:
        break;
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    captureError(e, { handler: 'stripe-webhook' });
    return errorResponse(500, 'stripe webhook failed');
  }
}

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatusEnum {
  switch (s) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return s;
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    default:
      return 'active';
  }
}

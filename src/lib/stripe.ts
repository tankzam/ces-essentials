import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) client = new Stripe(env.stripeSecretKey());
  return client;
}

export function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === 'string' ? x : x.id;
}

export function toDate(unix: number | null | undefined): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null;
}

import 'server-only';

// Shopify Admin API for the CES Marketplace store (backup checkout).
// The app was created in Shopify's Dev Dashboard; it gets short-lived access
// tokens with the client credentials grant and renews them automatically.

export const SHOPIFY_API_VERSION = '2026-10';

let cached: { token: string; expiresAt: number } | null = null;

function storeDomain(): string {
  const d = process.env.SHOPIFY_STORE_DOMAIN;
  if (!d) throw new Error('Missing environment variable SHOPIFY_STORE_DOMAIN');
  return d.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export async function shopifyToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const id = process.env.SHOPIFY_CLIENT_ID;
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
  const res = await fetch(`https://${storeDomain()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify token request failed (${res.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token: string; expires_in?: number; scope?: string };
  const ttl = (body.expires_in ?? 3600) * 1000;
  cached = { token: body.access_token, expiresAt: Date.now() + ttl - 5 * 60 * 1000 };
  return body.access_token;
}

export async function shopifyGraphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${storeDomain()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await shopifyToken() },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || body.errors) throw new Error(`Shopify API error (${res.status}): ${JSON.stringify(body.errors ?? body).slice(0, 500)}`);
  return body.data as T;
}

/** Store details and what the app is allowed to do — used to confirm the connection. */
export async function shopifyConnectionCheck() {
  return shopifyGraphql<{
    shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string }; currencyCode: string; plan: { displayName: string } };
    currentAppInstallation: { accessScopes: { handle: string }[] };
    products: { edges: { node: { title: string; status: string } }[] };
    sellingPlanGroups: { edges: { node: { name: string; appId: string | null } }[] };
  }>(`{
    shop { name myshopifyDomain primaryDomain { host } currencyCode plan { displayName } }
    currentAppInstallation { accessScopes { handle } }
    products(first: 10, query: "title:*CES*") { edges { node { title status } } }
    sellingPlanGroups(first: 10) { edges { node { name appId } } }
  }`);
}

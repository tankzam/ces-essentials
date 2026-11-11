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

// ───────────────────────── Products ─────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Creates (or updates) one Shopify product per CES Essentials product, priced
 * from the products table. Digital: no shipping, no inventory tracking, not
 * taxable. Hidden from storefront search/collections; members reach them
 * through checkout links from cesessentials.com. Safe to re-run.
 */
export async function syncShopifyProducts() {
  const { admin } = await import('@/lib/supabase/admin');
  const db = admin();
  const { data: products, error } = await db
    .from('products')
    .select('id, name, kind, price_cents, active, shopify_product_id, shopify_variant_id, product_services(service_id)')
    .order('sort_order');
  if (error) throw error;
  const { data: services } = await db.from('services').select('id, name, public_description');
  const svc = new Map((services ?? []).map((s) => [s.id as string, s]));

  const results: { id: string; action: string; productId?: string; variantId?: string; error?: string }[] = [];
  for (const p of products ?? []) {
    try {
      const sku = `ces-${p.id}`;
      const price = (p.price_cents / 100).toFixed(2);
      const included = ((p.product_services ?? []) as { service_id: string }[]).map((x) => svc.get(x.service_id)).filter(Boolean) as { name: string; public_description: string }[];
      const perPerson = p.kind === 'company_package' ? ' per person' : '';
      const descriptionHtml =
        `<p>CES Essentials monthly membership${perPerson}. Cancel anytime; access lasts through the end of the billing month. No refunds once a billing month has started.</p>` +
        `<ul>${included.map((s) => `<li><strong>${esc(s.name)}</strong>: ${esc(s.public_description)}</li>`).join('')}${p.kind === 'addon' ? '<li><strong>Discount Club</strong>: included free</li>' : ''}</ul>` +
        `<p>Healthcare services are provided by a licensed telehealth provider.</p>`;

      let productId = p.shopify_product_id as string | null;
      let variantId = p.shopify_variant_id as string | null;

      if (!productId) {
        // Already created on an earlier run? Find it by SKU.
        const found = await shopifyGraphql<{ productVariants: { nodes: { id: string; product: { id: string } }[] } }>(
          `query($q: String!) { productVariants(first: 1, query: $q) { nodes { id product { id } } } }`,
          { q: `sku:${sku}` },
        );
        const hit = found.productVariants.nodes[0];
        if (hit) {
          productId = hit.product.id;
          variantId = hit.id;
        }
      }

      if (!productId) {
        const created = await shopifyGraphql<{
          productCreate: { product: { id: string; variants: { nodes: { id: string }[] } } | null; userErrors: { field: string[]; message: string }[] };
        }>(
          `mutation($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product { id variants(first: 1) { nodes { id } } }
              userErrors { field message }
            }
          }`,
          {
            product: {
              title: `CES Essentials — ${p.name}`,
              descriptionHtml,
              vendor: 'CES Essentials',
              productType: 'Membership',
              tags: ['ces-essentials', p.kind],
              status: p.active ? 'ACTIVE' : 'DRAFT',
              metafields: [{ namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' }],
            },
          },
        );
        if (created.productCreate.userErrors.length) throw new Error(created.productCreate.userErrors.map((e) => e.message).join('; '));
        productId = created.productCreate.product!.id;
        variantId = created.productCreate.product!.variants.nodes[0].id;
        results.push({ id: p.id, action: 'created', productId, variantId });
      } else {
        await shopifyGraphql(
          `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
          { product: { id: productId, title: `CES Essentials — ${p.name}`, descriptionHtml } },
        );
        results.push({ id: p.id, action: 'updated', productId, variantId: variantId ?? undefined });
      }

      // Price and digital settings on the single variant.
      const upd = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
        }`,
        {
          productId,
          variants: [{ id: variantId, price, taxable: false, inventoryItem: { sku, requiresShipping: false, tracked: false } }],
        },
      );
      if (upd.productVariantsBulkUpdate.userErrors.length) throw new Error(upd.productVariantsBulkUpdate.userErrors.map((e) => e.message).join('; '));

      await db.from('products').update({ shopify_product_id: productId, shopify_variant_id: variantId }).eq('id', p.id);
    } catch (e) {
      results.push({ id: p.id, action: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

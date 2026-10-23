import { loadSource } from "./test-source.mjs";

export function orderFixture(db, id, { productId = "p", variantId = "p-standard", price = 300,
  offerProductId = productId, offerVariantId = variantId, offerPrice = 210,
  rules = { storeName: "Test", shippingFeeMad: 29, freeShippingThresholdMad: 400,
    upsellEnabled: true, upsellWindowSeconds: 300, upsellDiscountPercent: 30 }, offer = true } = {}) {
  const { insertStorefrontOrder } = loadSource("@/lib/db");
  const { getVariantById } = loadSource("@/lib/services/catalog");
  const { orderLineSnapshot } = loadSource("@/lib/services/order-lines");
  const { deriveOrderToken, orderTokenVerifier } = loadSource("@/lib/order-token");
  const { shippingFor } = loadSource("@/lib/pricing");
  const v = getVariantById(variantId), ov = getVariantById(offerVariantId);
  const token = deriveOrderToken(id, `nonce-${id}`);
  const shipping = shippingFor(price, rules);
  db.transaction(() => insertStorefrontOrder(db, { id, customerName: "Cliente test", customerPhone: "+212612345678",
    items: [orderLineSnapshot(v, v.product.name, price, 1)],
    offer: offer ? { offerId: `offer-${id}`, productId: offerProductId, name: ov.product.name, image: "",
      originalPrice: ov.price, upsellPrice: offerPrice, expiresAt: new Date(Date.now() + 300000).toISOString(),
      rules, variants: [{ variantId: ov.id, label: ov.label, options: ov.options, available: true }],
      variantItems: [orderLineSnapshot(ov, ov.product.name, offerPrice, 1)] } : null,
    nonce: `nonce-${id}`, verifier: orderTokenVerifier(token), subtotal: price, shipping, total: price + shipping,
    now: new Date().toISOString() })).immediate();
  return token;
}

export function upsellService(db) {
  const { createStorefrontOrderService } = loadSource("@/lib/services/storefront-orders");
  const catalog = loadSource("@/lib/services/catalog");
  return createStorefrontOrderService({ db, catalog: {
    getVariantById: (id) => { const v = catalog.getVariantById(id); return v && { ...v, productName: v.product.name }; },
    getProductById: catalog.getProductById, listUpsellCandidates: catalog.listProducts,
    getActivePacks: (ids) => loadSource("@/lib/services/packs").getActivePacksFor(ids, db),
  } });
}

export function genericProduct(db, id, price, variants) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
    VALUES (?, ?, ?, 'objets', ?, ?, ?)`).run(id, id, id, price, now, now);
  for (const [variantId, options] of variants) {
    db.prepare(`INSERT INTO variants (id, product_id, sku, label, options_json, options_key)
      VALUES (?, ?, ?, ?, ?, ?)`).run(variantId, id, variantId, options.length ? options.map(o => o.value).join(" / ") : "Standard",
        JSON.stringify(options), JSON.stringify(options));
  }
}

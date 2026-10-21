import { loadSource } from "./test-source.mjs";

// Test-only historical snapshot insertion. Runtime checkouts use durable v1
// receipts; operational suites deliberately construct interrupted/history states.
export function createOrder(input) {
  const db = loadSource("@/lib/db").getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json,
    upsell_offer_json, upsell_status, subtotal, shipping, total, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MAD', ?, ?)`)
    .run(input.id, input.customerName, input.customerPhone, JSON.stringify(input.items),
      input.upsellOffer ? JSON.stringify(input.upsellOffer) : null,
      input.upsellOffer ? "pending" : "closed", input.subtotal, input.shipping, input.total, now, now);
}

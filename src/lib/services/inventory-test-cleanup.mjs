// Offline maintenance entry point of the inventory service. No provider calls.
// The caller supplies a SQLite connection and explicit, previously reviewed IDs.
export function purgeConfirmedTests(db, ids, { apply = false, allowLaterStockCounts = false } = {}) {
  const fail = (message) => { throw new Error(message); };
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || !/^ord_[\w-]+$/.test(id))) {
    fail("Fournissez de 1 à 100 identifiants de commande distincts.");
  }
  if (db.pragma("foreign_keys", { simple: true }) !== 1) fail("Les clés étrangères doivent être activées.");

  return db.transaction(() => {
    db.exec(`DROP TABLE IF EXISTS temp.cleanup_orders;
      DROP TABLE IF EXISTS temp.cleanup_submissions;
      DROP TABLE IF EXISTS temp.cleanup_operations;
      DROP TABLE IF EXISTS temp.cleanup_notes;
      CREATE TEMP TABLE cleanup_orders (id TEXT PRIMARY KEY);
      CREATE TEMP TABLE cleanup_submissions (id TEXT PRIMARY KEY);
      CREATE TEMP TABLE cleanup_operations (id TEXT PRIMARY KEY);
      CREATE TEMP TABLE cleanup_notes (id TEXT PRIMARY KEY);`);
    const insert = db.prepare("INSERT INTO cleanup_orders VALUES (?)");
    for (const id of ids) insert.run(id);
    const invalid = db.prepare(`SELECT t.id FROM cleanup_orders t LEFT JOIN orders o ON o.id = t.id
      WHERE o.id IS NULL OR o.confirmation_status <> 'confirmed'`).all();
    if (invalid.length) fail("Une commande est absente ou n’est plus confirmée. Aucun changement.");
    db.exec(`INSERT INTO cleanup_submissions SELECT id FROM courier_submissions WHERE order_id IN (SELECT id FROM cleanup_orders);
      INSERT INTO cleanup_operations SELECT DISTINCT operation_id FROM bl_operation_parcels WHERE submission_id IN (SELECT id FROM cleanup_submissions);
      INSERT INTO cleanup_notes SELECT DISTINCT delivery_note_id FROM delivery_note_parcels WHERE submission_id IN (SELECT id FROM cleanup_submissions);
      INSERT OR IGNORE INTO cleanup_notes SELECT delivery_note_id FROM bl_operations WHERE id IN (SELECT id FROM cleanup_operations) AND delivery_note_id IS NOT NULL;
      INSERT OR IGNORE INTO cleanup_operations SELECT id FROM bl_operations WHERE delivery_note_id IN (SELECT id FROM cleanup_notes);`);
    if (db.prepare(`SELECT 1 FROM bl_operation_parcels WHERE operation_id IN (SELECT id FROM cleanup_operations)
      AND submission_id NOT IN (SELECT id FROM cleanup_submissions) LIMIT 1`).get() ||
      db.prepare(`SELECT 1 FROM delivery_note_parcels WHERE delivery_note_id IN (SELECT id FROM cleanup_notes)
      AND submission_id NOT IN (SELECT id FROM cleanup_submissions) LIMIT 1`).get()) {
      fail("Un BL est partagé avec une commande hors sélection. Aucun changement.");
    }
    if (db.prepare(`SELECT 1 FROM courier_submissions WHERE id IN (SELECT id FROM cleanup_submissions)
      AND status NOT IN ('submitted', 'failed', 'needs_review') LIMIT 1`).get() ||
      db.prepare(`SELECT 1 FROM bl_operations WHERE id IN (SELECT id FROM cleanup_operations)
      AND status NOT IN ('completed', 'abandoned') LIMIT 1`).get()) {
      fail("Une transmission ou un BL est encore actif ou incertain. Aucun changement.");
    }
    if (db.prepare("SELECT 1 FROM returns WHERE submission_id IN (SELECT id FROM cleanup_submissions) LIMIT 1").get()) {
      fail("Un retour existe : rapprochement manuel nécessaire. Aucun changement.");
    }
    if (db.prepare(`SELECT 1 FROM stock_movements WHERE submission_id IN (SELECT id FROM cleanup_submissions)
      AND (order_id IS NULL OR order_id NOT IN (SELECT id FROM cleanup_orders)) LIMIT 1`).get() ||
      db.prepare(`SELECT 1 FROM submission_resolutions WHERE
      (submission_id IN (SELECT id FROM cleanup_submissions)) <> (order_id IN (SELECT id FROM cleanup_orders)) LIMIT 1`).get()) {
      fail("Historique lié à une autre commande. Aucun changement.");
    }
    if (db.prepare(`SELECT 1 FROM meta_events WHERE event_id IN
      (SELECT event_id FROM meta_purchases WHERE order_id IN (SELECT id FROM cleanup_orders))
      AND lease IS NOT NULL AND available_at > ? LIMIT 1`).get(Date.now())) {
      fail("Un envoi Meta est en cours. Attendez une minute et réessayez.");
    }
    const movements = db.prepare(`SELECT * FROM stock_movements WHERE order_id IN (SELECT id FROM cleanup_orders)`).all();
    const reservations = db.prepare("SELECT * FROM reservations WHERE order_id IN (SELECT id FROM cleanup_orders)").all();
    const effects = new Map();
    for (const row of movements) {
      if (row.location !== "MAIN" || !["reserve", "release", "dispatch"].includes(row.kind) ||
        !Number.isSafeInteger(row.qty) || row.qty === 0 ||
        (row.kind === "reserve" ? row.qty < 0 : row.qty > 0)) fail("Mouvement de stock non pris en charge. Aucun changement.");
      const key = `${row.order_id}:${row.variant_id}`;
      const effect = effects.get(key) ?? { order: row.order_id, variant: row.variant_id, reserved: 0, dispatched: 0, active: 0, consumed: 0, first: row.created_at };
      effect.reserved += row.qty; // dispatch decrements both reserved and physical
      if (row.kind === "dispatch") effect.dispatched -= row.qty;
      if (row.created_at < effect.first) effect.first = row.created_at;
      effects.set(key, effect);
    }
    for (const row of reservations) {
      const effect = effects.get(`${row.order_id}:${row.variant_id}`);
      if (!effect || !Number.isSafeInteger(row.qty) || row.qty <= 0) fail("Réservation sans historique cohérent.");
      if (row.status === "active") effect.active += row.qty;
      else if (row.status === "consumed") effect.consumed += row.qty;
      else if (row.status !== "released") fail("Statut de réservation inconnu.");
    }
    const balances = new Map();
    for (const effect of effects.values()) {
      if (effect.reserved !== effect.active || effect.dispatched !== effect.consumed) fail("Réservations et mouvements incohérents. Aucun changement.");
      // A later absolute recount may already have corrected a test dispatch.
      if (!allowLaterStockCounts && effect.dispatched && db.prepare(`SELECT 1 FROM stock_movements WHERE variant_id = ? AND location = 'MAIN'
        AND kind IN ('opening', 'adjust_physical', 'adjust_quarantine') AND created_at >= ? LIMIT 1`)
        .get(effect.variant, effect.first)) fail("Un comptage de stock est postérieur au test. Vérification manuelle nécessaire.");
      const sum = balances.get(effect.variant) ?? { variant: effect.variant, release: 0, restore: 0 };
      sum.release += effect.active;
      sum.restore += effect.dispatched;
      balances.set(effect.variant, sum);
    }
    const stock = [];
    for (const effect of balances.values()) {
      const balance = db.prepare("SELECT * FROM stock_balances WHERE variant_id = ? AND location = 'MAIN'").get(effect.variant);
      const active = db.prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM reservations WHERE variant_id = ? AND status = 'active'").get(effect.variant).n;
      if (!balance || balance.reserved !== active || balance.reserved < effect.release) fail("Solde de stock incohérent. Aucun changement.");
      const physical = balance.physical + effect.restore;
      const reserved = balance.reserved - effect.release;
      if (!Number.isSafeInteger(physical) || physical < balance.quarantine + reserved) fail("La correction produirait un stock invalide.");
      stock.push({ ...effect, physicalBefore: balance.physical, physicalAfter: physical, reservedBefore: balance.reserved, reservedAfter: reserved });
    }
    const summary = {
      allowLaterStockCounts,
      orders: ids.length,
      parcels: db.prepare("SELECT COUNT(*) AS n FROM cleanup_submissions").get().n,
      operations: db.prepare("SELECT COUNT(*) AS n FROM cleanup_operations").get().n,
      deliveryNotes: db.prepare("SELECT COUNT(*) AS n FROM cleanup_notes").get().n,
      pairsReleased: stock.reduce((n, r) => n + r.release, 0),
      pairsRestored: stock.reduce((n, r) => n + r.restore, 0),
      stock,
    };
    if (!apply) return summary;

    for (const row of stock) {
      db.prepare("UPDATE stock_balances SET physical = ?, reserved = ? WHERE variant_id = ? AND location = 'MAIN'")
        .run(row.physicalAfter, row.reservedAfter, row.variant);
    }
    // Removing the original test movements leaves the ledger matching the restored balances.
    db.exec(`DELETE FROM bl_operation_events WHERE operation_id IN (SELECT id FROM cleanup_operations);
      DELETE FROM bl_operation_parcels WHERE operation_id IN (SELECT id FROM cleanup_operations);
      DELETE FROM delivery_note_parcels WHERE delivery_note_id IN (SELECT id FROM cleanup_notes);
      DELETE FROM bl_operations WHERE id IN (SELECT id FROM cleanup_operations);
      DELETE FROM delivery_notes WHERE id IN (SELECT id FROM cleanup_notes);
      DELETE FROM tracking_events WHERE submission_id IN (SELECT id FROM cleanup_submissions);
      DELETE FROM submission_resolutions WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM courier_submissions WHERE id IN (SELECT id FROM cleanup_submissions);
      DELETE FROM reservations WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM stock_movements WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM order_contacts WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM manual_order_requests WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM meta_events WHERE event_id IN (SELECT event_id FROM meta_purchases WHERE order_id IN (SELECT id FROM cleanup_orders));
      DELETE FROM meta_purchases WHERE order_id IN (SELECT id FROM cleanup_orders);
      DELETE FROM orders WHERE id IN (SELECT id FROM cleanup_orders);`);
    if (db.pragma("foreign_key_check").length) fail("Échec du contrôle des clés étrangères : transaction annulée.");
    return summary;
  }).immediate();
}

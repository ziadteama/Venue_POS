
function findMenuItemPrice(menu, menuItemId) {
  for (const cat of menu?.categories ?? []) {
    for (const item of cat.items ?? []) {
      if (item.id === menuItemId) return Number(item.price);
    }
  }
  return null;
}

/** Server price wins — refresh unit prices on unsynced open cheques before replay. */
export function reconcileLocalChequePrices(db, venueId) {
  const menuRow = db.prepare(`SELECT menu_json FROM menu_cache WHERE venue_id = ?`).get(venueId);
  if (!menuRow) return { updated: 0 };

  const menu = JSON.parse(menuRow.menu_json);
  let updated = 0;

  const openCheques = db
    .prepare(`SELECT id FROM cheques WHERE venue_id = ? AND status = 'open' AND server_id IS NULL`)
    .all(venueId);

  for (const { id: chequeId } of openCheques) {
    const orders = db.prepare(`SELECT id FROM orders WHERE cheque_id = ?`).all(chequeId);
    for (const { id: orderId } of orders) {
      const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);
      for (const item of items) {
        const serverPrice = findMenuItemPrice(menu, item.menu_item_id);
        if (serverPrice != null && serverPrice !== Number(item.unit_price)) {
          db.prepare(`UPDATE order_items SET unit_price = ? WHERE id = ?`).run(
            serverPrice,
            item.id,
          );
          updated += 1;
        }
      }
    }
  }

  return { updated };
}

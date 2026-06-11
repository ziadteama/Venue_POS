import { isTakeawayServiceMode, TAKEAWAY_TABLE_LABEL } from '@venue-pos/shared';

/** Receipt / kitchen location line for dine-in table or takeaway counter. */
export function formatTableLocationLine({ tableLabel, serviceMode } = {}) {
  if (isTakeawayServiceMode(serviceMode) || tableLabel === TAKEAWAY_TABLE_LABEL) {
    return 'Take away';
  }
  return `Table: ${tableLabel ?? '—'}`;
}

export function decimalToNumber(value) {
  if (value == null) return value;
  return Number(value);
}

export function serializeModifierOption(option) {
  return {
    id: option.id,
    nameEn: option.nameEn,
    nameAr: option.nameAr,
    priceDelta: decimalToNumber(option.priceDelta),
    sortOrder: option.sortOrder,
  };
}

export function serializeModifierGroup(group) {
  return {
    id: group.id,
    venueId: group.venueId,
    nameEn: group.nameEn,
    nameAr: group.nameAr,
    minSelection: group.minSelection,
    maxSelection: group.maxSelection,
    sortOrder: group.sortOrder,
    options: group.options?.map(serializeModifierOption) ?? [],
  };
}

export function serializeMenuItem(item) {
  const modifierGroups =
    item.modifierGroups?.map((link) =>
      serializeModifierGroup({
        ...link.modifierGroup,
        options: link.modifierGroup?.options,
      }),
    ) ?? item.modifierGroupsList?.map(serializeModifierGroup) ?? [];

  return {
    id: item.id,
    categoryId: item.categoryId,
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    descriptionEn: item.descriptionEn,
    descriptionAr: item.descriptionAr,
    price: decimalToNumber(item.price),
    taxRate: decimalToNumber(item.taxRate),
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    sortOrder: item.sortOrder,
    modifierGroups,
  };
}

export function serializeCategory(category) {
  return {
    id: category.id,
    venueId: category.venueId,
    nameEn: category.nameEn,
    nameAr: category.nameAr,
    sortOrder: category.sortOrder,
    items: category.items?.map(serializeMenuItem) ?? [],
  };
}

export function serializeVenueMenu(venue) {
  const menu = venue.venueMenu ?? {};
  return {
    venueId: venue.id,
    venueNameEn: venue.nameEn,
    venueNameAr: venue.nameAr,
    status: menu.status ?? 'draft',
    publishedAt: menu.publishedAt ?? null,
    versionHash: menu.versionHash ?? null,
    categories: venue.categories?.map(serializeCategory) ?? [],
    modifierGroups: venue.modifierGroups?.map(serializeModifierGroup) ?? [],
  };
}

export function serializeOrder(order) {
  const items =
    order.items?.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice: decimalToNumber(item.unitPrice),
      modifiersSnapshot: item.modifiersSnapshot,
      kitchenStatus: item.kitchenStatus ?? 'pending',
      isComped: item.isComped ?? false,
      billingChequeId: item.billingChequeId ?? null,
      paidAt: item.paidAt ?? null,
      nameEn: item.menuItem?.nameEn,
      nameAr: item.menuItem?.nameAr,
    })) ?? [];

  const subtotal = items.reduce((sum, item) => {
    if (item.isComped) return sum;
    const mods =
      item.modifiersSnapshot?.reduce((m, mod) => m + Number(mod.priceDelta ?? 0), 0) ?? 0;
    return sum + (Number(item.unitPrice) + mods) * item.quantity;
  }, 0);

  return {
    id: order.id,
    venueId: order.venueId,
    terminalId: order.terminalId,
    cashierId: order.cashierId,
    orderNumber: order.orderNumber,
    tableLabel: order.tableLabel,
    status: order.status,
    openedAt: order.openedAt,
    sentAt: order.sentAt,
    closedAt: order.closedAt ?? null,
    items,
    subtotal,
  };
}

export function buildReceiptText(order, venue) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    `Order #${order.orderNumber}`,
    formatTableLocationLine({ tableLabel: order.tableLabel }),
    `Status: ${order.status}`,
    '---',
  ];
  for (const item of order.items) {
    const mods = item.modifiersSnapshot ?? [];
    const modTotal = mods.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0);
    const lineTotal = (Number(item.unitPrice) + modTotal) * item.quantity;
    lines.push(`${item.quantity}x ${item.nameEn} — ${lineTotal.toFixed(2)}`);
    for (const mod of mods) {
      lines.push(`  + ${mod.nameEn} (+${Number(mod.priceDelta).toFixed(2)})`);
    }
  }
  lines.push('---', `Subtotal: ${order.subtotal.toFixed(2)}`, `Opened: ${order.openedAt}`);
  if (order.sentAt) lines.push(`Sent: ${order.sentAt}`);
  return lines.join('\n');
}

/** Itemized rounds + subtotal/discount for a serialized cheque (open or paid). */
export function appendChequeReceiptItems(lines, cheque) {
  const rounds = (cheque.orders ?? []).filter(
    (o) => o.status !== 'draft' && o.status !== 'voided' && o.items?.length,
  );

  const chequeId = cheque.id;
  const isChild = Boolean(cheque.parentChequeId);
  const showPaidItems = cheque.status === 'paid';

  for (const order of rounds) {
    const visibleItems = order.items.filter((item) => {
      if (!showPaidItems && item.paidAt) return false;
      if (isChild) return item.billingChequeId === chequeId;
      return !item.billingChequeId || item.billingChequeId === chequeId;
    });
    if (!visibleItems.length) continue;

    lines.push(`Round #${order.orderNumber} (${order.status})`);
    for (const item of visibleItems) {
      const mods = item.modifiersSnapshot ?? [];
      const modTotal = mods.reduce((s, m) => s + Number(m.priceDelta ?? 0), 0);
      const lineTotal = item.isComped
        ? 0
        : (Number(item.unitPrice) + modTotal) * item.quantity;
      const compTag = item.isComped ? ' [COMP]' : '';
      lines.push(`  ${item.quantity}x ${item.nameEn}${compTag} — ${lineTotal.toFixed(2)}`);
    }
    lines.push(`  Round subtotal: ${order.subtotal.toFixed(2)}`);
  }

  const subtotal = cheque.subtotalBeforeDiscount ?? cheque.total;
  if (Number(cheque.discountAmount ?? 0) > 0) {
    lines.push(`Subtotal: ${Number(subtotal).toFixed(2)}`);
    lines.push(`Discount: -${Number(cheque.discountAmount).toFixed(2)}`);
  } else if (Number(subtotal) > 0 && Number(subtotal) !== Number(cheque.total ?? 0)) {
    lines.push(`Subtotal: ${Number(subtotal).toFixed(2)}`);
  }
  if (Number(cheque.serviceAmount ?? 0) > 0) {
    lines.push(`Service: ${Number(cheque.serviceAmount).toFixed(2)}`);
  }
  if (Number(cheque.taxAmount ?? 0) > 0) {
    lines.push(`Tax: ${Number(cheque.taxAmount).toFixed(2)}`);
  }
}

export function buildChequeReceiptText(cheque, venue, { tendered, change, preview, copyNumber } = {}) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    ...(preview ? ['*** PRE-PAYMENT CHECK ***'] : []),
    ...(preview && copyNumber > 1 ? [`COPY #${copyNumber}`] : []),
    `Cheque #${cheque.chequeNumber}`,
    formatTableLocationLine({
      tableLabel: cheque.tableLabel,
      serviceMode: cheque.serviceMode,
    }),
  ];
  if (cheque.splitLabel) {
    lines.push(`Guest: ${cheque.splitLabel}`);
  }
  lines.push('---');

  appendChequeReceiptItems(lines, cheque);
  lines.push('---', `TOTAL: ${cheque.total.toFixed(2)}`);

  if (cheque.payments?.length) {
    lines.push('Payments:');
    for (const p of cheque.payments) {
      lines.push(`  ${p.method}: ${Number(p.amount).toFixed(2)}`);
    }
  }

  if (tendered != null && change != null) {
    lines.push(`Tendered: ${Number(tendered).toFixed(2)}`);
    lines.push(`Change: ${Number(change).toFixed(2)}`);
  }

  lines.push('---', 'Thank you!');
  return lines.join('\n');
}

/** Paid cheque slip for the restaurant — not handed to the guest. */
export function buildRestaurantReceiptText(cheque, venue, { tendered, change } = {}) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    '*** RESTAURANT COPY ***',
    `Cheque #${cheque.chequeNumber}`,
    formatTableLocationLine({
      tableLabel: cheque.tableLabel,
      serviceMode: cheque.serviceMode,
    }),
  ];
  if (cheque.splitLabel) {
    lines.push(`Guest: ${cheque.splitLabel}`);
  }
  lines.push('---');

  appendChequeReceiptItems(lines, cheque);
  lines.push('---', `TOTAL: ${cheque.total.toFixed(2)}`);

  if (cheque.payments?.length) {
    lines.push('Payments:');
    for (const p of cheque.payments) {
      lines.push(`  ${p.method}: ${Number(p.amount).toFixed(2)}`);
    }
  }

  if (tendered != null && change != null) {
    lines.push(`Tendered: ${Number(tendered).toFixed(2)}`);
    lines.push(`Change: ${Number(change).toFixed(2)}`);
  }

  lines.push('---', 'For restaurant records');
  return lines.join('\n');
}

/** One printable document listing every split guest plus any table remainder. */
export function buildFullSplitReceiptText(parentCheque, childCheques, venue) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    '*** FULL TABLE CHECK ***',
    `Cheque #${parentCheque.chequeNumber}`,
    formatTableLocationLine({
      tableLabel: parentCheque.tableLabel,
      serviceMode: parentCheque.serviceMode,
    }),
    '---',
  ];

  let grandTotal = 0;
  for (const child of childCheques) {
    lines.push(`-- ${child.splitLabel ?? 'Guest'} (#${child.chequeNumber}) --`);
    appendChequeReceiptItems(lines, child);
    lines.push(`Guest total: ${child.total.toFixed(2)}`, '---');
    grandTotal += child.total;
  }

  const remainder = Number(parentCheque.total ?? 0);
  if (remainder > 0.009) {
    lines.push(`-- Table remainder (#${parentCheque.chequeNumber}) --`);
    appendChequeReceiptItems(lines, parentCheque);
    lines.push(`Remainder: ${remainder.toFixed(2)}`, '---');
    grandTotal += remainder;
  }

  lines.push(`TABLE TOTAL: ${grandTotal.toFixed(2)}`, '---', 'Thank you!');
  return lines.join('\n');
}

export function buildRefundReceiptText(cheque, venue, refund) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    '*** REFUND ***',
    `Cheque #${cheque.chequeNumber}`,
    formatTableLocationLine({
      tableLabel: cheque.tableLabel,
      serviceMode: cheque.serviceMode,
    }),
    '---',
    `Refund amount: ${Number(refund.amount).toFixed(2)}`,
    `Method: ${refund.method}`,
    `Reason: ${refund.reason}`,
    `Processed: ${refund.processedAt}`,
    '---',
    'Retain this receipt for your records.',
  ];
  return lines.join('\n');
}

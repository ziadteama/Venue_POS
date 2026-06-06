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
    menuTemplateId: group.menuTemplateId,
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
    menuTemplateId: category.menuTemplateId,
    nameEn: category.nameEn,
    nameAr: category.nameAr,
    sortOrder: category.sortOrder,
    items: category.items?.map(serializeMenuItem) ?? [],
  };
}

export function serializeMenuTemplate(template) {
  return {
    id: template.id,
    nameEn: template.nameEn,
    nameAr: template.nameAr,
    status: template.status,
    publishedAt: template.publishedAt,
    versionHash: template.versionHash,
    venueIds: template.venues?.map((v) => v.venueId) ?? [],
    categories: template.categories?.map(serializeCategory) ?? [],
    modifierGroups: template.modifierGroups?.map(serializeModifierGroup) ?? [],
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
      nameEn: item.menuItem?.nameEn,
      nameAr: item.menuItem?.nameAr,
    })) ?? [];

  const subtotal = items.reduce((sum, item) => {
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
    items,
    subtotal,
  };
}

export function buildReceiptText(order, venue) {
  const lines = [
    venue?.nameEn ?? 'Venue POS',
    `Order #${order.orderNumber}`,
    `Table: ${order.tableLabel ?? '—'}`,
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

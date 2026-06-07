function decimalToNumber(value) {
  if (value == null) return 0;
  return Number(value);
}

/** Net subtotal after discount → service, tax, and payable total. */
export function computeVenueCharges(netSubtotal, venue) {
  const base = Math.max(0, Number(netSubtotal));
  const taxRate = decimalToNumber(venue?.taxRate);
  const serviceRate = venue?.serviceEnabled ? decimalToNumber(venue?.serviceRate) : 0;
  const taxInclusive = Boolean(venue?.taxInclusive);

  let serviceAmount = 0;
  if (serviceRate > 0 && base > 0) {
    serviceAmount = Number((base * serviceRate).toFixed(2));
  }

  let taxAmount = 0;
  if (taxRate > 0 && base > 0) {
    if (taxInclusive) {
      taxAmount = Number((base - base / (1 + taxRate)).toFixed(2));
    } else {
      taxAmount = Number(((base + serviceAmount) * taxRate).toFixed(2));
    }
  }

  const total = taxInclusive
    ? Number((base + serviceAmount).toFixed(2))
    : Number((base + serviceAmount + taxAmount).toFixed(2));

  return { serviceAmount, taxAmount, total };
}

import { prisma } from '../db/prisma.js';
import { notFound } from '../utils/errors.js';
import {
  buildChequeReceiptText,
  buildRestaurantReceiptText,
} from '../utils/serialize.js';

const PREVIEW_TYPES = new Set(['customer', 'restaurant', 'prePayment']);

function sampleSerializedCheque() {
  const subtotal = 120;
  const discountAmount = 0;
  const serviceAmount = 12;
  const taxAmount = 18.48;
  const total = 150.48;
  return {
    id: 'preview-cheque',
    chequeNumber: 42,
    tableLabel: 'T5',
    serviceMode: 'dine_in',
    status: 'paid',
    subtotalBeforeDiscount: subtotal,
    discountAmount,
    serviceAmount,
    taxAmount,
    total,
    prePaymentCheckPrintCount: 1,
    payments: [
      { method: 'cash', amount: 100, cardLast4: null },
      { method: 'card', amount: 50.48, cardLast4: '4242' },
    ],
    orders: [
      {
        orderNumber: 101,
        status: 'closed',
        subtotal: 120,
        items: [
          {
            quantity: 2,
            nameEn: 'Grilled Chicken',
            unitPrice: 45,
            isComped: false,
            paidAt: new Date().toISOString(),
            billingChequeId: null,
            modifiersSnapshot: [{ nameEn: 'Extra sauce', priceDelta: 15 }],
          },
          {
            quantity: 1,
            nameEn: 'House Salad',
            unitPrice: 15,
            isComped: false,
            paidAt: new Date().toISOString(),
            billingChequeId: null,
            modifiersSnapshot: [],
          },
        ],
      },
    ],
  };
}

export async function buildReceiptPreview(venueId, type) {
  if (!PREVIEW_TYPES.has(type)) {
    return { type, text: '' };
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) throw notFound('Venue not found');

  const cheque = sampleSerializedCheque();
  const opts = { tendered: 160, change: 9.52 };

  let text;
  if (type === 'prePayment') {
    text = buildChequeReceiptText(cheque, venue, { preview: true, copyNumber: 1 });
  } else if (type === 'restaurant') {
    text = buildRestaurantReceiptText(cheque, venue, opts);
  } else {
    text = buildChequeReceiptText(cheque, venue, opts);
  }

  return { type, text, venueNameEn: venue.nameEn };
}

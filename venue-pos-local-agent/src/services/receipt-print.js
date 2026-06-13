import { printReceiptText } from './receipt-printer.js';

function printOne(text, printerOpts, label) {
  if (!text) return;
  printReceiptText(text, printerOpts).catch((err) =>
    printerOpts.log?.warn?.({ err }, `${label} receipt print failed`),
  );
}

/** Dine-in: restaurant copy only. Takeaway: customer + restaurant copies. Always runs on pay. */
export function printPayReceipts(result, printerOpts) {
  const isTakeaway = result.cheque?.serviceMode === 'takeaway';
  printOne(result.restaurantReceipt, printerOpts, 'Restaurant');
  if (isTakeaway) {
    printOne(result.receipt, printerOpts, 'Customer');
  }
}

/** @deprecated Pay path uses printPayReceipts. Kept for callers still passing autoReceiptPrint. */
export function maybePrintPayReceipts(result, printerOpts) {
  if (!printerOpts.autoReceiptPrint) return;
  printPayReceipts(result, printerOpts);
}

/** Cross-venue settlement is dine-in — restaurant copy only. */
export function maybePrintCrossVenuePayReceipt(result, printerOpts) {
  if (!printerOpts.autoReceiptPrint) return;
  const text = result.restaurantReceipt ?? result.receipt;
  printOne(text, printerOpts, 'Cross-venue restaurant');
}

export function maybePrintReceipt(text, { autoReceiptPrint, log, receiptPrinterHost, receiptPrinterPort }) {
  if (!autoReceiptPrint || !text) return;
  printOne(text, { host: receiptPrinterHost, port: receiptPrinterPort, log }, 'Receipt');
}

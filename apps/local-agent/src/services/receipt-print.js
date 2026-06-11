import { printCustomerReceipt } from './kitchen-printer.js';

function printOne(text, { host, port, log }, label) {
  if (!text) return;
  printCustomerReceipt(text, { host, port, log }).catch((err) =>
    log.warn({ err }, `${label} receipt print failed`),
  );
}

/** Dine-in: restaurant copy only. Takeaway: customer + restaurant copies. */
export function maybePrintPayReceipts(
  result,
  { autoReceiptPrint, receiptPrinterHost, receiptPrinterPort, log },
) {
  if (!autoReceiptPrint) return;
  const printers = { host: receiptPrinterHost, port: receiptPrinterPort, log };
  const isTakeaway = result.cheque?.serviceMode === 'takeaway';

  printOne(result.restaurantReceipt, printers, 'Restaurant');
  if (isTakeaway) {
    printOne(result.receipt, printers, 'Customer');
  }
}

/** Cross-venue settlement is dine-in — restaurant copy only. */
export function maybePrintCrossVenuePayReceipt(result, printerOpts) {
  if (!printerOpts.autoReceiptPrint) return;
  const text = result.restaurantReceipt ?? result.receipt;
  printOne(text, {
    host: printerOpts.receiptPrinterHost,
    port: printerOpts.receiptPrinterPort,
    log: printerOpts.log,
  }, 'Cross-venue restaurant');
}

export function maybePrintReceipt(text, { autoReceiptPrint, receiptPrinterHost, receiptPrinterPort, log }) {
  if (!autoReceiptPrint || !text) return;
  printOne(text, { host: receiptPrinterHost, port: receiptPrinterPort, log }, 'Receipt');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAWER_KICK_BYTES,
  openCashDrawer,
  printReceiptText,
  __setSendRawOverride,
  __resetSendRawOverride,
} from './receipt-printer.js';
import { paymentIncludesCash } from './payment-tender.js';

test('paymentIncludesCash detects card-only pay', () => {
  assert.equal(paymentIncludesCash({ method: 'card' }), false);
  assert.equal(paymentIncludesCash({ payments: [{ method: 'cash' }] }), true);
});

test('DRAWER_KICK_BYTES uses ESC/POS init and kick pulse', () => {
  assert.equal(DRAWER_KICK_BYTES.length, 7);
  assert.deepEqual([...DRAWER_KICK_BYTES], [0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
});

test('printReceiptText wraps payload with init and sends via override', async () => {
  const sent = [];
  __setSendRawOverride(async (bytes) => {
    sent.push(bytes);
  });
  process.env.RECEIPT_PRINTER_MODE = 'windows';
  process.env.RECEIPT_PRINTER_NAME = 'TestPrinter';

  const result = await printReceiptText('Hello receipt', { log: null });
  assert.equal(result.printed, true);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].includes(Buffer.from('Hello receipt', 'utf8')));

  __resetSendRawOverride();
});

test('openCashDrawer sends kick bytes only', async () => {
  const sent = [];
  __setSendRawOverride(async (bytes) => {
    sent.push(bytes);
  });
  process.env.FEATURE_CASH_DRAWER = 'true';
  process.env.RECEIPT_PRINTER_MODE = 'windows';
  process.env.RECEIPT_PRINTER_NAME = 'TestPrinter';

  const result = await openCashDrawer({ log: null });
  assert.equal(result.opened, true);
  assert.deepEqual(sent[0], DRAWER_KICK_BYTES);

  __resetSendRawOverride();
});

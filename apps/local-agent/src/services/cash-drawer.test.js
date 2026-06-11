import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentIncludesCash } from './payment-tender.js';

test('paymentIncludesCash detects cash in split tender', () => {
  assert.equal(
    paymentIncludesCash({ payments: [{ method: 'card' }, { method: 'cash' }] }),
    true,
  );
  assert.equal(paymentIncludesCash({ payments: [{ method: 'card' }] }), false);
  assert.equal(paymentIncludesCash({ method: 'cash' }), true);
  assert.equal(paymentIncludesCash({ method: 'card' }), false);
});

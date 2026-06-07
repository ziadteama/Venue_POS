import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkOrphanBillableOrdersToOpenCheque } from './services/cheque-reconcile.js';

test('linkOrphanBillableOrdersToOpenCheque is exported', () => {
  assert.equal(typeof linkOrphanBillableOrdersToOpenCheque, 'function');
});

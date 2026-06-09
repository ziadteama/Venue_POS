import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkOrphanBillableOrdersToOpenCheque,
  pruneEmptyLinkedDraftOrders,
  repairStaleSplitCheques,
} from './services/cheque-reconcile.js';

test('linkOrphanBillableOrdersToOpenCheque is exported', () => {
  assert.equal(typeof linkOrphanBillableOrdersToOpenCheque, 'function');
});

test('repairStaleSplitCheques is exported', () => {
  assert.equal(typeof repairStaleSplitCheques, 'function');
});

test('pruneEmptyLinkedDraftOrders is exported', () => {
  assert.equal(typeof pruneEmptyLinkedDraftOrders, 'function');
});

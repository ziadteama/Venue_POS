import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVenueCharges } from '../src/utils/venue-charges.js';

test('computeVenueCharges adds service then tax on net subtotal', () => {
  const result = computeVenueCharges(100, {
    taxRate: 0.14,
    taxInclusive: false,
    serviceRate: 0.12,
    serviceEnabled: true,
  });
  assert.equal(result.serviceAmount, 12);
  assert.equal(result.taxAmount, 15.68);
  assert.equal(result.total, 127.68);
});

test('computeVenueCharges ignores service when disabled', () => {
  const result = computeVenueCharges(100, {
    taxRate: 0.14,
    taxInclusive: false,
    serviceRate: 0.12,
    serviceEnabled: false,
  });
  assert.equal(result.serviceAmount, 0);
  assert.equal(result.taxAmount, 14);
  assert.equal(result.total, 114);
});

test('computeVenueCharges extracts inclusive tax without adding to total', () => {
  const result = computeVenueCharges(114, {
    taxRate: 0.14,
    taxInclusive: true,
    serviceRate: 0,
    serviceEnabled: false,
  });
  assert.equal(result.taxAmount, 14);
  assert.equal(result.total, 114);
});

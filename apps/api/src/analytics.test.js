import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDateRange,
  previousPeriod,
  revenueAnalyticsToCsv,
} from './services/analytics-service.js';

test('resolveDateRange today spans current calendar day', () => {
  const { from, to, preset } = resolveDateRange({ preset: 'today' });
  assert.equal(preset, 'today');
  assert.equal(from.getHours(), 0);
  assert.equal(to.getHours(), 23);
  assert.ok(from <= new Date() && to >= new Date());
});

test('resolveDateRange custom requires from and to', () => {
  assert.throws(() => resolveDateRange({ preset: 'custom' }), /from and to/);
});

test('previousPeriod mirrors duration', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-07T23:59:59.999Z');
  const prev = previousPeriod(from, to);
  assert.ok(prev.to < from);
  assert.equal(
    Math.round((to - from) / 86_400_000),
    Math.round((prev.to - prev.from) / 86_400_000),
  );
});

test('revenueAnalyticsToCsv includes venue rows', () => {
  const csv = revenueAnalyticsToCsv({
    byVenue: [{ venueId: 'v1', nameEn: 'Cafe', nameAr: 'مقهى', revenue: 100 }],
    categories: [],
    items: [],
  });
  assert.match(csv, /venue,v1,Cafe/);
});

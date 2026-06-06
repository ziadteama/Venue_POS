# Phase 3+ — Scalable plan (deferred / provider flags)

Items **not** in the current sprint. Use for onboarding and roadmap; implement when a client needs them.

## Provider toggles (deploy-time)

| Flag | Env | Default | Status |
|------|-----|---------|--------|
| Manual card (US-5.3) | `FEATURE_MANUAL_CARD_PAYMENT` | OFF | ✅ Shipped |
| Line transfer | `FEATURE_LINE_TRANSFER` | OFF | ✅ Shipped |
| KDS | `FEATURE_KDS_ENABLED` | ON | ✅ Shipped |
| Discounts | `FEATURE_DISCOUNTS_ENABLED` | ON | ✅ Shipped |
| Refunds (US-5.6) | `FEATURE_REFUNDS_ENABLED` | ON | ✅ Shipped |
| Auto receipt print | `FEATURE_AUTO_RECEIPT_PRINT` | ON | ✅ Shipped |
| Integrated PDQ (US-5.2) | `FEATURE_INTEGRATED_CARD_PAYMENT` | OFF | **Future** |

## Deferred features

### Split by seat (US-3.6)
- Requires `seat` on `OrderItem` + POS seat picker at fire time.
- Auto-group items by seat into sub-cheques.
- **Not in main build** until seat model exists.

### Split by custom amount (US-3.6)
- ✅ Shipped — `POST /cheques/:id/split-amount`, child `splitAmount`.

### Post-payment corrections (refunds & cheque edits)
- ✅ **Refunds (US-5.6)** — `venue_manager` initiates + `hub_manager` approves; audit at `GET /manager/refunds`.
- ✅ **Cheque discounts** — before pay; dual PIN; `ChequeDiscountAudit`.
- Still **future**: void/comp on **paid** cheques, payment reversals beyond partial refund.

### Integrated card terminal (US-5.2)
- Ingenico/PAX SDK, transaction ID storage, PCI-safe.
- Behind `FEATURE_INTEGRATED_CARD_PAYMENT`; manual card remains fallback.

### Other Phase 3 tail
- Vouchers (US-5.5)
- Receipt PDF (US-10.2)
- Cross-venue billing → Epic 4
- Offline cheque sync → Phase 6

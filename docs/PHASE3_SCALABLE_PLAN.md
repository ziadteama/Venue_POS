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

## Manager authority (shipped)

**Venue manager** (`venue_manager`) executes discount, void, comp, line transfer directly. **Refunds** require hub approval (request → approve).

**General manager** (`hub_manager`) approves refund requests on **Approvals** (`/approvals`), can force-refund from Cheques, and has read-only **Activity log** review.

- Unified feed: discounts, refunds, voids, comps, transfers
- `GET /api/v1/manager/activity`

POS receives live updates via Socket.IO `manager:action` (no approval polling).

Paid-cheque corrections: comp/void round on paid cheques auto-create partial refunds + audit.

**Still hub/venue PIN (policy):** manual-card threshold, shift over/short.

## Phase 3 — closed (June 2026)

Core F&B tab lifecycle shipped on `phase-3`. Venue manager executes; hub manager reviews Activity log.

## Deferred (post–Phase 3 / client-driven)

| Item | PRD | Notes |
|------|-----|-------|
| Split by **seat** | US-3.6 | `seat` on `OrderItem` + POS picker |
| **Vouchers / promos** | US-5.5 | Code validation, one-time use |
| **Integrated card** terminal | US-5.2 | PDQ SDK; `FEATURE_INTEGRATED_CARD_PAYMENT` |
| **Receipt PDF** | US-10.2 | Digital/email receipt |
| **Cross-venue** billing | Epic 4 / Phase 4 | **Next** — `venue_billing_config`, anchor POS workflow |
| **Offline** cheque sync | Phase 6 | SQLite replay |
| Cashier PIN login on POS | — | Demo uses fixed cashier ID today |
| `venue_mgr` dashboard password | — | PIN-only on POS in default seed |

## Shipped (reference)

- Open cheques, fire/pay, shifts, manual card, comp/void
- Split by item + custom amount — `POST /cheques/:id/split-amount`
- Line transfer (flagged) — `POST /cheques/:id/transfer`
- Discounts + refunds — venue manager applies; audit + `/manager/activity`
- POS refund UI — paid-cheque picker + refund modal
- Paid void/comp — partial refund + audit
- Socket `manager:action` on POS (replaces approval poll)
- Auto receipt print — agent on pay when `KITCHEN_PRINTER_HOST` set

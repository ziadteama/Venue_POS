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

**Venue manager** (`venue_manager`) executes all sensitive cheque actions directly (POS PIN or dashboard JWT):

- Discount, refund, void, comp, line transfer

**General manager** (`hub_manager`) has **read-only review** on dashboard **Activity log** (`/activity`):

- Unified feed: discounts, refunds, voids, comps, transfers
- `GET /api/v1/manager/activity`

POS receives live updates via Socket.IO `manager:action` (no approval polling).

Paid-cheque corrections: comp/void round on paid cheques auto-create partial refunds + audit.

**Still hub/venue PIN (policy):** manual-card threshold, shift over/short.

## Phase 3 remaining (not yet built)

| Item | PRD | Notes |
|------|-----|-------|
| Split by **seat** | US-3.6 | `seat` on `OrderItem` + POS picker |
| **Vouchers / promos** | US-5.5 | Code validation, one-time use |
| **Integrated card** terminal | US-5.2 | PDQ SDK; `FEATURE_INTEGRATED_CARD_PAYMENT` |
| **Receipt PDF** | US-10.2 | Digital/email receipt |
| Refund from **POS** | US-5.6 | API exists; paid-cheque UI on terminal TBD |
| Void/comp on **paid** cheques | — | Post-payment correction tail |
| **Cross-venue** billing | Epic 4 | Multi-hub |
| **Offline** cheque sync | Phase 6 | SQLite replay |

## Shipped (reference)

- Split by custom amount — `POST /cheques/:id/split-amount`
- Refunds + discounts — approval queue + audit
- Auto receipt print — agent on pay when `KITCHEN_PRINTER_HOST` set

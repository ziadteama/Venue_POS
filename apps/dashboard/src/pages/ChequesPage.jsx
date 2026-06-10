import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';
import { useChequeManager } from '../hooks/useChequeManager.js';
import { ChequesPageHeader } from '../components/cheques/ChequesPageHeader.jsx';
import { ShiftContextBar } from '../components/cheques/ShiftContextBar.jsx';
import { ChequesSidebar } from '../components/cheques/ChequesSidebar.jsx';
import { ChequeDetailView } from '../components/cheques/ChequeDetailView.jsx';
import { ChequeActionModals } from '../components/cheques/ChequeActionModals.jsx';

export function ChequesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const manager = useChequeManager({ user });

  return (
    <div className="space-y-4">
      <ChequesPageHeader
        t={t}
        i18n={i18n}
        user={user}
        statusTab={manager.statusTab}
        venues={manager.venues}
        venueId={manager.venueId}
        searchQ={manager.searchQ}
        onSearchChange={manager.setSearch}
        onTabChange={manager.changeTab}
        onVenueChange={manager.changeVenue}
      />

      {manager.shiftId ? (
        <ShiftContextBar
          shiftContext={manager.shiftContext}
          shiftId={manager.shiftId}
          chequeCount={manager.cheques.length}
          t={t}
          onClear={manager.clearShiftFilter}
        />
      ) : null}

      {manager.error && manager.actionTarget?.type !== 'refund' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {manager.error}
        </div>
      ) : null}

      <ChequeActionModals
        actionTarget={manager.actionTarget}
        discountForm={manager.discountForm}
        onClose={manager.closeAction}
        onSubmit={manager.runAction}
        t={t}
        error={manager.error}
        busy={manager.busy}
      />

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <ChequesSidebar
          t={t}
          statusTab={manager.statusTab}
          cheques={manager.cheques}
          selectedId={manager.selectedId}
          onSelect={manager.setSelectedId}
        />

        <section className="surface-card p-5">
          <ChequeDetailView
            detail={manager.detail}
            busy={manager.busy}
            language={i18n.language}
            userRole={user?.role}
            shiftId={manager.shiftId}
            t={t}
            onAction={manager.setActionTarget}
            onDiscountAction={(type) => {
              if (!manager.detail) return;
              if (type === 'discount_remove') manager.openDiscountRemove(manager.detail);
              else manager.openDiscountRequest(manager.detail, type);
            }}
            onRefund={manager.openRefundRequest}
          />
        </section>
      </div>
    </div>
  );
}

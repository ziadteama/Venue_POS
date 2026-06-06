import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.js';
import { useChequeManager } from '../hooks/useChequeManager.js';
import { ChequesPageHeader } from '../components/cheques/ChequesPageHeader.jsx';
import { ChequesSidebar } from '../components/cheques/ChequesSidebar.jsx';
import { ChequeDetailView } from '../components/cheques/ChequeDetailView.jsx';
import { ChequeActionModals } from '../components/cheques/ChequeActionModals.jsx';

export function ChequesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const manager = useChequeManager({ user });

  return (
    <div className="space-y-6">
      <ChequesPageHeader
        t={t}
        i18n={i18n}
        user={user}
        statusTab={manager.statusTab}
        venues={manager.venues}
        venueId={manager.venueId}
        onTabChange={manager.changeTab}
        onVenueChange={manager.changeVenue}
      />

      {manager.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {manager.error}
        </div>
      )}

      <ChequeActionModals
        actionTarget={manager.actionTarget}
        discountForm={manager.discountForm}
        refundForm={manager.refundForm}
        onClose={manager.closeAction}
        onSubmit={manager.runAction}
        t={t}
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <ChequesSidebar
          t={t}
          statusTab={manager.statusTab}
          cheques={manager.cheques}
          selectedId={manager.selectedId}
          onSelect={manager.setSelectedId}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ChequeDetailView
            detail={manager.detail}
            user={user}
            statusTab={manager.statusTab}
            busy={manager.busy}
            language={i18n.language}
            t={t}
            onAction={manager.setActionTarget}
            onDiscountRequest={manager.openDiscountRequest}
            onRefundRequest={manager.openRefundRequest}
          />
        </section>
      </div>
    </div>
  );
}

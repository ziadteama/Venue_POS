import { useCallback, useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';
import { useAgentEventStream } from './useAgentEventStream.js';

const DEFAULT_FEATURES = {
  manualCardPayment: false,
  manualCardApprovalThreshold: 500,
  lineTransfer: false,
  discounts: true,
  refunds: true,
  autoReceiptPrint: true,
  tables: [],
  kdsEnabled: false,
  crossVenueBilling: false,
  isAnchor: false,
  crossVenueTargets: [],
  anchorVenue: null,
};

export function useFeatures({ agentReachable = true } = {}) {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  const applyHubTables = useCallback((payload) => {
    if (!Array.isArray(payload?.tables)) return;
    // #region agent log
    fetch('http://127.0.0.1:7914/ingest/66a003c4-bd01-4d5a-8e95-9c5efaf28c36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c47f38'},body:JSON.stringify({sessionId:'c47f38',hypothesisId:'H4',location:'useFeatures.js:applyHubTables',message:'pos state tables updating',data:{tableCount:payload.tables.length,sample:payload.tables.slice(0,3)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setFeatures((prev) => ({ ...prev, tables: payload.tables }));
  }, []);

  useAgentEventStream({
    enabled: agentReachable,
    onHubTablesUpdated: applyHubTables,
  });

  useEffect(() => {
    let cancelled = false;

    function applyFeatures(data) {
      if (cancelled || !data) return;
      setFeatures({
        manualCardPayment: Boolean(data?.manualCardPayment),
        manualCardApprovalThreshold: Number(data?.manualCardApprovalThreshold) || 500,
        lineTransfer: Boolean(data?.lineTransfer),
        discounts: data?.discounts !== false,
        refunds: data?.refunds !== false,
        autoReceiptPrint: data?.autoReceiptPrint !== false,
        tables: Array.isArray(data?.tables) ? data.tables : [],
        kdsEnabled: Boolean(data?.kdsEnabled),
        crossVenueBilling: Boolean(data?.crossVenueBilling),
        isAnchor: Boolean(data?.isAnchor),
        crossVenueTargets: Array.isArray(data?.crossVenueTargets) ? data.crossVenueTargets : [],
        anchorVenue: data?.anchorVenue ?? null,
      });
    }

    (async () => {
      try {
        const data = await callAgent('/v1/features');
        applyFeatures(data);
      } catch {
        if (!cancelled) setFeatures(DEFAULT_FEATURES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    let unsubscribeHubTables;
    if (window.venuePos?.onHubTablesUpdated) {
      unsubscribeHubTables = window.venuePos.onHubTablesUpdated(applyHubTables);
    }

    return () => {
      cancelled = true;
      unsubscribeHubTables?.();
    };
  }, [applyHubTables]);

  return { features, loading };
}

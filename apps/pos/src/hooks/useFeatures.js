import { useEffect, useState } from 'react';
import { callAgent } from '../api/agent.js';

const DEFAULT_FEATURES = {
  manualCardPayment: false,
  manualCardApprovalThreshold: 500,
  lineTransfer: false,
  discounts: true,
  refunds: true,
  autoReceiptPrint: true,
  tables: [],
};

export function useFeatures() {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await callAgent('/v1/features');
        if (!cancelled) {
          setFeatures({
            manualCardPayment: Boolean(data?.manualCardPayment),
            manualCardApprovalThreshold: Number(data?.manualCardApprovalThreshold) || 500,
            lineTransfer: Boolean(data?.lineTransfer),
            discounts: data?.discounts !== false,
            refunds: data?.refunds !== false,
            autoReceiptPrint: data?.autoReceiptPrint !== false,
            tables: Array.isArray(data?.tables) ? data.tables : [],
          });
        }
      } catch {
        if (!cancelled) setFeatures(DEFAULT_FEATURES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { features, loading };
}

import { useEffect, useState } from 'react';
import { POS_PRINTER_HEALTH_POLL_MS } from '@venue-pos/shared';
import { AGENT_URL } from '../config.js';

function readReceiptHealth(health) {
  const receipt = health?.receiptPrinter;
  if (receipt) return receipt.ok !== false;
  return health?.printer?.ok !== false;
}

export function usePrinterHealth() {
  const [printerOk, setPrinterOk] = useState(true);
  const [cashDrawerEnabled, setCashDrawerEnabled] = useState(true);

  useEffect(() => {
    async function checkPrinter() {
      try {
        if (window.venuePos?.getAgentHealth) {
          const health = await window.venuePos.getAgentHealth();
          setPrinterOk(readReceiptHealth(health));
          setCashDrawerEnabled(health.cashDrawerEnabled !== false);
          return;
        }
        const res = await fetch(`${AGENT_URL()}/health`);
        if (!res.ok) {
          setPrinterOk(false);
          return;
        }
        const health = await res.json();
        setPrinterOk(readReceiptHealth(health));
        setCashDrawerEnabled(health.cashDrawerEnabled !== false);
      } catch {
        setPrinterOk(false);
      }
    }
    checkPrinter();
    const id = setInterval(checkPrinter, POS_PRINTER_HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return { printerOk, cashDrawerEnabled };
}

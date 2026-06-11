import { useEffect, useState } from 'react';
import { POS_PRINTER_HEALTH_POLL_MS } from '@venue-pos/shared';
import { AGENT_URL } from '../config.js';

export function usePrinterHealth() {
  const [printerOk, setPrinterOk] = useState(true);

  useEffect(() => {
    async function checkPrinter() {
      try {
        if (window.venuePos?.getAgentHealth) {
          const health = await window.venuePos.getAgentHealth();
          setPrinterOk(health.printer?.ok !== false);
          return;
        }
        const res = await fetch(`${AGENT_URL()}/health`);
        if (!res.ok) {
          setPrinterOk(false);
          return;
        }
        const health = await res.json();
        setPrinterOk(health.printer?.ok !== false);
      } catch {
        setPrinterOk(false);
      }
    }
    checkPrinter();
    const id = setInterval(checkPrinter, POS_PRINTER_HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return printerOk;
}

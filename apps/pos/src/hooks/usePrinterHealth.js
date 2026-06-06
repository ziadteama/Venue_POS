import { useEffect, useState } from 'react';
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
        const res = await fetch(`${AGENT_URL}/health`);
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
    const id = setInterval(checkPrinter, 15_000);
    return () => clearInterval(id);
  }, []);

  return printerOk;
}

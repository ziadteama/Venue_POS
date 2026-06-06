import net from 'node:net';

/** @type {{ ok: boolean; message: string; lastAttemptAt: string | null }} */
let printerHealth = { ok: true, message: 'not_configured', lastAttemptAt: null };

export function getPrinterHealth() {
  return { ...printerHealth };
}

function formatKitchenTicket(order) {
  const lines = [
    '\x1B\x40',
    '*** KITCHEN ***',
    `Order #${order.orderNumber ?? '?'}`,
    `Table: ${order.tableLabel ?? '—'}`,
    `Time: ${new Date().toLocaleTimeString()}`,
    '------------------------------',
  ];

  for (const item of order.items ?? []) {
    lines.push(`${item.quantity}x ${item.nameEn ?? item.nameAr ?? 'Item'}`);
    for (const mod of item.modifiersSnapshot ?? []) {
      lines.push(`  + ${mod.nameEn ?? mod.nameAr ?? 'Mod'}`);
    }
  }

  lines.push('------------------------------', '\n\n');
  return lines.join('\n');
}

function sendToPrinter(host, port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(Buffer.from(text, 'utf8'), () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Printer connection timed out'));
    });
    socket.on('error', reject);
  });
}

export async function printKitchenTicket(order, { host, port = 9100, retries = 3, log }) {
  if (!host) {
    printerHealth = { ok: true, message: 'not_configured', lastAttemptAt: new Date().toISOString() };
    return { printed: false, reason: 'not_configured' };
  }

  const ticket = formatKitchenTicket(order);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendToPrinter(host, port, ticket);
      printerHealth = {
        ok: true,
        message: 'ready',
        lastAttemptAt: new Date().toISOString(),
      };
      log?.info({ host, port, attempt }, 'Kitchen ticket printed');
      return { printed: true, attempt };
    } catch (err) {
      log?.warn({ err, attempt, host, port }, 'Kitchen print attempt failed');
      if (attempt === retries) {
        printerHealth = {
          ok: false,
          message: err.message,
          lastAttemptAt: new Date().toISOString(),
        };
        return { printed: false, reason: err.message, attempts: attempt };
      }
    }
  }
  return { printed: false, reason: 'unknown' };
}

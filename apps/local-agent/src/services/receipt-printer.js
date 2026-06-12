import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** ESC/POS: init + drawer kick pulse (pin 2). */
export const DRAWER_KICK_BYTES = Buffer.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);

/** @type {{ ok: boolean; message: string; mode: string; printerName: string | null; lastAttemptAt: string | null }} */
let receiptPrinterHealth = {
  ok: true,
  message: 'not_configured',
  mode: 'windows',
  printerName: null,
  lastAttemptAt: null,
};

/** @type {((bytes: Buffer, printerName: string) => Promise<void>) | null} */
let sendRawOverride = null;

export function __setSendRawOverride(fn) {
  sendRawOverride = fn;
}

export function __resetSendRawOverride() {
  sendRawOverride = null;
}

export function getReceiptPrinterMode() {
  const configured = process.env.RECEIPT_PRINTER_MODE?.trim().toLowerCase();
  if (configured) return configured;
  return process.platform === 'win32' ? 'windows' : 'network';
}

export function isCashDrawerEnabled() {
  return process.env.FEATURE_CASH_DRAWER !== 'false';
}

export function getReceiptPrinterHealth() {
  return { ...receiptPrinterHealth };
}

function updateHealth(patch) {
  receiptPrinterHealth = {
    ...receiptPrinterHealth,
    ...patch,
    lastAttemptAt: new Date().toISOString(),
  };
}

function wrapReceiptText(text) {
  return Buffer.concat([Buffer.from('\x1B\x40', 'ascii'), Buffer.from(String(text), 'utf8'), Buffer.from('\n\n', 'utf8')]);
}

async function sendTcp(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(payload, () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Receipt printer connection timed out'));
    });
    socket.on('error', reject);
  });
}

const RAW_PRINTER_PS = String.raw`
param([string]$PrinterName, [string]$FilePath)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter")]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="WritePrinter")]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "VenuePOS", pDataType = "RAW" };
    if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
    if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return ok;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
if (-not [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)) { exit 1 }
`;

async function listWindowsPrinters() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
    { timeout: 10_000, windowsHide: true },
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function resolveCupsPrinterName() {
  const configured = process.env.RECEIPT_PRINTER_NAME?.trim();
  if (configured) return configured;
  try {
    const { stdout } = await execFileAsync('lpstat', ['-d'], { timeout: 5000 });
    const match = stdout.match(/system default destination:\s*(\S+)/i);
    if (match?.[1] && match[1] !== 'none') return match[1];
  } catch {
    // ignore — fall through to default queue name
  }
  return 'VenueReceipt';
}

export async function resolveReceiptPrinterName() {
  const configured = process.env.RECEIPT_PRINTER_NAME?.trim();
  if (configured) return configured;
  if (process.platform !== 'win32') {
    if (getReceiptPrinterMode() === 'cups') {
      return resolveCupsPrinterName();
    }
    return null;
  }
  const printers = await listWindowsPrinters();
  const usb = printers.find((name) => /usb/i.test(name));
  return usb ?? printers[0] ?? null;
}

async function sendRawWindows(printerName, bytes) {
  if (sendRawOverride) {
    await sendRawOverride(bytes, printerName);
    return;
  }
  const tmp = path.join(os.tmpdir(), `venue-pos-print-${Date.now()}.bin`);
  fs.writeFileSync(tmp, bytes);
  try {
    const scriptPath = path.join(os.tmpdir(), `venue-pos-raw-print-${Date.now()}.ps1`);
    fs.writeFileSync(scriptPath, RAW_PRINTER_PS, 'utf8');
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, printerName, tmp],
      { timeout: 15_000, windowsHide: true },
    );
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

async function sendRawCups(printerName, bytes) {
  const tmp = path.join(os.tmpdir(), `venue-pos-print-${Date.now()}.bin`);
  fs.writeFileSync(tmp, bytes);
  try {
    await execFileAsync('lp', ['-d', printerName, '-o', 'raw', tmp], { timeout: 15_000 });
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

function resolveNetworkTarget(overrides = {}) {
  return {
    host: overrides.host || process.env.RECEIPT_PRINTER_HOST || '',
    port: Number(overrides.port || process.env.RECEIPT_PRINTER_PORT || 9100),
  };
}

async function sendRawBytes(bytes, { host, port, log } = {}) {
  const mode = getReceiptPrinterMode();

  if (mode === 'network') {
    const target = resolveNetworkTarget({ host, port });
    if (!target.host) {
      updateHealth({ ok: true, message: 'not_configured', mode });
      throw new Error('Receipt printer host not configured');
    }
    await sendTcp(target.host, target.port, bytes);
    updateHealth({ ok: true, message: 'ready', mode, printerName: `${target.host}:${target.port}` });
    log?.info?.({ host: target.host, port: target.port }, 'Receipt printer RAW sent (network)');
    return;
  }

  if (mode === 'cups') {
    const printerName =
      process.env.RECEIPT_PRINTER_NAME?.trim() || (await resolveReceiptPrinterName());
    if (!printerName) {
      updateHealth({ ok: false, message: 'no_printer', mode });
      throw new Error('No CUPS receipt printer configured');
    }
    await sendRawCups(printerName, bytes);
    updateHealth({ ok: true, message: 'ready', mode, printerName });
    log?.info?.({ printerName }, 'Receipt printer RAW sent (cups)');
    return;
  }

  const printerName = await resolveReceiptPrinterName();
  if (!printerName) {
    updateHealth({ ok: false, message: 'no_printer', mode: 'windows' });
    throw new Error('No Windows receipt printer found');
  }
  await sendRawWindows(printerName, bytes);
  updateHealth({ ok: true, message: 'ready', mode: 'windows', printerName });
  log?.info?.({ printerName }, 'Receipt printer RAW sent (windows)');
}

export async function printReceiptText(text, { host, port, log } = {}) {
  if (!text) return { printed: false, reason: 'empty' };
  try {
    await sendRawBytes(wrapReceiptText(text), { host, port, log });
    return { printed: true };
  } catch (err) {
    updateHealth({ ok: false, message: err.message, mode: getReceiptPrinterMode() });
    log?.warn?.({ err }, 'Receipt print failed');
    return { printed: false, reason: err.message };
  }
}

export async function openCashDrawer({ host, port, log } = {}) {
  if (!isCashDrawerEnabled()) {
    return { opened: false, reason: 'disabled' };
  }
  try {
    await sendRawBytes(DRAWER_KICK_BYTES, { host, port, log });
    return { opened: true };
  } catch (err) {
    updateHealth({ ok: false, message: err.message, mode: getReceiptPrinterMode() });
    log?.warn?.({ err }, 'Cash drawer kick failed');
    return { opened: false, reason: err.message };
  }
}

export async function probeReceiptPrinterHealth({ host, port } = {}) {
  const mode = getReceiptPrinterMode();
  try {
    if (mode === 'network') {
      const target = resolveNetworkTarget({ host, port });
      if (!target.host) {
        updateHealth({ ok: true, message: 'not_configured', mode });
        return getReceiptPrinterHealth();
      }
      updateHealth({ ok: true, message: 'ready', mode, printerName: `${target.host}:${target.port}` });
      return getReceiptPrinterHealth();
    }
    const printerName = await resolveReceiptPrinterName();
    if (!printerName) {
      updateHealth({ ok: false, message: 'no_printer', mode, printerName: null });
    } else {
      updateHealth({ ok: true, message: 'ready', mode, printerName });
    }
  } catch (err) {
    updateHealth({ ok: false, message: err.message, mode, printerName: null });
  }
  return getReceiptPrinterHealth();
}

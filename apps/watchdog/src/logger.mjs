import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} logFile
 */
export function createLogger(logFile) {
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * @param {'INFO' | 'WARN' | 'ALERT'} level
   * @param {string} message
   */
  function append(level, message) {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    fs.appendFileSync(logFile, line, 'utf8');
    if (level === 'ALERT') {
      console.error(line.trim());
    } else {
      console.log(line.trim());
    }
  }

  return {
    info: (msg) => append('INFO', msg),
    warn: (msg) => append('WARN', msg),
    alert: (msg) => append('ALERT', msg),
  };
}

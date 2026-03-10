/**
 * Debug HTTP server for Claude Code integration.
 *
 * Exposes app state, screenshots, and logs via HTTP endpoints.
 * Only active when DEBUG_SERVER=true environment variable is set.
 *
 * Usage:
 *   npm run dev:debug          # real FC + debug server on port 9300
 *   npm run dev:demo:debug     # demo mode + debug server on port 9300
 *
 * Endpoints:
 *   GET /state          — connection, profile, tuning session, blackbox info
 *   GET /screenshot     — capture renderer screenshot (saves PNG, returns path)
 *   GET /logs           — last N lines from electron-log file
 *   GET /logs?n=100     — specify number of lines
 *   GET /console        — renderer console messages (captured via webContents)
 *   GET /msp            — MSP connection details, CLI mode, FC info
 *   GET /health         — simple health check
 */

import http from 'http';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { app } from 'electron';
import { getMainWindow } from '../window';
import { logger } from '../utils/logger';

const DEFAULT_PORT = 9300;
const MAX_LOG_LINES = 500;
const MAX_CONSOLE_MESSAGES = 200;

interface DebugDependencies {
  mspClient: any;
  profileManager: any;
  snapshotManager: any;
  tuningSessionManager: any;
  blackboxManager: any;
  tuningHistoryManager: any;
  isDemoMode: boolean;
}

let deps: DebugDependencies | null = null;
let server: http.Server | null = null;
const consoleMessages: Array<{ level: string; message: string; timestamp: string }> = [];

/**
 * Set dependencies — called from index.ts after managers are initialized.
 */
export function setDebugDependencies(d: DebugDependencies): void {
  deps = d;
}

/**
 * Start capturing renderer console messages.
 * Call after window is created.
 */
export function captureRendererConsole(): void {
  const win = getMainWindow();
  if (!win) return;

  win.webContents.on('console-message', (_event, level, message) => {
    const levelMap: Record<number, string> = { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' };
    consoleMessages.push({
      level: levelMap[level] || 'info',
      message,
      timestamp: new Date().toISOString(),
    });
    // Keep bounded
    if (consoleMessages.length > MAX_CONSOLE_MESSAGES) {
      consoleMessages.splice(0, consoleMessages.length - MAX_CONSOLE_MESSAGES);
    }
  });
}

/**
 * Start the debug HTTP server.
 */
export function startDebugServer(port: number = DEFAULT_PORT): void {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const path = url.pathname;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      switch (path) {
        case '/health':
          return json(res, { status: 'ok', pid: process.pid, uptime: process.uptime() });

        case '/state':
          return json(res, await getAppState());

        case '/screenshot':
          return json(res, await takeScreenshot());

        case '/logs': {
          const n = parseInt(url.searchParams.get('n') || '50', 10);
          return json(res, await getLogTail(Math.min(n, MAX_LOG_LINES)));
        }

        case '/console': {
          const level = url.searchParams.get('level') || 'all';
          const filtered =
            level === 'all' ? consoleMessages : consoleMessages.filter((m) => m.level === level);
          return json(res, { messages: filtered.slice(-100) });
        }

        case '/msp':
          return json(res, await getMSPState());

        default:
          res.statusCode = 404;
          return json(res, {
            error: `Unknown endpoint: ${path}`,
            endpoints: ['/health', '/state', '/screenshot', '/logs', '/console', '/msp'],
          });
      }
    } catch (err: any) {
      res.statusCode = 500;
      return json(res, { error: err.message || String(err) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[DEBUG] Debug server listening on http://127.0.0.1:${port}`);
    logger.info(`[DEBUG] Endpoints: /health, /state, /screenshot, /logs, /console, /msp`);
  });

  server.on('error', (err) => {
    logger.warn(`[DEBUG] Debug server failed to start: ${err.message}`);
  });
}

export function stopDebugServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

// ── Endpoint implementations ────────────────────────────────────────

async function getAppState() {
  if (!deps) return { error: 'Dependencies not initialized' };

  const { mspClient, profileManager, tuningSessionManager } = deps;

  const connected = mspClient?.isConnected?.() ?? false;
  const currentProfile = profileManager?.getCurrentProfile?.() ?? null;

  let tuningSession = null;
  if (currentProfile) {
    try {
      tuningSession = await tuningSessionManager?.getSession?.(currentProfile.id);
    } catch {
      // ignore
    }
  }

  let bbInfo = null;
  if (connected) {
    try {
      bbInfo = await mspClient.getBlackboxInfo();
    } catch {
      // ignore
    }
  }

  let fcInfo = null;
  if (connected) {
    try {
      fcInfo = await mspClient.getFCInfo();
    } catch {
      // ignore
    }
  }

  return {
    connected,
    demoMode: deps.isDemoMode,
    profile: currentProfile
      ? {
          id: currentProfile.id,
          name: currentProfile.name,
          fcSerial: currentProfile.fcSerialNumber,
          size: currentProfile.size,
          flightStyle: currentProfile.flightStyle,
        }
      : null,
    fcInfo: fcInfo
      ? {
          variant: fcInfo.variant,
          version: fcInfo.version,
          target: fcInfo.target,
          boardName: fcInfo.boardName,
        }
      : null,
    tuningSession: tuningSession
      ? {
          phase: tuningSession.phase,
          type: tuningSession.type,
          startedAt: tuningSession.startedAt,
          eraseCompleted: tuningSession.eraseCompleted,
        }
      : null,
    blackbox: bbInfo
      ? {
          storageType: bbInfo.storageType,
          hasLogs: bbInfo.hasLogs,
          usedSize: bbInfo.usedSize,
          totalSize: bbInfo.totalSize,
        }
      : null,
  };
}

async function takeScreenshot() {
  const win = getMainWindow();
  if (!win) return { error: 'No window available' };

  const image = await win.webContents.capturePage();
  const pngBuffer = image.toPNG();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = resolve(process.cwd(), 'debug-screenshots');

  // Ensure directory exists
  const { mkdir } = await import('fs/promises');
  await mkdir(screenshotDir, { recursive: true });

  const filePath = join(screenshotDir, `screenshot-${timestamp}.png`);
  const { writeFile } = await import('fs/promises');
  await writeFile(filePath, pngBuffer);

  return { path: filePath, size: pngBuffer.length, timestamp };
}

async function getLogTail(n: number) {
  // electron-log default path
  const logPath =
    process.platform === 'darwin'
      ? join(app.getPath('home'), 'Library/Logs/PIDlab/main.log')
      : process.platform === 'win32'
        ? join(app.getPath('userData'), 'logs/main.log')
        : join(app.getPath('home'), '.config/PIDlab/logs/main.log');

  try {
    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    return {
      path: logPath,
      totalLines: lines.length,
      lines: lines.slice(-n),
    };
  } catch (err: any) {
    return { error: `Cannot read log file: ${err.message}`, path: logPath };
  }
}

async function getMSPState() {
  if (!deps) return { error: 'Dependencies not initialized' };

  const { mspClient } = deps;
  const connected = mspClient?.isConnected?.() ?? false;

  const result: any = {
    connected,
    demoMode: deps.isDemoMode,
    mscModeActive: mspClient?.mscModeActive ?? false,
    rebootPending: mspClient?.rebootPending ?? false,
  };

  if (connected) {
    try {
      result.fcInfo = await mspClient.getFCInfo();
    } catch {
      result.fcInfo = null;
    }
    try {
      result.fcSerial = await mspClient.getFCSerialNumber();
    } catch {
      result.fcSerial = null;
    }
    try {
      result.filterConfig = await mspClient.getFilterConfiguration();
    } catch {
      result.filterConfig = null;
    }
    try {
      result.pidConfig = await mspClient.getPIDConfiguration();
    } catch {
      result.pidConfig = null;
    }
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────

function json(res: http.ServerResponse, data: any): void {
  res.end(JSON.stringify(data, null, 2));
}

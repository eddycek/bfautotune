import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock useToast hook (tests can override this)
vi.mock('../hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  }))
}));

// Mock window.betaflight API
global.window.betaflight = {
  // Connection
  listPorts: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getConnectionStatus: vi.fn(),
  onConnectionChanged: vi.fn(() => () => {}),

  // FC Info
  getFCInfo: vi.fn(),
  exportCLI: vi.fn(),

  // Snapshots
  createSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
  deleteSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  exportSnapshot: vi.fn(),

  // Profiles
  createProfile: vi.fn(),
  createProfileFromPreset: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  getCurrentProfile: vi.fn(),
  setCurrentProfile: vi.fn(),
  exportProfile: vi.fn(),
  getFCSerialNumber: vi.fn(),
  onProfileChanged: vi.fn(() => () => {}),
  onNewFCDetected: vi.fn(() => () => {}),

  // Blackbox
  getBlackboxInfo: vi.fn(),
  downloadBlackboxLog: vi.fn(),
  listBlackboxLogs: vi.fn().mockResolvedValue([]),
  deleteBlackboxLog: vi.fn(),
  eraseBlackboxFlash: vi.fn(),
  openBlackboxFolder: vi.fn(),
  testBlackboxRead: vi.fn(),
  parseBlackboxLog: vi.fn(),
  onBlackboxParseProgress: vi.fn(() => () => {}),

  // PID
  getPIDConfig: vi.fn(),
  updatePIDConfig: vi.fn(),
  savePIDConfig: vi.fn(),
  onPIDChanged: vi.fn(() => () => {}),

  // Events
  onError: vi.fn(() => () => {}),
  onLog: vi.fn(() => () => {})
};

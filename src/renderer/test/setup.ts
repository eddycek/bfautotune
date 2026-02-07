import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

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
  exportCLIDiff: vi.fn(),
  exportCLIDump: vi.fn(),

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
  getFCSerial: vi.fn(),
  onProfileChanged: vi.fn(() => () => {}),
  onNewFCDetected: vi.fn(() => () => {}),

  // Events
  onError: vi.fn(() => () => {}),
  onLog: vi.fn(() => () => {})
};

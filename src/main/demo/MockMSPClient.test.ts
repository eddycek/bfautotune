import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMSPClient, DEMO_FC_SERIAL, DEMO_CLI_DIFF } from './MockMSPClient';

describe('MockMSPClient', () => {
  let client: MockMSPClient;

  beforeEach(() => {
    client = new MockMSPClient();
  });

  describe('connection state', () => {
    it('starts disconnected', () => {
      expect(client.isConnected()).toBe(false);
      expect(client.getConnectionStatus()).toEqual({
        connected: false,
        portPath: undefined,
        fcInfo: undefined,
      });
    });

    it('simulateConnect sets connected state and emits events', async () => {
      const connectedHandler = vi.fn();
      const connectionChangedHandler = vi.fn();
      client.on('connected', connectedHandler);
      client.on('connection-changed', connectionChangedHandler);

      await client.simulateConnect();

      expect(client.isConnected()).toBe(true);
      expect(connectedHandler).toHaveBeenCalled();
      expect(connectionChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, portPath: '/dev/demo' })
      );
    });

    it('disconnect sets disconnected state and emits events', async () => {
      await client.simulateConnect();
      const disconnectedHandler = vi.fn();
      client.on('disconnected', disconnectedHandler);

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
      expect(disconnectedHandler).toHaveBeenCalled();
    });

    it('getConnectionStatus returns FC info when connected', async () => {
      await client.simulateConnect();
      const status = client.getConnectionStatus();

      expect(status.connected).toBe(true);
      expect(status.portPath).toBe('/dev/demo');
      expect(status.fcInfo).toBeDefined();
      expect(status.fcInfo!.variant).toBe('BTFL');
      expect(status.fcInfo!.version).toBe('4.5.1');
    });
  });

  describe('FC info', () => {
    it('returns demo FC info', async () => {
      const info = await client.getFCInfo();
      expect(info.variant).toBe('BTFL');
      expect(info.version).toBe('4.5.1');
      expect(info.target).toBe('STM32F405');
      expect(info.boardName).toBe('OMNIBUSF4SD');
      expect(info.apiVersion).toEqual({ protocol: 0, major: 1, minor: 46 });
    });

    it('returns demo serial number', async () => {
      const serial = await client.getFCSerialNumber();
      expect(serial).toBe(DEMO_FC_SERIAL);
    });

    it('returns demo UID', async () => {
      const uid = await client.getUID();
      expect(uid).toBe(DEMO_FC_SERIAL);
    });
  });

  describe('port listing', () => {
    it('returns a demo port', async () => {
      const ports = await client.listPorts();
      expect(ports).toHaveLength(1);
      expect(ports[0].path).toBe('/dev/demo');
      expect(ports[0].manufacturer).toContain('Demo');
    });
  });

  describe('blackbox info', () => {
    it('returns flash storage info', async () => {
      const info = await client.getBlackboxInfo();
      expect(info.supported).toBe(true);
      expect(info.storageType).toBe('flash');
      expect(info.totalSize).toBeGreaterThan(0);
    });

    it('reports flash has data when set', async () => {
      client.setFlashHasData(true);
      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(true);
      expect(info.usedSize).toBeGreaterThan(0);
    });

    it('reports flash empty when not set', async () => {
      client.setFlashHasData(false);
      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);
      expect(info.usedSize).toBe(0);
    });
  });

  describe('PID configuration', () => {
    it('returns standard 5" PID values', async () => {
      const config = await client.getPIDConfiguration();
      expect(config.roll.P).toBe(50);
      expect(config.pitch.P).toBe(52);
      expect(config.yaw.P).toBe(45);
    });

    it('setPIDConfiguration is a no-op', async () => {
      await expect(
        client.setPIDConfiguration({
          roll: { P: 60, I: 90, D: 50 },
          pitch: { P: 60, I: 90, D: 50 },
          yaw: { P: 50, I: 90, D: 0 },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('filter configuration', () => {
    it('returns BF 4.5 default filter settings', async () => {
      const config = await client.getFilterConfiguration();
      expect(config.gyro_lpf1_static_hz).toBe(250);
      expect(config.gyro_lpf2_static_hz).toBe(500);
      expect(config.dterm_lpf1_static_hz).toBe(150);
      expect(config.rpm_filter_harmonics).toBe(3);
    });
  });

  describe('feedforward configuration', () => {
    it('returns demo FF config', async () => {
      const config = await client.getFeedforwardConfiguration();
      expect(config.rollGain).toBe(120);
      expect(config.pitchGain).toBe(130);
      expect(config.boost).toBe(15);
    });
  });

  describe('CLI operations', () => {
    it('exportCLIDiff returns realistic diff', async () => {
      const diff = await client.exportCLIDiff();
      expect(diff).toBe(DEMO_CLI_DIFF);
      expect(diff).toContain('set gyro_lpf1_static_hz');
      expect(diff).toContain('set p_pitch');
    });
  });

  describe('blackbox download', () => {
    it('throws when no demo BBL data set', async () => {
      const freshClient = new MockMSPClient();
      await expect(freshClient.downloadBlackboxLog()).rejects.toThrow('No demo BBL data');
    });

    it('returns demo BBL data with progress', async () => {
      const demoData = Buffer.from('test-data');
      client.setDemoBBLData(demoData);

      const progressCalls: number[] = [];
      const result = await client.downloadBlackboxLog((p) => progressCalls.push(p));

      expect(result).toBe(demoData);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toBe(100);
    });
  });

  describe('erase flash', () => {
    it('resets flash state', async () => {
      client.setFlashHasData(true);
      await client.eraseBlackboxFlash();

      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);
    });
  });

  describe('save and reboot', () => {
    it('emits disconnect then reconnect', async () => {
      await client.simulateConnect();

      const events: string[] = [];
      client.on('disconnected', () => events.push('disconnected'));
      client.on('connected', () => events.push('connected'));

      await client.saveAndReboot();

      expect(events).toContain('disconnected');
      expect(events).toContain('connected');
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('state flags', () => {
    it('manages rebootPending flag', () => {
      expect(client.rebootPending).toBe(false);
      client.setRebootPending();
      expect(client.rebootPending).toBe(true);
      client.clearRebootPending();
      expect(client.rebootPending).toBe(false);
    });

    it('manages mscModeActive flag', () => {
      expect(client.mscModeActive).toBe(false);
      client.clearMSCMode(); // Should not throw
      expect(client.mscModeActive).toBe(false);
    });
  });

  describe('mock connection', () => {
    it('tracks CLI mode', async () => {
      expect(client.connection.isInCLI()).toBe(false);
      await client.connection.enterCLI();
      expect(client.connection.isInCLI()).toBe(true);
      client.connection.exitCLI();
      expect(client.connection.isInCLI()).toBe(false);
    });

    it('sendCLICommand returns response', async () => {
      const response = await client.connection.sendCLICommand('set gyro_lpf1_static_hz = 200');
      expect(response).toContain('set gyro_lpf1_static_hz');
    });
  });
});

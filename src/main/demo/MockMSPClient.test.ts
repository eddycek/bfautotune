import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockMSPClient, DEMO_FC_SERIAL, DEMO_CLI_DIFF, DEMO_FC_INFO } from './MockMSPClient';

describe('MockMSPClient', () => {
  let client: MockMSPClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new MockMSPClient();
  });

  afterEach(() => {
    client.cancelAutoFlight();
    vi.useRealTimers();
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

      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      expect(client.isConnected()).toBe(true);
      expect(connectedHandler).toHaveBeenCalled();
      expect(connectionChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, portPath: '/dev/demo' })
      );
    });

    it('simulateConnect does not reset flash state', async () => {
      client.setFlashHasData(true);

      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(true);
    });

    it('disconnect sets disconnected state and emits events', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const disconnectedHandler = vi.fn();
      client.on('disconnected', disconnectedHandler);

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
      expect(disconnectedHandler).toHaveBeenCalled();
    });

    it('getConnectionStatus returns FC info when connected', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

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
      const downloadPromise = client.downloadBlackboxLog((p) => progressCalls.push(p));
      // 21 chunks × 50ms each
      await vi.advanceTimersByTimeAsync(21 * 50);
      const result = await downloadPromise;

      expect(result).toBe(demoData);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toBe(100);
    });
  });

  describe('erase flash', () => {
    it('resets flash state immediately', async () => {
      client.setFlashHasData(true);

      // Start erase, then advance timers to resolve internal 500ms delay
      const erasePromise = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erasePromise;

      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);
    });

    it('schedules auto-flight after 3s', async () => {
      const erasePromise = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erasePromise;

      // Immediately after erase: flash is empty
      let info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);

      // After 3s: auto-flight populates flash
      vi.advanceTimersByTime(3000);
      info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(true);
    });

    it('auto-flight emits disconnect then reconnect', async () => {
      const events: string[] = [];
      client.on('disconnected', () => events.push('disconnected'));
      client.on('connected', () => events.push('connected'));

      const erasePromise = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erasePromise;

      // Advance past auto-flight (3s)
      vi.advanceTimersByTime(3000);
      expect(events).toContain('disconnected');
      expect(client.isConnected()).toBe(false);

      // Advance past reconnect delay (1.5s)
      vi.advanceTimersByTime(1500);
      expect(events).toContain('connected');
      expect(client.isConnected()).toBe(true);
    });

    it('cycles flight type: filter → pid → verification → filter', async () => {
      // Initial state: next flight is filter
      expect(client._nextFlightType).toBe('filter');

      // 1st erase → generates filter BBL, next becomes pid
      const erase1 = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erase1;
      vi.advanceTimersByTime(3000); // auto-flight fires
      expect(client._nextFlightType).toBe('pid');

      vi.advanceTimersByTime(1500); // reconnect

      // 2nd erase → generates PID BBL, next becomes verification
      const erase2 = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erase2;
      vi.advanceTimersByTime(3000);
      expect(client._nextFlightType).toBe('verification');

      vi.advanceTimersByTime(1500);

      // 3rd erase → generates verification BBL, next becomes filter
      const erase3 = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erase3;
      vi.advanceTimersByTime(3000);
      expect(client._nextFlightType).toBe('filter');

      vi.advanceTimersByTime(1500);

      // 4th erase → generates filter BBL, next becomes pid again
      const erase4 = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erase4;
      vi.advanceTimersByTime(3000);
      expect(client._nextFlightType).toBe('pid');
    });
  });

  describe('save and reboot', () => {
    it('emits disconnect then reconnect', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const events: string[] = [];
      client.on('disconnected', () => events.push('disconnected'));
      client.on('connected', () => events.push('connected'));

      const rebootPromise = client.saveAndReboot();
      await vi.advanceTimersByTimeAsync(2000);
      await rebootPromise;

      expect(events).toContain('disconnected');
      expect(events).toContain('connected');
      expect(client.isConnected()).toBe(true);
    });

    it('keeps rebootPending true through reconnect', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const rebootPromise = client.saveAndReboot();
      // After disconnect, before reconnect
      expect(client.rebootPending).toBe(true);

      await vi.advanceTimersByTimeAsync(2000);
      await rebootPromise;

      // rebootPending remains true after reconnect (caller clears it)
      expect(client.rebootPending).toBe(true);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('disconnect with auto-reconnect', () => {
    it('auto-reconnects when rebootPending is true', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      client.setRebootPending();

      const events: string[] = [];
      client.on('disconnected', () => events.push('disconnected'));
      client.on('connected', () => events.push('connected'));
      client.on('connection-changed', (status) => events.push(`changed:${status.connected}`));

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      expect(events).toContain('disconnected');

      // After 1.5s: auto-reconnect
      vi.advanceTimersByTime(1500);
      expect(client.isConnected()).toBe(true);
      expect(events).toContain('connected');
    });

    it('does not auto-reconnect when rebootPending is false', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const connectedHandler = vi.fn();
      client.on('connected', connectedHandler);

      await client.disconnect();
      vi.advanceTimersByTime(2000);

      expect(client.isConnected()).toBe(false);
      expect(connectedHandler).not.toHaveBeenCalled();
    });

    it('disconnect emits connection-changed with FC info on reconnect', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      client.setRebootPending();

      const connectionStatuses: any[] = [];
      client.on('connection-changed', (status) => connectionStatuses.push(status));

      await client.disconnect();
      vi.advanceTimersByTime(1500);

      // First: disconnected status, second: reconnected with FC info
      expect(connectionStatuses).toHaveLength(2);
      expect(connectionStatuses[0]).toEqual({ connected: false });
      expect(connectionStatuses[1]).toEqual(
        expect.objectContaining({
          connected: true,
          portPath: '/dev/demo',
          fcInfo: DEMO_FC_INFO,
        })
      );
    });
  });

  describe('cancelAutoFlight', () => {
    it('cancels pending auto-flight timer', async () => {
      const erasePromise = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erasePromise;

      // Cancel before the 3s auto-flight fires
      client.cancelAutoFlight();
      vi.advanceTimersByTime(5000);

      // Flash should still be empty
      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);
    });

    it('disconnect cancels pending auto-flight', async () => {
      const connectPromise = client.simulateConnect();
      await vi.advanceTimersByTimeAsync(500);
      await connectPromise;

      const erasePromise = client.eraseBlackboxFlash();
      await vi.advanceTimersByTimeAsync(500);
      await erasePromise;

      // Disconnect cancels the auto-flight timer
      await client.disconnect();
      vi.advanceTimersByTime(5000);

      // Flash should still be empty (timer was cancelled)
      const info = await client.getBlackboxInfo();
      expect(info.hasLogs).toBe(false);
    });

    it('is safe to call when no timer is pending', () => {
      expect(() => client.cancelAutoFlight()).not.toThrow();
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

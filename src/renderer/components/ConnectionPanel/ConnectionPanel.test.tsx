import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionPanel } from './ConnectionPanel';
import type { PortInfo, ConnectionStatus } from '@shared/types/common.types';

describe('ConnectionPanel', () => {
  const mockPorts: PortInfo[] = [
    { path: '/dev/ttyUSB0', manufacturer: 'Silicon Labs' },
    { path: '/dev/ttyUSB1', manufacturer: 'FTDI' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks - return promises immediately
    vi.mocked(window.betaflight.listPorts).mockImplementation(() => Promise.resolve(mockPorts));
    vi.mocked(window.betaflight.connect).mockImplementation(() => Promise.resolve(undefined));
    vi.mocked(window.betaflight.disconnect).mockImplementation(() => Promise.resolve(undefined));
    vi.mocked(window.betaflight.getConnectionStatus).mockImplementation(() =>
      Promise.resolve({ connected: false })
    );
    vi.mocked(window.betaflight.onConnectionChanged).mockReturnValue(() => {});
  });

  it('renders connection panel with title', () => {
    render(<ConnectionPanel />);
    expect(screen.getByText('Connection')).toBeInTheDocument();
  });

  it('loads and displays available ports on mount', async () => {
    render(<ConnectionPanel />);

    // Wait for API call
    await waitFor(() => {
      expect(window.betaflight.listPorts).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Wait for UI to update
    await waitFor(() => {
      const select = screen.getByLabelText(/serial port/i) as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1); // More than just "No ports found"
    }, { timeout: 5000 });
  });

  it('shows disconnected status by default', async () => {
    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  it('enables connect button when port is selected', async () => {
    render(<ConnectionPanel />);

    await waitFor(() => {
      const connectButton = screen.getByRole('button', { name: /connect/i });
      expect(connectButton).not.toBeDisabled();
    });
  });

  it('calls connect with selected port when connect button clicked', async () => {
    const user = userEvent.setup();

    render(<ConnectionPanel />);

    // Wait for ports to load
    await waitFor(() => {
      expect(window.betaflight.listPorts).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Wait for button to be enabled
    await waitFor(() => {
      const connectButton = screen.getByRole('button', { name: /connect/i });
      expect(connectButton).not.toBeDisabled();
    }, { timeout: 5000 });

    const connectButton = screen.getByRole('button', { name: /connect/i });
    await user.click(connectButton);

    expect(window.betaflight.connect).toHaveBeenCalledWith('/dev/ttyUSB0');
  });

  it('shows connected status when connected', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });

    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByText(/● connected/i)).toBeInTheDocument();
    });
  });

  it('shows disconnect button when connected', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });

    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    });
  });

  it('calls disconnect when disconnect button clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.disconnect).mockResolvedValue(undefined);

    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    });

    const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
    await user.click(disconnectButton);

    await waitFor(() => {
      expect(window.betaflight.disconnect).toHaveBeenCalled();
    });
  });

  it('shows cooldown timer after disconnect', async () => {
    const user = userEvent.setup();
    let connectionCallback: ((status: ConnectionStatus) => void) | null = null;
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((cb) => {
      connectionCallback = cb;
      return () => {};
    });
    vi.mocked(window.betaflight.disconnect).mockImplementation(async () => {
      // Simulate FC sending disconnected status after disconnect
      connectionCallback?.({ connected: false });
    });

    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    });

    const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
    await user.click(disconnectButton);

    await waitFor(() => {
      expect(screen.getByText(/wait \d+ second/i)).toBeInTheDocument();
    });
  });

  it('shows cooldown on unexpected disconnect (FC reboot)', async () => {
    let connectionCallback: ((status: ConnectionStatus) => void) | null = null;
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((cb) => {
      connectionCallback = cb;
      return () => {};
    });

    render(<ConnectionPanel />);

    // Wait for connected state
    await waitFor(() => {
      expect(screen.getByText(/● connected/i)).toBeInTheDocument();
    });

    // Simulate FC reboot (port closes, no disconnect button click)
    connectionCallback?.({ connected: false });

    await waitFor(() => {
      expect(screen.getByText(/wait \d+ second/i)).toBeInTheDocument();
    });
  });

  it('displays error message when connection fails', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Failed to connect to port';

    // Setup error mock BEFORE render
    vi.mocked(window.betaflight.connect).mockRejectedValueOnce(new Error(errorMessage));

    render(<ConnectionPanel />);

    // Wait for ports to load
    await waitFor(() => {
      expect(window.betaflight.listPorts).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Wait for button
    await waitFor(() => {
      const connectButton = screen.getByRole('button', { name: /connect/i });
      expect(connectButton).not.toBeDisabled();
    }, { timeout: 5000 });

    const connectButton = screen.getByRole('button', { name: /connect/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('allows port scanning when disconnected', async () => {
    const user = userEvent.setup();
    render(<ConnectionPanel />);

    await waitFor(() => {
      const scanButton = screen.getByRole('button', { name: /scan/i });
      expect(scanButton).not.toBeDisabled();
    });

    const scanButton = screen.getByRole('button', { name: /scan/i });

    // Clear the initial mount call
    vi.clearAllMocks();

    await user.click(scanButton);

    expect(window.betaflight.listPorts).toHaveBeenCalledTimes(1);
  });

  it('disables controls during cooldown', async () => {
    const user = userEvent.setup();
    let connectionCallback: ((status: ConnectionStatus) => void) | null = null;
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({
      connected: true,
      portPath: '/dev/ttyUSB0'
    });
    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((cb) => {
      connectionCallback = cb;
      return () => {};
    });
    vi.mocked(window.betaflight.disconnect).mockImplementation(async () => {
      connectionCallback?.({ connected: false });
    });

    render(<ConnectionPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    });

    const disconnectButton = screen.getByRole('button', { name: /disconnect/i });
    await user.click(disconnectButton);

    await waitFor(() => {
      const select = screen.getByLabelText(/serial port/i);
      expect(select).toBeDisabled();
    });
  });
});

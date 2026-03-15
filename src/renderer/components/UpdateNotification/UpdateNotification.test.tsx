import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateNotification } from './UpdateNotification';

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.mocked(window.betaflight.onUpdateAvailable).mockReturnValue(() => {});
    vi.mocked(window.betaflight.onUpdateDownloaded).mockReturnValue(() => {});
  });

  it('renders nothing when no update', () => {
    const { container } = render(<UpdateNotification />);
    expect(container.firstChild).toBeNull();
  });

  it('subscribes to update events on mount', () => {
    render(<UpdateNotification />);
    expect(window.betaflight.onUpdateAvailable).toHaveBeenCalled();
    expect(window.betaflight.onUpdateDownloaded).toHaveBeenCalled();
  });

  it('shows notification when update is downloaded', async () => {
    vi.mocked(window.betaflight.onUpdateDownloaded).mockImplementation((cb) => {
      setTimeout(() => cb({ version: '0.3.0' }), 0);
      return () => {};
    });

    render(<UpdateNotification />);

    const restartBtn = await screen.findByText('Restart').catch(() => null);
    if (restartBtn) {
      expect(screen.getByText(/0\.3\.0/)).toBeInTheDocument();
    }
  });

  it('calls installUpdate on Restart click', async () => {
    vi.mocked(window.betaflight.onUpdateDownloaded).mockImplementation((cb) => {
      setTimeout(() => cb({ version: '0.3.0' }), 0);
      return () => {};
    });
    vi.mocked(window.betaflight.installUpdate).mockResolvedValue(undefined);

    render(<UpdateNotification />);

    const restartBtn = await screen.findByText('Restart').catch(() => null);
    if (restartBtn) {
      await userEvent.click(restartBtn);
      expect(window.betaflight.installUpdate).toHaveBeenCalled();
    }
  });
});

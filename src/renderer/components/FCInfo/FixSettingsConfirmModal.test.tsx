import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FixSettingsConfirmModal } from './FixSettingsConfirmModal';

describe('FixSettingsConfirmModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  it('displays commands to be applied', () => {
    render(
      <FixSettingsConfirmModal
        commands={['set debug_mode = GYRO_SCALED', 'set blackbox_sample_rate = 1']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('set debug_mode = GYRO_SCALED')).toBeInTheDocument();
    expect(screen.getByText('set blackbox_sample_rate = 1')).toBeInTheDocument();
  });

  it('shows reboot warning', () => {
    render(
      <FixSettingsConfirmModal
        commands={['set debug_mode = GYRO_SCALED']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/save settings and reboot/i)).toBeInTheDocument();
  });

  it('calls onConfirm when Fix & Reboot clicked', async () => {
    const user = userEvent.setup();
    render(
      <FixSettingsConfirmModal
        commands={['set debug_mode = GYRO_SCALED']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByText('Fix & Reboot'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(
      <FixSettingsConfirmModal
        commands={['set debug_mode = GYRO_SCALED']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

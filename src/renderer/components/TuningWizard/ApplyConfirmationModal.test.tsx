import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplyConfirmationModal } from './ApplyConfirmationModal';

describe('ApplyConfirmationModal', () => {
  it('shows total change count', () => {
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/5 changes will be written/)).toBeInTheDocument();
  });

  it('shows filter and PID change counts separately', () => {
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('3 filter changes (via CLI)')).toBeInTheDocument();
    expect(screen.getByText('2 PID changes (via MSP)')).toBeInTheDocument();
  });

  it('handles singular "change" text correctly', () => {
    render(
      <ApplyConfirmationModal
        filterCount={1}
        pidCount={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('1 filter change (via CLI)')).toBeInTheDocument();
    expect(screen.getByText('1 PID change (via MSP)')).toBeInTheDocument();
  });

  it('checkbox is checked by default', () => {
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('clicking checkbox toggles snapshot option', async () => {
    const user = userEvent.setup();
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('confirm button calls onConfirm with createSnapshot=true by default', async () => {
    const user = userEvent.setup();
    const mockConfirm = vi.fn();
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={mockConfirm}
        onCancel={vi.fn()}
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Apply Changes' });
    await user.click(confirmButton);

    expect(mockConfirm).toHaveBeenCalledWith(true);
  });

  it('confirm with unchecked checkbox calls onConfirm with false', async () => {
    const user = userEvent.setup();
    const mockConfirm = vi.fn();
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={mockConfirm}
        onCancel={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox); // Uncheck

    const confirmButton = screen.getByRole('button', { name: 'Apply Changes' });
    await user.click(confirmButton);

    expect(mockConfirm).toHaveBeenCalledWith(false);
  });

  it('cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    const mockCancel = vi.fn();
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={mockCancel}
      />
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(mockCancel).toHaveBeenCalled();
  });

  it('shows reboot warning text', () => {
    render(
      <ApplyConfirmationModal
        filterCount={3}
        pidCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/Your FC will reboot after applying/)).toBeInTheDocument();
  });
});

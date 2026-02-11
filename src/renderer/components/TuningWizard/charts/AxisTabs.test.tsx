import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxisTabs } from './AxisTabs';

describe('AxisTabs', () => {
  it('renders 4 tabs (Roll, Pitch, Yaw, All)', () => {
    render(<AxisTabs selected="roll" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pitch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Yaw' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('selected tab has aria-selected=true', () => {
    render(<AxisTabs selected="pitch" onChange={vi.fn()} />);

    const pitchTab = screen.getByRole('tab', { name: 'Pitch' });
    expect(pitchTab).toHaveAttribute('aria-selected', 'true');
  });

  it('non-selected tabs have aria-selected=false', () => {
    render(<AxisTabs selected="pitch" onChange={vi.fn()} />);

    const rollTab = screen.getByRole('tab', { name: 'Roll' });
    const yawTab = screen.getByRole('tab', { name: 'Yaw' });
    const allTab = screen.getByRole('tab', { name: 'All' });

    expect(rollTab).toHaveAttribute('aria-selected', 'false');
    expect(yawTab).toHaveAttribute('aria-selected', 'false');
    expect(allTab).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking tab calls onChange with axis key', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    render(<AxisTabs selected="roll" onChange={mockOnChange} />);

    const yawTab = screen.getByRole('tab', { name: 'Yaw' });
    await user.click(yawTab);

    expect(mockOnChange).toHaveBeenCalledWith('yaw');
  });

  it('has tablist role on container', () => {
    const { container } = render(<AxisTabs selected="roll" onChange={vi.fn()} />);

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeInTheDocument();
  });

  it('calls onChange for each tab', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    render(<AxisTabs selected="roll" onChange={mockOnChange} />);

    await user.click(screen.getByRole('tab', { name: 'Pitch' }));
    expect(mockOnChange).toHaveBeenCalledWith('pitch');

    mockOnChange.mockClear();
    await user.click(screen.getByRole('tab', { name: 'All' }));
    expect(mockOnChange).toHaveBeenCalledWith('all');
  });
});

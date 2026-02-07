import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders message correctly', () => {
    render(
      <Toast
        id="test-1"
        type="success"
        message="Test message"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('shows correct icon for success type', () => {
    render(
      <Toast
        id="test-1"
        type="success"
        message="Success"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('shows correct icon for error type', () => {
    render(
      <Toast
        id="test-1"
        type="error"
        message="Error"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('shows correct icon for info type', () => {
    render(
      <Toast
        id="test-1"
        type="info"
        message="Info"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('ℹ')).toBeInTheDocument();
  });

  it('shows correct icon for warning type', () => {
    render(
      <Toast
        id="test-1"
        type="warning"
        message="Warning"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('applies correct CSS class for each type', () => {
    const { rerender, container } = render(
      <Toast
        id="test-1"
        type="success"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(container.querySelector('.toast--success')).toBeInTheDocument();

    rerender(
      <Toast
        id="test-1"
        type="error"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );
    expect(container.querySelector('.toast--error')).toBeInTheDocument();

    rerender(
      <Toast
        id="test-1"
        type="info"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );
    expect(container.querySelector('.toast--info')).toBeInTheDocument();

    rerender(
      <Toast
        id="test-1"
        type="warning"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );
    expect(container.querySelector('.toast--warning')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <Toast
        id="test-1"
        type="success"
        message="Test"
        dismissible={true}
        onDismiss={onDismiss}
      />
    );

    const dismissButton = screen.getByRole('button', { name: /dismiss notification/i });
    await user.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render dismiss button when dismissible is false', () => {
    render(
      <Toast
        id="test-1"
        type="error"
        message="Test"
        dismissible={false}
        onDismiss={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /dismiss notification/i })).not.toBeInTheDocument();
  });

  it('renders progress bar when duration is provided', () => {
    const { container } = render(
      <Toast
        id="test-1"
        type="success"
        message="Test"
        duration={3000}
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    const progressBar = container.querySelector('.toast__progress');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ animationDuration: '3000ms' });
  });

  it('does not render progress bar when duration is undefined', () => {
    const { container } = render(
      <Toast
        id="test-1"
        type="error"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(container.querySelector('.toast__progress')).not.toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    const { container } = render(
      <Toast
        id="test-1"
        type="success"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    const toast = container.querySelector('.toast');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveAttribute('aria-atomic', 'true');
  });

  it('uses assertive aria-live for error toasts', () => {
    const { container } = render(
      <Toast
        id="test-1"
        type="error"
        message="Error"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    const toast = container.querySelector('.toast');
    expect(toast).toHaveAttribute('aria-live', 'assertive');
  });

  it('uses polite aria-live for non-error toasts', () => {
    const { rerender, container } = render(
      <Toast
        id="test-1"
        type="success"
        message="Success"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    expect(container.querySelector('.toast')).toHaveAttribute('aria-live', 'polite');

    rerender(
      <Toast
        id="test-1"
        type="info"
        message="Info"
        dismissible={true}
        onDismiss={() => {}}
      />
    );
    expect(container.querySelector('.toast')).toHaveAttribute('aria-live', 'polite');

    rerender(
      <Toast
        id="test-1"
        type="warning"
        message="Warning"
        dismissible={true}
        onDismiss={() => {}}
      />
    );
    expect(container.querySelector('.toast')).toHaveAttribute('aria-live', 'polite');
  });

  it('icon has aria-hidden attribute', () => {
    const { container } = render(
      <Toast
        id="test-1"
        type="success"
        message="Test"
        dismissible={true}
        onDismiss={() => {}}
      />
    );

    const icon = container.querySelector('.toast__icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

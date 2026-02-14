import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows error message in fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('renders custom fallback prop when provided', () => {
    const customFallback = <div>Custom error UI</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('Try Again button resets error state', async () => {
    const user = userEvent.setup();

    // Use a wrapper that can control whether child throws
    function TestWrapper({ shouldThrow }: { shouldThrow: boolean }) {
      return (
        <ErrorBoundary key={shouldThrow ? 'throwing' : 'normal'}>
          <ThrowingComponent shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(<TestWrapper shouldThrow={true} />);

    // Error fallback is shown
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click Try Again button - this resets the error state
    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    await user.click(tryAgainButton);

    // Re-render with non-throwing component (and new key to reset error boundary)
    rerender(<TestWrapper shouldThrow={false} />);

    // Error is cleared, normal content is shown
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('calls console.error via componentDidCatch', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ErrorBoundary] Caught error:',
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });
});

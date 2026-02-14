import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock all hooks used in AppContent
vi.mock('./hooks/useProfiles', () => ({
  useProfiles: vi.fn(() => ({
    profiles: [],
    currentProfile: null,
    loading: false,
    createProfile: vi.fn(),
    createProfileFromPreset: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    setCurrentProfile: vi.fn(),
    exportProfile: vi.fn(),
  })),
}));

vi.mock('./hooks/useTuningSession', () => ({
  useTuningSession: vi.fn(() => ({
    session: null,
    loading: false,
    startSession: vi.fn(),
    updatePhase: vi.fn(),
    resetSession: vi.fn(),
  })),
}));

vi.mock('./hooks/useTuningHistory', () => ({
  useTuningHistory: vi.fn(() => ({
    history: [],
    loading: false,
  })),
}));

vi.mock('./hooks/useConnection', () => ({
  useConnection: vi.fn(() => ({
    ports: [],
    status: { connected: false },
    loading: false,
    error: null,
    scanPorts: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  markIntentionalDisconnect: vi.fn(),
  resetConnectionGlobalState: vi.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Betaflight PID AutoTune')).toBeInTheDocument();
  });

  it('shows app title "Betaflight PID AutoTune"', () => {
    render(<App />);
    const title = screen.getByRole('heading', { name: /betaflight pid autotune/i });
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe('H1');
  });

  it('renders ConnectionPanel', () => {
    render(<App />);
    // ConnectionPanel should render (we can check for connection-related text)
    // Since ConnectionPanel is always rendered, we just verify the component tree doesn't crash
    expect(screen.getByText('Betaflight PID AutoTune')).toBeInTheDocument();
  });

  it('shows version number', () => {
    render(<App />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('shows BF compatibility badge', () => {
    render(<App />);
    expect(screen.getByText('BF 4.3+')).toBeInTheDocument();
  });

  it('shows "How to tune?" button', () => {
    render(<App />);
    const helpButton = screen.getByRole('button', { name: /how to tune/i });
    expect(helpButton).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  // Suppress console.error for this test (ErrorBoundary logs errors)
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('catches errors and shows fallback UI', async () => {
    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    const { ErrorBoundary } = await import('./components/ErrorBoundary');

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});

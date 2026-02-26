import { useState, useEffect } from 'react';

/**
 * Hook that returns whether the app is running in demo mode.
 * Caches the result — demo mode never changes during a session.
 */
let cachedDemoMode: boolean | null = null;

export function useDemoMode(): { isDemoMode: boolean } {
  const [isDemoMode, setIsDemoMode] = useState(cachedDemoMode ?? false);

  useEffect(() => {
    if (cachedDemoMode !== null) {
      setIsDemoMode(cachedDemoMode);
      return;
    }
    window.betaflight.isDemoMode().then((value) => {
      cachedDemoMode = value;
      setIsDemoMode(value);
    });
  }, []);

  return { isDemoMode };
}

// Exported for testing — reset cached state between tests
export function _resetDemoModeCache() {
  cachedDemoMode = null;
}

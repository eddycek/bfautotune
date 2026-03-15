import { useState, useEffect, useCallback } from 'react';

export function useAutoUpdate() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const cleanupAvailable = window.betaflight.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
    });

    const cleanupDownloaded = window.betaflight.onUpdateDownloaded((info) => {
      setUpdateVersion(info.version);
      setUpdateReady(true);
    });

    return () => {
      cleanupAvailable();
      cleanupDownloaded();
    };
  }, []);

  const installUpdate = useCallback(() => {
    window.betaflight.installUpdate().catch(() => {});
  }, []);

  return { updateVersion, updateReady, installUpdate };
}

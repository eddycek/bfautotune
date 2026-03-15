import React, { useState } from 'react';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import './UpdateNotification.css';

export function UpdateNotification() {
  const { updateVersion, updateReady, installUpdate } = useAutoUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateReady || dismissed) return null;

  return (
    <div className="update-notification">
      <span className="update-notification-text">v{updateVersion} available</span>
      <button className="update-notification-btn" onClick={installUpdate}>
        Restart
      </button>
      <button
        className="update-notification-dismiss"
        onClick={() => setDismissed(true)}
        title="Dismiss (will install on next quit)"
      >
        &times;
      </button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useConnection } from '../../hooks/useConnection';
import './ConnectionPanel.css';

export function ConnectionPanel() {
  const { ports, status, loading, error, scanPorts, connect, disconnect } = useConnection();
  const [selectedPort, setSelectedPort] = useState<string>('');

  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  useEffect(() => {
    if (ports.length > 0 && !selectedPort) {
      setSelectedPort(ports[0].path);
    }
  }, [ports, selectedPort]);

  const handleConnect = async () => {
    if (selectedPort) {
      await connect(selectedPort);
    }
  };

  return (
    <div className="panel">
      <h2 className="panel-title">Connection</h2>

      {error && <div className="error">{error}</div>}

      <div className="connection-controls">
        <div className="port-selection">
          <label htmlFor="port-select">Serial Port:</label>
          <select
            id="port-select"
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={status.connected || loading}
          >
            {ports.length === 0 && <option value="">No ports found</option>}
            {ports.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path}
                {port.manufacturer && ` - ${port.manufacturer}`}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={scanPorts}
            disabled={status.connected || loading}
          >
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        <div className="connection-status">
          <span className="status-label">Status:</span>
          <span className={status.connected ? 'status-connected' : 'status-disconnected'}>
            {status.connected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>

        <div className="connection-actions">
          {!status.connected ? (
            <button
              className="primary"
              onClick={handleConnect}
              disabled={!selectedPort || loading || ports.length === 0}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button className="danger" onClick={disconnect} disabled={loading}>
              {loading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

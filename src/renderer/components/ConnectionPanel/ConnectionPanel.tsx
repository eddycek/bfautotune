import React, { useEffect, useState } from 'react';
import { useConnection } from '../../hooks/useConnection';
import './ConnectionPanel.css';

export function ConnectionPanel() {
  const { ports, status, loading, error, scanPorts, connect, disconnect } = useConnection();
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [reconnectCooldown, setReconnectCooldown] = useState(0);

  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  useEffect(() => {
    // If no port selected, select first available
    if (ports.length > 0 && !selectedPort) {
      setSelectedPort(ports[0].path);
      return;
    }

    // If selected port no longer exists in the list, select first available
    if (ports.length > 0 && selectedPort) {
      const portExists = ports.some(port => port.path === selectedPort);
      if (!portExists) {
        console.log(`Selected port ${selectedPort} no longer exists, selecting ${ports[0].path}`);
        setSelectedPort(ports[0].path);
      }
    }

    // If no ports available, clear selection
    if (ports.length === 0 && selectedPort) {
      setSelectedPort('');
    }
  }, [ports, selectedPort]);

  useEffect(() => {
    if (reconnectCooldown > 0) {
      const timer = setTimeout(() => {
        setReconnectCooldown(reconnectCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [reconnectCooldown]);

  const handleConnect = async () => {
    if (selectedPort) {
      await connect(selectedPort);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    // Start 3 second cooldown after disconnect
    setReconnectCooldown(3);

    // Rescan ports after disconnect to detect new FC
    // Wait a bit for the old port to be released
    setTimeout(() => {
      scanPorts();
    }, 1500);
  };

  return (
    <div className="panel">
      <h2 className="panel-title">Connection</h2>

      {error && <div className="error">{error}</div>}
      {reconnectCooldown > 0 && (
        <div className="info" style={{
          padding: '8px 12px',
          backgroundColor: '#1e3a5f',
          border: '1px solid #2563eb',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '13px',
          color: '#93c5fd'
        }}>
          Wait {reconnectCooldown} second{reconnectCooldown !== 1 ? 's' : ''} before reconnecting...
        </div>
      )}

      <div className="connection-controls">
        <div className="port-selection">
          <label htmlFor="port-select">Serial Port:</label>
          <select
            id="port-select"
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={status.connected || loading || reconnectCooldown > 0}
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
            disabled={status.connected || loading || reconnectCooldown > 0}
          >
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        <div className="connection-status">
          <span className="status-label">Status:</span>
          <span className={status.connected ? 'status-connected' : 'status-disconnected'}>
            {status.connected ? '● Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="connection-actions">
          {!status.connected ? (
            <button
              className="primary"
              onClick={handleConnect}
              disabled={!selectedPort || loading || ports.length === 0 || reconnectCooldown > 0}
            >
              {loading ? 'Connecting...' : reconnectCooldown > 0 ? `Wait ${reconnectCooldown}s` : 'Connect'}
            </button>
          ) : (
            <button className="danger" onClick={handleDisconnect} disabled={loading}>
              {loading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

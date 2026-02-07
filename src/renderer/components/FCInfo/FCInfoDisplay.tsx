import React, { useEffect } from 'react';
import { useConnection } from '../../hooks/useConnection';
import { useFCInfo } from '../../hooks/useFCInfo';
import './FCInfoDisplay.css';

export function FCInfoDisplay() {
  const { status } = useConnection();
  const { fcInfo, loading, error, fetchFCInfo, exportCLI } = useFCInfo();

  useEffect(() => {
    if (status.connected && status.fcInfo) {
      // Use FC info from connection status
    } else if (status.connected) {
      fetchFCInfo();
    }
  }, [status.connected, status.fcInfo, fetchFCInfo]);

  const handleExport = async (format: 'diff' | 'dump') => {
    const cli = await exportCLI(format);
    if (cli) {
      // Create download
      const blob = new Blob([cli], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `betaflight-${format}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!status.connected) {
    return null;
  }

  const info = status.fcInfo || fcInfo;

  return (
    <div className="panel">
      <h2 className="panel-title">Flight Controller Information</h2>

      {error && <div className="error">{error}</div>}

      {loading && <div>Loading FC information...</div>}

      {info && (
        <>
          <div className="info-grid">
            <span className="info-label">Variant:</span>
            <span className="info-value">{info.variant}</span>

            <span className="info-label">Version:</span>
            <span className="info-value">{info.version}</span>

            <span className="info-label">Board:</span>
            <span className="info-value">{info.boardName}</span>

            <span className="info-label">Target:</span>
            <span className="info-value">{info.target}</span>

            <span className="info-label">API Version:</span>
            <span className="info-value">
              {info.apiVersion.protocol}.{info.apiVersion.major}.{info.apiVersion.minor}
            </span>
          </div>

          <div className="fc-actions">
            <h3>Configuration Export</h3>
            <div className="action-buttons">
              <button className="secondary" onClick={() => handleExport('diff')} disabled={loading}>
                Export CLI Diff
              </button>
              <button className="secondary" onClick={() => handleExport('dump')} disabled={loading}>
                Export CLI Dump
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

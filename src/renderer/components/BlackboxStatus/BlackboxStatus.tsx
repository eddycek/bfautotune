import React, { useState } from 'react';
import { useBlackboxInfo } from '../../hooks/useBlackboxInfo';
import { useBlackboxLogs } from '../../hooks/useBlackboxLogs';
import { useToast } from '../../hooks/useToast';
import './BlackboxStatus.css';

interface BlackboxStatusProps {
  onAnalyze?: (logId: string) => void;
  readonly?: boolean;
}

export function BlackboxStatus({ onAnalyze, readonly }: BlackboxStatusProps) {
  const { info, loading, error, refresh: refreshInfo } = useBlackboxInfo();
  const { logs, deleteLog, openFolder, reload: reloadLogs } = useBlackboxLogs();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [erasing, setErasing] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      const metadata = await window.betaflight.downloadBlackboxLog((progress) => {
        setDownloadProgress(progress);
      });

      toast.success(`Log downloaded: ${metadata.filename} (${formatSize(metadata.size)})`);
      setDownloadProgress(100);

      // Reload logs list to show new download
      await reloadLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download Blackbox log';
      toast.error(message);
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress(0);
      }, 2000);
    }
  };

  const handleEraseFlash = async () => {
    setErasing(true);
    try {
      await window.betaflight.eraseBlackboxFlash();
      toast.success('Flash memory erased successfully');
      setShowEraseConfirm(false);

      // Reload Blackbox info to show 0% usage
      await refreshInfo();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to erase flash';
      toast.error(message);
    } finally {
      setErasing(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteLog(logId);
      toast.success('Log deleted successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete log';
      toast.error(message);
    }
  };

  const handleTestRead = async () => {
    try {
      const result = await window.betaflight.testBlackboxRead();

      if (result.success) {
        toast.success('Blackbox read OK');
      } else {
        toast.error(`Test failed: ${result.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test failed';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="blackbox-status">
        <h3>Blackbox Storage</h3>
        <div className="loading">Loading Blackbox info...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="blackbox-status">
        <h3>Blackbox Storage</h3>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!info) {
    return null;
  }

  if (!info.supported) {
    return (
      <div className="blackbox-status">
        <h3>Blackbox Storage</h3>
        <div className="not-supported">
          <span className="icon">⚠️</span>
          <span>Blackbox not supported or no flash storage detected</span>
        </div>
      </div>
    );
  }

  // Blackbox supported but size info not available (SD card or external storage)
  if (info.supported && info.totalSize === 0) {
    return (
      <div className="blackbox-status">
        <h3>Blackbox Storage</h3>
        <div className="storage-info">
          <div className="info-message">
            <span className="icon">ℹ️</span>
            <div>
              <strong>Blackbox is supported</strong>
              <p>Storage size unavailable - your FC might use SD card logging instead of onboard flash.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getUsageColor = (percent: number): string => {
    if (percent < 50) return 'low';
    if (percent < 80) return 'medium';
    return 'high';
  };

  return (
    <div className="blackbox-status">
      <h3>Blackbox Storage</h3>

      <div className="storage-info">
        <div className="storage-bar">
          <div
            className={`usage-indicator ${getUsageColor(info.usagePercent)}`}
            style={{ width: `${info.usagePercent}%` }}
          />
        </div>

        <div className="storage-stats">
          <div className="stat">
            <span className="label">Total:</span>
            <span className="value">{formatSize(info.totalSize)}</span>
          </div>
          <div className="stat">
            <span className="label">Used:</span>
            <span className="value">{formatSize(info.usedSize)}</span>
          </div>
          <div className="stat">
            <span className="label">Free:</span>
            <span className="value">{formatSize(info.freeSize)}</span>
          </div>
          <div className="stat">
            <span className="label">Usage:</span>
            <span className="value">{info.usagePercent}%</span>
          </div>
        </div>

        {info.hasLogs && (
          <>
            <div className="logs-available">
              <span className="icon">📊</span>
              <span>Logs available for download</span>
            </div>

            {!readonly && (
              <>
                {/* Debug button for testing MSP_DATAFLASH_READ */}
                <button
                  className="test-read-button"
                  onClick={handleTestRead}
                  title="Test if FC supports MSP_DATAFLASH_READ (reads 10 bytes)"
                >
                  <span className="icon">🔬</span>
                  <span>Test Read (Debug)</span>
                </button>

                <div className="action-buttons">
                  <button
                    className="download-button"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <>
                        <span className="spinner" />
                        <span>Downloading... {downloadProgress}%</span>
                      </>
                    ) : (
                      <>
                        <span className="icon">⬇️</span>
                        <span>Download Logs</span>
                      </>
                    )}
                  </button>

                  <button
                    className="erase-flash-button"
                    onClick={() => setShowEraseConfirm(true)}
                    disabled={downloading || erasing}
                    title="Permanently erase all logs from FC flash memory"
                  >
                    <span className="icon">🗑️</span>
                    <span>Erase Flash</span>
                  </button>
                </div>

                {downloading && downloadProgress > 0 && (
                  <div className="download-progress">
                    <div
                      className="download-progress-bar"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!info.hasLogs && (
          <div className="no-logs">
            <span className="icon">ℹ️</span>
            <span>No logs recorded yet</span>
          </div>
        )}
      </div>

      {/* Downloaded Logs Section */}
      <div className="downloaded-logs">
        <h4>Downloaded Logs ({logs.length})</h4>
        {logs.length > 0 ? (
          <div className="logs-list">
            {[...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((log) => (
              <div key={log.id} className="log-item">
                <div className="log-info">
                  <div className="log-filename">{log.filename}</div>
                  <div className="log-meta">
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    <span>•</span>
                    <span>{formatSize(log.size)}</span>
                    <span>•</span>
                    <span>{log.fcInfo.variant} {log.fcInfo.version}</span>
                  </div>
                </div>
                <div className="log-actions">
                  {onAnalyze && !readonly && (
                    <button
                      className="log-analyze-button"
                      onClick={() => onAnalyze(log.id)}
                      title="Analyze & Tune"
                    >
                      Analyze
                    </button>
                  )}
                  <button
                    className="log-action-button"
                    onClick={() => openFolder(log.filepath)}
                    title="Open folder"
                  >
                    📁
                  </button>
                  <button
                    className="log-action-button delete"
                    onClick={() => handleDeleteLog(log.id)}
                    title="Delete log"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-downloaded-logs">
            <span className="icon">📦</span>
            <span>No downloaded logs yet. Download from FC to see them here.</span>
          </div>
        )}
      </div>

      {/* Erase Flash Confirmation Dialog */}
      {showEraseConfirm && (
        <div className="modal-overlay" onClick={() => !erasing && setShowEraseConfirm(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Erase Flash Memory?</h3>
            <p>
              This will <strong>permanently delete ALL logs</strong> from the flight controller's flash memory.
            </p>
            <p className="warning-text">
              ⚠️ This action cannot be undone! Make sure you've downloaded any logs you want to keep.
            </p>
            <div className="modal-actions">
              <button
                className="button-secondary"
                onClick={() => setShowEraseConfirm(false)}
                disabled={erasing}
              >
                Cancel
              </button>
              <button
                className="button-danger"
                onClick={handleEraseFlash}
                disabled={erasing}
              >
                {erasing ? 'Erasing...' : 'Erase Flash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

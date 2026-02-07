import React, { useState } from 'react';
import { useBlackboxInfo } from '../../hooks/useBlackboxInfo';
import { useToast } from '../../hooks/useToast';
import './BlackboxStatus.css';

export function BlackboxStatus() {
  const { info, loading, error } = useBlackboxInfo();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [lastDownloadPath, setLastDownloadPath] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      const filepath = await window.betaflight.downloadBlackboxLog((progress) => {
        setDownloadProgress(progress);
      });

      setLastDownloadPath(filepath);
      toast.success('Blackbox log downloaded successfully!');
      setDownloadProgress(100);
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

  const handleOpenFolder = async () => {
    if (lastDownloadPath) {
      try {
        await window.betaflight.openBlackboxFolder(lastDownloadPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open folder';
        toast.error(message);
      }
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

              {lastDownloadPath && !downloading && (
                <button
                  className="open-folder-button"
                  onClick={handleOpenFolder}
                  title={lastDownloadPath}
                >
                  <span className="icon">📁</span>
                  <span>Open Folder</span>
                </button>
              )}
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

        {!info.hasLogs && (
          <div className="no-logs">
            <span className="icon">ℹ️</span>
            <span>No logs recorded yet</span>
          </div>
        )}
      </div>
    </div>
  );
}

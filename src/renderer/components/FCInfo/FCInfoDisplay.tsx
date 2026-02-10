import React, { useEffect, useState } from 'react';
import { useConnection } from '../../hooks/useConnection';
import { useFCInfo } from '../../hooks/useFCInfo';
import type { BlackboxSettings } from '@shared/types/blackbox.types';
import './FCInfoDisplay.css';

const RECOMMENDED_DEBUG_MODE = 'GYRO_SCALED';
const MIN_LOGGING_RATE_HZ = 2000;

export function FCInfoDisplay() {
  const { status } = useConnection();
  const { fcInfo, loading, error, fetchFCInfo, exportCLI } = useFCInfo();
  const [bbSettings, setBbSettings] = useState<BlackboxSettings | null>(null);
  const [bbLoading, setBbLoading] = useState(false);

  useEffect(() => {
    if (status.connected && status.fcInfo) {
      // Use FC info from connection status
    } else if (status.connected) {
      fetchFCInfo();
    }
  }, [status.connected, status.fcInfo, fetchFCInfo]);

  useEffect(() => {
    if (status.connected) {
      setBbLoading(true);
      window.betaflight.getBlackboxSettings()
        .then(settings => setBbSettings(settings))
        .catch(() => setBbSettings(null))
        .finally(() => setBbLoading(false));
    } else {
      setBbSettings(null);
    }
  }, [status.connected]);

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

  const debugModeOk = bbSettings?.debugMode === RECOMMENDED_DEBUG_MODE;
  const loggingRateOk = bbSettings ? bbSettings.loggingRateHz >= MIN_LOGGING_RATE_HZ : true;

  return (
    <div className="panel">
      <h2 className="panel-title">Flight Controller Information</h2>

      {error && <div className="error">{error}</div>}

      {loading && <div>Loading FC information...</div>}

      {info && (
        <>
          <div className="fc-info-row">
            <div className="info-grid">
              <span className="info-label">Variant:</span>
              <span className="info-value">{info.variant}</span>

              <span className="info-label">Version:</span>
              <span className="info-value">{info.version}</span>

              <span className="info-label">Target:</span>
              <span className="info-value">{info.target}</span>

              {info.boardName && info.boardName !== info.target && (
                <>
                  <span className="info-label">Board:</span>
                  <span className="info-value">{info.boardName}</span>
                </>
              )}

              <span className="info-label">API Version:</span>
              <span className="info-value">
                {info.apiVersion.protocol}.{info.apiVersion.major}.{info.apiVersion.minor}
              </span>
            </div>

            {bbSettings && (
              <div className="fc-bb-settings">
                <div className={`fc-bb-setting ${debugModeOk ? 'ok' : 'warn'}`}>
                  <span className="fc-bb-indicator">{debugModeOk ? '\u2713' : '\u26A0'}</span>
                  <span className="fc-bb-label">Debug Mode:</span>
                  <span className="fc-bb-value">{bbSettings.debugMode}</span>
                </div>
                <div className={`fc-bb-setting ${loggingRateOk ? 'ok' : 'warn'}`}>
                  <span className="fc-bb-indicator">{loggingRateOk ? '\u2713' : '\u26A0'}</span>
                  <span className="fc-bb-label">Logging Rate:</span>
                  <span className="fc-bb-value">{formatRate(bbSettings.loggingRateHz)}</span>
                </div>
                {!debugModeOk && (
                  <div className="fc-bb-hint">Set <code>debug_mode = GYRO_SCALED</code> for noise analysis</div>
                )}
                {!loggingRateOk && (
                  <div className="fc-bb-hint">Increase logging rate to 2 kHz or higher</div>
                )}
              </div>
            )}
            {bbLoading && (
              <div className="fc-bb-settings">
                <span className="fc-bb-loading">Reading settings...</span>
              </div>
            )}
          </div>

          <div className="fc-export-buttons">
            <button className="secondary" onClick={() => handleExport('diff')} disabled={loading}>
              Export CLI Diff
            </button>
            <button className="secondary" onClick={() => handleExport('dump')} disabled={loading}>
              Export CLI Dump
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatRate(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`;
  }
  return `${hz} Hz`;
}

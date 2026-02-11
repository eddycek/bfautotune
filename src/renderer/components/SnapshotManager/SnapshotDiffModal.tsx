import React from 'react';
import type { ConfigurationSnapshot } from '@shared/types/common.types';
import { parseCLIDiff, computeDiff, groupDiffByCommand } from './snapshotDiffUtils';
import './SnapshotDiffModal.css';

interface SnapshotDiffModalProps {
  snapshotA: ConfigurationSnapshot;
  snapshotB: ConfigurationSnapshot;
  onClose: () => void;
}

export function SnapshotDiffModal({ snapshotA, snapshotB, onClose }: SnapshotDiffModalProps) {
  const beforeMap = parseCLIDiff(snapshotA.configuration.cliDiff);
  const afterMap = parseCLIDiff(snapshotB.configuration.cliDiff);
  const diff = computeDiff(beforeMap, afterMap);
  const groups = groupDiffByCommand(diff);

  const addedCount = diff.filter(d => d.status === 'added').length;
  const changedCount = diff.filter(d => d.status === 'changed').length;

  return (
    <div className="snapshot-diff-overlay" onClick={onClose}>
      <div className="snapshot-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="snapshot-diff-header">
          <h3>Snapshot Comparison</h3>
          <div className="snapshot-diff-labels">
            <span className="snapshot-diff-label-before">{snapshotA.label}</span>
            <span className="snapshot-diff-arrow">&rarr;</span>
            <span className="snapshot-diff-label-after">{snapshotB.label}</span>
          </div>
        </div>

        <div className="snapshot-diff-legend">
          <span className="diff-badge diff-badge-added">Added</span>
          <span className="diff-badge diff-badge-changed">Changed</span>
        </div>

        <div className="snapshot-diff-summary">
          {addedCount} added, {changedCount} changed
        </div>

        <div className="snapshot-diff-content">
          {diff.length === 0 ? (
            <div className="snapshot-diff-empty">Snapshots have identical configuration.</div>
          ) : (
            Array.from(groups.entries()).map(([command, entries]) => (
              <div key={command} className="diff-group">
                <div className="diff-group-title">{command}</div>
                {entries.map((entry) => (
                  <div key={entry.key}>
                    {entry.status === 'added' && (
                      <div className="diff-line diff-line-added">
                        <span className="diff-prefix">+</span>
                        <span className="diff-key">{entry.key}</span>
                        <span className="diff-value">= {entry.newValue}</span>
                      </div>
                    )}
                    {entry.status === 'changed' && (
                      <>
                        <div className="diff-line diff-line-changed-old">
                          <span className="diff-prefix">-</span>
                          <span className="diff-key">{entry.key}</span>
                          <span className="diff-value">= {entry.oldValue}</span>
                        </div>
                        <div className="diff-line diff-line-changed-new">
                          <span className="diff-prefix">+</span>
                          <span className="diff-key">{entry.key}</span>
                          <span className="diff-value">= {entry.newValue}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="snapshot-diff-footer">
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

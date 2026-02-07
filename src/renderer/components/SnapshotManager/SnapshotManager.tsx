import React, { useState } from 'react';
import { useConnection } from '../../hooks/useConnection';
import { useSnapshots } from '../../hooks/useSnapshots';
import './SnapshotManager.css';

export function SnapshotManager() {
  const { status } = useConnection();
  const { snapshots, loading, error, createSnapshot, deleteSnapshot, loadSnapshot } = useSnapshots();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  const handleCreateSnapshot = async () => {
    const result = await createSnapshot(snapshotLabel || undefined);
    if (result) {
      setShowCreateDialog(false);
      setSnapshotLabel('');
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (confirm('Are you sure you want to delete this snapshot?')) {
      await deleteSnapshot(id);
    }
  };

  const handleViewSnapshot = async (id: string) => {
    const snapshot = await loadSnapshot(id);
    if (snapshot) {
      setSelectedSnapshot(id);
      // Show snapshot details (could open a modal)
      const blob = new Blob([snapshot.configuration.cliDiff], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-${snapshot.label}-${new Date(snapshot.timestamp).toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="panel">
      <h2 className="panel-title">Configuration Snapshots</h2>

      {error && <div className="error">{error}</div>}

      <div className="snapshot-actions">
        <button
          className="primary"
          onClick={() => setShowCreateDialog(true)}
          disabled={!status.connected || loading}
        >
          Create Snapshot
        </button>
      </div>

      {showCreateDialog && (
        <div className="create-dialog">
          <h3>Create Snapshot</h3>
          <input
            type="text"
            placeholder="Label (optional)"
            value={snapshotLabel}
            onChange={(e) => setSnapshotLabel(e.target.value)}
          />
          <div className="dialog-actions">
            <button className="primary" onClick={handleCreateSnapshot} disabled={loading}>
              Create
            </button>
            <button className="secondary" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="snapshot-list">
        {loading && <div>Loading snapshots...</div>}

        {snapshots.length === 0 && !loading && (
          <div className="no-snapshots">No snapshots yet. Create one to save your configuration.</div>
        )}

        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="snapshot-item">
            <div className="snapshot-info">
              <div className="snapshot-label">
                {snapshot.label}
                {snapshot.type === 'baseline' && <span className="badge baseline">Baseline</span>}
              </div>
              <div className="snapshot-meta">
                <span>{new Date(snapshot.timestamp).toLocaleString()}</span>
                <span>•</span>
                <span>
                  {snapshot.fcInfo.variant} {snapshot.fcInfo.version}
                </span>
                <span>•</span>
                <span>{snapshot.fcInfo.boardName}</span>
              </div>
            </div>
            <div className="snapshot-actions-item">
              <button className="secondary" onClick={() => handleViewSnapshot(snapshot.id)}>
                Export
              </button>
              {snapshot.type !== 'baseline' && (
                <button className="danger" onClick={() => handleDeleteSnapshot(snapshot.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

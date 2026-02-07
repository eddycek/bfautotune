import React from 'react';
import { ConnectionPanel } from './components/ConnectionPanel/ConnectionPanel';
import { FCInfoDisplay } from './components/FCInfo/FCInfoDisplay';
import { SnapshotManager } from './components/SnapshotManager/SnapshotManager';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Beta PIDTune</h1>
        <span className="version">v0.1.0</span>
      </header>

      <main className="app-main">
        <div className="main-content">
          <ConnectionPanel />
          <FCInfoDisplay />
          <SnapshotManager />
        </div>
      </main>
    </div>
  );
}

export default App;

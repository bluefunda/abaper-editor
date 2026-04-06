import './monacoSetup';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAuth } from './services/auth';
import { track } from './services/telemetry';

// Point @monaco-editor/react to the bundled monaco instance
loader.config({ monaco });

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#ef4444', fontFamily: 'monospace' }}>
          <h1>Runtime Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', opacity: 0.7 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root')!);

initAuth().then(() => {
  track('app_loaded');
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}).catch((err) => {
  root.render(
    <div style={{ padding: '2rem', color: '#ef4444' }}>
      <h1>Authentication Failed</h1>
      <p>{String(err)}</p>
    </div>,
  );
});

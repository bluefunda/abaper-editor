import './monacoSetup';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAuth } from './services/auth';

// Point @monaco-editor/react to the bundled monaco instance
loader.config({ monaco });

const root = createRoot(document.getElementById('root')!);

initAuth().then(() => {
  root.render(
    <StrictMode>
      <App />
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

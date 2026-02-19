import './monacoSetup';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Point @monaco-editor/react to the bundled monaco instance
loader.config({ monaco });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

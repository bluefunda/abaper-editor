import { useState } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { setBaseUrl } from '../../services/api';
import { checkConnection } from '../../services/connection';
import { ConnectionStatus } from '../../types/lsp';
import { Spinner } from '../common/Spinner';

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ConnectionDialog({ open, onClose }: ConnectionDialogProps) {
  const {
    backendUrl,
    offlineLinting,
    activateOnSave,
    setBackendUrl,
    setOfflineLinting,
    setActivateOnSave,
    setStatus,
  } = useConnectionStore();

  const [url, setUrl] = useState(backendUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setBaseUrl(url);
    try {
      const status = await checkConnection();
      if (status === ConnectionStatus.Connected) {
        setTestResult('Connection successful!');
      } else {
        setTestResult('Connection failed — backend not reachable');
      }
    } catch {
      setTestResult('Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setBackendUrl(url);
    setBaseUrl(url);
    checkConnection().then(setStatus);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[440px] bg-sidebar-bg border border-panel-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-panel-border">
          <h2 className="text-sm font-semibold">Connection Settings</h2>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">ABAPer Backend URL</label>
            <input
              type="text"
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing && <Spinner size={12} />}
              Test Connection
            </button>
            {testResult && (
              <span
                className={`text-xs ${testResult.includes('successful') ? 'text-success' : 'text-error'}`}
              >
                {testResult}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={offlineLinting}
                onChange={(e) => setOfflineLinting(e.target.checked)}
                className="accent-accent"
              />
              Enable offline linting (abaplint in-browser)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={activateOnSave}
                onChange={(e) => setActivateOnSave(e.target.checked)}
                className="accent-accent"
              />
              Activate on save
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-panel-border">
          <button
            className="px-4 py-1.5 text-xs rounded hover:bg-white/10"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

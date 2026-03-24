import { useState, useEffect } from 'react';
import { useSystemStore } from '../../stores/systemStore';
import { testSystemConnectionFor } from '../../services/api';
import type { SAPSystem } from '../../stores/systemStore';
import { Spinner } from '../common/Spinner';

interface AddSystemDialogProps {
  open: boolean;
  onClose: () => void;
  editSystem?: SAPSystem | null;
}

export function AddSystemDialog({ open, onClose, editSystem }: AddSystemDialogProps) {
  const addSystem = useSystemStore((s) => s.addSystem);
  const updateSystem = useSystemStore((s) => s.updateSystem);

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [client, setClient] = useState('100');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (editSystem) {
      setName(editSystem.name);
      setHost(editSystem.host);
      setClient(editSystem.client);
      setUsername(editSystem.username);
      setPassword(editSystem.password);
    }
  }, [editSystem]);

  const reset = () => {
    setName('');
    setHost('');
    setClient('100');
    setUsername('');
    setPassword('');
    setTesting(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!host || !username || !password) return;
    setTesting(true);
    setTestResult(null);
    try {
      const tempSystem: SAPSystem = {
        id: 'test',
        name: name || host,
        host,
        client,
        username,
        password,
        status: 'checking',
      };
      const result = await testSystemConnectionFor(tempSystem);
      setTestResult(result.success ? 'Connection successful!' : 'Connection failed');
    } catch {
      setTestResult('Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!host || !username || !password) return;
    if (editSystem) {
      updateSystem(editSystem.id, {
        name: name || host,
        host,
        client,
        username,
        password,
      });
    } else {
      addSystem({
        name: name || host,
        host,
        client,
        username,
        password,
      });
    }
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="w-[440px] bg-sidebar-bg border border-panel-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-panel-border">
          <h2 className="text-sm font-semibold">{editSystem ? 'Edit SAP System' : 'Add SAP System'}</h2>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">Display Name</label>
            <input
              type="text"
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DEV, QAS, PRD"
            />
          </div>

          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">SAP Host URL</label>
            <input
              type="text"
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="https://sap-host.example.com:44300"
            />
          </div>

          <div className="flex gap-3">
            <div className="w-24">
              <label className="block text-xs text-sidebar-fg/60 mb-1">Client</label>
              <input
                type="text"
                className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-sidebar-fg/60 mb-1">Username</label>
              <input
                type="text"
                className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="SAP username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">Password</label>
            <input
              type="password"
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SAP password"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs rounded disabled:opacity-50"
              onClick={handleTest}
              disabled={testing || !host || !username || !password}
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
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-panel-border">
          <button
            className="px-4 py-1.5 text-xs rounded hover:bg-white/10"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded disabled:opacity-50"
            onClick={handleSave}
            disabled={!host || !username || !password}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Package, Plus, X } from 'lucide-react';
import { Icon } from './Icon';
import { getTransportInfo, createTransport } from '../../services/api';
import { useEditorStore } from '../../stores/editorStore';
import type { TransportInfo } from '../../types/adt';

export function TransportIndicator() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [info, setInfo] = useState<TransportInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const isSapObject = activeTab && activeTab.source !== 'github' && !activeTab.readOnly;

  useEffect(() => {
    if (!isSapObject) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    getTransportInfo()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [activeTabId, isSapObject]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isSapObject || !info) return null;

  const label = info.local
    ? 'Local ($TMP)'
    : info.transports.length > 0
      ? info.transports[0]!.transport
      : 'No transport';

  const handleCreate = async () => {
    if (!desc.trim()) return;
    setError('');
    setCreating(true);
    try {
      await createTransport(desc.trim(), info.package_name);
      const updated = await getTransportInfo();
      setInfo(updated);
      setDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 hover:text-white/90"
        onClick={() => setOpen(!open)}
        title="Transport info"
      >
        <Icon icon={Package} size={12} />
        <span>{label}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-7 right-0 w-72 bg-sidebar-bg border border-panel-border rounded shadow-lg z-50 text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border">
            <span className="font-medium">Transports</span>
            <button onClick={() => setOpen(false)} className="text-sidebar-fg/40 hover:text-sidebar-fg">
              <Icon icon={X} size={14} />
            </button>
          </div>

          {info.local && (
            <div className="px-3 py-2 text-sidebar-fg/60">
              Object is in local package ($TMP) — no transport required.
            </div>
          )}

          {!info.local && info.transports.length > 0 && (
            <div className="max-h-40 overflow-auto">
              {info.transports.map((t) => (
                <div key={t.transport} className="px-3 py-1.5 hover:bg-white/5 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-accent">{t.transport}</div>
                    <div className="text-sidebar-fg/60 truncate">{t.description}</div>
                  </div>
                  <span className="text-sidebar-fg/30 shrink-0 ml-2">{t.status}</span>
                </div>
              ))}
            </div>
          )}

          {!info.local && (
            <div className="px-3 py-2 border-t border-panel-border">
              <div className="flex gap-1">
                <input
                  className="flex-1 bg-editor-bg border border-panel-border rounded px-2 py-1 text-xs text-editor-fg outline-none focus:border-accent"
                  placeholder="Transport description..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <button
                  className="flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40"
                  onClick={handleCreate}
                  disabled={creating || !desc.trim()}
                >
                  <Icon icon={Plus} size={12} />
                  Create
                </button>
              </div>
              {error && <div className="text-error mt-1">{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

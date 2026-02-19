import { useState, useEffect, useRef, useCallback } from 'react';
import { searchObjects, getObject } from '../../services/api';
import { useEditorStore } from '../../stores/editorStore';
import { Spinner } from '../common/Spinner';
import type { ADTObject } from '../../types/adt';
import type { ABAPObjectType } from '../../types/editor';

interface OpenObjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function OpenObjectDialog({ open, onClose }: OpenObjectDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADTObject[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openTab = useEditorStore((s) => s.openTab);
  const appendOutput = useEditorStore((s) => s.appendOutput);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const objects = await searchObjects(query);
        setResults(objects);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const openSelected = useCallback(async (obj: ADTObject) => {
    onClose();
    try {
      appendOutput(`Opening ${obj.type} ${obj.name}...`);
      const source = await getObject(obj.type, obj.name);
      openTab(
        source.object_name,
        source.object_type as ABAPObjectType,
        source.source,
        source.etag,
      );
      appendOutput(`Opened ${obj.name}`);
    } catch (err) {
      appendOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [onClose, openTab, appendOutput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      openSelected(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-[560px] bg-sidebar-bg border border-panel-border rounded-lg shadow-2xl overflow-hidden self-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3 py-2 border-b border-panel-border">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="Type to search ABAP objects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <Spinner size={14} />}
        </div>

        <div className="max-h-[300px] overflow-auto">
          {results.map((obj, i) => (
            <button
              key={`${obj.type}:${obj.name}`}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left ${
                i === selectedIndex ? 'bg-accent text-white' : 'hover:bg-white/5'
              }`}
              onClick={() => openSelected(obj)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-[10px] uppercase w-12 text-right opacity-60 shrink-0">
                {obj.type}
              </span>
              <span className="font-mono">{obj.name}</span>
              <span className="text-xs opacity-50 truncate">{obj.description}</span>
            </button>
          ))}
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sidebar-fg/30 text-sm">
              No objects found
            </div>
          )}
          {!query && (
            <div className="px-4 py-6 text-center text-sidebar-fg/30 text-sm">
              Start typing to search...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { Search, FileCode, ChevronRight } from 'lucide-react';
import { searchObjects } from '../../services/api';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
import type { ADTObject } from '../../types/adt';

interface ExplorerPanelProps {
  onOpenObject: (name: string, type: string) => void;
}

export function ExplorerPanel({ onOpenObject }: ExplorerPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADTObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const objects = await searchObjects(query);
      setResults(objects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1 bg-editor-bg rounded border border-panel-border">
          <input
            type="text"
            className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="Search objects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="px-1.5 text-sidebar-fg/60 hover:text-sidebar-fg"
            onClick={handleSearch}
          >
            <Icon icon={Search} size={14} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      {error && <div className="px-3 py-2 text-error text-xs">{error}</div>}

      <div className="flex-1 overflow-auto">
        {results.map((obj) => (
          <button
            key={`${obj.type}:${obj.name}`}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 text-left"
            onDoubleClick={() => onOpenObject(obj.name, obj.type)}
          >
            <Icon icon={ChevronRight} size={12} className="text-sidebar-fg/30" />
            <Icon icon={FileCode} size={14} className="text-accent" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{obj.name}</div>
              <div className="text-sidebar-fg/40 truncate">{obj.description}</div>
            </div>
            <span className="text-sidebar-fg/30 text-[10px] uppercase">{obj.type}</span>
          </button>
        ))}
        {!loading && !error && results.length === 0 && query && (
          <div className="px-3 py-4 text-center text-sidebar-fg/30 text-xs">No results</div>
        )}
      </div>
    </div>
  );
}

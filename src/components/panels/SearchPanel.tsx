import { useState, useCallback } from 'react';
import { Search, FileCode } from 'lucide-react';
import { searchObjects } from '../../services/api';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
import type { ADTObject } from '../../types/adt';

interface SearchPanelProps {
  onOpenObject: (name: string, type: string) => void;
}

export function SearchPanel({ onOpenObject }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<ADTObject[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const objects = await searchObjects(query, typeFilter || undefined);
      setResults(objects);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pb-2 space-y-1">
        <div className="flex items-center gap-1 bg-editor-bg rounded border border-panel-border">
          <input
            type="text"
            className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="Search repository..."
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
        <select
          className="w-full bg-editor-bg text-xs px-2 py-1 rounded border border-panel-border text-editor-fg outline-none"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="program">Programs</option>
          <option value="class">Classes</option>
          <option value="interface">Interfaces</option>
          <option value="function">Functions</option>
          <option value="table">Tables</option>
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {results.map((obj) => (
          <button
            key={`${obj.type}:${obj.name}`}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 text-left"
            onDoubleClick={() => onOpenObject(obj.name, obj.type)}
          >
            <Icon icon={FileCode} size={14} className="text-accent" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{obj.name}</div>
              <div className="text-sidebar-fg/40 truncate">{obj.description}</div>
            </div>
            <span className="text-sidebar-fg/30 text-[10px] uppercase">{obj.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

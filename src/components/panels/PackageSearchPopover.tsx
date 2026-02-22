import { useState, useCallback, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { searchObjects } from '../../services/api';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';

interface PackageSearchPopoverProps {
  open: boolean;
  onClose: () => void;
  onSelect: (packageName: string) => void;
}

export function PackageSearchPopover({ open, onClose, onSelect }: PackageSearchPopoverProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ name: string; description: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const objects = await searchObjects(query, 'DEVC/K');
      setResults(objects.map((o) => ({ name: o.name, description: o.description })));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute left-0 right-0 mx-2 mt-1 bg-sidebar-bg border border-panel-border rounded shadow-xl max-h-64 overflow-hidden flex flex-col"
        style={{ top: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 border-b border-panel-border px-2">
          <Icon icon={Search} size={13} className="text-sidebar-fg/40" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-xs px-1 py-2 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="Search packages (e.g. Z* or $TMP)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {loading && <Spinner size={12} />}
        </div>
        <div className="overflow-auto max-h-48">
          {results.map((pkg) => (
            <button
              key={pkg.name}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 text-left"
              onClick={() => {
                onSelect(pkg.name);
                onClose();
              }}
            >
              <span className="font-medium">{pkg.name}</span>
              {pkg.description && (
                <span className="text-sidebar-fg/40 truncate">{pkg.description}</span>
              )}
            </button>
          ))}
          {!loading && results.length === 0 && query && (
            <div className="px-3 py-3 text-center text-sidebar-fg/30 text-xs">
              No packages found. Press Enter to search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

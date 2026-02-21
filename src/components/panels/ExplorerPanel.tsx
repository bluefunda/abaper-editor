import { useState, useCallback } from 'react';
import { Search, FileCode, ChevronRight, ChevronDown, Package, FolderOpen } from 'lucide-react';
import { searchObjects, listPackages } from '../../services/api';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
import type { ADTObject } from '../../types/adt';

interface ExplorerPanelProps {
  onOpenObject: (name: string, type: string) => void;
}

interface PackageNode {
  name: string;
  objects: ADTObject[];
  loading: boolean;
  expanded: boolean;
}

export function ExplorerPanel({ onOpenObject }: ExplorerPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADTObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Package tree state
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [packageFilter, setPackageFilter] = useState('');
  const [packages, setPackages] = useState<PackageNode[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);

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

  const handlePackageSearch = useCallback(async () => {
    if (!packageFilter.trim()) return;
    setPackagesLoading(true);
    setPackagesError(null);
    try {
      const pkgs = await listPackages(packageFilter);
      setPackages(pkgs.map((p) => ({ name: p.name, objects: [], loading: false, expanded: false })));
    } catch (err) {
      setPackagesError(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setPackagesLoading(false);
    }
  }, [packageFilter]);

  const handleExpandPackage = useCallback(async (pkgName: string) => {
    setPackages((prev) =>
      prev.map((p) => {
        if (p.name !== pkgName) return p;
        if (p.expanded) return { ...p, expanded: false };
        // If already loaded objects, just toggle
        if (p.objects.length > 0) return { ...p, expanded: true };
        return { ...p, expanded: true, loading: true };
      }),
    );

    // Check if we need to load objects
    const pkg = packages.find((p) => p.name === pkgName);
    if (pkg && pkg.objects.length > 0) return;

    try {
      const objects = await searchObjects(`*`);
      const filtered = objects.filter(
        (obj) => obj.package?.toUpperCase() === pkgName.toUpperCase(),
      );
      setPackages((prev) =>
        prev.map((p) =>
          p.name === pkgName ? { ...p, objects: filtered, loading: false } : p,
        ),
      );
    } catch {
      setPackages((prev) =>
        prev.map((p) => (p.name === pkgName ? { ...p, loading: false } : p)),
      );
    }
  }, [packages]);

  return (
    <div className="flex flex-col h-full">
      {/* Object search */}
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
        {/* Search results */}
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

        {/* Packages section */}
        <div className="border-t border-panel-border mt-2">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/60 hover:text-sidebar-fg"
            onClick={() => setPackagesOpen(!packagesOpen)}
          >
            <Icon icon={packagesOpen ? ChevronDown : ChevronRight} size={12} />
            <Icon icon={Package} size={14} />
            Packages
          </button>

          {packagesOpen && (
            <div>
              <div className="px-2 pb-2">
                <div className="flex items-center gap-1 bg-editor-bg rounded border border-panel-border">
                  <input
                    type="text"
                    className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
                    placeholder="Filter packages..."
                    value={packageFilter}
                    onChange={(e) => setPackageFilter(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePackageSearch()}
                  />
                  <button
                    className="px-1.5 text-sidebar-fg/60 hover:text-sidebar-fg"
                    onClick={handlePackageSearch}
                  >
                    <Icon icon={Search} size={14} />
                  </button>
                </div>
              </div>

              {packagesLoading && (
                <div className="flex justify-center py-2">
                  <Spinner />
                </div>
              )}

              {packagesError && (
                <div className="px-3 py-1 text-error text-xs">{packagesError}</div>
              )}

              {packages.map((pkg) => (
                <div key={pkg.name}>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 text-left"
                    onClick={() => handleExpandPackage(pkg.name)}
                  >
                    <Icon
                      icon={pkg.expanded ? ChevronDown : ChevronRight}
                      size={12}
                      className="text-sidebar-fg/40"
                    />
                    <Icon icon={FolderOpen} size={14} className="text-yellow-400/70" />
                    <span className="truncate">{pkg.name}</span>
                  </button>

                  {pkg.expanded && (
                    <div className="ml-4">
                      {pkg.loading && (
                        <div className="flex justify-center py-1">
                          <Spinner />
                        </div>
                      )}
                      {!pkg.loading && pkg.objects.length === 0 && (
                        <div className="px-3 py-1 text-sidebar-fg/30 text-xs">No objects</div>
                      )}
                      {pkg.objects.map((obj) => (
                        <button
                          key={`${obj.type}:${obj.name}`}
                          className="w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-white/5 text-left"
                          onDoubleClick={() => onOpenObject(obj.name, obj.type)}
                        >
                          <Icon icon={FileCode} size={13} className="text-accent" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{obj.name}</div>
                          </div>
                          <span className="text-sidebar-fg/30 text-[10px] uppercase">{obj.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

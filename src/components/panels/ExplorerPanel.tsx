import { useState, useCallback, useEffect } from 'react';
import {
  Search, FileCode, ChevronRight, ChevronDown, FolderOpen, Plus, X,
  Box, Circle, Layers, Table, Server, Pencil,
} from 'lucide-react';
import { searchObjects, getPackageContents } from '../../services/api';
import { useSystemStore } from '../../stores/systemStore';
import { useFavoritePackagesStore, type PackageTreeNode } from '../../stores/favoritePackagesStore';
import { PackageSearchPopover } from './PackageSearchPopover';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';
import type { ADTObject } from '../../types/adt';

const EMPTY_STRINGS: string[] = [];
const EMPTY_TREE: Record<string, PackageTreeNode[]> = {};

interface ExplorerPanelProps {
  onOpenObject: (name: string, type: string) => void;
  onAddSystem: () => void;
  onEditSystem: (id: string) => void;
}

const TYPE_ICONS: Record<string, { icon: typeof FileCode; color: string }> = {
  'PROG/P': { icon: FileCode, color: 'text-blue-400' },
  'PROG': { icon: FileCode, color: 'text-blue-400' },
  'CLAS/OC': { icon: Box, color: 'text-purple-400' },
  'CLAS': { icon: Box, color: 'text-purple-400' },
  'INTF/OI': { icon: Circle, color: 'text-cyan-400' },
  'INTF': { icon: Circle, color: 'text-cyan-400' },
  'FUGR/F': { icon: Layers, color: 'text-orange-400' },
  'FUGR': { icon: Layers, color: 'text-orange-400' },
  'TABL/DT': { icon: Table, color: 'text-green-400' },
  'TABL': { icon: Table, color: 'text-green-400' },
  'DEVC/K': { icon: FolderOpen, color: 'text-yellow-400' },
  'DEVC': { icon: FolderOpen, color: 'text-yellow-400' },
};

function getTypeIcon(type: string) {
  return TYPE_ICONS[type] ?? TYPE_ICONS[type.split('/')[0] ?? ''] ?? { icon: FileCode, color: 'text-sidebar-fg/60' };
}

function PackageTreeNodeItem({
  node,
  path,
  depth,
  onOpenObject,
}: {
  node: PackageTreeNode;
  path: string;
  depth: number;
  onOpenObject: (name: string, type: string) => void;
}) {
  const isExpanded = useFavoritePackagesStore((s) => s.expandedPaths.includes(path));
  const isLoading = useFavoritePackagesStore((s) => s.loadingPaths.includes(path));
  const isExpandable = node.expandable;
  const { icon, color } = getTypeIcon(node.type);

  const handleClick = useCallback(async () => {
    if (!isExpandable) return;
    const store = useFavoritePackagesStore.getState();
    store.toggleExpanded(path);

    if (!store.expandedPaths.includes(path) && node.children === undefined) {
      store.setLoading(path, true);
      try {
        const result = await getPackageContents(node.name);
        const children: PackageTreeNode[] = result.nodes.map((n) => ({
          name: n.name,
          type: n.type,
          description: n.description,
          expandable: n.expandable,
          children: undefined,
        }));
        useFavoritePackagesStore.getState().setPackageChildren(path, children);
      } catch {
        useFavoritePackagesStore.getState().setLoading(path, false);
      }
    }
  }, [isExpandable, node, path]);

  const handleDoubleClick = useCallback(() => {
    if (!isExpandable) {
      const baseType = node.type.split('/')[0] ?? node.type;
      onOpenObject(node.name, baseType);
    }
  }, [isExpandable, node, onOpenObject]);

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-1 text-xs hover:bg-white/5 text-left group"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {isExpandable ? (
          <Icon
            icon={isExpanded ? ChevronDown : ChevronRight}
            size={12}
            className="text-sidebar-fg/40 shrink-0"
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon icon={icon} size={14} className={`${color} shrink-0`} />
        <span className="truncate flex-1">{node.name}</span>
        {node.description && (
          <span className="text-sidebar-fg/30 text-[10px] truncate max-w-[80px] mr-1">{node.description}</span>
        )}
        <span className="text-sidebar-fg/20 text-[10px] uppercase shrink-0 mr-1">
          {node.type.split('/')[0]}
        </span>
      </button>

      {isExpandable && isExpanded && (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-1">
              <Spinner />
            </div>
          ) : node.children === undefined ? null : node.children.length === 0 ? (
            <div
              className="text-sidebar-fg/30 text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Empty
            </div>
          ) : (
            node.children.map((child) => (
              <PackageTreeNodeItem
                key={`${path}/${child.name}`}
                node={child}
                path={`${path}/${child.name}`}
                depth={depth + 1}
                onOpenObject={onOpenObject}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ExplorerPanel({ onOpenObject, onAddSystem, onEditSystem }: ExplorerPanelProps) {
  const systems = useSystemStore((s) => s.systems);
  const activeSystemId = useSystemStore((s) => s.activeSystemId);
  const setActiveSystem = useSystemStore((s) => s.setActiveSystem);

  const favoritesBySystem = useFavoritePackagesStore((s) => s.favoritesBySystem);
  const favorites = (activeSystemId ? favoritesBySystem[activeSystemId] : undefined) ?? EMPTY_STRINGS;
  const trees = useFavoritePackagesStore((s) => s.trees) ?? EMPTY_TREE;
  const expandedPaths = useFavoritePackagesStore((s) => s.expandedPaths) ?? EMPTY_STRINGS;
  const loadingPaths = useFavoritePackagesStore((s) => s.loadingPaths) ?? EMPTY_STRINGS;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ADTObject[]>([]);
  const [loading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinPopoverOpen, setPinPopoverOpen] = useState(false);

  // Clear trees when active system changes
  useEffect(() => {
    useFavoritePackagesStore.getState().clearTrees();
  }, [activeSystemId]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setError(null);
    try {
      const objects = await searchObjects(query);
      setResults(objects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  const handleExpandFavorite = useCallback(async (pkgName: string) => {
    const path = pkgName;
    const store = useFavoritePackagesStore.getState();
    store.toggleExpanded(path);

    const isCurrentlyExpanded = store.expandedPaths.includes(path);
    if (!isCurrentlyExpanded && !store.trees[pkgName]) {
      store.setLoading(path, true);
      try {
        const result = await getPackageContents(pkgName);
        const children: PackageTreeNode[] = result.nodes.map((n) => ({
          name: n.name,
          type: n.type,
          description: n.description,
          expandable: n.expandable,
          children: undefined,
        }));
        useFavoritePackagesStore.getState().setPackageChildren(path, children);
      } catch {
        useFavoritePackagesStore.getState().setLoading(path, false);
      }
    }
  }, []);

  const handlePinPackage = useCallback((packageName: string) => {
    const sysId = useSystemStore.getState().activeSystemId;
    if (sysId) {
      useFavoritePackagesStore.getState().addFavorite(sysId, packageName);
    }
  }, []);

  const handleUnpinPackage = useCallback((packageName: string) => {
    const sysId = useSystemStore.getState().activeSystemId;
    if (sysId) {
      useFavoritePackagesStore.getState().removeFavorite(sysId, packageName);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* System selector */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1">
          <div className="flex-1 flex items-center gap-1.5 bg-editor-bg rounded border border-panel-border">
            <Icon icon={Server} size={13} className="text-sidebar-fg/40 ml-2 shrink-0" />
            <select
              className="flex-1 bg-transparent text-xs py-1.5 text-editor-fg outline-none appearance-none cursor-pointer"
              value={activeSystemId ?? ''}
              onChange={(e) => setActiveSystem(e.target.value || null)}
            >
              {systems.length === 0 && <option value="">No systems configured</option>}
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name} {sys.status === 'connected' ? '' : `(${sys.status})`}
                </option>
              ))}
            </select>
          </div>
          {activeSystemId && (
            <button
              className="p-1.5 text-sidebar-fg/60 hover:text-sidebar-fg hover:bg-white/5 rounded"
              onClick={() => onEditSystem(activeSystemId)}
              title="Edit SAP System"
            >
              <Icon icon={Pencil} size={13} />
            </button>
          )}
          <button
            className="p-1.5 text-sidebar-fg/60 hover:text-sidebar-fg hover:bg-white/5 rounded"
            onClick={onAddSystem}
            title="Add SAP System"
          >
            <Icon icon={Plus} size={14} />
          </button>
        </div>
      </div>

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

      <div className="flex-1 overflow-auto">
        {/* Favorite packages section */}
        <div className="border-b border-panel-border">
          <div className="flex items-center px-3 py-1.5">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/60">
              Favorite Packages
            </span>
            <button
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-sidebar-fg/60 hover:text-sidebar-fg hover:bg-white/10 rounded text-xs"
              onClick={() => setPinPopoverOpen(true)}
              title="Pin a package"
            >
              <Icon icon={Plus} size={12} />
              <span>Pin</span>
            </button>
          </div>

          {favorites.length === 0 && (
            <div className="px-3 py-2 text-sidebar-fg/30 text-xs">
              No pinned packages. Click "+ Pin" above to add.
            </div>
          )}

          {favorites.map((pkgName) => {
            const isExpanded = expandedPaths.includes(pkgName);
            const isLoading = loadingPaths.includes(pkgName);
            const children = trees[pkgName];

            return (
              <div key={pkgName}>
                <div className="flex items-center group">
                  <button
                    className="flex-1 flex items-center gap-1.5 py-1 text-xs hover:bg-white/5 text-left pl-2"
                    onClick={() => handleExpandFavorite(pkgName)}
                  >
                    <Icon
                      icon={isExpanded ? ChevronDown : ChevronRight}
                      size={12}
                      className="text-sidebar-fg/40 shrink-0"
                    />
                    <Icon icon={FolderOpen} size={14} className="text-yellow-400/70 shrink-0" />
                    <span className="truncate">{pkgName}</span>
                  </button>
                  <button
                    className="p-1 mr-1 text-sidebar-fg/20 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleUnpinPackage(pkgName)}
                    title="Unpin package"
                  >
                    <Icon icon={X} size={12} />
                  </button>
                </div>

                {isExpanded && (
                  <div>
                    {isLoading ? (
                      <div className="flex justify-center py-1">
                        <Spinner />
                      </div>
                    ) : children === undefined ? null : children.length === 0 ? (
                      <div className="text-sidebar-fg/30 text-xs py-0.5 pl-8">Empty</div>
                    ) : (
                      children.map((child) => (
                        <PackageTreeNodeItem
                          key={`${pkgName}/${child.name}`}
                          node={child}
                          path={`${pkgName}/${child.name}`}
                          depth={1}
                          onOpenObject={onOpenObject}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Search results */}
        {loading && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}

        {error && <div className="px-3 py-2 text-error text-xs">{error}</div>}

        {results.length > 0 && (
          <div className="border-b border-panel-border">
            <div className="px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/60">
                Search Results
              </span>
            </div>
            {results.map((obj) => {
              const { icon, color } = getTypeIcon(obj.type);
              return (
                <button
                  key={`${obj.type}:${obj.name}`}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 text-left"
                  onDoubleClick={() => onOpenObject(obj.name, obj.type)}
                >
                  <Icon icon={icon} size={14} className={color} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{obj.name}</div>
                    <div className="text-sidebar-fg/40 truncate">{obj.description}</div>
                  </div>
                  <span className="text-sidebar-fg/30 text-[10px] uppercase">{obj.type}</span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && !error && results.length === 0 && query && (
          <div className="px-3 py-4 text-center text-sidebar-fg/30 text-xs">No results</div>
        )}
      </div>

      {/* Package search popover */}
      <PackageSearchPopover
        open={pinPopoverOpen}
        onClose={() => setPinPopoverOpen(false)}
        onSelect={handlePinPackage}
      />
    </div>
  );
}

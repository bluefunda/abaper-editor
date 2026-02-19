import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { ABAPObjectType } from '../../types/editor';

interface NewObjectDialogProps {
  open: boolean;
  onClose: () => void;
}

const objectTypes: { value: ABAPObjectType; label: string }[] = [
  { value: 'program', label: 'Program' },
  { value: 'class', label: 'Class' },
  { value: 'interface', label: 'Interface' },
  { value: 'function', label: 'Function Module' },
];

const defaultSource: Record<ABAPObjectType, string> = {
  program: 'REPORT zprogram.\n\nSTART-OF-SELECTION.\n  WRITE: / \'Hello World\'.\n',
  class: [
    'CLASS zcl_myclass DEFINITION',
    '  PUBLIC',
    '  FINAL',
    '  CREATE PUBLIC.',
    '',
    '  PUBLIC SECTION.',
    '    METHODS constructor.',
    '',
    '  PROTECTED SECTION.',
    '  PRIVATE SECTION.',
    'ENDCLASS.',
    '',
    'CLASS zcl_myclass IMPLEMENTATION.',
    '  METHOD constructor.',
    '',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n'),
  interface: [
    'INTERFACE zif_myinterface',
    '  PUBLIC.',
    '',
    '  METHODS my_method',
    '    IMPORTING',
    '      iv_param TYPE string',
    '    RETURNING',
    '      VALUE(rv_result) TYPE string.',
    '',
    'ENDINTERFACE.',
  ].join('\n'),
  function: '"Function Module\n',
  table: '',
  structure: '',
};

export function NewObjectDialog({ open, onClose }: NewObjectDialogProps) {
  const [objectType, setObjectType] = useState<ABAPObjectType>('program');
  const [objectName, setObjectName] = useState('');
  const openTab = useEditorStore((s) => s.openTab);

  const handleCreate = () => {
    if (!objectName.trim()) return;
    const name = objectName.toUpperCase().trim();
    openTab(name, objectType, defaultSource[objectType] ?? '', '');
    onClose();
    setObjectName('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[400px] bg-sidebar-bg border border-panel-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-panel-border">
          <h2 className="text-sm font-semibold">New ABAP Object</h2>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">Object Type</label>
            <select
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none"
              value={objectType}
              onChange={(e) => setObjectType(e.target.value as ABAPObjectType)}
            >
              {objectTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-sidebar-fg/60 mb-1">Object Name</label>
            <input
              type="text"
              className="w-full bg-editor-bg text-sm px-3 py-2 rounded border border-panel-border text-editor-fg outline-none focus:border-accent font-mono uppercase"
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              placeholder="Z_MY_OBJECT"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
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
            className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded disabled:opacity-40"
            onClick={handleCreate}
            disabled={!objectName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

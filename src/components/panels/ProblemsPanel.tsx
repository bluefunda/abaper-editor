import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from '../common/Icon';
import type { DiagnosticItem } from '../../types/editor';

interface ProblemsPanelProps {
  onNavigate: (line: number, column: number) => void;
}

function severityIcon(severity: DiagnosticItem['severity']) {
  switch (severity) {
    case 'error':
      return <Icon icon={AlertCircle} size={14} className="text-error shrink-0" />;
    case 'warning':
      return <Icon icon={AlertTriangle} size={14} className="text-warning shrink-0" />;
    default:
      return <Icon icon={Info} size={14} className="text-info shrink-0" />;
  }
}

export function ProblemsPanel({ onNavigate }: ProblemsPanelProps) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const diagnosticsMap = useEditorStore((s) => s.diagnosticsMap);
  const diagnostics = activeTabId ? diagnosticsMap[activeTabId] ?? [] : [];

  if (diagnostics.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sidebar-fg/30 text-xs">
        No problems detected
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {diagnostics.map((d, i) => (
        <button
          key={i}
          className="flex items-center gap-2 px-3 py-1 hover:bg-white/5 text-left"
          onClick={() => onNavigate(d.startLineNumber, d.startColumn)}
        >
          {severityIcon(d.severity)}
          <span className="flex-1 truncate">{d.message}</span>
          {d.code && <span className="text-sidebar-fg/30">{d.code}</span>}
          <span className="text-sidebar-fg/40 shrink-0">
            [{d.startLineNumber}:{d.startColumn}]
          </span>
          <span className="text-sidebar-fg/30 shrink-0">{d.source}</span>
        </button>
      ))}
    </div>
  );
}

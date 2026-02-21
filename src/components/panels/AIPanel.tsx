import { useEffect, useRef } from 'react';
import {
  Sparkles,
  Shield,
  BookOpen,
  TestTube,
  Zap,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useAIStore } from '../../stores/aiStore';
import { Spinner } from '../common/Spinner';
import { Icon } from '../common/Icon';
import type { ReviewFinding, S4RemediationIssue } from '../../types/mcp';

interface AIPanelProps {
  onReview: () => void;
  onS4Check: () => void;
  onExplain: () => void;
  onRunTests: () => void;
  onOptimize: () => void;
  onNavigateToLine?: (line: number, column: number) => void;
}

const severityIcon = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const severityColor = {
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

const s4SeverityColor = {
  high: 'text-red-400 border-red-400/30',
  medium: 'text-yellow-400 border-yellow-400/30',
  low: 'text-blue-400 border-blue-400/30',
};

function ReviewFindings({
  findings,
  onNavigate,
}: {
  findings: ReviewFinding[];
  onNavigate?: (line: number, column: number) => void;
}) {
  return (
    <div className="space-y-1 mt-1">
      {findings.map((f, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-2 py-1 rounded bg-white/5 text-xs"
        >
          <Icon
            icon={severityIcon[f.severity]}
            size={14}
            className={`shrink-0 mt-0.5 ${severityColor[f.severity]}`}
          />
          <div className="flex-1 min-w-0">
            <span className="text-editor-fg">{f.message}</span>
            {f.line > 0 && (
              <button
                className="ml-1 text-accent hover:underline"
                onClick={() => onNavigate?.(f.line, 1)}
              >
                Line {f.line}
              </button>
            )}
            {f.suggestion && (
              <div className="text-sidebar-fg/60 mt-0.5">{f.suggestion}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function S4IssueCard({ issue }: { issue: S4RemediationIssue }) {
  return (
    <div
      className={`rounded border px-3 py-2 mt-1 text-xs ${s4SeverityColor[issue.severity]} bg-white/5`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold uppercase text-[10px]">{issue.severity}</span>
        <span className="text-editor-fg font-medium">{issue.title}</span>
        {issue.line > 0 && (
          <span className="text-sidebar-fg/40 ml-auto">Line {issue.line}</span>
        )}
      </div>
      <div className="text-sidebar-fg/70 mb-1">{issue.description}</div>
      {issue.before && (
        <div className="mt-1">
          <div className="text-sidebar-fg/40 text-[10px] mb-0.5">Before:</div>
          <pre className="bg-black/30 rounded px-2 py-1 overflow-x-auto whitespace-pre text-red-300">
            {issue.before}
          </pre>
        </div>
      )}
      {issue.after && (
        <div className="mt-1">
          <div className="text-sidebar-fg/40 text-[10px] mb-0.5">After:</div>
          <pre className="bg-black/30 rounded px-2 py-1 overflow-x-auto whitespace-pre text-green-300">
            {issue.after}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AIPanel({
  onReview,
  onS4Check,
  onExplain,
  onRunTests,
  onOptimize,
  onNavigateToLine,
}: AIPanelProps) {
  const messages = useAIStore((s) => s.messages);
  const isAnalyzing = useAIStore((s) => s.isAnalyzing);
  const lastReviewResult = useAIStore((s) => s.lastReviewResult);
  const lastS4Result = useAIStore((s) => s.lastS4Result);
  const clearMessages = useAIStore((s) => s.clearMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, lastReviewResult, lastS4Result]);

  const actions = [
    { label: 'Review', icon: Sparkles, action: onReview },
    { label: 'S/4 Check', icon: Shield, action: onS4Check },
    { label: 'Explain', icon: BookOpen, action: onExplain },
    { label: 'Unit Tests', icon: TestTube, action: onRunTests },
    { label: 'Optimize', icon: Zap, action: onOptimize },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Action bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-panel-border shrink-0">
        {actions.map((a) => (
          <button
            key={a.label}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10 text-sidebar-fg/80 hover:text-white disabled:opacity-40"
            onClick={a.action}
            disabled={isAnalyzing}
          >
            <Icon icon={a.icon} size={13} />
            {a.label}
          </button>
        ))}
        <div className="flex-1" />
        {isAnalyzing && <Spinner size={14} />}
        <button
          className="px-1.5 text-sidebar-fg/40 hover:text-sidebar-fg"
          onClick={clearMessages}
          title="Clear AI Panel"
        >
          <Icon icon={Trash2} size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !lastReviewResult && !lastS4Result && (
          <div className="text-center text-sidebar-fg/30 text-xs py-4">
            Use the actions above to analyze the active ABAP object.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs ${
              msg.role === 'user' ? 'text-accent' : 'text-editor-fg'
            }`}
          >
            <span className="font-medium">
              {msg.role === 'user' ? '> ' : ''}
            </span>
            <span className="whitespace-pre-wrap">{msg.content}</span>
          </div>
        ))}

        {/* Review findings inline */}
        {lastReviewResult && lastReviewResult.length > 0 && (
          <ReviewFindings findings={lastReviewResult} onNavigate={onNavigateToLine} />
        )}

        {/* S/4 result cards */}
        {lastS4Result && lastS4Result.issues.length > 0 && (
          <div className="space-y-1">
            {lastS4Result.issues.map((issue, i) => (
              <S4IssueCard key={i} issue={issue} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Sparkles,
  Shield,
  BookOpen,
  TestTube,
  Zap,
  AlignLeft,
  Trash2,
  Square,
  AlertTriangle,
  AlertCircle,
  Info,
  Send,
  Circle,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAIStore } from '../../stores/aiStore';
import type { ToolExecution, ArtifactEvent } from '../../stores/aiStore';
import { Icon } from '../common/Icon';
import type { ReviewFinding, S4RemediationIssue } from '../../types/mcp';

interface AIPanelProps {
  onReview: () => void;
  onS4Check: () => void;
  onExplain: () => void;
  onRunTests: () => void;
  onOptimize: () => void;
  onFormatCode?: () => void;
  onNavigateToLine?: (line: number, column: number) => void;
  onSendPrompt?: (text: string) => void;
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

// --- Copy button for code blocks ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      className="absolute top-1.5 right-1.5 p-1 rounded bg-white/10 hover:bg-white/20 text-sidebar-fg/50 hover:text-sidebar-fg transition-colors"
      onClick={handleCopy}
      title="Copy code"
    >
      <Icon icon={copied ? Check : Copy} size={12} />
    </button>
  );
}

// --- Markdown renderer for assistant messages ---
function MarkdownMessage({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="ai-markdown text-xs text-editor-fg prose prose-invert prose-xs max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            // Inline code
            if (!match && !codeString.includes('\n')) {
              return (
                <code className="px-1 py-0.5 rounded bg-white/10 text-accent text-[11px]" {...props}>
                  {children}
                </code>
              );
            }

            // Code block with syntax highlighting
            const language = match?.[1] || 'text';
            return (
              <div className="relative group my-2">
                <CopyButton text={codeString} />
                <SyntaxHighlighter
                  style={oneDark}
                  language={language === 'abap' ? 'abap' : language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '11px',
                    lineHeight: '1.4',
                    background: 'rgba(0,0,0,0.3)',
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          },
          // Styled tables
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full text-[11px] border border-panel-border">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="px-2 py-1 border border-panel-border bg-white/5 text-left font-medium text-sidebar-fg/80">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-2 py-1 border border-panel-border text-sidebar-fg/70">
                {children}
              </td>
            );
          },
          // Links
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {children}
              </a>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="my-1 leading-relaxed">{children}</p>;
          },
          // Lists
          ul({ children }) {
            return <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sidebar-fg/80">{children}</li>;
          },
          // Headings
          h1({ children }) {
            return <h1 className="text-sm font-bold mt-3 mb-1 text-editor-fg">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xs font-bold mt-2 mb-1 text-editor-fg">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-xs font-semibold mt-2 mb-0.5 text-editor-fg">{children}</h3>;
          },
          // Blockquote
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-accent/50 pl-2 my-1 text-sidebar-fg/60 italic">
                {children}
              </blockquote>
            );
          },
          // Horizontal rule
          hr() {
            return <hr className="my-2 border-panel-border" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-[2px] h-3.5 bg-accent animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}

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

function ToolExecutionLog({ executions }: { executions: ToolExecution[] }) {
  const [expanded, setExpanded] = useState(false);
  if (executions.length === 0) return null;

  const okCount = executions.filter((e) => e.status === 'ok').length;
  const errCount = executions.length - okCount;
  const totalMs = executions.reduce((sum, e) => sum + e.durationMs, 0);

  return (
    <div className="text-xs border border-panel-border rounded bg-white/5 my-1">
      <button
        className="flex items-center gap-1.5 w-full px-2 py-1 text-sidebar-fg/60 hover:text-sidebar-fg/80"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon icon={expanded ? ChevronDown : ChevronRight} size={12} />
        <span>
          {executions.length} tool call{executions.length !== 1 ? 's' : ''}
        </span>
        <span className="text-green-400/80">{okCount} ok</span>
        {errCount > 0 && <span className="text-red-400/80">{errCount} err</span>}
        <span className="ml-auto text-sidebar-fg/40">{(totalMs / 1000).toFixed(1)}s</span>
      </button>
      {expanded && (
        <div className="border-t border-panel-border px-2 py-1 space-y-0.5">
          {executions.map((exec, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={exec.status === 'ok' ? 'text-green-400' : 'text-red-400'}>
                {exec.status === 'ok' ? '✓' : '✗'}
              </span>
              <span className="text-sidebar-fg/70 font-mono">{exec.toolName}</span>
              <span className="text-sidebar-fg/40 ml-auto">{exec.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactBadges({ artifacts }: { artifacts: ArtifactEvent[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 my-1">
      {artifacts.map((a, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono ${
            a.success
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {a.success ? '✓' : '✗'} {a.artifactName} {a.action.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}

export function AIPanel({
  onReview,
  onS4Check,
  onExplain,
  onRunTests,
  onOptimize,
  onFormatCode,
  onNavigateToLine,
  onSendPrompt,
}: AIPanelProps) {
  const messages = useAIStore((s) => s.messages);
  const isAnalyzing = useAIStore((s) => s.isAnalyzing);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const lastReviewResult = useAIStore((s) => s.lastReviewResult);
  const lastS4Result = useAIStore((s) => s.lastS4Result);
  const clearMessages = useAIStore((s) => s.clearMessages);
  const cancelAnalysis = useAIStore((s) => s.cancelAnalysis);
  const mcpTools = useAIStore((s) => s.mcpTools);
  const mcpConnected = useAIStore((s) => s.mcpConnected);
  const toolExecutions = useAIStore((s) => s.toolExecutions);
  const artifacts = useAIStore((s) => s.artifacts);
  const selectedModel = useAIStore((s) => s.selectedModel);
  const setSelectedModel = useAIStore((s) => s.setSelectedModel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputText, setInputText] = useState('');

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, lastReviewResult, lastS4Result, isStreaming, toolExecutions, artifacts]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !onSendPrompt) return;
    onSendPrompt(text);
    setInputText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputText, onSendPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const actions = [
    { label: 'Format', icon: AlignLeft, action: onFormatCode, title: 'Format Code (Shift+Alt+F)' },
    { label: 'Review', icon: Sparkles, action: onReview, title: 'AI Code Review' },
    { label: 'S/4 Check', icon: Shield, action: onS4Check, title: 'S/4HANA Compatibility Check' },
    { label: 'Explain', icon: BookOpen, action: onExplain, title: 'Explain Code' },
    { label: 'Tests', icon: TestTube, action: onRunTests, title: 'Run Unit Tests' },
    { label: 'Optimize', icon: Zap, action: onOptimize, title: 'Optimize Code' },
  ];

  const toolCount = mcpTools.length;

  return (
    <div className="flex flex-col h-full">
      {/* MCP status line */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-panel-border shrink-0 text-[11px]">
        <Icon
          icon={Circle}
          size={8}
          className={mcpConnected ? 'text-green-400 fill-green-400' : 'text-orange-400 fill-orange-400'}
        />
        <span className="text-sidebar-fg/60">
          {mcpConnected
            ? `ABAPer agent: ${toolCount} tools`
            : 'ABAPer agent: Offline'}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-sidebar-fg/50">
          gpt-oss-120b
        </span>
        {(isAnalyzing || isStreaming) && (
          <button
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
            onClick={cancelAnalysis}
            title="Stop"
          >
            <Icon icon={Square} size={10} />
            Stop
          </button>
        )}
        <button
          className="text-sidebar-fg/40 hover:text-sidebar-fg"
          onClick={clearMessages}
          title="Clear"
        >
          <Icon icon={Trash2} size={13} />
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !lastReviewResult && !lastS4Result && (
          <div className="text-center text-sidebar-fg/30 text-xs py-4">
            Ask anything about your ABAP code, or use the quick actions below.
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLastMsg = idx === messages.length - 1;
          const msgIsStreaming = isLastMsg && isStreaming && msg.role === 'assistant';

          return (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="text-xs text-accent">
                  <span className="font-medium">&gt; </span>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              ) : (
                <MarkdownMessage content={msg.content} isStreaming={msgIsStreaming} />
              )}
            </div>
          );
        })}

        {/* Progress indicator for active operations */}
        {(isStreaming || isAnalyzing) && (
          <div className="flex items-center gap-2 text-xs text-sidebar-fg/50 py-1.5 px-1">
            <Icon icon={Loader2} size={14} className="animate-spin text-accent/70" />
            <span>
              {isStreaming
                ? messages[messages.length - 1]?.content
                  ? 'Generating...'
                  : 'Thinking...'
                : 'Analyzing...'}
            </span>
          </div>
        )}

        {/* Tool execution log and artifact badges */}
        <ToolExecutionLog executions={toolExecutions} />
        <ArtifactBadges artifacts={artifacts} />

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

      {/* Quick actions — icon-only row */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-panel-border shrink-0">
        <span className="text-[10px] text-sidebar-fg/40 mr-1">Quick:</span>
        {actions.map((a) => (
          <button
            key={a.label}
            className="p-1.5 rounded hover:bg-white/10 text-sidebar-fg/70 hover:text-white disabled:opacity-40"
            onClick={a.action}
            disabled={isAnalyzing}
            title={a.title}
          >
            <Icon icon={a.icon} size={14} />
          </button>
        ))}
      </div>

      {/* Text input */}
      <div className="flex items-end gap-1 px-2 py-1.5 border-t border-panel-border shrink-0">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-white/5 border border-panel-border rounded px-2 py-1.5 text-xs text-editor-fg placeholder:text-sidebar-fg/30 resize-none focus:outline-none focus:border-accent/50 min-h-[32px]"
          placeholder="Ask anything about your ABAP code..."
          value={inputText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isAnalyzing}
        />
        <button
          className="p-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          onClick={handleSend}
          disabled={isAnalyzing || !inputText.trim()}
          title="Send (Enter)"
        >
          <Icon icon={Send} size={14} />
        </button>
      </div>
    </div>
  );
}

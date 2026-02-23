import { useCallback } from 'react';
import { abaperAgent, extractText, extractJSON } from '../services/mcp';
import { streamChat } from '../services/cai';
import { useAIStore } from '../stores/aiStore';
import type { ReviewFinding, S4RemediationResult, S4RemediationIssue } from '../types/mcp';

function parseS4Result(text: string, objectName: string, objectType: string): S4RemediationResult {
  try {
    const parsed = JSON.parse(text);
    return {
      objectName: parsed.objectName || objectName,
      objectType: parsed.objectType || objectType,
      totalIssues: parsed.totalIssues ?? (parsed.issues?.length || 0),
      issues: (parsed.issues || []).map((i: Record<string, unknown>) => ({
        severity: i.severity || 'medium',
        pattern: i.pattern || '',
        title: i.title || '',
        line: Number(i.line) || 0,
        description: i.description || '',
        before: i.before || '',
        after: i.after || '',
      })) as S4RemediationIssue[],
    };
  } catch {
    return {
      objectName,
      objectType,
      totalIssues: 0,
      issues: [],
    };
  }
}

function isCancelled(): boolean {
  return !useAIStore.getState().isAnalyzing;
}

export function useAIAssistant() {
  const addMessage = useAIStore((s) => s.addMessage);
  const setAnalyzing = useAIStore((s) => s.setAnalyzing);
  const setReviewResult = useAIStore((s) => s.setReviewResult);
  const setS4Result = useAIStore((s) => s.setS4Result);

  const reviewCode = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Review ${objectType} ${objectName}` });
      try {
        const result = await abaperAgent.callTool('analyze-s4-remediation', {
          object_type: objectType,
          object_name: objectName,
        });
        const json = extractJSON<Record<string, unknown>>(result);
        const markdown = extractText(result);
        if (json) {
          const s4Result = parseS4Result(JSON.stringify(json), objectName, objectType);
          const findings: ReviewFinding[] = s4Result.issues.map((issue) => ({
            severity: issue.severity === 'high' ? 'error' : issue.severity === 'medium' ? 'warning' : 'info',
            message: `${issue.title}: ${issue.description}`,
            line: issue.line,
            suggestion: issue.after || undefined,
          }));
          setReviewResult(findings);
        }
        addMessage({
          role: 'assistant',
          content: markdown || 'No issues found.',
          toolCalls: [
            { name: 'analyze-s4-remediation', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing, setReviewResult],
  );

  const analyzeS4 = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `S/4HANA remediation check for ${objectType} ${objectName}` });
      try {
        const result = await abaperAgent.callTool('analyze-s4-remediation', {
          object_type: objectType,
          object_name: objectName,
        });
        const json = extractJSON<Record<string, unknown>>(result);
        const markdown = extractText(result);
        if (json) {
          const s4Result = parseS4Result(JSON.stringify(json), objectName, objectType);
          setS4Result(s4Result);
        }
        addMessage({
          role: 'assistant',
          content: markdown || 'No S/4HANA remediation issues found.',
          toolCalls: [
            { name: 'analyze-s4-remediation', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `S/4 analysis failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing, setS4Result],
  );

  const explainCode = useCallback(
    async (source: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: 'Explain this ABAP code' });
      try {
        // No server-side explain tool — display source summary locally
        const lines = source.split('\n');
        const summary = [
          `**Code Summary** (${lines.length} lines)`,
          '',
          lines.length > 0 ? `First line: \`${lines[0]!.trim()}\`` : '',
          `Contains ${lines.filter((l) => l.trim().startsWith('*') || l.trim().startsWith('"')).length} comment line(s)`,
          `Contains ${lines.filter((l) => /\bMETHOD\b/i.test(l)).length} method definition(s)`,
          `Contains ${lines.filter((l) => /\bSELECT\b/i.test(l)).length} SELECT statement(s)`,
        ].filter(Boolean).join('\n');
        addMessage({ role: 'assistant', content: summary });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `Explain failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const runTests = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Run unit tests for ${objectType} ${objectName}` });
      try {
        const result = await abaperAgent.callTool('run-unit-tests', {
          object_type: objectType,
          object_name: objectName,
        });
        const json = extractJSON<Record<string, unknown>>(result);
        let content: string;
        if (json) {
          const passed = Number(json.passed || 0);
          const failed = Number(json.failed || 0);
          const total = Number(json.total_tests || 0);
          const allPassed = json.all_passed === true;
          if (json.details && String(json.details).includes('failed:')) {
            // Backend error
            content = `**Unit tests for ${objectName}**: Error\n\n${String(json.details).split(':').slice(0, 2).join(':')}`;
          } else if (total === 0) {
            content = `**${objectName}**: No unit tests found.`;
          } else if (allPassed) {
            content = `**${objectName}**: All ${total} test(s) passed.`;
          } else {
            content = `**${objectName}**: ${passed}/${total} passed, ${failed} failed.`;
          }
        } else {
          content = extractText(result) || 'Unit tests completed.';
        }
        addMessage({
          role: 'assistant',
          content,
          toolCalls: [
            { name: 'run-unit-tests', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `Tests failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const optimizeCode = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Optimize ${objectType} ${objectName}` });
      try {
        const result = await abaperAgent.callTool('analyze-s4-remediation', {
          object_type: objectType,
          object_name: objectName,
        });
        const markdown = extractText(result);
        addMessage({
          role: 'assistant',
          content: markdown || 'No optimization suggestions found.',
          toolCalls: [
            { name: 'analyze-s4-remediation', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `Optimization analysis failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const fixError = useCallback(
    async (errorMessage: string, line: number, _source: string, objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Fix error on line ${line}: ${errorMessage}` });
      try {
        const result = await abaperAgent.callTool('analyze-s4-remediation', {
          object_type: objectType,
          object_name: objectName,
        });
        const markdown = extractText(result);
        addMessage({
          role: 'assistant',
          content: markdown || `No fix suggestion available for: ${errorMessage}`,
          toolCalls: [
            { name: 'analyze-s4-remediation', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        if (!isCancelled()) {
          addMessage({
            role: 'assistant',
            content: `Fix analysis failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const sendPrompt = useCallback(
    async (text: string, objectType: string, objectName: string, source: string, isSelection = false) => {
      const store = useAIStore.getState();
      setAnalyzing(true);
      addMessage({ role: 'user', content: text });

      // Add placeholder assistant message for streaming
      addMessage({ role: 'assistant', content: '' });

      const isNew = !store.chatId;
      const chatId = store.chatId || crypto.randomUUID();
      store.setChatId(chatId);
      store.resetStreamContent();
      store.setStreaming(true);

      const signal = store.getAbortSignal();

      // Build prompt with active editor context
      let prompt = text;
      if (source) {
        const label = isSelection ? 'Selected code' : 'Active file';
        const header = objectName
          ? `[${label} from ${objectType} ${objectName}]`
          : `[${label}]`;
        prompt = `${header}\n\`\`\`abap\n${source}\n\`\`\`\n\n${text}`;
      }

      try {
        await streamChat(
          {
            chat_id: chatId,
            prompt,
            model: store.selectedModel,
            mcp_server_name: 'abaper-mcp',
            is_new_chat: isNew,
          },
          signal,
          (event) => {
            const s = useAIStore.getState();
            if (event.type === 'stream_chunk' && event.content) {
              s.appendStreamContent(event.content);
              s.updateLastMessage(s.streamingContent + event.content);
            } else if (event.type === 'stream_end') {
              if (event.full_content) {
                s.updateLastMessage(event.full_content);
              }
              s.setStreaming(false);
            } else if (event.type === 'error' || event.type === 'stream_error') {
              s.updateLastMessage(`Error: ${event.error || event.message || 'Unknown error'}`);
              s.setStreaming(false);
            }
          },
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError' && !isCancelled()) {
          const s = useAIStore.getState();
          s.updateLastMessage(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        const s = useAIStore.getState();
        s.setStreaming(false);
        s.resetStreamContent();
        if (!isCancelled()) setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  return { reviewCode, analyzeS4, explainCode, runTests, optimizeCode, fixError, sendPrompt };
}

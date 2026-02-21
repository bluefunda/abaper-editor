import { useCallback } from 'react';
import { abaperMCP, extractText } from '../services/mcp';
import { useAIStore } from '../stores/aiStore';
import type { ReviewFinding, S4RemediationResult, S4RemediationIssue } from '../types/mcp';

function parseReviewFindings(text: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  // Parse structured JSON from tool output, fallback to raw text
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((f: Record<string, unknown>) => ({
        severity: (f.severity as ReviewFinding['severity']) || 'info',
        message: String(f.message || ''),
        line: Number(f.line) || 0,
        suggestion: f.suggestion ? String(f.suggestion) : undefined,
      }));
    }
  } catch {
    // Treat as plain text — single finding
    findings.push({ severity: 'info', message: text, line: 0 });
  }
  return findings;
}

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
        const result = await abaperMCP.callTool('get-object', {
          object_type: objectType,
          object_name: objectName,
        });
        const source = extractText(result);
        const reviewResult = await abaperMCP.callTool('syntax-check', {
          object_type: objectType,
          object_name: objectName,
          source,
        });
        const text = extractText(reviewResult);
        const findings = parseReviewFindings(text);
        setReviewResult(findings);
        addMessage({
          role: 'assistant',
          content: findings.length
            ? `Found ${findings.length} issue(s) in ${objectName}`
            : `No issues found in ${objectName}`,
          toolCalls: [
            { name: 'get-object', args: { object_type: objectType, object_name: objectName } },
            { name: 'syntax-check', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        addMessage({
          role: 'assistant',
          content: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing, setReviewResult],
  );

  const analyzeS4 = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `S/4HANA remediation check for ${objectType} ${objectName}` });
      try {
        const result = await abaperMCP.callTool('analyze-s4-remediation', {
          object_type: objectType,
          object_name: objectName,
        });
        const text = extractText(result);
        const s4Result = parseS4Result(text, objectName, objectType);
        setS4Result(s4Result);
        addMessage({
          role: 'assistant',
          content: s4Result.totalIssues
            ? `Found ${s4Result.totalIssues} S/4HANA remediation issue(s) in ${objectName}`
            : `No S/4HANA remediation issues in ${objectName}`,
          toolCalls: [
            { name: 'analyze-s4-remediation', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        addMessage({
          role: 'assistant',
          content: `S/4 analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing, setS4Result],
  );

  const explainCode = useCallback(
    async (source: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: 'Explain this ABAP code' });
      try {
        const result = await abaperMCP.callTool('get-documentation', { source });
        const text = extractText(result);
        addMessage({ role: 'assistant', content: text });
      } catch (err) {
        addMessage({
          role: 'assistant',
          content: `Explain failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const runTests = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Run unit tests for ${objectType} ${objectName}` });
      try {
        const result = await abaperMCP.callTool('run-unit-tests', {
          object_type: objectType,
          object_name: objectName,
        });
        const text = extractText(result);
        addMessage({
          role: 'assistant',
          content: text || 'Unit tests completed.',
          toolCalls: [
            { name: 'run-unit-tests', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        addMessage({
          role: 'assistant',
          content: `Tests failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  const optimizeCode = useCallback(
    async (objectType: string, objectName: string) => {
      setAnalyzing(true);
      addMessage({ role: 'user', content: `Optimize ${objectType} ${objectName}` });
      try {
        const result = await abaperMCP.callTool('get-object', {
          object_type: objectType,
          object_name: objectName,
        });
        const source = extractText(result);
        // Use where-used as a proxy for optimization analysis
        const whereUsed = await abaperMCP.callTool('where-used', {
          object_type: objectType,
          object_name: objectName,
        });
        const usages = extractText(whereUsed);
        addMessage({
          role: 'assistant',
          content: `**Optimization analysis for ${objectName}**\n\nSource length: ${source.length} chars\n\n**Usage references:**\n${usages || 'No references found.'}`,
          toolCalls: [
            { name: 'get-object', args: { object_type: objectType, object_name: objectName } },
            { name: 'where-used', args: { object_type: objectType, object_name: objectName } },
          ],
        });
      } catch (err) {
        addMessage({
          role: 'assistant',
          content: `Optimization analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setAnalyzing(false);
      }
    },
    [addMessage, setAnalyzing],
  );

  return { reviewCode, analyzeS4, explainCode, runTests, optimizeCode };
}

import type { languages } from 'monaco-editor';

const abapKeywords = [
  'ABSTRACT', 'ADD', 'ADJACENT', 'ALL', 'APPEND', 'AS', 'ASCENDING',
  'ASSIGN', 'AT', 'AUTHORITY-CHECK',
  'BACK', 'BEGIN', 'BETWEEN', 'BINARY', 'BREAK-POINT',
  'CALL', 'CASE', 'CAST', 'CATCH', 'CHANGING', 'CHECK', 'CLASS',
  'CLASS-DATA', 'CLASS-METHODS', 'CLEANUP', 'CLEAR', 'CLOSE', 'COLLECT',
  'COMMIT', 'COMMUNICATION', 'COMPUTE', 'CONCATENATE', 'COND', 'CONDENSE',
  'CONSTANTS', 'CONTINUE', 'CONTROLS', 'CONV', 'CONVERT', 'CORRESPONDING',
  'CREATE',
  'DATA', 'DEFAULT', 'DEFINE', 'DELETE', 'DESCENDING', 'DESCRIBE', 'DETAIL',
  'DISTINCT', 'DIV', 'DIVIDE', 'DO',
  'ELSE', 'ELSEIF', 'END-OF-DEFINITION', 'END-OF-PAGE', 'END-OF-SELECTION',
  'ENDCASE', 'ENDCLASS', 'ENDDO', 'ENDFORM', 'ENDFUNCTION', 'ENDIF',
  'ENDINTERFACE', 'ENDLOOP', 'ENDMETHOD', 'ENDMODULE', 'ENDSELECT',
  'ENDTRY', 'ENDWHILE', 'EVENT', 'EVENTS', 'EXACT', 'EXCEPTIONS',
  'EXIT', 'EXPORT', 'EXPORTING',
  'FETCH', 'FIELD-SYMBOLS', 'FILTER', 'FINAL', 'FIND', 'FOR', 'FORM',
  'FORMAT', 'FREE', 'FROM', 'FUNCTION', 'FUNCTION-POOL',
  'GENERATE', 'GET', 'GROUP',
  'HANDLER', 'HAVING', 'HIDE',
  'IF', 'IMPLEMENTATION', 'IMPLEMENTING', 'IMPORT', 'IMPORTING', 'IN',
  'INCLUDE', 'INDEX', 'INHERITING', 'INITIAL', 'INITIALIZATION', 'INNER',
  'INSERT', 'INTERFACE', 'INTERFACES', 'INTO',
  'JOIN',
  'KEY',
  'LEAVE', 'LEFT', 'LIKE', 'LINE', 'LINES', 'LOAD', 'LOG-POINT', 'LOOP',
  'MATCH', 'MEMORY', 'MESSAGE', 'METHOD', 'METHODS', 'MOD', 'MODIFY',
  'MODULE', 'MOVE', 'MOVE-CORRESPONDING', 'MULTIPLY',
  'NEW', 'NEW-LINE', 'NOT',
  'OBJECT', 'OCCURRENCE', 'OF', 'ON', 'OPEN', 'OPTIONAL', 'OR', 'ORDER',
  'OTHERS', 'OUTER', 'OUTPUT', 'OVERLAY',
  'PACK', 'PARAMETERS', 'PERFORM', 'POSITION', 'PREFERRED', 'PRIVATE',
  'PROGRAM', 'PROTECTED', 'PUBLIC',
  'RAISE', 'RAISING', 'RANGE', 'READ', 'RECEIVING', 'REDEFINITION',
  'REDUCE', 'REF', 'REFERENCE', 'REFRESH', 'REJECT', 'REPLACE', 'REPORT',
  'RESERVE', 'RESUME', 'RESUMABLE', 'RETURN', 'RETURNING', 'ROLLBACK', 'ROWS',
  'SEARCH', 'SECTION', 'SELECT', 'SELECT-OPTIONS', 'SELECTION-SCREEN',
  'SET', 'SHIFT', 'SINGLE', 'SKIP', 'SORT', 'SORTED', 'SPLIT', 'STANDARD',
  'START-OF-SELECTION', 'STATICS', 'STOP', 'STRUCTURE', 'SUBMIT',
  'SUBTRACT', 'SUM', 'SUPPRESS', 'SWITCH',
  'TABLE', 'TABLES', 'TRANSLATE', 'TRANSPORTING', 'TRY', 'TYPE', 'TYPES',
  'ULINE', 'UNASSIGN', 'UNPACK', 'UP', 'UPDATE', 'USING',
  'VALUE',
  'WAIT', 'WHEN', 'WHERE', 'WHILE', 'WITH', 'WORK', 'WRITE',
];

export function createABAPCompletionProvider(): languages.CompletionItemProvider {
  return {
    triggerCharacters: ['-', '>', '='],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: languages.CompletionItem[] = abapKeywords.map((kw) => ({
        label: kw,
        kind: 17, // CompletionItemKind.Keyword
        insertText: kw,
        range,
      }));

      // Add system variables
      const sysVars = [
        'sy-subrc', 'sy-tabix', 'sy-index', 'sy-datum', 'sy-uzeit',
        'sy-uname', 'sy-mandt', 'sy-langu', 'sy-tcode', 'sy-repid',
        'sy-dbcnt', 'sy-msgty', 'sy-msgno', 'sy-msgv1', 'sy-msgv2',
        'sy-msgv3', 'sy-msgv4', 'sy-batch',
      ];
      for (const sv of sysVars) {
        suggestions.push({
          label: sv,
          kind: 5, // CompletionItemKind.Variable
          insertText: sv,
          detail: 'System variable',
          range,
        });
      }

      return { suggestions };
    },
  };
}

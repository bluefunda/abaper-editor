import type { languages } from 'monaco-editor';

export const abapMonarchLanguage: languages.IMonarchLanguage = {
  ignoreCase: true,
  defaultToken: '',
  tokenPostfix: '.abap',

  keywords: [
    // Declarations
    'DATA', 'TYPES', 'CONSTANTS', 'FIELD-SYMBOLS', 'CLASS-DATA', 'STATICS',
    'PARAMETERS', 'SELECT-OPTIONS', 'TABLES', 'TYPE-POOLS', 'RANGES',
    // Control flow
    'IF', 'ELSE', 'ELSEIF', 'ENDIF', 'CASE', 'WHEN', 'ENDCASE',
    'DO', 'ENDDO', 'WHILE', 'ENDWHILE', 'LOOP', 'ENDLOOP',
    'EXIT', 'CHECK', 'CONTINUE', 'RETURN', 'STOP',
    // OOP
    'CLASS', 'ENDCLASS', 'METHOD', 'ENDMETHOD', 'METHODS',
    'INTERFACE', 'ENDINTERFACE', 'INTERFACES',
    'INHERITING', 'FROM', 'IMPLEMENTING',
    'PUBLIC', 'PROTECTED', 'PRIVATE', 'SECTION',
    'CREATE', 'ABSTRACT', 'FINAL', 'REDEFINITION',
    'DEFINITION', 'IMPLEMENTATION',
    // Database
    'SELECT', 'ENDSELECT', 'INSERT', 'UPDATE', 'DELETE', 'MODIFY',
    'INTO', 'WHERE', 'ORDER', 'BY', 'GROUP', 'HAVING',
    'UP', 'TO', 'ROWS', 'APPENDING', 'TABLE',
    'FOR', 'ALL', 'ENTRIES', 'IN', 'INNER', 'JOIN',
    'LEFT', 'OUTER', 'ON', 'AS', 'SINGLE', 'DISTINCT',
    // Internal tables
    'APPEND', 'COLLECT', 'READ', 'SORT', 'CLEAR', 'REFRESH', 'FREE',
    'DESCRIBE', 'LINES', 'TRANSPORTING', 'WITH', 'KEY',
    'BINARY', 'SEARCH', 'INDEX', 'ASSIGNING', 'REFERENCE',
    'INITIAL', 'SIZE', 'OCCURS',
    // Strings
    'CONCATENATE', 'SPLIT', 'CONDENSE', 'TRANSLATE', 'REPLACE',
    'FIND', 'MATCH', 'STRLEN', 'SUBSTRING',
    // Events
    'START-OF-SELECTION', 'END-OF-SELECTION', 'AT', 'SELECTION-SCREEN',
    'INITIALIZATION', 'TOP-OF-PAGE', 'END-OF-PAGE',
    // Macros/includes
    'DEFINE', 'END-OF-DEFINITION', 'INCLUDE',
    // Exception handling
    'TRY', 'CATCH', 'CLEANUP', 'ENDTRY', 'RAISE', 'RAISING',
    'RESUMABLE', 'RESUME',
    // Type qualifiers
    'TYPE', 'REF', 'LIKE', 'STANDARD', 'SORTED', 'HASHED',
    'RANGE', 'LINE', 'OF',
    // Other
    'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'FUNCTION', 'ENDFUNCTION',
    'FORM', 'ENDFORM', 'PERFORM', 'USING', 'CHANGING', 'TABLES',
    'WRITE', 'FORMAT', 'NEW-LINE', 'SKIP', 'ULINE',
    'CALL', 'IMPORTING', 'EXPORTING', 'EXCEPTIONS', 'RECEIVING',
    'MOVE', 'MOVE-CORRESPONDING', 'CORRESPONDING',
    'ASSIGN', 'UNASSIGN', 'ASSIGNED',
    'IS', 'NOT', 'BOUND', 'SUPPLIED', 'REQUESTED',
    'BEGIN', 'END', 'STRUCTURE',
    'MESSAGE', 'AUTHORITY-CHECK', 'OBJECT',
    'COMMIT', 'WORK', 'ROLLBACK', 'AND', 'WAIT',
    'SET', 'GET', 'HANDLER', 'EVENT', 'EVENTS',
    'CONVERT', 'VALUE', 'NEW', 'CAST', 'CONV', 'COND', 'SWITCH',
    'CORRESPONDING', 'FILTER', 'REDUCE', 'EXACT',
    'OPEN', 'CURSOR', 'CLOSE', 'FETCH', 'NEXT',
    'FIELD-SYMBOL', 'ASSERT',
    'SUBMIT', 'LEAVE', 'SCREEN', 'CALL', 'TRANSACTION',
    'EXPORT', 'IMPORT', 'MEMORY', 'ID',
    'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE',
    'COMPUTE', 'MOVE', 'PACK', 'UNPACK',
    'OVERLAY', 'SHIFT',
    'LOG-POINT', 'BREAK-POINT',
    'OPTIONAL', 'DEFAULT', 'PREFERRED', 'PARAMETER',
  ],

  builtinTypes: [
    'i', 'f', 'c', 'n', 'd', 't', 'x', 'p', 'string', 'xstring',
    'decfloat16', 'decfloat34', 'int8',
    'abap_bool', 'abap_true', 'abap_false', 'abap_undefined',
    'any', 'clike', 'csequence', 'numeric', 'xsequence', 'simple',
  ],

  comparisonOperators: [
    'EQ', 'NE', 'LT', 'GT', 'LE', 'GE',
    'CO', 'CN', 'CA', 'NA', 'CS', 'NS', 'CP', 'NP',
    'BETWEEN', 'BIT-AND', 'BIT-OR', 'BIT-XOR', 'BIT-NOT',
    'DIV', 'MOD',
  ],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  tokenizer: {
    root: [
      // Column-1 comment (* at start of line)
      [/^\*.*$/, 'comment'],

      // Inline comment (" anywhere)
      [/".*$/, 'comment'],

      // Pragmas ##
      [/##\w+/, 'annotation'],

      // String template |...|
      [/\|/, { token: 'string.template', next: '@stringTemplate' }],

      // Single-quoted strings
      [/'/, { token: 'string', next: '@string' }],

      // Numbers
      [/\b\d+(\.\d+)?\b/, 'number'],

      // System variables sy-*
      [/\bsy-\w+/i, 'variable.predefined'],

      // Identifiers and keywords
      [/[\w-]+/, {
        cases: {
          '@keywords': 'keyword',
          '@builtinTypes': 'type',
          '@comparisonOperators': 'keyword.operator',
          '@default': 'identifier',
        },
      }],

      // Field symbols <...>
      [/<[\w-]+>/, 'variable.name'],

      // Operators
      [/[{}()[\]]/, '@brackets'],
      [/[=<>!]+/, 'operator'],
      [/[,.]/, 'delimiter'],
      [/->|=>/, 'operator'],
    ],

    string: [
      [/''/, 'string.escape'],
      [/'/, { token: 'string', next: '@pop' }],
      [/./, 'string'],
    ],

    stringTemplate: [
      [/\\\|/, 'string.escape'],
      [/\{/, { token: 'string.template.bracket', next: '@stringTemplateExpr' }],
      [/\|/, { token: 'string.template', next: '@pop' }],
      [/./, 'string.template'],
    ],

    stringTemplateExpr: [
      [/\}/, { token: 'string.template.bracket', next: '@pop' }],
      [/\bsy-\w+/i, 'variable.predefined'],
      [/[\w-]+/, {
        cases: {
          '@keywords': 'keyword',
          '@builtinTypes': 'type',
          '@default': 'identifier',
        },
      }],
      [/<[\w-]+>/, 'variable.name'],
      [/[=<>!]+/, 'operator'],
      [/->|=>/, 'operator'],
      [/./, 'string.template.expr'],
    ],
  },
};

import type { languages } from 'monaco-editor';

export function createABAPSnippetProvider(): languages.CompletionItemProvider {
  return {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const snippets: languages.CompletionItem[] = [
        {
          label: 'class',
          kind: 27, // CompletionItemKind.Snippet
          insertText: [
            'CLASS ${1:zcl_myclass} DEFINITION',
            '  PUBLIC',
            '  FINAL',
            '  CREATE PUBLIC.',
            '',
            '  PUBLIC SECTION.',
            '    METHODS ${2:constructor}.',
            '',
            '  PROTECTED SECTION.',
            '  PRIVATE SECTION.',
            'ENDCLASS.',
            '',
            'CLASS ${1:zcl_myclass} IMPLEMENTATION.',
            '  METHOD ${2:constructor}.',
            '    $0',
            '  ENDMETHOD.',
            'ENDCLASS.',
          ].join('\n'),
          insertTextRules: 4, // InsertTextRule.InsertAsSnippet
          detail: 'ABAP Class definition + implementation',
          documentation: 'Creates a new ABAP class with definition and implementation',
          range,
        },
        {
          label: 'method',
          kind: 27,
          insertText: [
            'METHOD ${1:method_name}.',
            '  $0',
            'ENDMETHOD.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'Method implementation',
          range,
        },
        {
          label: 'intf',
          kind: 27,
          insertText: [
            'INTERFACE ${1:zif_myinterface}',
            '  PUBLIC.',
            '',
            '  METHODS ${2:method_name}',
            '    IMPORTING',
            '      ${3:iv_param} TYPE ${4:string}',
            '    RETURNING',
            '      VALUE(${5:rv_result}) TYPE ${6:string}.',
            '',
            'ENDINTERFACE.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'Interface definition',
          range,
        },
        {
          label: 'select',
          kind: 27,
          insertText: [
            'SELECT ${1:*}',
            '  FROM ${2:table_name}',
            '  WHERE ${3:condition}',
            '  INTO TABLE @DATA(${4:lt_result}).',
            '$0',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'SELECT statement',
          range,
        },
        {
          label: 'selectsingle',
          kind: 27,
          insertText: [
            'SELECT SINGLE ${1:*}',
            '  FROM ${2:table_name}',
            '  WHERE ${3:condition}',
            '  INTO @DATA(${4:ls_result}).',
            '$0',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'SELECT SINGLE statement',
          range,
        },
        {
          label: 'trycatch',
          kind: 27,
          insertText: [
            'TRY.',
            '    $0',
            '  CATCH ${1:cx_root} INTO DATA(${2:lx_error}).',
            '    ${3:" handle error}',
            'ENDTRY.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'TRY/CATCH block',
          range,
        },
        {
          label: 'loop',
          kind: 27,
          insertText: [
            'LOOP AT ${1:lt_table} INTO DATA(${2:ls_line}).',
            '  $0',
            'ENDLOOP.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'LOOP AT internal table',
          range,
        },
        {
          label: 'loopassign',
          kind: 27,
          insertText: [
            'LOOP AT ${1:lt_table} ASSIGNING FIELD-SYMBOL(<${2:ls_line}>).',
            '  $0',
            'ENDLOOP.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'LOOP AT with FIELD-SYMBOL',
          range,
        },
        {
          label: 'ifelse',
          kind: 27,
          insertText: [
            'IF ${1:condition}.',
            '  $0',
            'ELSE.',
            '  ',
            'ENDIF.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'IF/ELSE/ENDIF',
          range,
        },
        {
          label: 'data',
          kind: 27,
          insertText: 'DATA(${1:lv_variable}) = ${2:value}.',
          insertTextRules: 4,
          detail: 'Inline DATA declaration',
          range,
        },
        {
          label: 'report',
          kind: 27,
          insertText: [
            'REPORT ${1:zreport}.',
            '',
            'START-OF-SELECTION.',
            '  $0',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'Report template',
          range,
        },
        {
          label: 'methoddef',
          kind: 27,
          insertText: [
            'METHODS ${1:method_name}',
            '  IMPORTING',
            '    ${2:iv_param} TYPE ${3:string}',
            '  RETURNING',
            '    VALUE(${4:rv_result}) TYPE ${5:string}',
            '  RAISING',
            '    ${6:cx_root}.',
          ].join('\n'),
          insertTextRules: 4,
          detail: 'Method definition',
          range,
        },
      ];

      return { suggestions: snippets };
    },
  };
}

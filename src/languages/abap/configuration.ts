import type { languages } from 'monaco-editor';

export const abapLanguageConfiguration: languages.LanguageConfiguration = {
  comments: {
    lineComment: '"',
  },
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '|', close: '|', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'" },
    { open: '|', close: '|' },
  ],
  wordPattern: /(-?\d*\.\d\w*)|([^\s`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g,
  indentationRules: {
    increaseIndentPattern:
      /^\s*(IF|ELSE|ELSEIF|DO|WHILE|LOOP|CASE|WHEN|TRY|CATCH|CLEANUP|METHOD|CLASS|FORM|FUNCTION|MODULE|SELECT|AT|DEFINE)\b/i,
    decreaseIndentPattern:
      /^\s*(ENDIF|ENDDO|ENDWHILE|ENDLOOP|ENDCASE|ENDTRY|ENDMETHOD|ENDCLASS|ENDFORM|ENDFUNCTION|ENDMODULE|ENDSELECT|ENDAT|END-OF-DEFINITION|ELSE|ELSEIF|WHEN|CATCH|CLEANUP)\b/i,
  },
  folding: {
    markers: {
      start: /^\s*(IF|DO|WHILE|LOOP|CASE|TRY|METHOD|CLASS|FORM|FUNCTION|SELECT|DEFINE)\b/i,
      end: /^\s*(ENDIF|ENDDO|ENDWHILE|ENDLOOP|ENDCASE|ENDTRY|ENDMETHOD|ENDCLASS|ENDFORM|ENDFUNCTION|ENDSELECT|END-OF-DEFINITION)\b/i,
    },
  },
};

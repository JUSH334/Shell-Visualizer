/*
 * shell.l: Lexical analyzer for the shell.
 */

%{
#include <cstring>
#include "y.tab.h"
%}

%option noyywrap

%%

\n      { return NEWLINE; }

[ \t]   { /* Discard spaces and tabs */ }

">>&"   { return GREATGREATAMPERSAND; }

">>"    { return GREATGREAT; }

">&"    { return GREATAMPERSAND; }

">"     { return GREAT; }

"<"     { return LESS; }

"|"     { return PIPE; }

"&"     { return AMPERSAND; }

[^ \t\n][^ \t\n]*  {
                yylval.string_val = strdup(yytext);
                return WORD;
        }

.       { return NOTOKEN; }

%%

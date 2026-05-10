/*
 * shell.y: Parser for the shell.
 */

%{
#include <cstdio>
#include <cstring>
#include "command.h"

void yyerror(const char *s);
int yylex();
%}

%union {
    char *string_val;
}

%token <string_val> WORD
%token NOTOKEN GREAT LESS NEWLINE GREATGREAT GREATAMPERSAND
%token GREATGREATAMPERSAND PIPE AMPERSAND

%%

goal:
    command_list
    ;

command_list:
    command_list command_line
    |
    ;

command_line:
    pipe_list io_modifier_list background_optional NEWLINE {
        Command::_currentCommand.execute();
    }
    | NEWLINE {
        Command::_currentCommand.prompt();
    }
    | error NEWLINE {
        yyerrok;
        Command::_currentCommand.clear();
        Command::_currentCommand.prompt();
    }
    ;

pipe_list:
    pipe_list PIPE cmd_and_args
    | cmd_and_args
    ;

cmd_and_args:
    WORD {
        Command::_currentSimpleCommand = new SimpleCommand();
        Command::_currentSimpleCommand->insertArgument($1);
    } arg_list {
        Command::_currentCommand.insertSimpleCommand(
            Command::_currentSimpleCommand);
    }
    ;

arg_list:
    arg_list WORD {
        Command::_currentSimpleCommand->insertArgument($2);
    }
    |
    ;

io_modifier_list:
    io_modifier_list io_modifier
    |
    ;

io_modifier:
    GREAT WORD {
        Command::_currentCommand._outFile = $2;
        Command::_currentCommand._append = 0;
    }
    | GREATGREAT WORD {
        Command::_currentCommand._outFile = $2;
        Command::_currentCommand._append = 1;
    }
    | LESS WORD {
        Command::_currentCommand._inputFile = $2;
    }
    | GREATAMPERSAND WORD {
        Command::_currentCommand._outFile = $2;
        Command::_currentCommand._errFile = strdup($2);
        Command::_currentCommand._append = 0;
    }
    | GREATGREATAMPERSAND WORD {
        Command::_currentCommand._outFile = $2;
        Command::_currentCommand._errFile = strdup($2);
        Command::_currentCommand._append = 1;
    }
    ;

background_optional:
    AMPERSAND {
        Command::_currentCommand._background = 1;
    }
    |
    ;

%%

void yyerror(const char *s) {
    fprintf(stderr, "%s\n", s);
}

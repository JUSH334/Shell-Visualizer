/*
 * main.cc: Entry point for the shell.
 */

#include <cstdio>
#include "command.h"

int yyparse(void);

int main() {
    // Initialize job table
    _jobTable.init();

    // Set up signal handlers for job control
    setupSignalHandlers();

    Command::_currentCommand.prompt();
    yyparse();
    return 0;
}

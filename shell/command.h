#ifndef COMMAND_H
#define COMMAND_H

#include <sys/types.h>

// ============================================================
// Job Control
// ============================================================

#define MAX_JOBS 64

enum JobStatus {
    JOB_RUNNING,
    JOB_STOPPED,
    JOB_DONE
};

struct Job {
    int id;
    pid_t pgid;
    char *command;
    enum JobStatus status;
    int background;
};

struct JobTable {
    struct Job jobs[MAX_JOBS];
    int numJobs;

    void init();
    int addJob(pid_t pgid, const char *cmd, int bg);
    void removeJob(int id);
    Job *findJob(int id);
    Job *findJobByPgid(pid_t pgid);
    void printJobs();
    int nextId();
    void checkDoneJobs();
};

extern JobTable _jobTable;

// ============================================================
// SimpleCommand & Command
// ============================================================

struct SimpleCommand {
    int _numberOfAvailableArguments;
    int _numberOfArguments;
    char **_arguments;

    SimpleCommand();
    void insertArgument(char *argument);
};

struct Command {
    int _numberOfAvailableSimpleCommands;
    int _numberOfSimpleCommands;
    SimpleCommand **_simpleCommands;

    char *_outFile;
    char *_inputFile;
    char *_errFile;
    int _background;
    int _append;

    void prompt();
    void execute();
    void clear();

    Command();
    void insertSimpleCommand(SimpleCommand *simpleCommand);

    static Command _currentCommand;
    static SimpleCommand *_currentSimpleCommand;
};

void setupSignalHandlers();

#endif

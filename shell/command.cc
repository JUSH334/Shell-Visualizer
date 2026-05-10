#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <signal.h>
#include <errno.h>

#include "command.h"

// ============================================================
// Global job table
// ============================================================
JobTable _jobTable;

// ============================================================
// Signal Handlers
// ============================================================

void sigchld_handler(int sig) {
    // Reap zombie children and update job statuses
    int status;
    pid_t pid;
    while ((pid = waitpid(-1, &status, WNOHANG | WUNTRACED | WCONTINUED)) > 0) {
        Job *j = _jobTable.findJobByPgid(pid);
        if (!j) continue;

        if (WIFSTOPPED(status)) {
            j->status = JOB_STOPPED;
        } else if (WIFCONTINUED(status)) {
            j->status = JOB_RUNNING;
        } else {
            // Exited or killed
            j->status = JOB_DONE;
        }
    }
}

void setupSignalHandlers() {
    struct sigaction sa;

    // SIGCHLD — reap children
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART | SA_NOCLDSTOP;
    sigaction(SIGCHLD, &sa, NULL);

    // SIGINT (Ctrl+C) — ignore in parent shell
    signal(SIGINT, SIG_IGN);

    // SIGTSTP (Ctrl+Z) — ignore in parent shell
    signal(SIGTSTP, SIG_IGN);

    // SIGTTOU — ignore so we can call tcsetpgrp
    signal(SIGTTOU, SIG_IGN);
}

// ============================================================
// JobTable implementation
// ============================================================

void JobTable::init() {
    numJobs = 0;
    for (int i = 0; i < MAX_JOBS; i++) {
        jobs[i].id = 0;
        jobs[i].pgid = 0;
        jobs[i].command = NULL;
        jobs[i].status = JOB_DONE;
    }
}

int JobTable::nextId() {
    int maxId = 0;
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id > maxId) maxId = jobs[i].id;
    }
    return maxId + 1;
}

int JobTable::addJob(pid_t pgid, const char *cmd, int bg) {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id == 0) {
            jobs[i].id = nextId();
            jobs[i].pgid = pgid;
            jobs[i].command = strdup(cmd);
            jobs[i].status = JOB_RUNNING;
            jobs[i].background = bg;
            numJobs++;
            return jobs[i].id;
        }
    }
    fprintf(stderr, "myshell: too many jobs\n");
    return -1;
}

void JobTable::removeJob(int id) {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id == id) {
            if (jobs[i].command) free(jobs[i].command);
            jobs[i].id = 0;
            jobs[i].pgid = 0;
            jobs[i].command = NULL;
            jobs[i].status = JOB_DONE;
            numJobs--;
            return;
        }
    }
}

Job *JobTable::findJob(int id) {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id == id) return &jobs[i];
    }
    return NULL;
}

Job *JobTable::findJobByPgid(pid_t pgid) {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].pgid == pgid && jobs[i].id != 0) return &jobs[i];
    }
    return NULL;
}

void JobTable::printJobs() {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id == 0) continue;
        const char *statusStr;
        switch (jobs[i].status) {
            case JOB_RUNNING: statusStr = "Running"; break;
            case JOB_STOPPED: statusStr = "Stopped"; break;
            case JOB_DONE:    statusStr = "Done";    break;
            default:          statusStr = "Unknown"; break;
        }
        printf("[%d]  %-10s %s", jobs[i].id, statusStr, jobs[i].command);
        if (jobs[i].background && jobs[i].status == JOB_RUNNING)
            printf(" &");
        printf("\n");
    }
}

void JobTable::checkDoneJobs() {
    for (int i = 0; i < MAX_JOBS; i++) {
        if (jobs[i].id != 0 && jobs[i].status == JOB_DONE) {
            if (jobs[i].background) {
                printf("[%d]  Done       %s\n", jobs[i].id, jobs[i].command);
            }
            removeJob(jobs[i].id);
        }
    }
}

// ============================================================
// SimpleCommand
// ============================================================

SimpleCommand::SimpleCommand() {
    _numberOfAvailableArguments = 5;
    _numberOfArguments = 0;
    _arguments = (char **)malloc(_numberOfAvailableArguments * sizeof(char *));
}

void SimpleCommand::insertArgument(char *argument) {
    if (_numberOfArguments >= _numberOfAvailableArguments) {
        _numberOfAvailableArguments *= 2;
        _arguments = (char **)realloc(_arguments,
            _numberOfAvailableArguments * sizeof(char *));
    }
    _arguments[_numberOfArguments] = argument;
    _numberOfArguments++;
    _arguments[_numberOfArguments] = NULL;
}

// ============================================================
// Command
// ============================================================

Command Command::_currentCommand;
SimpleCommand *Command::_currentSimpleCommand;

Command::Command() {
    _numberOfAvailableSimpleCommands = 1;
    _numberOfSimpleCommands = 0;
    _simpleCommands = (SimpleCommand **)malloc(
        _numberOfAvailableSimpleCommands * sizeof(SimpleCommand *));
    _outFile = NULL;
    _inputFile = NULL;
    _errFile = NULL;
    _background = 0;
    _append = 0;
}

void Command::insertSimpleCommand(SimpleCommand *simpleCommand) {
    if (_numberOfSimpleCommands >= _numberOfAvailableSimpleCommands) {
        _numberOfAvailableSimpleCommands *= 2;
        _simpleCommands = (SimpleCommand **)realloc(_simpleCommands,
            _numberOfAvailableSimpleCommands * sizeof(SimpleCommand *));
    }
    _simpleCommands[_numberOfSimpleCommands] = simpleCommand;
    _numberOfSimpleCommands++;
}

void Command::clear() {
    for (int i = 0; i < _numberOfSimpleCommands; i++) {
        for (int j = 0; j < _simpleCommands[i]->_numberOfArguments; j++) {
            free(_simpleCommands[i]->_arguments[j]);
        }
        free(_simpleCommands[i]->_arguments);
        free(_simpleCommands[i]);
    }
    if (_outFile) free(_outFile);
    if (_inputFile) free(_inputFile);
    if (_errFile) free(_errFile);

    _numberOfSimpleCommands = 0;
    _outFile = NULL;
    _inputFile = NULL;
    _errFile = NULL;
    _background = 0;
    _append = 0;
}

// Build a display string from the command table
static char *buildCmdString(Command *cmd) {
    // Estimate size
    int len = 0;
    for (int i = 0; i < cmd->_numberOfSimpleCommands; i++) {
        for (int j = 0; j < cmd->_simpleCommands[i]->_numberOfArguments; j++) {
            len += strlen(cmd->_simpleCommands[i]->_arguments[j]) + 1;
        }
        len += 3; // " | "
    }
    len += 50; // redirection and extras

    char *str = (char *)malloc(len);
    str[0] = '\0';

    for (int i = 0; i < cmd->_numberOfSimpleCommands; i++) {
        if (i > 0) strcat(str, " | ");
        for (int j = 0; j < cmd->_simpleCommands[i]->_numberOfArguments; j++) {
            if (j > 0) strcat(str, " ");
            strcat(str, cmd->_simpleCommands[i]->_arguments[j]);
        }
    }

    if (cmd->_inputFile) { strcat(str, " < "); strcat(str, cmd->_inputFile); }
    if (cmd->_outFile) {
        strcat(str, cmd->_append ? " >> " : " > ");
        strcat(str, cmd->_outFile);
    }

    return str;
}

// ============================================================
// Execute — with job control
// ============================================================

void Command::execute() {
    if (_numberOfSimpleCommands == 0) {
        prompt();
        return;
    }

    // ---- Built-in: exit ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "exit") == 0) {
        printf("Good bye!!\n");
        exit(0);
    }

    // ---- Built-in: cd ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "cd") == 0) {
        const char *dir = _simpleCommands[0]->_numberOfArguments > 1
            ? _simpleCommands[0]->_arguments[1] : getenv("HOME");
        if (chdir(dir) != 0) perror("cd");
        clear(); prompt(); return;
    }

    // ---- Built-in: setenv ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "setenv") == 0) {
        if (_simpleCommands[0]->_numberOfArguments == 3)
            setenv(_simpleCommands[0]->_arguments[1],
                   _simpleCommands[0]->_arguments[2], 1);
        else fprintf(stderr, "Usage: setenv VAR VALUE\n");
        clear(); prompt(); return;
    }

    // ---- Built-in: unsetenv ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "unsetenv") == 0) {
        if (_simpleCommands[0]->_numberOfArguments == 2)
            unsetenv(_simpleCommands[0]->_arguments[1]);
        else fprintf(stderr, "Usage: unsetenv VAR\n");
        clear(); prompt(); return;
    }

    // ---- Built-in: jobs ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "jobs") == 0) {
        _jobTable.printJobs();
        clear(); prompt(); return;
    }

    // ---- Built-in: fg ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "fg") == 0) {
        int jobId = -1;
        if (_simpleCommands[0]->_numberOfArguments > 1) {
            jobId = atoi(_simpleCommands[0]->_arguments[1]);
        } else {
            // Find most recent stopped or background job
            for (int i = MAX_JOBS - 1; i >= 0; i--) {
                if (_jobTable.jobs[i].id != 0 &&
                    (_jobTable.jobs[i].status == JOB_STOPPED ||
                     _jobTable.jobs[i].status == JOB_RUNNING)) {
                    jobId = _jobTable.jobs[i].id;
                    break;
                }
            }
        }

        Job *j = _jobTable.findJob(jobId);
        if (!j || j->id == 0) {
            fprintf(stderr, "fg: no such job\n");
            clear(); prompt(); return;
        }

        printf("%s\n", j->command);

        // Give the job's process group control of the terminal
        if (isatty(STDIN_FILENO))
            tcsetpgrp(STDIN_FILENO, j->pgid);

        // Send SIGCONT if stopped
        if (j->status == JOB_STOPPED) {
            kill(-j->pgid, SIGCONT);
        }
        j->status = JOB_RUNNING;
        j->background = 0;

        // Wait for the job
        int status;
        waitpid(-j->pgid, &status, WUNTRACED);

        if (WIFSTOPPED(status)) {
            j->status = JOB_STOPPED;
            printf("\n[%d]  Stopped    %s\n", j->id, j->command);
        } else {
            _jobTable.removeJob(j->id);
        }

        // Take terminal control back
        tcsetpgrp(STDIN_FILENO, getpgrp());

        clear(); prompt(); return;
    }

    // ---- Built-in: bg ----
    if (strcmp(_simpleCommands[0]->_arguments[0], "bg") == 0) {
        int jobId = -1;
        if (_simpleCommands[0]->_numberOfArguments > 1) {
            jobId = atoi(_simpleCommands[0]->_arguments[1]);
        } else {
            for (int i = MAX_JOBS - 1; i >= 0; i--) {
                if (_jobTable.jobs[i].id != 0 &&
                    _jobTable.jobs[i].status == JOB_STOPPED) {
                    jobId = _jobTable.jobs[i].id;
                    break;
                }
            }
        }

        Job *j = _jobTable.findJob(jobId);
        if (!j || j->id == 0) {
            fprintf(stderr, "bg: no such job\n");
            clear(); prompt(); return;
        }

        j->status = JOB_RUNNING;
        j->background = 1;
        printf("[%d]  %s &\n", j->id, j->command);
        kill(-j->pgid, SIGCONT);

        clear(); prompt(); return;
    }

    // ============================================================
    // External commands — fork/exec with job control
    // ============================================================

    // Build command string for job display
    char *cmdStr = buildCmdString(this);

    // Save default stdin/stdout/stderr
    int tmpin  = dup(0);
    int tmpout = dup(1);
    int tmperr = dup(2);

    // Set up initial input
    int fdin;
    if (_inputFile) {
        fdin = open(_inputFile, O_RDONLY);
        if (fdin < 0) {
            perror("open input");
            free(cmdStr);
            clear(); prompt(); return;
        }
    } else {
        fdin = dup(tmpin);
    }

    // Set up stderr redirection
    if (_errFile) {
        int fderr = _append
            ? open(_errFile, O_WRONLY | O_CREAT | O_APPEND, 0644)
            : open(_errFile, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fderr >= 0) { dup2(fderr, 2); close(fderr); }
    }

    // Block SIGCHLD during fork/exec to prevent race condition
    // where the handler reaps the child before our waitpid
    sigset_t mask, prev;
    sigemptyset(&mask);
    sigaddset(&mask, SIGCHLD);
    sigprocmask(SIG_BLOCK, &mask, &prev);

    pid_t pgid = 0;  // Process group for this pipeline
    int ret = -1;
    int fdout;

    for (int i = 0; i < _numberOfSimpleCommands; i++) {
        // Redirect input
        dup2(fdin, 0);
        close(fdin);

        // Set up output
        if (i == _numberOfSimpleCommands - 1) {
            if (_outFile) {
                fdout = _append
                    ? open(_outFile, O_WRONLY | O_CREAT | O_APPEND, 0644)
                    : open(_outFile, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (fdout < 0) { perror("open output"); break; }
            } else {
                fdout = dup(tmpout);
            }
        } else {
            int fdpipe[2];
            pipe(fdpipe);
            fdout = fdpipe[1];
            fdin  = fdpipe[0];
        }

        // Redirect output
        dup2(fdout, 1);
        close(fdout);

        // Create child process
        ret = fork();
        if (ret == 0) {
            // ---- Child process ----

            // Set process group
            if (pgid == 0) {
                // First child: create new process group
                setpgid(0, 0);
            } else {
                setpgid(0, pgid);
            }

            // Restore default signal handlers in child
            signal(SIGINT, SIG_DFL);
            signal(SIGTSTP, SIG_DFL);
            signal(SIGTTOU, SIG_DFL);
            signal(SIGCHLD, SIG_DFL);

            // Unblock SIGCHLD in child
            sigprocmask(SIG_SETMASK, &prev, NULL);

            // Close saved file descriptors
            close(tmpin);
            close(tmpout);
            close(tmperr);

            execvp(_simpleCommands[i]->_arguments[0],
                   _simpleCommands[i]->_arguments);
            perror("execvp");
            _exit(1);
        } else if (ret < 0) {
            perror("fork");
            break;
        }

        // ---- Parent process ----
        // Set the process group (also done in parent to avoid race)
        if (pgid == 0) {
            pgid = ret;  // First child's PID becomes the PGID
        }
        setpgid(ret, pgid);
    }

    // Restore stdin/stdout/stderr
    dup2(tmpin, 0);
    dup2(tmpout, 1);
    dup2(tmperr, 2);
    close(tmpin);
    close(tmpout);
    close(tmperr);

    if (_background) {
        // Background job — add to job table, don't wait
        int jid = _jobTable.addJob(pgid, cmdStr, 1);
        printf("[%d]  %d\n", jid, pgid);
    } else {
        // Foreground job — give it the terminal and wait
        if (isatty(STDIN_FILENO))
            tcsetpgrp(STDIN_FILENO, pgid);

        // Add to job table (so Ctrl+Z can reference it)
        int jid = _jobTable.addJob(pgid, cmdStr, 0);

        int status;
        waitpid(-pgid, &status, WUNTRACED);

        if (WIFSTOPPED(status)) {
            // Process was stopped with Ctrl+Z
            Job *j = _jobTable.findJob(jid);
            if (j) {
                j->status = JOB_STOPPED;
                printf("\n[%d]  Stopped    %s\n", j->id, j->command);
            }
        } else {
            // Process exited normally
            _jobTable.removeJob(jid);
        }

        // Take terminal control back
        if (isatty(STDIN_FILENO))
            tcsetpgrp(STDIN_FILENO, getpgrp());
    }

    free(cmdStr);

    // Unblock SIGCHLD
    sigprocmask(SIG_SETMASK, &prev, NULL);

    // Check for any background jobs that finished
    _jobTable.checkDoneJobs();

    clear();
    prompt();
}

void Command::prompt() {
    if (isatty(0)) {
        printf("myshell> ");
        fflush(stdout);
    }
}

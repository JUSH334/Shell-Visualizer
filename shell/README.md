# myshell — A Unix Shell

A custom shell implementation with pipes, I/O redirection, and built-in commands.

## Building

```bash
make
```

Requires: `gcc`, `g++`, `flex`, `bison`

On Ubuntu/Debian, install with:
```bash
sudo apt-get install build-essential flex bison
```

## Running

```bash
./myshell
```

## Supported Features

### Commands and pipes
```
ls -al
ls -al | grep me
ls -al | sort | head -5
```

### I/O redirection
```
ls > outfile           # redirect stdout to file
sort < infile          # redirect stdin from file
ls >> outfile          # append stdout to file
ls >& errfile          # redirect stdout+stderr
ls >>& errfile         # append stdout+stderr
```

### Background execution
```
sleep 10 &             # run in background
```

### Built-in commands
```
cd /path/to/dir        # change directory
cd                     # go to $HOME
setenv VAR value       # set environment variable
unsetenv VAR           # remove environment variable
exit                   # exit the shell
```

## File Structure

```
shell.l      — Lexer rules (token definitions)
shell.y      — Parser grammar (builds command table)
command.h    — Command/SimpleCommand data structures
command.cc   — Executor (fork/exec/pipe/redirection)
main.cc      — Entry point
Makefile     — Build rules
```

## TODO — Features to Add

- [ ] Wildcard expansion (* and ?)
- [ ] Subdirectory wildcard matching
- [ ] Environment variable expansion (${VAR})
- [ ] Subshell execution (`command`)
- [ ] printenv built-in command
- [ ] Tilde expansion (~/path)
- [ ] Signal handling (Ctrl-C, zombie cleanup)
- [ ] Line editing and history (with readline)

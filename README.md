# Unix Shell + Visualizer

A custom Unix shell written in C ([`shell/`](shell/)) and a React frontend
([`visualizer/`](visualizer/)) that animates the same lex → parse → exec
pipeline that drives it.

![docker](https://img.shields.io/badge/docker-ready-blue) ![C](https://img.shields.io/badge/language-C-green) ![React](https://img.shields.io/badge/frontend-React-cyan) [![CI](https://github.com/JUSH334/unix-shell-visualizer/actions/workflows/test.yml/badge.svg)](https://github.com/JUSH334/unix-shell-visualizer/actions/workflows/test.yml)

## The Shell

Built with `flex` + `bison` (`shell.l` and `shell.y`). Supports:

- **Pipes:** `ls -al | grep src | sort`
- **I/O redirection:** `>` `>>` `<` `>&` `>>&`
- **Job control:** `Ctrl+Z` to suspend, `fg` / `bg` to resume, `jobs` to list
- **Background execution:** `sleep 30 &`
- **Built-ins:** `cd`, `setenv`, `unsetenv`, `exit`

See [`shell/README.md`](shell/README.md) for the full feature list and build
instructions.

## The Visualizer

A retro CRT-styled web app that walks a typed command through three stages:

1. **Lexer** — input is split into typed tokens (`WORD`, `PIPE`, `GREAT`,
   `LESS`, `AMPERSAND`, …) using the same rules as
   [`shell.l`](shell/shell.l).
2. **Parser** — tokens are grouped into a command table: each `|` starts a
   new `SimpleCommand`, redirections attach as `inFile` / `outFile` /
   `errFile`, a trailing `&` sets the `bg` flag — same shape as
   [`shell.y`](shell/shell.y).
3. **Executor** — the resulting pipeline is rendered as one process per
   command, with arrows wiring `fd 1` of each writer into `fd 0` of the
   next reader. A trailing `&` skips the `waitpid()`; otherwise the shell
   waits on the last child.

A row of example commands above the input fills the prompt on click so you
can quickly compare a simple command against a piped pipeline against a
backgrounded one with redirects.

## Run It

Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is
installed, then:

```bash
git clone https://github.com/JUSH334/unix-shell-visualizer.git
cd unix-shell-visualizer
docker compose up --build
```

Open <http://localhost:3000> for the visualizer.

To use the shell directly inside the container:

```bash
docker exec -it myshell /app/shell/myshell
```

To stop:

```bash
docker compose down
```

### Without Docker

```bash
cd visualizer
npm install
npm run dev          # http://localhost:5173
```

```bash
cd shell
make                 # requires gcc, g++, flex, bison
./myshell
```

## Tests

```bash
cd visualizer
npm test             # 20 unit tests covering tokenizer + parser
```

CI runs the same suite on every push and pull request.

## Architecture

```
visualizer/src/
  main.jsx     React entry
  App.jsx      Visualizer UI: phase tabs, input, example chips,
               token / parse-table / pipeline panels, status bar,
               CRT visual layer
  shell.js     Tokenizer + parser (port of shell.l / shell.y)
  useSfx.js    Per-event Web Audio voices: tick / click / blip /
               confirm / done
  shell.test.js  Vitest suite for tokenizer + parser
```

## What I Learned

Going from a yacc grammar to an interactive visualizer means understanding
what each parser action *does*, not just that it parses. Animating
`fork` / `pipe` / `dup2` made me reason about file descriptors as concrete
numbers (fd 0 / 1 / 2) rather than abstract "input" and "output."

Mirroring the shell's grammar in JavaScript and unit-testing it kept the
two implementations honest — the visualizer can't drift from the C shell
without a test failing.

## What's Next

- **Wildcard expansion** (`*`, `?`) in the C shell, with a corresponding
  pre-execution glob phase in the visualizer.
- **Environment variable expansion** (`${VAR}`) — both runtime substitution
  in the shell and a small extra step in the visualizer to show the
  pre-/post-substitution token stream.
- **Subshell execution** (`` `cmd` `` and `$(cmd)`) — recursive
  visualization of the inner command's pipeline.
- **Line editing and history** with readline.

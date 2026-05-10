import { describe, it, expect } from "vitest";
import { tokenize, parse } from "./shell";

// Every token list ends with a NEWLINE — strip it for readability in
// assertions that don't care about it.
const real = (toks) => toks.filter(t => t.type !== "NEWLINE");
const types = (toks) => real(toks).map(t => t.type);
const values = (toks) => real(toks).map(t => t.value);

describe("tokenize", () => {
  it("emits a trailing NEWLINE on every input", () => {
    expect(tokenize("").at(-1).type).toBe("NEWLINE");
    expect(tokenize("ls").at(-1).type).toBe("NEWLINE");
  });

  it("produces a single WORD for a bare command", () => {
    const t = tokenize("whoami");
    expect(real(t)).toEqual([{ type: "WORD", value: "whoami" }]);
  });

  it("splits multiple words on whitespace", () => {
    expect(values(tokenize("ls -al /home"))).toEqual(["ls", "-al", "/home"]);
  });

  it("treats tabs and runs of spaces the same as a single space", () => {
    expect(values(tokenize("ls  \t -al"))).toEqual(["ls", "-al"]);
  });

  it("recognizes pipe", () => {
    expect(types(tokenize("ls | grep x"))).toEqual(["WORD", "PIPE", "WORD", "WORD"]);
  });

  it("recognizes > and >> as distinct operators", () => {
    expect(types(tokenize("a > b"))).toEqual(["WORD", "GREAT", "WORD"]);
    expect(types(tokenize("a >> b"))).toEqual(["WORD", "GREATGREAT", "WORD"]);
  });

  it("recognizes < as input redirect", () => {
    expect(types(tokenize("sort < in"))).toEqual(["WORD", "LESS", "WORD"]);
  });

  it("recognizes >& and >>& as merged stdout+stderr redirects", () => {
    expect(types(tokenize("a >& b"))).toEqual(["WORD", "GREATAMPERSAND", "WORD"]);
    expect(types(tokenize("a >>& b"))).toEqual(["WORD", "GREATGREATAMPERSAND", "WORD"]);
  });

  it("recognizes a trailing & as background", () => {
    expect(types(tokenize("sleep 1 &"))).toEqual(["WORD", "WORD", "AMPERSAND"]);
  });

  it("handles operators packed against words (no whitespace)", () => {
    expect(types(tokenize("a|b>c"))).toEqual(["WORD", "PIPE", "WORD", "GREAT", "WORD"]);
  });
});

describe("parse", () => {
  it("returns no commands for empty input", () => {
    const ast = parse(tokenize(""));
    expect(ast.cmds).toEqual([]);
    expect(ast.bg).toBe(false);
  });

  it("builds a single-command argv", () => {
    const ast = parse(tokenize("ls -al"));
    expect(ast.cmds).toEqual([["ls", "-al"]]);
    expect(ast.outFile).toBeNull();
    expect(ast.inFile).toBeNull();
    expect(ast.bg).toBe(false);
  });

  it("splits a pipeline into one cmd per pipe segment", () => {
    const ast = parse(tokenize("ls -al | grep foo | wc -l"));
    expect(ast.cmds).toEqual([
      ["ls", "-al"],
      ["grep", "foo"],
      ["wc", "-l"],
    ]);
  });

  it("attaches > to outFile (truncate, not append)", () => {
    const ast = parse(tokenize("ls > out.txt"));
    expect(ast.outFile).toBe("out.txt");
    expect(ast.append).toBe(false);
  });

  it("attaches >> to outFile and sets append", () => {
    const ast = parse(tokenize("ls >> out.txt"));
    expect(ast.outFile).toBe("out.txt");
    expect(ast.append).toBe(true);
  });

  it("attaches < to inFile", () => {
    const ast = parse(tokenize("sort < in.txt"));
    expect(ast.inFile).toBe("in.txt");
  });

  it("sets both outFile and errFile from >&", () => {
    const ast = parse(tokenize("cmd >& both.log"));
    expect(ast.outFile).toBe("both.log");
    expect(ast.errFile).toBe("both.log");
    expect(ast.append).toBe(false);
  });

  it("sets append=true for >>&", () => {
    const ast = parse(tokenize("cmd >>& both.log"));
    expect(ast.outFile).toBe("both.log");
    expect(ast.errFile).toBe("both.log");
    expect(ast.append).toBe(true);
  });

  it("sets bg from a trailing &", () => {
    const ast = parse(tokenize("sleep 1 &"));
    expect(ast.cmds).toEqual([["sleep", "1"]]);
    expect(ast.bg).toBe(true);
  });

  it("handles a full pipeline with redirect, input, and background", () => {
    const ast = parse(tokenize("cat < in.txt | grep foo > out.txt &"));
    expect(ast.cmds).toEqual([["cat"], ["grep", "foo"]]);
    expect(ast.inFile).toBe("in.txt");
    expect(ast.outFile).toBe("out.txt");
    expect(ast.bg).toBe(true);
  });
});

export function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === " " || input[i] === "\t") { i++; continue; }
    if (input.startsWith(">>&", i)) { tokens.push({ type: "GREATGREATAMPERSAND", value: ">>&" }); i += 3; continue; }
    if (input.startsWith(">>", i)) { tokens.push({ type: "GREATGREAT", value: ">>" }); i += 2; continue; }
    if (input.startsWith(">&", i)) { tokens.push({ type: "GREATAMPERSAND", value: ">&" }); i += 2; continue; }
    if (input[i] === ">") { tokens.push({ type: "GREAT", value: ">" }); i++; continue; }
    if (input[i] === "<") { tokens.push({ type: "LESS", value: "<" }); i++; continue; }
    if (input[i] === "|") { tokens.push({ type: "PIPE", value: "|" }); i++; continue; }
    if (input[i] === "&") { tokens.push({ type: "AMPERSAND", value: "&" }); i++; continue; }
    let word = "";
    while (i < input.length && input[i] !== " " && input[i] !== "\t" && input[i] !== "|" && input[i] !== ">" && input[i] !== "<" && input[i] !== "&") {
      word += input[i]; i++;
    }
    if (word) tokens.push({ type: "WORD", value: word });
  }
  tokens.push({ type: "NEWLINE", value: "\\n" });
  return tokens;
}

export function parse(tokens) {
  const cmds = [];
  let current = [];
  let outFile = null, inFile = null, errFile = null, bg = false, append = false;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "WORD") { current.push(t.value); i++; }
    else if (t.type === "PIPE") {
      if (current.length) cmds.push([...current]);
      current = []; i++;
    } else if (t.type === "GREAT" || t.type === "GREATGREAT") {
      append = t.type === "GREATGREAT";
      if (i + 1 < tokens.length && tokens[i + 1].type === "WORD") { outFile = tokens[i + 1].value; i += 2; } else i++;
    } else if (t.type === "LESS") {
      if (i + 1 < tokens.length && tokens[i + 1].type === "WORD") { inFile = tokens[i + 1].value; i += 2; } else i++;
    } else if (t.type === "GREATAMPERSAND" || t.type === "GREATGREATAMPERSAND") {
      append = t.type === "GREATGREATAMPERSAND";
      if (i + 1 < tokens.length && tokens[i + 1].type === "WORD") { outFile = tokens[i + 1].value; errFile = tokens[i + 1].value; i += 2; } else i++;
    } else if (t.type === "AMPERSAND") { bg = true; i++; }
    else i++;
  }
  if (current.length) cmds.push([...current]);
  return { cmds, outFile, inFile, errFile, bg, append };
}

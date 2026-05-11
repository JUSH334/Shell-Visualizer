import { useState, useEffect, useRef } from "react";
import { tokenize, parse } from "./shell";
import { useSfx } from "./useSfx";

// ─────────────────────────── theme ───────────────────────────

const THEME = {
  hot:    "#7fff95",
  bright: "#4cd96a",
  base:   "#22a340",
  dim:    "#0e5a23",
  faded:  "#0a3414",
  ghost:  "#04150a",
  bg:     "#000000",
  panel:  "#020c06",
};

const glow = (c = THEME.bright, s = 1) =>
  `0 0 ${4 * s}px ${c}, 0 0 ${10 * s}px ${c}55`;

// ─────────────────────── example commands ────────────────────

const EXAMPLE_CMDS = [
  "ls -al",
  "ls -al | grep src > out.txt",
  "cat file.txt | sort | uniq -c",
  "echo hello world",
  "ps aux | grep node > procs.txt &",
  "find . -name *.js | wc -l",
  "sort < input.txt | head -20",
];

// ─────────────────────── splash sequence ─────────────────────

const APP_LOAD_LINES = [
  { delay:    0, text: "shell visualizer" },
  { delay:  150, text: "" },
  { delay:  450, text: "initializing tokenizer ......... ok" },
  { delay:  850, text: "loading parser ................. ok" },
  { delay: 1250, text: "mounting executor .............. ok" },
  { delay: 1650, text: "" },
  { delay: 1850, text: "ready." },
];

// ─────────────────── token / phase styling ───────────────────

const TOKEN_STYLES = {
  WORD:                 { text: THEME.hot,    border: THEME.bright, dash: false },
  PIPE:                 { text: THEME.bright, border: THEME.bright, dash: false },
  GREAT:                { text: THEME.bright, border: THEME.bright, dash: false },
  GREATGREAT:           { text: THEME.bright, border: THEME.bright, dash: false },
  LESS:                 { text: THEME.bright, border: THEME.bright, dash: false },
  AMPERSAND:            { text: THEME.bright, border: THEME.bright, dash: true },
  GREATAMPERSAND:       { text: THEME.bright, border: THEME.bright, dash: false },
  GREATGREATAMPERSAND:  { text: THEME.bright, border: THEME.bright, dash: false },
  NEWLINE:              { text: THEME.dim,    border: THEME.faded,  dash: true },
};

// ───────────────────── assistant content ─────────────────────

const ASSISTANT_GREETING =
  "Type a command — or pick an example above — and I'll walk you through what the shell does with it, one step at a time.";

// Two-line ASCII face. Cycled while running; static (frame 0) when idle.
const ASSISTANT_FRAMES = [
  ["[o o]", " \\_/ "],
  ["[o o]", " \\o/ "],
  ["[O O]", " \\o/ "],
  ["[o o]", " \\-/ "],
];

// Natural-language list joiner: ["a", "b", "c"] -> "a, b, and c".
function joinAnd(arr) {
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
}

// ── reactive describers — produce per-phase narration of the current command ──

function describeLex(tokens) {
  const real = (tokens || []).filter(t => t.type !== "NEWLINE");
  if (real.length === 0) return "Nothing to lex yet.";

  const wordCount = real.filter(t => t.type === "WORD").length;
  const pipeCount = real.filter(t => t.type === "PIPE").length;
  const redirTypes = ["GREAT", "GREATGREAT", "LESS", "GREATAMPERSAND", "GREATGREATAMPERSAND"];
  const redirCount = real.filter(t => redirTypes.includes(t.type)).length;
  const hasBg = real.some(t => t.type === "AMPERSAND");

  const parts = [];
  const labels = [];
  if (wordCount) labels.push(`${wordCount} WORD${wordCount === 1 ? "" : "s"}`);
  if (pipeCount) labels.push(`${pipeCount} pipe${pipeCount === 1 ? "" : "s"}`);
  if (redirCount) labels.push(`${redirCount} redirection${redirCount === 1 ? "" : "s"}`);
  if (hasBg) labels.push("a background marker");

  parts.push(`Read ${real.length} token${real.length === 1 ? "" : "s"} — ${joinAnd(labels)}.`);

  // Preview the first few WORDs so the user can connect the labels to the
  // actual content of their command.
  const firstWords = real.filter(t => t.type === "WORD").slice(0, 3).map(t => `"${t.value}"`);
  if (firstWords.length) {
    parts.push(`First word${firstWords.length === 1 ? "" : "s"}: ${firstWords.join(", ")}.`);
  }
  return parts.join(" ");
}

function describeParse(parsed) {
  if (!parsed || parsed.cmds.length === 0) return "Nothing to parse — empty input.";
  const n = parsed.cmds.length;
  const parts = [];

  if (n === 1) {
    const cmd = parsed.cmds[0];
    const argv = cmd[0];
    const argc = cmd.length - 1;
    parts.push(`Single command: ${argv}${argc > 0 ? ` with ${argc} argument${argc === 1 ? "" : "s"}` : ""}.`);
  } else {
    const names = parsed.cmds.map(c => c[0]).join(" → ");
    parts.push(`${n}-stage pipeline: ${names}.`);
  }

  if (parsed.inFile) parts.push(`Input comes from ${parsed.inFile}.`);
  if (parsed.outFile && parsed.errFile === parsed.outFile) {
    const verb = parsed.append ? "appends" : "writes";
    parts.push(`Stdout and stderr both ${verb} to ${parsed.outFile}.`);
  } else {
    if (parsed.outFile) {
      const verb = parsed.append ? "appends to" : "writes to";
      parts.push(`Output ${verb} ${parsed.outFile}.`);
    }
    if (parsed.errFile) parts.push(`Stderr goes to ${parsed.errFile}.`);
  }
  if (parsed.bg) parts.push("Trailing & marks the whole pipeline as a background job.");

  return parts.join(" ");
}

function describeExec(parsed) {
  if (!parsed || parsed.cmds.length === 0) return "Nothing to execute.";
  const n = parsed.cmds.length;
  const pidRange = n === 1 ? `PID 1000` : `PIDs 1000–${999 + n}`;
  const parts = [`Forking ${n} process${n === 1 ? "" : "es"} (${pidRange}).`];

  if (n > 1) {
    parts.push(`A pipe is opened between each adjacent pair — stdout of one feeds stdin of the next.`);
  } else {
    parts.push(`Single process, so no pipes are needed.`);
  }

  if (parsed.inFile) parts.push(`The first process reads from ${parsed.inFile}.`);
  if (parsed.outFile) {
    parts.push(`The last process writes to ${parsed.outFile}${parsed.append ? " (append mode)" : ""}.`);
  }
  return parts.join(" ");
}

function describeDone(parsed) {
  if (!parsed || parsed.cmds.length === 0) return "Done.";
  const n = parsed.cmds.length;
  if (parsed.bg) {
    return `Backgrounded — the shell didn't wait. The prompt is already back, and the ${n === 1 ? "process is" : `${n} processes are`} running independently.`;
  }
  return `Waited on PID ${999 + n} to exit, then returned to the prompt. The exit code is now available in $?.`;
}

// One row per visualizer phase. `concept` is the always-true explanation of
// what this phase does in general; `describe` runs against the current
// tokens / parsed state and narrates what just happened to the user's
// specific command.
const STEPS = [
  {
    key: "LEX",
    concept: "The shell scans your input and breaks it into tokens. Spaces are dropped; symbols like | > < & become their own tokens; everything else is a WORD.",
    describe: (tokens, _parsed) => describeLex(tokens),
  },
  {
    key: "PARSE",
    concept: "The shell groups the tokens into commands. Each | starts a new command; redirections (> < >>) attach as input/output settings; a trailing & marks the pipeline as background.",
    describe: (_tokens, parsed) => describeParse(parsed),
  },
  {
    key: "EXEC",
    concept: "The shell creates a pipe for each |, then launches one process per command. Each process is wired to the right input and output (terminal, file, or pipe), then becomes the target program.",
    describe: (_tokens, parsed) => describeExec(parsed),
  },
  {
    key: "DONE",
    concept: "The shell waits for the last process to finish, reads its exit code, and shows the next prompt. Background commands (&) skip the wait.",
    describe: (_tokens, parsed) => describeDone(parsed),
  },
];

function AssistantPanel({ phase, running, tokens, parsed, lastCmd, sfx }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const [revealed, setRevealed] = useState(0);

  // The greeting only shows on a truly fresh session — once any command
  // has been run (lastCmd is set), we never fall back to the greeting,
  // even during the brief window where `reset()` puts phase back to 0
  // before the next phase timer fires.
  const showGreeting = phase === 0 && !lastCmd;
  const activeReactive = phase > 0 ? STEPS[Math.max(0, phase - 1)].describe(tokens, parsed) : "";
  const currentText = showGreeting ? ASSISTANT_GREETING : activeReactive;
  const speaking = revealed < currentText.length;

  // Typewriter the current speech, with a matching reveal-tick sound.
  // Reset on every phase change so each new step's reactive line types
  // out from the start.
  useEffect(() => {
    setRevealed(0);
    let r = 0;
    const id = setInterval(() => {
      r = Math.min(r + 2, currentText.length);
      setRevealed(r);
      if (r < currentText.length) sfx?.typewriter?.();
      else clearInterval(id);
    }, 35);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tokens, parsed]);

  // Face cycles frames while text is still typewriting. Settles to idle
  // once the speech finishes.
  useEffect(() => {
    if (!speaking) { setFrameIdx(0); return; }
    const id = setInterval(() => {
      setFrameIdx((i) => (i + 1) % ASSISTANT_FRAMES.length);
    }, 180);
    return () => clearInterval(id);
  }, [speaking]);

  const face = speaking ? ASSISTANT_FRAMES[frameIdx] : ASSISTANT_FRAMES[0];

  return (
    <div style={{
      position: "sticky", top: 18,
      background: THEME.panel,
      border: `1px solid ${THEME.bright}`,
      boxShadow: `${glow(THEME.bright, 0.45)}, inset 0 0 16px ${THEME.bright}11`,
      fontFamily: "'VT323', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "6px 14px",
        background: THEME.ghost,
        borderBottom: `1px solid ${THEME.faded}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{
          color: THEME.bright, fontSize: 14, letterSpacing: 3,
          textShadow: `0 0 2px ${THEME.bright}`,
        }}>ASSISTANT</span>
        <span style={{ color: THEME.base, fontSize: 13, letterSpacing: 1 }}>
          {phase === 0 ? "READY" : `${phase} / ${STEPS.length}`}
        </span>
      </div>

      {/* Character + headline */}
      <div style={{ padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          color: THEME.hot, fontSize: 20, lineHeight: 1.05,
          whiteSpace: "pre", textShadow: `0 0 2px ${THEME.hot}`,
          flexShrink: 0, paddingTop: 2,
        }}>
          {face[0]}{"\n"}{face[1]}
        </div>
        <div style={{
          flex: 1, color: THEME.bright,
          fontSize: 16, lineHeight: 1.55,
          minHeight: 50,
        }}>
          {showGreeting ? (
            <>
              {ASSISTANT_GREETING.slice(0, revealed)}
              {speaking && <span className="term-blink" style={{ marginLeft: 1 }}>▎</span>}
            </>
          ) : (
            <span style={{ fontFamily: "'VT323', monospace" }}>
              <span style={{ color: THEME.dim, marginRight: 4 }}>$</span>
              <span style={{ color: THEME.hot, textShadow: glow(THEME.hot, 0.4) }}>{lastCmd}</span>
            </span>
          )}
        </div>
      </div>

      {/* Accumulating step descriptions — text snaps in once a phase is
          reached and stays put. Past steps remain readable forever. */}
      <div style={{
        borderTop: `1px solid ${THEME.faded}`,
        padding: "14px 16px 16px",
      }}>
        <div style={{
          color: THEME.base, fontSize: 12, letterSpacing: 2,
          marginBottom: 10,
        }}>STEPS</div>
        {STEPS.map((step, i) => {
          const sp = i + 1;
          const reached = phase >= sp;
          const active = phase === sp;
          const completed = phase > sp;
          const markerColor = active ? THEME.hot : completed ? THEME.bright : THEME.dim;
          const marker = active ? "▸" : completed ? "✓" : "·";
          return (
            <div key={step.key} style={{
              marginBottom: i === STEPS.length - 1 ? 0 : 14,
              paddingBottom: i === STEPS.length - 1 ? 0 : 14,
              borderBottom: i === STEPS.length - 1 ? "none" : `1px dashed ${THEME.faded}`,
            }}>
              <div style={{
                color: markerColor,
                fontSize: 16, letterSpacing: 2,
                marginBottom: reached ? 7 : 0,
                textShadow: active ? `0 0 2px ${THEME.hot}` : "none",
              }}>
                {marker} {step.key}
              </div>
              {reached && (
                <div
                  style={{
                    paddingLeft: 16,
                    animation: "fadeIn 0.35s",
                  }}
                >
                  {/* What this phase does in general */}
                  <div style={{
                    color: THEME.base,
                    fontSize: 14, lineHeight: 1.55,
                    marginBottom: 8,
                  }}>{step.concept}</div>

                  {/* What just happened to the user's specific command —
                      typewriter-reveals when this step is active, snaps to
                      full once the phase moves past. */}
                  <div style={{
                    display: "flex", gap: 7,
                    color: active ? THEME.hot : THEME.bright,
                    fontSize: 14, lineHeight: 1.55,
                  }}>
                    <span style={{ color: active ? THEME.hot : THEME.base, flexShrink: 0 }}>→</span>
                    <span>
                      {(() => {
                        const full = step.describe(tokens, parsed);
                        return active ? full.slice(0, revealed) : full;
                      })()}
                      {active && speaking && (
                        <span className="term-blink" style={{ marginLeft: 1 }}>▎</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PhaseTab = ({ label, active, done, last }) => (
  <div style={{
    flex: 1, padding: "8px 10px", fontSize: 16, letterSpacing: 3, textAlign: "center",
    fontFamily: "'VT323', 'IBM Plex Mono', monospace", textTransform: "uppercase",
    background: active ? THEME.bright : "transparent",
    color: active ? "#000" : done ? THEME.hot : THEME.faded,
    border: `1px solid ${active ? THEME.bright : done ? THEME.bright : THEME.faded}`,
    borderRight: last ? `1px solid ${active ? THEME.bright : done ? THEME.bright : THEME.faded}` : "none",
    textShadow: active ? "none" : done ? glow(THEME.hot, 0.6) : "none",
    boxShadow: active ? `${glow(THEME.bright, 0.8)}, inset 0 0 16px ${THEME.bright}88` : "none",
    transition: "all 0.3s",
    position: "relative",
  }}>
    {active && <span style={{ position: "absolute", left: 6 }}>▶</span>}
    {label}
  </div>
);

const Token = ({ token, visible, delay }) => {
  const style = TOKEN_STYLES[token.type] || TOKEN_STYLES.WORD;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px",
      fontSize: 18, fontFamily: "'VT323', 'IBM Plex Mono', monospace",
      background: "transparent",
      border: `1px ${style.dash ? "dashed" : "solid"} ${style.border}`,
      color: style.text,
      // Crisp single-shadow definition — no halo, so letters stay sharp
      // at this size. The border + color already make the chip distinct.
      textShadow: `0 0 1.5px ${style.text}`,
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)",
      transition: `opacity 0.3s ${delay}ms, transform 0.3s ${delay}ms`,
    }}>
      <span style={{ fontSize: 13, color: THEME.base, letterSpacing: 1 }}>{token.type}</span>
      <span style={{ color: style.text, fontWeight: 500 }}>{token.value}</span>
    </span>
  );
};

const ProcessBox = ({ cmd, index, total, outFile, inFile, visible, delay }) => {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: `all 0.4s ${delay}ms`,
    }}>
      {isFirst && inFile && (
        <>
          <div style={{
            padding: "6px 12px", background: "transparent", border: `1px solid ${THEME.bright}`,
            fontSize: 16, fontFamily: "'VT323', monospace", color: THEME.hot,
            textShadow: glow(THEME.hot, 0.6),
          }}>{inFile}</div>
          <svg width="40" height="24"><line x1="0" y1="12" x2="32" y2="12" stroke={THEME.bright} strokeWidth="1.5" /><polygon points="32,8 40,12 32,16" fill={THEME.bright} /></svg>
        </>
      )}
      {isFirst && !inFile && (
        <>
          <div style={{
            padding: "6px 10px", background: "transparent", border: `1px dashed ${THEME.faded}`,
            fontSize: 14, fontFamily: "'VT323', monospace", color: THEME.dim,
            textShadow: glow(THEME.dim, 0.4),
          }}>stdin</div>
          <svg width="40" height="24"><line x1="0" y1="12" x2="32" y2="12" stroke={THEME.faded} strokeWidth="1" strokeDasharray="4 3" /><polygon points="32,9 38,12 32,15" fill={THEME.faded} /></svg>
        </>
      )}
      <div style={{
        padding: "10px 16px", background: "transparent",
        border: `1px solid ${THEME.bright}`,
        boxShadow: `${glow(THEME.bright, 0.4)}, inset 0 0 14px ${THEME.bright}22`,
        minWidth: 110, textAlign: "center", position: "relative",
      }}>
        <div style={{ fontSize: 13, color: THEME.base, letterSpacing: 2, marginBottom: 2, fontFamily: "'VT323', monospace", textShadow: glow(THEME.base, 0.5) }}>PID {1000 + index}</div>
        <div style={{ fontSize: 18, fontFamily: "'VT323', monospace", color: THEME.hot, textShadow: glow(THEME.hot, 0.6), lineHeight: 1.1 }}>{cmd[0]}</div>
        {cmd.length > 1 && (
          <div style={{ fontSize: 14, fontFamily: "'VT323', monospace", color: THEME.base, marginTop: 0, textShadow: glow(THEME.base, 0.4) }}>
            {cmd.slice(1).join(" ")}
          </div>
        )}
        <div style={{ fontSize: 12, color: THEME.dim, marginTop: 4, display: "flex", gap: 8, justifyContent: "center", fontFamily: "'VT323', monospace", letterSpacing: 1 }}>
          <span>fd0:{isFirst && inFile ? inFile : isFirst ? "term" : "pipe"}</span>
          <span>fd1:{isLast && outFile ? outFile : isLast ? "term" : "pipe"}</span>
        </div>
      </div>
      {!isLast && (
        <svg width="60" height="40" style={{ margin: "0 -2px" }}>
          <rect x="8" y="10" width="44" height="20" fill="none" stroke={THEME.base} strokeWidth="1" />
          <line x1="14" y1="20" x2="46" y2="20" stroke={THEME.bright} strokeWidth="1.5" strokeDasharray="3 2" style={{ filter: `drop-shadow(0 0 2px ${THEME.bright})` }}>
            <animate attributeName="stroke-dashoffset" from="0" to="-10" dur="1s" repeatCount="indefinite" />
          </line>
          <polygon points="46,17 52,20 46,23" fill={THEME.bright} />
          <text x="30" y="8" textAnchor="middle" fill={THEME.base} fontSize="10" fontFamily="'VT323', monospace" letterSpacing="1">pipe</text>
        </svg>
      )}
      {isLast && outFile && (
        <>
          <svg width="40" height="24"><line x1="0" y1="12" x2="32" y2="12" stroke={THEME.bright} strokeWidth="1.5" /><polygon points="32,8 40,12 32,16" fill={THEME.bright} /></svg>
          <div style={{
            padding: "6px 12px", background: "transparent", border: `1px solid ${THEME.bright}`,
            fontSize: 16, fontFamily: "'VT323', monospace", color: THEME.hot,
            textShadow: glow(THEME.hot, 0.6),
          }}>{outFile}</div>
        </>
      )}
      {isLast && !outFile && (
        <>
          <svg width="40" height="24"><line x1="0" y1="12" x2="32" y2="12" stroke={THEME.faded} strokeWidth="1" strokeDasharray="4 3" /><polygon points="32,9 38,12 32,15" fill={THEME.faded} /></svg>
          <div style={{
            padding: "6px 10px", background: "transparent", border: `1px dashed ${THEME.faded}`,
            fontSize: 14, fontFamily: "'VT323', monospace", color: THEME.dim,
            textShadow: glow(THEME.dim, 0.4),
          }}>stdout</div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────── root ───────────────────────────

export default function ShellVisualizer() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState(0);
  const [tokens, setTokens] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [tokensVisible, setTokensVisible] = useState(0);
  const [tableVisible, setTableVisible] = useState(false);
  const [procsVisible, setProcsVisible] = useState(0);
  const [running, setRunning] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [appLoadShown, setAppLoadShown] = useState([]);
  const [lastCmd, setLastCmd] = useState("");
  const inputRef = useRef(null);
  const timerRef = useRef([]);

  // First-load splash: scripted lines on a timer, then fade away.
  useEffect(() => {
    if (!appLoading) return;
    const timeouts = [];
    APP_LOAD_LINES.forEach((line) => {
      timeouts.push(setTimeout(() => {
        setAppLoadShown((prev) => [...prev, line.text]);
      }, line.delay));
    });
    timeouts.push(setTimeout(() => setAppLoading(false), 2300));
    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { sfx, muted, setMuted } = useSfx();
  const { tick: sfxTick, click: sfxClick, blip: sfxBlip, confirm: sfxConfirm, done: sfxDone } = sfx;

  const clearTimers = () => { timerRef.current.forEach(clearTimeout); timerRef.current = []; };

  const reset = () => {
    clearTimers();
    setPhase(0); setTokens([]); setParsed(null); setTokensVisible(0);
    setTableVisible(false); setProcsVisible(0); setRunning(false);
  };

  const runVisualization = (cmd) => {
    if (!cmd.trim()) return;
    reset();
    setLastCmd(cmd.trim());
    setRunning(true);
    sfxConfirm();

    const toks = tokenize(cmd.trim());
    const p = parse(toks);
    setTokens(toks);
    setParsed(p);

    let t = 200;
    timerRef.current.push(setTimeout(() => { setPhase(1); sfxBlip(0); }, t));
    toks.forEach((_, i) => {
      t += 150;
      timerRef.current.push(setTimeout(() => setTokensVisible(i + 1), t));
    });
    t += 400;
    timerRef.current.push(setTimeout(() => { setPhase(2); setTableVisible(true); sfxBlip(1); }, t));
    t += 800;
    timerRef.current.push(setTimeout(() => { setPhase(3); sfxBlip(2); }, t));
    p.cmds.forEach((_, i) => {
      t += 350;
      timerRef.current.push(setTimeout(() => { setProcsVisible(i + 1); sfxClick(); }, t));
    });
    t += 600;
    timerRef.current.push(setTimeout(() => { setPhase(4); setRunning(false); sfxDone(); }, t));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (running) return;
    runVisualization(input);
  };

  const handleReset = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset audio preferences and reload?")) return;
    try { localStorage.removeItem("viz-muted"); } catch { /* ignore */ }
    location.reload();
  };

  useEffect(() => () => clearTimers(), []);

  const phaseLabels = ["LEX", "PARSE", "EXEC", "DONE"];
  const phaseLabel = phase >= 1 && phase <= 4 ? phaseLabels[phase - 1] : "READY";

  const panel = {
    background: THEME.panel,
    border: `1px solid ${THEME.dim}`,
    boxShadow: `inset 0 0 24px ${THEME.bright}11, 0 0 12px ${THEME.bright}22`,
    padding: 20, marginBottom: 16,
  };

  const panelHeader = {
    fontSize: 16, color: THEME.bright, fontWeight: 400, letterSpacing: 3,
    textTransform: "uppercase", marginBottom: 12,
    fontFamily: "'VT323', monospace",
  };

  return (
    <div style={{
      minHeight: "100vh", background: THEME.bg, color: THEME.bright,
      fontFamily: "'VT323', 'IBM Plex Mono', 'Consolas', monospace",
      padding: "30px 20px", position: "relative", overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="crt-curve" />
      <div className="crt-scanlines" />
      <div className="crt-vignette" />
      <div className="crt-flicker" />

      <div style={{ maxWidth: 1500, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Toolbar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          padding: "8px 4px", marginBottom: 14,
          borderBottom: `1px solid ${THEME.faded}`,
          fontFamily: "'VT323', monospace",
        }}>
          <span style={{
            padding: "2px 12px", border: `1px solid ${THEME.bright}`,
            background: THEME.bright, color: "#000",
            fontSize: 14, letterSpacing: 2,
            fontFamily: "'VT323', monospace", textTransform: "uppercase",
            boxShadow: glow(THEME.bright, 0.6),
          }}>Visualizer</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => {
                setMuted((m) => {
                  const next = !m;
                  if (!next) setTimeout(() => sfxClick(), 0);
                  return next;
                });
              }}
              style={{
                border: `1px solid ${muted ? THEME.faded : THEME.base}`,
                background: "transparent",
                color: muted ? THEME.faded : THEME.bright,
                fontFamily: "'VT323', monospace",
                fontSize: 14, letterSpacing: 1, padding: "1px 10px",
                cursor: "pointer", lineHeight: 1.4,
                textShadow: muted ? "none" : glow(THEME.bright, 0.4),
              }}
              title={muted ? "muted — click to enable" : "on — click to mute"}
            >♪ {muted ? "off" : "on"}</button>
            <button
              onClick={handleReset}
              style={{
                border: `1px solid ${THEME.faded}`,
                background: "transparent",
                color: THEME.dim,
                fontFamily: "'VT323', monospace",
                fontSize: 14, letterSpacing: 1, padding: "1px 8px",
                cursor: "pointer", lineHeight: 1.4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = THEME.bright; e.currentTarget.style.borderColor = THEME.base; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = THEME.dim; e.currentTarget.style.borderColor = THEME.faded; }}
              title="reset audio preferences and reload"
            >↻ reset</button>
          </span>
        </div>

        <div style={{
          display: "flex", gap: 24, alignItems: "flex-start",
          flexWrap: "wrap",
        }}>
        <main style={{ flex: "1 1 640px", minWidth: 0 }}>

        {/* Phase tab bar */}
        <div style={{ display: "flex", marginBottom: 16 }}>
          <PhaseTab label="Input"    active={phase === 0} done={phase > 0} last={false} />
          <PhaseTab label="Lexer"    active={phase === 1} done={phase > 1} last={false} />
          <PhaseTab label="Parser"   active={phase === 2} done={phase > 2} last={false} />
          <PhaseTab label="Executor" active={phase === 3} done={phase > 3} last={false} />
          <PhaseTab label="Done"     active={phase === 4} done={false}     last />
        </div>

        {/* Example chips — click to populate input */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          marginBottom: 10, padding: "0 2px",
          fontFamily: "'VT323', monospace",
        }}>
          <span style={{
            color: THEME.base, fontSize: 13, letterSpacing: 2,
            alignSelf: "center", marginRight: 4,
          }}>EXAMPLES</span>
          {EXAMPLE_CMDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => { sfxClick(); setInput(cmd); inputRef.current?.focus(); }}
              disabled={running}
              style={{
                padding: "2px 10px",
                border: `1px solid ${THEME.faded}`,
                background: "transparent",
                color: THEME.bright,
                fontFamily: "'VT323', monospace",
                fontSize: 13, letterSpacing: 0.5,
                cursor: running ? "default" : "pointer",
                textShadow: glow(THEME.bright, 0.3),
              }}
              onMouseEnter={(e) => { if (!running) { e.currentTarget.style.borderColor = THEME.bright; e.currentTarget.style.color = THEME.hot; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = THEME.faded; e.currentTarget.style.color = THEME.bright; }}
              title="click to fill the input"
            >{cmd}</button>
          ))}
        </div>

        {/* Terminal input */}
        <div style={{
          background: THEME.panel,
          border: `1px solid ${THEME.bright}`,
          boxShadow: `${glow(THEME.bright, 0.5)}, inset 0 0 30px ${THEME.bright}15`,
          marginBottom: 16,
        }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: THEME.bright, fontFamily: "'VT323', monospace", fontSize: 22, fontWeight: 400, textShadow: glow(THEME.bright, 0.7), lineHeight: 1 }}>&gt;</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") sfxTick();
                if (e.key === "Enter") handleSubmit(e);
              }}
              placeholder="ENTER COMMAND..."
              disabled={running}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: THEME.hot, fontSize: 22, fontFamily: "'VT323', monospace",
                letterSpacing: 1, textShadow: glow(THEME.hot, 0.5),
                caretColor: THEME.bright,
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={running || !input.trim()}
              style={{
                padding: "4px 18px", border: `1px solid ${running ? THEME.faded : THEME.bright}`,
                background: running ? "transparent" : THEME.bright,
                color: running ? THEME.faded : "#000",
                cursor: running ? "default" : "pointer",
                fontSize: 16, fontWeight: 400, letterSpacing: 3,
                fontFamily: "'VT323', monospace", textTransform: "uppercase",
                boxShadow: running ? "none" : glow(THEME.bright, 0.7),
              }}
            >{running ? "RUNNING..." : "[ EXECUTE ]"}</button>
          </div>
        </div>

        {/* Phase output */}
        {phase > 0 && (
          <div>
            {phase >= 1 && tokens.length > 0 && (
              <div style={panel}>
                <div style={panelHeader}>TOKENS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {tokens.map((tok, i) => (
                    <Token key={i} token={tok} visible={i < tokensVisible} delay={0} />
                  ))}
                </div>
              </div>
            )}

            {phase >= 2 && parsed && (
              <div style={{
                ...panel,
                opacity: tableVisible ? 1 : 0, transform: tableVisible ? "translateY(0)" : "translateY(8px)",
                transition: "all 0.4s",
              }}>
                <div style={panelHeader}>PARSE TABLE</div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 17 }}>
                  {parsed.cmds.map((cmd, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                      <span style={{ color: THEME.base, minWidth: 110 }}>&gt; SimpleCmd[{i}]:</span>
                      <span style={{ color: THEME.hot }}>[ {cmd.map(a => `"${a}"`).join(", ")}, NULL ]</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px dashed ${THEME.dim}`, marginTop: 10, paddingTop: 10, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <span style={{ color: THEME.base }}>in: <span style={parsed.inFile ? { color: THEME.hot } : { color: THEME.dim }}>{parsed.inFile || "default"}</span></span>
                    <span style={{ color: THEME.base }}>out: <span style={parsed.outFile ? { color: THEME.hot } : { color: THEME.dim }}>{parsed.outFile || "default"}{parsed.append ? " (append)" : ""}</span></span>
                    <span style={{ color: THEME.base }}>err: <span style={parsed.errFile ? { color: THEME.hot } : { color: THEME.dim }}>{parsed.errFile || "default"}</span></span>
                    <span style={{ color: THEME.base }}>bg: <span style={parsed.bg ? { color: THEME.hot } : { color: THEME.dim }}>{parsed.bg ? "yes" : "no"}</span></span>
                  </div>
                </div>
              </div>
            )}

            {phase >= 3 && parsed && (
              <div style={panel}>
                <div style={panelHeader}>PIPELINE</div>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexWrap: "wrap", gap: 0, padding: "10px 0",
                  overflowX: "auto",
                }}>
                  {parsed.cmds.map((cmd, i) => (
                    <ProcessBox
                      key={i} cmd={cmd} index={i} total={parsed.cmds.length}
                      outFile={parsed.outFile} inFile={parsed.inFile}
                      visible={i < procsVisible} delay={0}
                    />
                  ))}
                </div>
                {phase >= 4 && (
                  <div style={{
                    marginTop: 16, padding: "8px 14px",
                    background: "transparent", border: `1px solid ${THEME.bright}`,
                    boxShadow: `${glow(THEME.bright, 0.5)}, inset 0 0 12px ${THEME.bright}22`,
                    fontSize: 17, color: THEME.hot, fontFamily: "'VT323', monospace",
                    textAlign: "center", letterSpacing: 1,
                    textShadow: glow(THEME.hot, 0.5),
                    animation: "fadeIn 0.4s",
                  }}>
                    &gt;&gt; {parsed.bg ? "BACKGROUND :: shell returns prompt immediately" : `WAITPID(PID ${999 + parsed.cmds.length}) :: shell waits, then prompts`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status bar */}
        <div style={{
          marginTop: 24,
          border: `1px solid ${THEME.bright}`,
          background: THEME.panel,
          boxShadow: `${glow(THEME.bright, 0.5)}, inset 0 0 16px ${THEME.bright}11`,
          padding: "6px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 15, fontFamily: "'VT323', monospace", letterSpacing: 2,
        }}>
          <span style={{ color: THEME.bright }}>
            PHASE: <span style={{ color: THEME.hot, textShadow: glow(THEME.hot, 0.5) }}>{phaseLabel}</span>
          </span>
          <span style={{ color: THEME.bright }}>
            TOK: <span style={{ color: THEME.hot, textShadow: glow(THEME.hot, 0.5) }}>{tokens.length || 0}</span>
          </span>
          <span style={{ color: THEME.bright }}>
            CMD: <span style={{ color: THEME.hot, textShadow: glow(THEME.hot, 0.5) }}>{parsed?.cmds.length || 0}</span>
          </span>
          <span style={{ color: THEME.bright }}>
            PIDS: <span style={{ color: THEME.hot, textShadow: glow(THEME.hot, 0.5) }}>
              {parsed?.cmds.length ? `${1000}-${999 + parsed.cmds.length}` : "----"}
            </span>
          </span>
          <span style={{ color: THEME.bright }}>
            STATUS: <span style={{ color: running ? THEME.hot : phase === 4 ? THEME.hot : THEME.dim, textShadow: glow(running ? THEME.hot : THEME.base, 0.5) }}>
              <span className={running ? "term-blink" : ""}>●</span> {running ? "BUSY" : phase === 4 ? "OK" : "IDLE"}
            </span>
          </span>
        </div>
        </main>

        <aside style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 400 }}>
          {!appLoading && (
            <AssistantPanel
              phase={phase}
              running={running}
              tokens={tokens}
              parsed={parsed}
              lastCmd={lastCmd}
              sfx={sfx}
            />
          )}
        </aside>
        </div>
      </div>

      {appLoading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 8,
          background: "#000",
          padding: "44px 36px",
          fontFamily: "'VT323', monospace",
          overflow: "hidden",
        }}>
          {appLoadShown.map((line, i) => (
            <div key={i} style={{
              fontSize: 18, lineHeight: 1.45,
              color: line === "ready." ? THEME.hot : THEME.bright,
              textShadow: glow(line === "ready." ? THEME.hot : THEME.bright, 0.4),
              whiteSpace: "pre",
              letterSpacing: 0.5,
            }}>{line || " "}</div>
          ))}
          <span style={{
            display: "inline-block",
            width: 10, height: 18,
            background: THEME.bright,
            verticalAlign: "text-bottom",
            marginTop: 4,
            boxShadow: glow(THEME.bright, 0.5),
            animation: "termBlink 0.7s steps(1) infinite",
          }} />
        </div>
      )}

      <CrtStyles />
    </div>
  );
}

// ───────────────────────── CRT visual layer ─────────────────────────

function CrtStyles() {
  return (
    <style>{`
      @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes termBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.15; } }
      @keyframes crtFlicker {
        0%, 100% { opacity: 0; }
        5%       { opacity: 0.02; }
        10%      { opacity: 0; }
        50%      { opacity: 0.012; }
        51%      { opacity: 0; }
      }
      @keyframes scanMove {
        0%   { transform: translateY(0); }
        100% { transform: translateY(4px); }
      }
      input::placeholder { color: ${THEME.faded}; }
      input:disabled { color: ${THEME.dim}; }
      button:disabled { cursor: default !important; }
      * { box-sizing: border-box; }

      .term-blink { animation: termBlink 1.2s steps(1) infinite; }

      .crt-curve {
        position: fixed; inset: 0; pointer-events: none; z-index: 12;
        box-shadow:
          inset 0 0 80px rgba(0, 0, 0, 0.30),
          inset 0 0 180px rgba(0, 0, 0, 0.35);
        border-radius: 18px;
      }
      .crt-scanlines {
        position: fixed; inset: 0; pointer-events: none; z-index: 10;
        background: repeating-linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0)    0px,
          rgba(0, 0, 0, 0)    2px,
          rgba(0, 0, 0, 0.12) 3px,
          rgba(0, 0, 0, 0.12) 4px
        );
        animation: scanMove 0.15s linear infinite;
      }
      .crt-vignette {
        position: fixed; inset: 0; pointer-events: none; z-index: 9;
        background: radial-gradient(
          ellipse at center,
          transparent 50%,
          rgba(0, 0, 0, 0.30) 92%,
          rgba(0, 0, 0, 0.65) 100%
        );
      }
      .crt-flicker {
        position: fixed; inset: 0; pointer-events: none; z-index: 11;
        background: ${THEME.bright};
        mix-blend-mode: overlay;
        animation: crtFlicker 4s infinite;
      }

      ::selection { background: ${THEME.bright}; color: #000; }

      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track {
        background: ${THEME.panel};
        border-left: 1px solid ${THEME.faded};
      }
      ::-webkit-scrollbar-thumb {
        background: ${THEME.dim};
        border: 2px solid ${THEME.panel};
      }
      ::-webkit-scrollbar-thumb:hover {
        background: ${THEME.base};
      }
      ::-webkit-scrollbar-corner { background: ${THEME.panel}; }
      * { scrollbar-width: thin; scrollbar-color: ${THEME.dim} ${THEME.panel}; }
    `}</style>
  );
}

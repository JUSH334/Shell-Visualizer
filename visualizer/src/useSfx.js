import { useEffect, useRef, useState, useMemo, useCallback } from "react";

// Per-event UI sounds for the visualizer. Synthesized via WebAudio so there
// are no audio assets to ship.

export function useSfx() {
  const audioRef = useRef(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("viz-muted") === "1"; } catch { return false; }
  });

  useEffect(() => {
    mutedRef.current = muted;
    try { localStorage.setItem("viz-muted", muted ? "1" : "0"); } catch { /* ignore */ }
  }, [muted]);

  const getCtx = useCallback(() => {
    if (mutedRef.current) return null;
    if (!audioRef.current) {
      try {
        audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return null; }
    }
    if (audioRef.current.state === "suspended") audioRef.current.resume();
    return audioRef.current;
  }, []);

  const sfx = useMemo(() => {
    const tone = (freq, dur, type = "triangle", vol = 0.05, slideTo = null, detune = 0) => {
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), ctx.currentTime + dur);
      if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    };

    const noiseBurst = (dur, vol = 0.04, filterFreq = 2800, q = 4) => {
      const ctx = getCtx();
      if (!ctx) return;
      const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    };

    // Mechanical click — low body thud + sharp filtered tip.
    const thunk = (vol = 1) => {
      const ctx = getCtx();
      if (!ctx) return;
      const body = ctx.createOscillator();
      const bgain = ctx.createGain();
      body.type = "sine";
      body.frequency.setValueAtTime(190, ctx.currentTime);
      body.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.09);
      bgain.gain.setValueAtTime(0, ctx.currentTime);
      bgain.gain.linearRampToValueAtTime(0.05 * vol, ctx.currentTime + 0.003);
      bgain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
      body.connect(bgain).connect(ctx.destination);
      body.start();
      body.stop(ctx.currentTime + 0.13);
      noiseBurst(0.012, 0.028 * vol, 4200, 6);
    };

    return {
      tick:    () => noiseBurst(0.014, 0.025, 4500 + Math.random() * 800, 6),
      click:   () => thunk(1),
      blip:    (step = 0) => tone(520 + step * 110, 0.10, "triangle", 0.05, 480 + step * 110),
      confirm: () => {
        tone(440, 0.10, "triangle", 0.055, null, -8);
        setTimeout(() => tone(659, 0.16, "triangle", 0.06, null, 6), 90);
      },
      done: () => {
        tone(523, 0.10, "triangle", 0.05);
        setTimeout(() => tone(659, 0.10, "triangle", 0.05), 90);
        setTimeout(() => tone(784, 0.24, "triangle", 0.06), 180);
      },
    };
  }, [getCtx]);

  return { sfx, muted, setMuted };
}

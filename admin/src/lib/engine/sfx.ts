// sfx.ts — synthesize meme sound-effects to WAV buffers (pure TS, no external assets).
// Sibling of music.ts/makePad. Generic: any cue can request a named effect; assemble.mixSfx places them.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type SfxName = "vineboom" | "scratch" | "rimshot" | "ding" | "whoosh" | "boing";
export const SFX_NAMES: SfxName[] = ["vineboom", "scratch", "rimshot", "ding", "whoosh", "boing"];

const SR = 44100;

/** Synthesize a named effect → 16-bit mono WAV Buffer (peak-normalized then scaled by gain). */
export function makeSfx(name: SfxName, opts: { sampleRate?: number; gain?: number } = {}): Buffer {
  const sr = opts.sampleRate ?? SR;
  const gain = opts.gain ?? 0.92;
  let data: Float32Array;
  switch (name) {
    case "vineboom": data = vineBoom(sr); break;
    case "scratch":  data = recordScratch(sr); break;
    case "rimshot":  data = rimshot(sr); break;
    case "ding":     data = ding(sr); break;
    case "whoosh":   data = whoosh(sr); break;
    case "boing":    data = boing(sr); break;
    default:         data = ding(sr);
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  const norm = peak > 0 ? (0.97 / peak) * gain : gain;
  for (let i = 0; i < data.length; i++) data[i] *= norm;
  return floatToWav(data, sr);
}

/** Cache an effect to <dir>/<name>.wav (synth once) and return the path. */
export function sfxFile(name: SfxName, dir: string, opts: { sampleRate?: number; gain?: number } = {}): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.wav`);
  if (!existsSync(p)) writeFileSync(p, makeSfx(name, opts));
  return p;
}

// ── effects ────────────────────────────────────────────────────────────────

// The "vine boom": deep bass thump, pitch glide ~80→38 Hz, sub octave, transient click, exp decay.
function vineBoom(sr: number): Float32Array {
  const dur = 1.35, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let phase = 0, phaseSub = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 38 + 44 * Math.exp(-t / 0.12);                 // glide down
    phase += (2 * Math.PI * f) / sr;
    phaseSub += (2 * Math.PI * (f * 0.5)) / sr;
    const env = Math.exp(-t / 0.5) * Math.min(1, t / 0.004); // fast attack, slow exp tail
    let s = Math.sin(phase) + 0.5 * Math.sin(phaseSub);
    if (t < 0.012) s += (1 - t / 0.012) * (Math.random() * 2 - 1) * 0.6; // initial click
    d[i] = Math.tanh(s * 1.6) * env;                          // soft clip → punch
  }
  return d;
}

// Bright bell "ding!" — inharmonic partials with fast decays.
function ding(sr: number): Float32Array {
  const dur = 0.6, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  const f0 = 1318.5; // E6
  const partials: [number, number, number][] = [[1, 0.55, 0.5], [2.01, 0.4, 0.34], [2.84, 0.3, 0.26], [3.5, 0.22, 0.2]];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (const [mult, amp, tau] of partials) s += amp * Math.sin(2 * Math.PI * f0 * mult * t) * Math.exp(-t / tau);
    d[i] = s * Math.min(1, t / 0.002);
  }
  return d;
}

// Cartoon "boing" — spring: pitch bends down fast with a damped wobble.
function boing(sr: number): Float32Array {
  const dur = 0.5, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const base = 90 + 320 * Math.exp(-t / 0.12);
    const wob = 1 + 0.35 * Math.exp(-t / 0.18) * Math.sin(2 * Math.PI * 18 * t);
    phase += (2 * Math.PI * base * wob) / sr;
    const env = Math.exp(-t / 0.22) * Math.min(1, t / 0.003);
    d[i] = Math.sin(phase) * env;
  }
  return d;
}

// "ba-dum-tss" rimshot — two descending toms then a noisy cymbal.
function rimshot(sr: number): Float32Array {
  const dur = 1.0, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  for (const tm of [{ start: 0.0, f0: 220 }, { start: 0.17, f0: 160 }]) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr - tm.start;
      if (t < 0 || t > 0.22) continue;
      const f = tm.f0 * (1 + 1.2 * Math.exp(-t / 0.025));
      phase += (2 * Math.PI * f) / sr;
      d[i] += Math.sin(phase) * Math.exp(-t / 0.05) * Math.min(1, t / 0.002) * 0.9;
    }
  }
  const cymStart = 0.34;
  for (let i = 0; i < n; i++) {
    const t = i / sr - cymStart;
    if (t < 0 || t > 0.5) continue;
    const env = Math.exp(-t / 0.14) * Math.min(1, t / 0.001);
    d[i] += (Math.random() * 2 - 1) * env * 0.5 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9000 * t));
  }
  return d;
}

// "whoosh" — band-passed noise whose centre sweeps up then down (Chamberlin SVF).
function whoosh(sr: number): Float32Array {
  const dur = 0.55, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let low = 0, band = 0;
  const q = 0.6;
  for (let i = 0; i < n; i++) {
    const p = (i / sr) / dur;
    const cutoff = 300 + 3700 * Math.sin(Math.PI * p);
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, sr / 6)) / sr);
    const x = Math.random() * 2 - 1;
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    d[i] = band * Math.sin(Math.PI * p);
  }
  return d;
}

// Vinyl "record scratch" — buzzy tone scrubbed back-and-forth, drifting down, band-passed + crackle.
function recordScratch(sr: number): Float32Array {
  const dur = 0.6, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let phase = 0, low = 0, band = 0;
  const q = 0.5;
  const fc = 2 * Math.sin((Math.PI * 1200) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, p = t / dur;
    const scrub = Math.sin(2 * Math.PI * 7 * t) * (1 - p);   // hand scrubbing, slows at end
    const f = Math.max(40, 220 * (1 - 0.6 * p) * (1.2 + scrub));
    phase += (2 * Math.PI * f) / sr;
    let x = 0;
    for (let h = 1; h <= 6; h++) x += Math.sin(phase * h) / h; // saw-ish source
    x += (Math.random() * 2 - 1) * 0.25;                       // crackle
    low += fc * band;
    const high = x - low - q * band;
    band += fc * high;
    d[i] = (band * 0.8 + high * 0.2) * Math.min(1, t / 0.01) * (1 - 0.2 * p);
  }
  return d;
}

// ── WAV writer (same format as music.ts/floatToWav) ──────────────────────────
function floatToWav(data: Float32Array, sr: number): Buffer {
  const n = data.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

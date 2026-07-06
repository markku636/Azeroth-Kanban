// sfx.ts — synthesize meme sound-effects to WAV buffers (pure TS, no external assets).
// Sibling of music.ts/makePad. Generic: any cue can request a named effect; assemble.mixSfx places them.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type SfxName =
  | "vineboom" | "scratch" | "rimshot" | "ding" | "whoosh" | "boing"
  | "heartbeat" | "drone" | "sting" | "giggle" | "riser" | "whisper";
export const SFX_NAMES: SfxName[] = [
  "vineboom", "scratch", "rimshot", "ding", "whoosh", "boing",
  "heartbeat", "drone", "sting", "giggle", "riser", "whisper",
];

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
    case "heartbeat": data = heartbeat(sr); break;
    case "drone":    data = drone(sr); break;
    case "sting":    data = sting(sr); break;
    case "giggle":   data = giggle(sr); break;
    case "riser":    data = riser(sr); break;
    case "whisper":  data = whisper(sr); break;
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

// ── horror effects ───────────────────────────────────────────────────────────

// Heartbeat "lub-dub" — two low pitch-glide thumps (vineBoom math, gentler drive) per beat,
// ~55 BPM x 4 beats; duration lands exactly on the beat grid so it loops cleanly.
function heartbeat(sr: number): Float32Array {
  const beat = 60 / 55, dur = beat * 4, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  for (let b = 0; b < 4; b++) {
    for (const th of [{ start: b * beat, amp: 1.0 }, { start: b * beat + 0.08, amp: 0.72 }]) {
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr - th.start;
        if (t < 0 || t > 0.35) continue;
        const f = 35 + 15 * Math.exp(-t / 0.06);                 // glide 50→35 Hz
        phase += (2 * Math.PI * f) / sr;
        const env = Math.exp(-t / 0.09) * Math.min(1, t / 0.005);
        d[i] += Math.tanh(Math.sin(phase) * 1.1) * env * th.amp * 0.6; // lower drive than vineBoom
      }
    }
  }
  return d;
}

// 8s low drone bed — detuned 42 / 43.1 Hz sine pair beating + quiet fifth (63 Hz),
// very slow tremolo, soft clip, long fade in/out at both ends.
function drone(sr: number): Float32Array {
  const dur = 8.0, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const s = Math.sin(2 * Math.PI * 42 * t) + Math.sin(2 * Math.PI * 43.1 * t)
      + 0.3 * Math.sin(2 * Math.PI * 63 * t);
    const trem = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.13 * t);   // very slow tremolo
    const fade = Math.min(1, t / 1.5, (dur - t) / 1.5);          // fade in / fade out
    d[i] = Math.tanh(s * 0.9) * trem * fade;
  }
  return d;
}

// Jump-scare sting — 30ms white-noise burst + dissonant high cluster (minor-second stack,
// fast decay) + 90→30 Hz sub drop over 0.8s, tanh drive.
function sting(sr: number): Float32Array {
  const dur = 1.2, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  const cluster: [number, number][] = [[2300, 0.5], [2440, 0.45], [3100, 0.35]];
  let sub = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    if (t < 0.03) s += (Math.random() * 2 - 1) * (1 - t / 0.03);            // noise burst
    for (const [f, amp] of cluster) s += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.07);
    if (t < 0.8) {
      const f = 30 + 60 * (1 - t / 0.8);                                    // sub drop 90→30 Hz
      sub += (2 * Math.PI * f) / sr;
      s += 0.9 * Math.sin(sub) * Math.exp(-t / 0.45);
    }
    d[i] = Math.tanh(s * 1.8) * Math.min(1, t / 0.002);
  }
  return d;
}

// Warped child-giggle — six falling FM chirps (600→250 Hz, 90ms each, 120ms apart),
// 40 Hz ring-mod + tanh hard clip, then band-passed (Chamberlin SVF, as in whoosh).
function giggle(sr: number): Float32Array {
  const dur = 0.85, n = Math.floor(dur * sr);
  const raw = new Float32Array(n);
  for (let c = 0; c < 6; c++) {
    const start = c * 0.12;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr - start;
      if (t < 0 || t > 0.09) continue;
      const f = 250 + 350 * Math.exp(-t / 0.035);                // chirp 600→250 Hz
      phase += (2 * Math.PI * f) / sr;
      raw[i] += Math.sin(phase) * Math.exp(-t / 0.04) * Math.min(1, t / 0.003);
    }
  }
  const d = new Float32Array(n);
  let low = 0, band = 0;
  const q = 0.7, fc = 2 * Math.sin((Math.PI * 700) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = Math.tanh(raw[i] * Math.sin(2 * Math.PI * 40 * t) * 4); // ring-mod + hard clip
    low += fc * band;
    const high = x - low - q * band;
    band += fc * high;
    d[i] = band;
  }
  return d;
}

// 3s riser — noise + exponential sine sweep 200→1800 Hz with amplitude crescendo,
// then cut dead (the trailing silence sells the scare).
function riser(sr: number): Float32Array {
  const dur = 3.0, cut = 2.9, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (t >= cut) break;                                         // hard cut → trailing silence
    const p = t / cut;
    const f = 200 * Math.pow(9, p);                              // exponential sweep 200→1800 Hz
    phase += (2 * Math.PI * f) / sr;
    const s = Math.sin(phase) * 0.7 + (Math.random() * 2 - 1) * 0.4;
    d[i] = s * (0.08 + 0.92 * p * p);                            // crescendo
  }
  return d;
}

// 1.8s whisper — band-passed noise gated at a random ~7 Hz "syllable" rate.
function whisper(sr: number): Float32Array {
  const dur = 1.8, n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let low = 0, band = 0, gate = 0, target = 0, nextSwitch = 0;
  const q = 0.8, fc = 2 * Math.sin((Math.PI * 2200) / sr);
  const slew = 1 - Math.exp(-1 / (0.012 * sr));                  // ~12ms gate smoothing
  for (let i = 0; i < n; i++) {
    if (i >= nextSwitch) {                                       // new syllable, ~7 Hz rate
      target = Math.random() < 0.25 ? 0 : 0.35 + Math.random() * 0.65;
      nextSwitch = i + Math.floor(sr * (0.09 + Math.random() * 0.1));
    }
    gate += (target - gate) * slew;
    const x = Math.random() * 2 - 1;
    low += fc * band;
    const high = x - low - q * band;
    band += fc * high;
    const t = i / sr;
    d[i] = band * gate * Math.min(1, t / 0.05, (dur - t) / 0.1);
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

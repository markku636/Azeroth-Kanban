// Procedural cinematic ambient BGM bed (pure TS → stereo WAV). Warm evolving pads over an emotional
// vi–IV–I–V arc, a sub-bass root for weight, a gentle L/R detune for stereo width, and a slow swell /
// fade so it breathes like a score bed rather than a flat drone. Mixed (and sidechain-ducked under the
// narration) by assemble.mixBgm. Signature unchanged — callers just get a fuller, stereo bed.
export function makePad(durationSec: number, opts: { sampleRate?: number; gain?: number } = {}): Buffer {
  const sr = opts.sampleRate ?? 44100;
  const gain = opts.gain ?? 0.2;
  const n = Math.floor(durationSec * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  // vi–IV–I–V in A minor (Am – F – C – G): the classic emotional/cinematic loop. Triad voicings, Hz.
  const chords = [
    [220.00, 261.63, 329.63], // Am
    [174.61, 220.00, 261.63], // F
    [261.63, 329.63, 392.00], // C
    [196.00, 246.94, 293.66], // G
  ];
  const roots = [110.00, 87.31, 130.81, 98.00]; // sub-bass root (one octave below) per chord, for weight
  const chordDur = durationSec / chords.length;
  const detune = 1.004; // ~7-cent L/R spread → stereo width without phasing
  // Scale the swell/release windows to the bed length so a short film isn't crushed near-silent (the
  // per-chord and global ramps would otherwise overlap and never reach full level). Long beds keep the
  // original 1.1 / 2.5 / 2.0s feel.
  const envRamp = Math.min(1.1, chordDur / 2.5);
  const swellIn = Math.min(2.5, durationSec / 4);
  const relOut = Math.min(2.0, durationSec / 4);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ci = Math.min(chords.length - 1, Math.floor(t / chordDur));
    const chord = chords[ci];
    const localT = t - ci * chordDur;
    const env = Math.min(1, localT / envRamp) * Math.min(1, (chordDur - localT) / envRamp); // per-chord swell
    const trem = 0.88 + 0.12 * Math.sin(2 * Math.PI * 0.12 * t);                    // slow tremolo

    let l = 0, r = 0;
    for (const f of chord) {
      l += Math.sin(2 * Math.PI * f * t);
      r += Math.sin(2 * Math.PI * f * detune * t);
      l += 0.18 * Math.sin(2 * Math.PI * f * 2 * t);            // soft octave shimmer
      r += 0.18 * Math.sin(2 * Math.PI * f * 2 * detune * t);
    }
    const sub = 0.45 * Math.sin(2 * Math.PI * roots[ci] * t);   // centred sub-bass root for warmth/weight
    l = l / (chord.length * 1.5) + sub * 0.5;
    r = r / (chord.length * 1.5) + sub * 0.5;

    // global swell in over ~2.5s, fade out over ~2s — cinematic build / release across the whole bed
    const g = Math.min(1, t / swellIn) * Math.min(1, (durationSec - t) / relOut);
    const a = gain * env * trem * g;
    L[i] = Math.max(-1, Math.min(1, l * a));
    R[i] = Math.max(-1, Math.min(1, r * a));
  }
  return stereoToWav(L, R, sr);
}

function stereoToWav(L: Float32Array, R: Float32Array, sr: number): Buffer {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4); // 16-bit stereo → 4 bytes/frame
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE((Math.max(-1, Math.min(1, L[i])) * 32767) | 0, o); o += 2;
    buf.writeInt16LE((Math.max(-1, Math.min(1, R[i])) * 32767) | 0, o); o += 2;
  }
  return buf;
}

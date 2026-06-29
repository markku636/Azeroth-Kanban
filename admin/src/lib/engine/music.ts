// Procedural ambient BGM pad (pure TS → WAV buffer). Gentle 4-chord bed, soft attack/release.
export function makePad(durationSec: number, opts: { sampleRate?: number; gain?: number } = {}): Buffer {
  const sr = opts.sampleRate ?? 44100;
  const gain = opts.gain ?? 0.2;
  const n = Math.floor(durationSec * sr);
  const data = new Float32Array(n);
  // soft major-key progression: C - Am - F - G (root + triad + 7th-ish), Hz
  const chords = [
    [130.81, 164.81, 196.0, 246.94],
    [110.0, 130.81, 164.81, 220.0],
    [87.31, 110.0, 130.81, 174.61],
    [98.0, 123.47, 146.83, 196.0],
  ];
  const chordDur = durationSec / chords.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ci = Math.min(chords.length - 1, Math.floor(t / chordDur));
    const chord = chords[ci];
    const localT = t - ci * chordDur;
    const env = Math.min(1, localT / 0.9) * Math.min(1, (chordDur - localT) / 0.9); // per-chord attack/release
    const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.15 * t);                    // slow tremolo
    let s = 0;
    for (const f of chord) {
      s += Math.sin(2 * Math.PI * f * t);
      s += 0.28 * Math.sin(2 * Math.PI * f * 2 * t);                                 // octave shimmer
    }
    s = (s / (chord.length * 1.3)) * env * trem;
    const g = Math.min(1, t / 1.5) * Math.min(1, (durationSec - t) / 1.5);          // global fade in/out
    data[i] = s * gain * g;
  }
  return floatToWav(data, sr);
}

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

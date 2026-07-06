// Procedural cinematic ambient BGM bed (pure TS → stereo WAV). Warm evolving pads over an emotional
// vi–IV–I–V arc, a sub-bass root for weight, a gentle L/R detune for stereo width, and a slow swell /
// fade so it breathes like a score bed rather than a flat drone. Mixed (and sidechain-ducked under the
// narration) by assemble.mixBgm. Signature unchanged — callers just get a fuller, stereo bed.
// Emotional mood → 4-chord loop + sub-bass roots (one octave below each chord). 'neutral' is the
// original Am–F–C–G (byte-identical default); the caller derives mood from the project's tone/genre so
// a tense thriller gets a suspended progression, a comedy a brighter one, etc. Optional per-mood fields
// ('horror' only so far, all backward-compatible): tremHz overrides the default 0.12Hz tremolo,
// droneHz/droneGain layer a constant sub-drone under the bed, friction adds an intermittent
// semitone-rub overtone for unease.
const MOODS: Record<string, { chords: number[][]; roots: number[]; tremHz?: number; droneHz?: number; droneGain?: number; friction?: boolean }> = {
  neutral: { chords: [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]], roots: [110, 87.31, 130.81, 98] },     // Am–F–C–G
  warm:    { chords: [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63]], roots: [130.81, 98, 110, 87.31] },     // C–G–Am–F (uplifting)
  somber:  { chords: [[220, 261.63, 329.63], [164.81, 196, 246.94], [174.61, 220, 261.63], [261.63, 329.63, 392]], roots: [110, 82.41, 87.31, 130.81] },  // Am–Em–F–C (melancholy)
  tense:   { chords: [[220, 261.63, 329.63], [174.61, 220, 261.63], [146.83, 174.61, 220], [164.81, 207.65, 246.94]], roots: [110, 87.31, 73.42, 82.41] }, // Am–F–Dm–E (suspense)
  // horror: low-register minor Am–Fm(♭6 colour)–Cm/G–E♭dim with every sub root kept in the 55–110Hz
  // octave; near-static 0.07Hz tremolo, a constant 36.7Hz sub-drone and occasional semitone friction
  // give cold dread while staying at the same mixed level as the other moods.
  horror:  { chords: [[110, 130.81, 164.81], [130.81, 174.61, 207.65], [130.81, 155.56, 196], [155.56, 185, 220]], roots: [55, 87.31, 98, 77.78], tremHz: 0.07, droneHz: 36.7, droneGain: 0.08, friction: true }, // Am–Fm–Cm/G–E♭dim
};

export function makePad(durationSec: number, opts: { sampleRate?: number; gain?: number; mood?: string } = {}): Buffer {
  const sr = opts.sampleRate ?? 44100;
  const gain = opts.gain ?? 0.2;
  const n = Math.floor(durationSec * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  // 4-chord emotional loop selected by mood (default 'neutral' = the original Am–F–C–G). Triad voicings.
  const spec = MOODS[opts.mood ?? 'neutral'] ?? MOODS.neutral;
  const { chords, roots } = spec;
  const chordDur = durationSec / chords.length;
  const detune = 1.004; // ~7-cent L/R spread → stereo width without phasing
  const tremHz = spec.tremHz ?? 0.12; // horror slows this to ~0.07Hz for a near-static, uneasy pulse
  // Constant sub-drone (horror only): bypasses the per-chord envelope/tremolo so it never breathes; it
  // only rides the global swell (no start/end clicks) and scales with the requested gain (≈0.08 at the
  // default 0.2) so the bed stays at the same level as the other moods under the narration duck.
  const droneHz = spec.droneHz ?? 0;
  const droneAmp = droneHz ? (spec.droneGain ?? 0.08) * (gain / 0.2) : 0;
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
    const trem = 0.88 + 0.12 * Math.sin(2 * Math.PI * tremHz * t);                  // slow tremolo

    let l = 0, r = 0;
    for (const f of chord) {
      l += Math.sin(2 * Math.PI * f * t);
      r += Math.sin(2 * Math.PI * f * detune * t);
      l += 0.18 * Math.sin(2 * Math.PI * f * 2 * t);            // soft octave shimmer
      r += 0.18 * Math.sin(2 * Math.PI * f * 2 * detune * t);
    }
    if (spec.friction) {
      // occasional semitone-rub overtone above the top voice — a slow gate lets it surface and vanish,
      // and the minor-2nd beating adds unease without raising the bed's overall level
      const fr = chord[chord.length - 1] * 1.05946;
      const gate = Math.max(0, Math.sin(2 * Math.PI * 0.031 * t + 1.7));
      l += 0.1 * gate * Math.sin(2 * Math.PI * fr * t);
      r += 0.1 * gate * Math.sin(2 * Math.PI * fr * detune * t);
    }
    const sub = 0.45 * Math.sin(2 * Math.PI * roots[ci] * t);   // centred sub-bass root for warmth/weight
    l = l / (chord.length * 1.5) + sub * 0.5;
    r = r / (chord.length * 1.5) + sub * 0.5;

    // global swell in over ~2.5s, fade out over ~2s — cinematic build / release across the whole bed
    const g = Math.min(1, t / swellIn) * Math.min(1, (durationSec - t) / relOut);
    const a = gain * env * trem * g;
    const drone = droneAmp ? droneAmp * Math.sin(2 * Math.PI * droneHz * t) * g : 0; // centred, constant
    L[i] = Math.max(-1, Math.min(1, l * a + drone));
    R[i] = Math.max(-1, Math.min(1, r * a + drone));
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

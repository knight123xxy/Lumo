const sampleRate = 48000;
export const beatSeconds = 60 / 120;

// 原创四小节合成配乐，八分音符分解和弦加四分音符低鼓。不依赖外部音乐或服务。
export function buildTemplateMusic(beats: number) {
  const count = Math.round(beats * beatSeconds * sampleRate);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);

  const chords = [[45, 60, 64, 69], [41, 60, 65, 69], [48, 60, 64, 67], [43, 59, 62, 67]] as const;
  const pattern = [1, 2, 3, 2, 1, 2, 3, 2] as const;
  const eighthSamples = sampleRate * beatSeconds / 2;
  const tone = (note: number, time: number) => Math.sin(2 * Math.PI * 440 * 2 ** ((note - 69) / 12) * time);
  for (let i = 0; i < count; i++) {
    const step = Math.floor(i / eighthSamples);
    const chord = chords[Math.floor(step / 8) % chords.length]!;
    const note = chord[pattern[step % pattern.length]!];
    const t = (i % eighthSamples) / sampleRate;
    const beatT = (i % (2 * eighthSamples)) / sampleRate;
    const pluck = Math.min(t / 0.012, 1) * Math.min((beatSeconds / 2 - t) / 0.04, 1) * Math.exp(-9 * t);
    const bass = Math.min(beatT / 0.018, 1) * Math.min((beatSeconds - beatT) / 0.06, 1) * Math.exp(-4 * beatT);
    const kick = Math.sin(2 * Math.PI * (49 * beatT + 2.3 * (1 - Math.exp(-45 * beatT)))) * Math.min(beatT / 0.004, 1) * Math.exp(-24 * beatT);
    const fade = Math.min((count - i) / (sampleRate * 0.12), 1);
    const sample = fade * (pluck * (0.095 * tone(note, t) + 0.024 * tone(note + 12, t)) + 0.105 * bass * tone(chord[0], beatT) + 0.2 * kick);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + 2 * i);
  }
  return wav;
}

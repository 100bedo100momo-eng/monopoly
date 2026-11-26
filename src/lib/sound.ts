"use client";

// مؤثرات صوتية مولّدة برمجيًا عبر WebAudio — بلا ملفات خارجية وبلا حقوق.
type SoundName = "click" | "dice" | "move" | "cash" | "card" | "bid" | "win" | "error" | "notify";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + when);
  osc.stop(ac.currentTime + when + dur);
}

function noise(dur: number, gain: number) {
  const ac = audio();
  if (!ac) return;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(g).connect(ac.destination);
  src.start();
}

const recipes: Record<SoundName, () => void> = {
  click: () => tone(660, 0.05, "square", 0.05),
  dice: () => {
    noise(0.18, 0.12);
    tone(220, 0.1, "triangle", 0.08, 0.05);
    tone(330, 0.1, "triangle", 0.07, 0.12);
  },
  move: () => tone(520, 0.06, "sine", 0.09),
  cash: () => {
    tone(880, 0.08, "sine", 0.12);
    tone(1320, 0.1, "sine", 0.1, 0.07);
  },
  card: () => {
    tone(300, 0.12, "sawtooth", 0.05);
    tone(600, 0.1, "sine", 0.08, 0.08);
  },
  bid: () => tone(740, 0.09, "square", 0.07),
  win: () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.22, "triangle", 0.12, i * 0.14));
  },
  error: () => tone(160, 0.18, "sawtooth", 0.1),
  notify: () => tone(600, 0.07, "sine", 0.06),
};

let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted() {
  return muted;
}

export function play(name: SoundName) {
  if (muted) return;
  try {
    recipes[name]();
  } catch {
    /* تجاهل قيود المتصفح */
  }
}

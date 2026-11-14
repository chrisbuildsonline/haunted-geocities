// Sound effects, synthesized with the Web Audio API: no files, no network. Muted until the popup's
// Sound effects switch stores audioEnabled === true. One player per document (the popup, each haunted
// page's content script), one lazily made real-time AudioContext per player, one master gain.
// Imported by the popup and the costume only, never by the MAIN-world hooks.
import { AUDIO_KEY } from "../data/types";

export const SOUND_KINDS = ["whoosh", "ghost", "thud", "sting", "organ"] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

/** Length of each sound in seconds, release included. Every value is at most MAX_SECONDS. */
export const SOUND_DURATION: Record<SoundKind, number> = { whoosh: 0.9, ghost: 0.8, thud: 0.5, sting: 0.6, organ: 0.7 };

export const MASTER_GAIN = 0.2;
export const MAX_SECONDS = 1.2;
export const MAX_VOICES = 4;
export const DEBOUNCE_MS = 150;
export const CLOSE_RAMP_S = 0.03;

export interface PlayerDeps {
  storage: Pick<typeof chrome.storage, "local" | "onChanged">;
  /** In production: () => new AudioContext(). Tests pass a fake. */
  createContext: () => AudioContext;
  /** For the debounce. Default performance.now. */
  now?: () => number;
}

export interface Player {
  play(kind: SoundKind): void;
  /** Close the context and stop following storage. */
  dispose(): void;
}

interface Voice {
  stop(): void;
  disconnect(): void;
  onEnded(fn: () => void): void;
}

/** 0 at t0, a linear rise to `peak`, a hold, a linear fall to exactly 0. */
function envelope(g: GainNode, t0: number, attack: number, peak: number, hold: number, release: number): void {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.linearRampToValueAtTime(0, t0 + attack + hold + release);
}

/** Mono white noise, made in code. */
function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  buffer.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

function osc(ctx: AudioContext, type: OscillatorType, hz: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  return o;
}

function filter(ctx: AudioContext, type: BiquadFilterType, hz: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  return f;
}

/** Start every source now and schedule its stop at the sound's end; the voice ends with its last source. */
function voice(t0: number, seconds: number, sources: AudioScheduledSourceNode[], nodes: AudioNode[]): Voice {
  let left = sources.length;
  let done: (() => void) | undefined;
  for (const s of sources) {
    s.onended = () => {
      if (--left === 0) done?.();
    };
    s.start(t0);
    s.stop(t0 + seconds);
  }
  return {
    stop: () => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
    },
    disconnect: () => {
      for (const n of [...sources, ...nodes]) n.disconnect();
    },
    onEnded: (fn) => (done = fn),
  };
}

type Build = (ctx: AudioContext, out: AudioNode) => Voice;

const SOUNDS: Record<SoundKind, Build> = {
  // Band-passed noise sweeping up, loudest near the middle.
  whoosh(ctx, out) {
    const t0 = ctx.currentTime;
    const d = SOUND_DURATION.whoosh;
    const src = noise(ctx, d);
    const bp = filter(ctx, "bandpass", 200);
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(200, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + d);
    const env = ctx.createGain();
    envelope(env, t0, 0.3, 0.9, 0.15, 0.45);
    src.connect(bp).connect(env).connect(out);
    return voice(t0, d, [src], [bp, env]);
  },
  // A soft "ooo": two sines 7 cents apart, a slow vibrato on both.
  ghost(ctx, out) {
    const t0 = ctx.currentTime;
    const a = osc(ctx, "sine", 392);
    const b = osc(ctx, "sine", 392);
    b.detune.value = 7;
    const lfo = osc(ctx, "sine", 5.5);
    const depth = ctx.createGain();
    depth.gain.value = 4; // cents
    lfo.connect(depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    const env = ctx.createGain();
    envelope(env, t0, 0.25, 0.5, 0.15, 0.4);
    a.connect(env);
    b.connect(env);
    env.connect(out);
    return voice(t0, SOUND_DURATION.ghost, [a, b, lfo], [depth, env]);
  },
  // A low stone thud: a falling sine and a short low-passed knock of noise.
  thud(ctx, out) {
    const t0 = ctx.currentTime;
    const o = osc(ctx, "sine", 90);
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
    const env = ctx.createGain();
    envelope(env, t0, 0.005, 0.9, 0.145, 0.35);
    o.connect(env).connect(out);
    const knock = noise(ctx, 0.06);
    const lp = filter(ctx, "lowpass", 300);
    const kenv = ctx.createGain();
    envelope(kenv, t0, 0.005, 0.6, 0, 0.05);
    knock.connect(lp).connect(kenv).connect(out);
    return voice(t0, SOUND_DURATION.thud, [o, knock], [env, lp, kenv]);
  },
  // A short dissonant sting: two sawtooths a tritone apart, low-passed.
  sting(ctx, out) {
    const t0 = ctx.currentTime;
    const a = osc(ctx, "sawtooth", 220);
    const b = osc(ctx, "sawtooth", 311.1);
    const lp = filter(ctx, "lowpass", 900);
    const env = ctx.createGain();
    envelope(env, t0, 0.01, 0.5, 0.14, 0.45);
    a.connect(lp);
    b.connect(lp);
    lp.connect(env).connect(out);
    return voice(t0, SOUND_DURATION.sting, [a, b], [lp, env]);
  },
  // A low organ stab: three squares on 55 Hz and its harmonics, low-passed.
  organ(ctx, out) {
    const t0 = ctx.currentTime;
    const lp = filter(ctx, "lowpass", 600);
    const parts = ([[55, 0.5], [110, 0.3], [165, 0.2]] as const).map(([hz, level]) => {
      const o = osc(ctx, "square", hz);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(lp);
      return [o, g] as const;
    });
    const env = ctx.createGain();
    envelope(env, t0, 0.02, 0.6, 0.18, 0.5);
    lp.connect(env).connect(out);
    return voice(t0, SOUND_DURATION.organ, parts.map(([o]) => o), [...parts.map(([, g]) => g), lp, env]);
  },
};

export function createPlayer(deps: PlayerDeps): Player {
  const now = deps.now ?? (() => performance.now());
  let enabled = false;
  let settled = false; // a change or dispose came before the first read: that read is stale
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const voices = new Set<Voice>();
  const last = new Map<SoundKind, number>();

  const silence = () => {
    if (!ctx || !master) return;
    const c = ctx;
    const m = master;
    ctx = null;
    master = null;
    for (const v of voices) v.stop();
    voices.clear();
    try {
      m.gain.cancelScheduledValues(c.currentTime);
      m.gain.setValueAtTime(m.gain.value, c.currentTime);
      m.gain.linearRampToValueAtTime(0, c.currentTime + CLOSE_RAMP_S);
    } catch {
      // closing anyway
    }
    setTimeout(() => void c.close().catch(() => {}), CLOSE_RAMP_S * 1000);
  };

  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !(AUDIO_KEY in changes)) return;
    settled = true;
    enabled = changes[AUDIO_KEY]!.newValue === true;
    if (!enabled) silence();
  };

  deps.storage.onChanged.addListener(onChanged);
  deps.storage.local
    .get({ [AUDIO_KEY]: false })
    .then((v) => {
      if (!settled) enabled = v[AUDIO_KEY] === true;
    })
    .catch(() => {});

  return {
    play(kind) {
      if (!enabled) return;
      try {
        const t = now();
        if (t - (last.get(kind) ?? -Infinity) < DEBOUNCE_MS || voices.size >= MAX_VOICES) return;
        if (!ctx) {
          const c = deps.createContext();
          const m = c.createGain();
          m.gain.value = MASTER_GAIN;
          m.connect(c.destination);
          ctx = c;
          master = m;
        }
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        last.set(kind, t);
        const v = SOUNDS[kind](ctx, master!);
        voices.add(v);
        v.onEnded(() => {
          voices.delete(v);
          v.disconnect();
        });
      } catch {
        // a sound must never break a card or the Haunt click
      }
    },
    dispose() {
      settled = true;
      enabled = false;
      deps.storage.onChanged.removeListener(onChanged);
      silence();
    },
  };
}

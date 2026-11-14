// The five sounds, one graph each: node types, frequencies, lengths and envelopes (requirements 19, 24-29, 44).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AUDIO_KEY } from "../../src/data/types";
import { createPlayer, SOUND_DURATION, SOUND_KINDS, type SoundKind } from "../../src/audio/sound";
import { asChrome, createChromeMock } from "../chrome-mock";
import { createContext, FakeAudioContext, FakeNode, FakeParam } from "./fake-audio";

beforeEach(() => FakeAudioContext.reset());
afterEach(() => FakeAudioContext.reset());

/** Play `kind` once with sound on; the graph without the master gain. */
async function graph(kind: SoundKind) {
  FakeAudioContext.reset();
  const m = createChromeMock();
  m.chrome.storage.local.data[AUDIO_KEY] = true;
  const player = createPlayer({ storage: asChrome(m).storage, createContext });
  await new Promise((r) => setTimeout(r, 0));
  player.play(kind);
  const ctx = FakeAudioContext.instances[0]!;
  const master = ctx.toDestination[0]!;
  const nodes = ctx.nodes.filter((n) => n !== master);
  const t0 = ctx.currentTime;
  return {
    ctx,
    t0,
    master,
    nodes,
    oscs: nodes.filter((n) => n.kind === "oscillator"),
    filters: nodes.filter((n) => n.kind === "biquad"),
    noise: nodes.filter((n) => n.kind === "bufferSource"),
    gains: nodes.filter((n) => n.kind === "gain"),
    /** Gain nodes with an envelope (automation), as opposed to fixed mix levels. */
    envelopes: nodes.filter((n) => n.kind === "gain" && n.gain.calls.length > 0),
  };
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const call = (p: FakeParam, method: string) => p.calls.find((c) => c[0] === method);

describe("SOUND_DURATION", () => {
  test("gives each sound's length", () => {
    expect(SOUND_DURATION).toEqual({ whoosh: 0.9, ghost: 0.8, thud: 0.5, sting: 0.6, organ: 0.7 });
  });
});

describe("whoosh", () => {
  test("whoosh: a bandpass sweeps 200 to 2400 Hz over 0.9 seconds", async () => {
    const g = await graph("whoosh");
    expect(g.oscs).toHaveLength(0);
    expect(g.filters).toHaveLength(1);
    const f = g.filters[0]!;
    expect(f.type).toBe("bandpass");
    expect(f.Q.value).toBe(3);
    expect(call(f.frequency, "setValueAtTime")).toEqual(["setValueAtTime", 200, g.t0]);
    const ramp = call(f.frequency, "exponentialRampToValueAtTime")!;
    expect(ramp[1]).toBe(2400);
    expect(close(ramp[2], g.t0 + 0.9)).toBe(true);
    expect(g.noise[0]!.connections).toContain(f);
  });

  test("whoosh: the noise buffer is 0.9 seconds", async () => {
    const g = await graph("whoosh");
    expect(g.noise).toHaveLength(1);
    const buf = g.noise[0]!.buffer!;
    expect(buf.numberOfChannels).toBe(1);
    expect(close(buf.duration, 0.9, 1 / buf.sampleRate)).toBe(true);
    // white noise made in code, in [-1, 1), copied in (never read back from a rendered buffer)
    expect(buf.copied).toHaveLength(1);
    const data = buf.copied[0]!.data;
    expect(data.length).toBe(buf.length);
    expect(data.every((x) => x >= -1 && x < 1)).toBe(true);
    expect(new Set(data.slice(0, 100)).size).toBeGreaterThan(50);
  });

  test("whoosh: gain starts and ends at 0, peaking near the middle", async () => {
    const g = await graph("whoosh");
    expect(g.envelopes).toHaveLength(1);
    const env = g.envelopes[0]!.gain.calls;
    expect(env[0]).toEqual(["setValueAtTime", 0, g.t0]);
    expect(env.at(-1)![1]).toBe(0);
    expect(close(env.at(-1)![2], g.t0 + 0.9)).toBe(true);
    const peak = Math.max(...env.map((c) => c[1]));
    const at = env.find((c) => c[1] === peak)![2] - g.t0;
    expect(at).toBeGreaterThanOrEqual(0.2);
    expect(at).toBeLessThanOrEqual(0.6);
  });
});

describe("card sounds", () => {
  test("ghost: two sines detuned 7 cents with a 5.5 Hz vibrato of at most 12 cents", async () => {
    const g = await graph("ghost");
    expect(g.noise).toHaveLength(0);
    expect(g.oscs.every((o) => o.type === "sine")).toBe(true);
    const voices = g.oscs.filter((o) => o.frequency.value === 392);
    expect(voices).toHaveLength(2);
    expect(voices.map((v) => v.detune.value).sort()).toEqual([0, 7]);
    const lfo = g.oscs.find((o) => o.frequency.value !== 392)!;
    expect(lfo.frequency.value).toBeGreaterThanOrEqual(5);
    expect(lfo.frequency.value).toBeLessThanOrEqual(6);
    const depth = lfo.connections[0] as FakeNode;
    expect(depth.kind).toBe("gain");
    expect(Math.abs(depth.gain.value)).toBeLessThanOrEqual(12);
    for (const v of voices) expect(depth.connections).toContain(v.detune);
    expect(Math.max(...g.ctx.sources.map((s) => s.stops[0]! - g.t0))).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  test("thud: a sine falls from 90 to 40 Hz in 0.25 seconds", async () => {
    const g = await graph("thud");
    expect(g.oscs).toHaveLength(1);
    const o = g.oscs[0]!;
    expect(o.type).toBe("sine");
    expect(call(o.frequency, "setValueAtTime")).toEqual(["setValueAtTime", 90, g.t0]);
    const ramp = call(o.frequency, "exponentialRampToValueAtTime")!;
    expect(ramp[1]).toBe(40);
    expect(close(ramp[2], g.t0 + 0.25)).toBe(true);
    // a short low-passed noise burst at the start
    expect(g.noise).toHaveLength(1);
    expect(g.noise[0]!.starts[0]).toBe(g.t0);
    expect(g.noise[0]!.buffer!.duration).toBeLessThanOrEqual(0.1);
    const lp = g.filters.find((f) => f.type === "lowpass")!;
    expect(lp.frequency.value).toBe(300);
    expect(g.noise[0]!.connections).toContain(lp);
    expect(Math.max(...g.ctx.sources.map((s) => s.stops[0]! - g.t0))).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  test("sting: two sawtooths a tritone apart through a lowpass", async () => {
    const g = await graph("sting");
    expect(g.oscs).toHaveLength(2);
    expect(g.oscs.every((o) => o.type === "sawtooth")).toBe(true);
    const [lo, hi] = g.oscs.map((o) => o.frequency.value).sort((a, b) => a - b) as [number, number];
    expect(lo).toBe(220);
    expect(Math.abs(hi / lo - Math.SQRT2)).toBeLessThan(0.01);
    expect(g.filters).toHaveLength(1);
    expect(g.filters[0]!.type).toBe("lowpass");
    expect(g.filters[0]!.frequency.value).toBe(900);
    for (const o of g.oscs) expect(o.connections).toContain(g.filters[0]!);
    expect(Math.max(...g.ctx.sources.map((s) => s.stops[0]! - g.t0))).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  test("organ: square oscillators at 55, 110 and 165 Hz through a lowpass", async () => {
    const g = await graph("organ");
    expect(g.oscs).toHaveLength(3);
    expect(g.oscs.every((o) => o.type === "square")).toBe(true);
    expect(g.oscs.map((o) => o.frequency.value).sort((a, b) => a - b)).toEqual([55, 110, 165]);
    expect(g.filters).toHaveLength(1);
    expect(g.filters[0]!.type).toBe("lowpass");
    expect(g.filters[0]!.frequency.value).toBe(600);
    const mix = g.oscs.map((o) => (o.connections[0] as FakeNode).gain.value);
    expect(mix).toEqual([0.5, 0.3, 0.2]);
    expect(Math.max(...g.ctx.sources.map((s) => s.stops[0]! - g.t0))).toBeLessThanOrEqual(0.7 + 1e-9);
  });
});

describe("every sound", () => {
  test("every sound's gain starts and ends at 0", async () => {
    for (const k of SOUND_KINDS) {
      const g = await graph(k);
      expect({ k, envelopes: g.envelopes.length > 0 }).toEqual({ k, envelopes: true });
      for (const e of g.envelopes) {
        const c = e.gain.calls;
        expect({ k, first: c[0]![0], v: c[0]![1] }).toEqual({ k, first: "setValueAtTime", v: 0 });
        expect({ k, last: c.at(-1)![1] }).toEqual({ k, last: 0 });
        expect(c.at(-1)![2] - g.t0).toBeLessThanOrEqual(SOUND_DURATION[k] + 1e-9);
        // attack of at least 5 ms, release of at least 20 ms: no click
        expect(c[1]![2] - c[0]![2]).toBeGreaterThanOrEqual(0.005 - 1e-9);
        expect(c.at(-1)![2] - c.at(-2)![2]).toBeGreaterThanOrEqual(0.02 - 1e-9);
        // one rise and one fall: nothing pulses
        const rises = c.slice(1).filter((x, i) => x[1] > c[i]![1]).length;
        expect({ k, rises }).toEqual({ k, rises: 1 });
      }
    }
  });

  test("no gain before the master goes above 1", async () => {
    for (const k of SOUND_KINDS) {
      const g = await graph(k);
      // a gain that feeds an AudioParam (the ghost's vibrato depth, in cents) is not a loudness
      const loud = g.gains.filter((n) => !n.connections.some((t) => t instanceof FakeParam));
      for (const n of loud) for (const v of n.gain.values()) expect({ k, v: v <= 1 }).toEqual({ k, v: true });
    }
  });

  test("no source loops", async () => {
    for (const k of SOUND_KINDS) {
      const g = await graph(k);
      for (const s of g.noise) expect(s.loop).toBe(false);
    }
  });

  test("every sound is made in play, not before", async () => {
    for (const k of SOUND_KINDS) {
      const g = await graph(k);
      expect(g.ctx.sources.every((s) => s.starts[0] === g.t0)).toBe(true);
    }
  });
});

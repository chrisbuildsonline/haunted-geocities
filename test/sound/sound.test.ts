// The sound module's player: muted by default, one lazy AudioContext, a master gain of at most 0.25,
// every sound stopped within 1.2 s, and a live toggle that closes the context. Uses a fake AudioContext.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_KEY } from "../../src/data/types";
import { CLOSE_RAMP_S, createPlayer, DEBOUNCE_MS, MASTER_GAIN, MAX_SECONDS, MAX_VOICES, SOUND_DURATION, SOUND_KINDS, type SoundKind } from "../../src/audio/sound";
import { asChrome, createChromeMock } from "../chrome-mock";
import { createContext, FakeAudioContext, FakeNode, FakeParam } from "./fake-audio";

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => FakeAudioContext.reset());
afterEach(() => FakeAudioContext.reset());

/** A player over a chrome storage mock. `audio` is what storage.local holds at start (undefined: no key). */
async function setup(opts: { audio?: unknown; clock?: { t: number } } = {}) {
  const m = createChromeMock();
  if (opts.audio !== undefined) m.chrome.storage.local.data[AUDIO_KEY] = opts.audio;
  const writes: unknown[] = [];
  const set = m.chrome.storage.local.set;
  m.chrome.storage.local.set = async (items: Record<string, unknown>) => {
    writes.push(items);
    return set(items);
  };
  const clock = opts.clock ?? { t: 0 };
  const player = createPlayer({ storage: asChrome(m).storage, createContext, now: () => clock.t });
  await flush();
  const change = (newValue: unknown, area = "local", key = AUDIO_KEY) => {
    for (const l of [...m.chrome.storage.onChanged.listeners]) l({ [key]: { newValue } }, area);
  };
  return { m, player, writes, clock, change };
}

const contexts = () => FakeAudioContext.instances;
const only = () => {
  expect(contexts()).toHaveLength(1);
  return contexts()[0]!;
};

describe("constants", () => {
  test("importing the module constructs nothing", () => {
    expect(contexts()).toHaveLength(0);
  });

  test("SOUND_KINDS lists the five kinds", () => {
    expect([...SOUND_KINDS]).toEqual(["whoosh", "ghost", "thud", "sting", "organ"]);
  });

  test("every SOUND_DURATION is at most 1.2", () => {
    expect(MAX_SECONDS).toBe(1.2);
    expect(Object.keys(SOUND_DURATION).sort()).toEqual([...SOUND_KINDS].sort());
    for (const k of SOUND_KINDS) expect(SOUND_DURATION[k]).toBeLessThanOrEqual(MAX_SECONDS);
  });

  test("MASTER_GAIN is at most 0.25", () => {
    expect(MASTER_GAIN).toBe(0.2);
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.25);
    expect([MAX_VOICES, DEBOUNCE_MS, CLOSE_RAMP_S]).toEqual([4, 150, 0.03]);
  });
});

describe("muted path", () => {
  test("muted by default: play constructs no context and no node", async () => {
    const { player, clock } = await setup();
    for (const k of SOUND_KINDS) {
      clock.t += 1000;
      player.play(k);
    }
    expect(contexts()).toHaveLength(0);
  });

  test("a rejected storage read stays muted", async () => {
    const m = createChromeMock();
    m.chrome.storage.local.get = async () => {
      throw new Error("no storage");
    };
    const player = createPlayer({ storage: asChrome(m).storage, createContext });
    await flush();
    player.play("ghost");
    expect(contexts()).toHaveLength(0);
  });

  test("a missing key stays muted", async () => {
    const { player } = await setup({ audio: undefined });
    player.play("thud");
    expect(contexts()).toHaveLength(0);
  });

  test("only the value true turns sound on", async () => {
    for (const v of [false, "true", 1, null, {}]) {
      const { player } = await setup({ audio: v });
      player.play("sting");
    }
    expect(contexts()).toHaveLength(0);
    const { player } = await setup({ audio: true });
    player.play("sting");
    expect(contexts()).toHaveLength(1);
  });

  test("a play before the first storage read resolves plays nothing", async () => {
    const m = createChromeMock();
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const player = createPlayer({ storage: asChrome(m).storage, createContext });
    player.play("ghost");
    expect(contexts()).toHaveLength(0);
  });

  test("never writes storage", async () => {
    const { player, writes, change } = await setup({ audio: true });
    player.play("ghost");
    change(false);
    change(true);
    player.dispose();
    expect(writes).toEqual([]);
  });

  test("ignores other areas and other keys", async () => {
    const { player, change } = await setup();
    change(true, "session");
    change(true, "sync");
    change(true, "local", "somethingElse");
    player.play("ghost");
    expect(contexts()).toHaveLength(0);
    change(true);
    player.play("ghost");
    expect(contexts()).toHaveLength(1);
  });

  test("reads storage once and follows onChanged, without polling", async () => {
    const m = createChromeMock();
    let reads = 0;
    const get = m.chrome.storage.local.get;
    m.chrome.storage.local.get = async (k?: any) => {
      reads++;
      return get(k);
    };
    createPlayer({ storage: asChrome(m).storage, createContext });
    await wait(50);
    expect(reads).toBe(1);
    expect(m.chrome.storage.onChanged.listeners).toHaveLength(1);
  });
});

describe("context and master gain", () => {
  test("first play creates one context and one master gain", async () => {
    const { player } = await setup({ audio: true });
    player.play("ghost");
    const ctx = only();
    const master = ctx.toDestination;
    expect(master).toHaveLength(1);
    expect(master[0]!.kind).toBe("gain");
    expect(ctx.nodes[0]).toBe(master[0]!); // built before any sound
  });

  test("master gain is at most 0.25", async () => {
    const { player, clock } = await setup({ audio: true });
    for (const k of SOUND_KINDS) {
      clock.t += 1000;
      player.play(k);
    }
    const master = only().toDestination[0]!;
    expect(master.gain.value).toBe(MASTER_GAIN);
    for (const v of master.gain.values()) expect(v).toBeLessThanOrEqual(0.25);
  });

  test("only the master connects to destination", async () => {
    const { player, clock } = await setup({ audio: true });
    for (const k of SOUND_KINDS) {
      clock.t += 1000;
      player.play(k);
    }
    const ctx = only();
    expect(ctx.toDestination).toHaveLength(1);
    // every other node leads to the master: follow the wiring from each source
    const master = ctx.toDestination[0]!;
    // a connection to an AudioParam (the vibrato into detune) leads on through the param's node
    const owner = (p: FakeParam) => ctx.nodes.find((n) => [n.gain, n.frequency, n.detune, n.Q].includes(p));
    const reaches = (n: FakeNode | undefined, seen = new Set<FakeNode>()): boolean =>
      !!n && (n === master || (!seen.has(n) && (seen.add(n), n.connections.some((t) => reaches(t instanceof FakeParam ? owner(t) : t instanceof FakeNode ? t : undefined, seen)))));
    for (const s of ctx.sources) expect(reaches(s)).toBe(true);
  });

  test("a second play reuses the context", async () => {
    const { player, clock } = await setup({ audio: true });
    player.play("ghost");
    clock.t += 1000;
    player.play("thud");
    expect(contexts()).toHaveLength(1);
    expect(only().toDestination).toHaveLength(1);
  });

  test("two players make two contexts", async () => {
    const a = await setup({ audio: true });
    const b = await setup({ audio: true });
    a.player.play("ghost");
    b.player.play("ghost");
    expect(contexts()).toHaveLength(2);
  });

  test("a suspended context is resumed once and play stays synchronous", async () => {
    FakeAudioContext.initialState = "suspended";
    const { player } = await setup({ audio: true });
    const r = player.play("ghost") as unknown;
    expect(r).toBeUndefined();
    const ctx = only();
    expect(ctx.resumes).toBe(1);
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.sources.every((s) => s.starts.length === 1)).toBe(true);
  });

  test("toggling on alone constructs nothing", async () => {
    const { change } = await setup();
    change(true);
    await flush();
    expect(contexts()).toHaveLength(0);
  });
});

describe("voices", () => {
  test("every source stops within 1.2 seconds, for every kind", async () => {
    for (const k of SOUND_KINDS) {
      FakeAudioContext.reset();
      const { player } = await setup({ audio: true });
      player.play(k);
      const ctx = only();
      expect(ctx.sources.length).toBeGreaterThan(0);
      for (const s of ctx.sources) {
        expect({ k, starts: s.starts.length, stops: s.stops.length }).toEqual({ k, starts: 1, stops: 1 });
        expect(s.starts[0]).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(s.stops[0]! - ctx.currentTime).toBeLessThanOrEqual(MAX_SECONDS);
        expect(s.stops[0]! - ctx.currentTime).toBeLessThanOrEqual(SOUND_DURATION[k] + 1e-9);
      }
    }
  });

  test("nodes are disconnected when a source ends", async () => {
    const { player } = await setup({ audio: true });
    player.play("organ");
    const ctx = only();
    const master = ctx.toDestination[0]!;
    const voiceNodes = ctx.nodes.filter((n) => n !== master);
    expect(voiceNodes.some((n) => n.disconnected)).toBe(false);
    ctx.endAll();
    expect(voiceNodes.every((n) => n.disconnected)).toBe(true);
    expect(master.disconnected).toBe(false);
  });

  test("a fifth concurrent play does nothing", async () => {
    const { player, clock } = await setup({ audio: true });
    const kinds: SoundKind[] = ["ghost", "thud", "sting", "organ", "whoosh"];
    const counts: number[] = [];
    for (const k of kinds) {
      clock.t += 1000;
      player.play(k);
      counts.push(only().sources.length);
    }
    expect(counts[4]).toBe(counts[3]); // the fifth added no source
    // once the first sound's sources end, a voice is free again
    const ctx = only();
    for (const s of ctx.sources.slice(0, counts[0])) s.onended?.();
    clock.t += 1000;
    player.play("whoosh");
    expect(ctx.sources.length).toBeGreaterThan(counts[3]!);
  });

  test("the same kind twice within 150ms plays once", async () => {
    const { player, clock } = await setup({ audio: true });
    player.play("ghost");
    const n = only().sources.length;
    clock.t += 100;
    player.play("ghost");
    expect(only().sources.length).toBe(n);
    clock.t += 10;
    player.play("thud"); // another kind is not held back
    const m = only().sources.length;
    expect(m).toBeGreaterThan(n);
    clock.t += DEBOUNCE_MS;
    player.play("ghost");
    expect(only().sources.length).toBeGreaterThan(m);
  });

  test("a Web Audio error does not escape play", async () => {
    FakeAudioContext.failOn = "connect";
    const { player } = await setup({ audio: true });
    expect(() => player.play("ghost")).not.toThrow();
    FakeAudioContext.failOn = "createGain";
    const b = await setup({ audio: true });
    expect(() => b.player.play("thud")).not.toThrow();
    const m = createChromeMock();
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const c = createPlayer({ storage: asChrome(m).storage, createContext: () => { throw new Error("no audio"); } });
    await flush();
    expect(() => c.play("ghost")).not.toThrow();
  });
});

describe("live toggle", () => {
  test("toggle off mid-session stops sources, ramps the master to 0 and closes the context", async () => {
    const { player, change } = await setup({ audio: true });
    player.play("whoosh");
    const ctx = only();
    const master = ctx.toDestination[0]!;
    change(false);
    for (const s of ctx.sources) expect(s.stops.length).toBe(2); // the scheduled stop, then stop now
    for (const s of ctx.sources) expect(s.stops[1]).toBeLessThanOrEqual(ctx.currentTime);
    const ramp = master.gain.calls.find((c) => c[0] === "linearRampToValueAtTime");
    expect(ramp?.[1]).toBe(0);
    expect(ramp![2] - ctx.currentTime).toBeLessThanOrEqual(CLOSE_RAMP_S + 1e-9);
    expect(ctx.closes).toBe(0); // after the ramp
    await wait(CLOSE_RAMP_S * 1000 + 20);
    expect(ctx.closes).toBe(1);
  });

  test("play after toggle off constructs nothing", async () => {
    const { player, change, clock } = await setup({ audio: true });
    player.play("ghost");
    const before = only().nodes.length;
    change(false);
    clock.t += 1000;
    player.play("ghost");
    player.play("thud");
    expect(contexts()).toHaveLength(1);
    expect(only().nodes.length).toBe(before);
  });

  test("toggle on again then play creates a new context", async () => {
    const { player, change, clock } = await setup({ audio: true });
    player.play("ghost");
    change(false);
    change(true);
    expect(contexts()).toHaveLength(1);
    clock.t += 1000;
    player.play("ghost");
    expect(contexts()).toHaveLength(2);
    expect(contexts()[1]!.toDestination).toHaveLength(1);
  });

  test("toggle off with no context does nothing", async () => {
    const { change } = await setup({ audio: true });
    expect(() => change(false)).not.toThrow();
    expect(contexts()).toHaveLength(0);
  });

  test("dispose closes the context and removes the listener", async () => {
    const { player, m, change, clock } = await setup({ audio: true });
    player.play("ghost");
    player.dispose();
    expect(m.chrome.storage.onChanged.listeners).toHaveLength(0);
    await wait(CLOSE_RAMP_S * 1000 + 20);
    expect(only().closes).toBe(1);
    change(true);
    clock.t += 1000;
    player.play("ghost");
    expect(contexts()).toHaveLength(1);
  });

  test("dispose before the first read keeps it muted", async () => {
    const m = createChromeMock();
    m.chrome.storage.local.data[AUDIO_KEY] = true;
    const player = createPlayer({ storage: asChrome(m).storage, createContext });
    player.dispose();
    await flush();
    player.play("ghost");
    expect(contexts()).toHaveLength(0);
  });
});

describe("source", () => {
  const src = readFileSync(join(import.meta.dir, "..", "..", "src", "audio", "sound.ts"), "utf8");

  test("the source uses no forbidden API", () => {
    for (const bad of ["OfflineAudioContext", "startRendering", "fetch(", "XMLHttpRequest", "decodeAudioData", "getChannelData", "loop = true", "setInterval", ".src", "getImageData", "toDataURL", "toBlob", "measureText", "postMessage", "local.set", "local.remove", "executeScript"]) {
      expect({ bad, found: src.includes(bad) }).toEqual({ bad, found: false });
    }
  });

  test("the module has no top-level state that builds audio", () => {
    expect(src).not.toMatch(/^(const|let|var) \w+ = new /m);
  });
});

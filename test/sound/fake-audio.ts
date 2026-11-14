// A recording stand-in for the slice of Web Audio the sound module uses. Every context and node is kept
// so a test can read the graph back: node kinds, wiring, AudioParam calls, start and stop times.

export type ParamCall = [method: string, value: number, time: number];

export class FakeParam {
  calls: ParamCall[] = [];
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number) {
    this.calls.push(["setValueAtTime", v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["linearRampToValueAtTime", v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(["exponentialRampToValueAtTime", v, t]);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.calls.push(["cancelScheduledValues", NaN, t]);
    return this;
  }
  /** Every value this param is set or ramped to, the initial one included. */
  values() {
    return [this.value, ...this.calls.filter((c) => c[0] !== "cancelScheduledValues").map((c) => c[1])];
  }
}

export type Target = FakeNode | FakeParam | { kind: "destination" };

export class FakeNode {
  connections: Target[] = [];
  disconnected = false;
  // sources
  type = "";
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  loop = false;
  buffer: FakeBuffer | null = null;
  // params, by node kind
  gain = new FakeParam(1);
  frequency = new FakeParam(0);
  detune = new FakeParam(0);
  Q = new FakeParam(1);
  constructor(public ctx: FakeAudioContext, public kind: "gain" | "oscillator" | "bufferSource" | "biquad") {
    if (kind === "oscillator") {
      this.type = "sine";
      this.frequency = new FakeParam(440);
    }
    if (kind === "biquad") {
      this.type = "lowpass";
      this.frequency = new FakeParam(350);
    }
  }
  connect(t: Target) {
    if (this.ctx.failOn === "connect") throw new Error("fake connect failure");
    this.connections.push(t);
    return t;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(t = 0) {
    this.starts.push(t);
  }
  stop(t = this.ctx.currentTime) {
    this.stops.push(t);
  }
  get isSource() {
    return this.kind === "oscillator" || this.kind === "bufferSource";
  }
}

export class FakeBuffer {
  copied: { data: Float32Array; channel: number }[] = [];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {}
  get duration() {
    return this.length / this.sampleRate;
  }
  copyToChannel(data: Float32Array, channel: number) {
    this.copied.push({ data, channel });
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** The state a new context starts in. */
  static initialState: "running" | "suspended" = "running";
  static failOn: "" | "connect" | "createGain" = "";
  static reset() {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = "running";
    FakeAudioContext.failOn = "";
  }

  state: string = FakeAudioContext.initialState;
  failOn = FakeAudioContext.failOn;
  currentTime = 10;
  sampleRate = 48000;
  destination = { kind: "destination" as const };
  nodes: FakeNode[] = [];
  buffers: FakeBuffer[] = [];
  resumes = 0;
  closes = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  private node(kind: FakeNode["kind"]) {
    const n = new FakeNode(this, kind);
    this.nodes.push(n);
    return n;
  }
  createGain() {
    if (this.failOn === "createGain") throw new Error("fake createGain failure");
    return this.node("gain");
  }
  createOscillator() {
    return this.node("oscillator");
  }
  createBufferSource() {
    return this.node("bufferSource");
  }
  createBiquadFilter() {
    return this.node("biquad");
  }
  createBuffer(channels: number, length: number, rate: number) {
    const b = new FakeBuffer(channels, length, rate);
    this.buffers.push(b);
    return b;
  }
  resume() {
    this.resumes++;
    return new Promise<void>(() => {}); // never settles: play must not wait for it
  }
  close() {
    this.closes++;
    this.state = "closed";
    return Promise.resolve();
  }

  // ---- reading the graph back ----
  get sources() {
    return this.nodes.filter((n) => n.isSource);
  }
  /** The nodes wired straight to the destination. */
  get toDestination() {
    return this.nodes.filter((n) => n.connections.includes(this.destination));
  }
  /** Fire `ended` on every source, as the browser does once each stop time passes. */
  endAll() {
    for (const s of this.sources) s.onended?.();
  }
}

export const createContext = () => new FakeAudioContext() as unknown as AudioContext;

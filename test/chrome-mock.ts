// A minimal in-memory stand-in for the slice of chrome.* the extension uses.
// Only what the background and popup call is modelled; anything else is undefined on purpose.

type Listener = (...args: any[]) => unknown;

const event = () => {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (l: Listener) => void listeners.push(l),
    removeListener: (l: Listener) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (l: Listener) => listeners.includes(l),
  };
};

const area = () => {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys == null) return { ...data };
      if (typeof keys === "string") return keys in data ? { [keys]: data[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in data ? data[k] : d]));
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
    async remove(keys: string | string[]) {
      for (const k of [keys].flat()) delete data[k];
    },
  };
};

export type MockTab = { id: number; url?: string; active?: boolean };

export function createChromeMock(opts: { tabs?: MockTab[]; fileAccess?: boolean; grant?: boolean } = {}) {
  const tabs = new Map<number, MockTab>((opts.tabs ?? []).map((t) => [t.id, t]));
  const granted = new Set<string>();
  const calls = {
    executeScript: [] as unknown[],
    sendMessage: [] as unknown[],
    request: [] as unknown[],
    remove: [] as unknown[],
    runtimeMessages: [] as unknown[],
  };
  // declarativeNetRequest session rules, with the real API's rule: ids must be unique.
  const dnr = { rules: [] as any[], fail: false };
  const mock = {
    calls,
    dnr,
    tabsById: tabs,
    granted,
    grant: opts.grant ?? false,
    // what the content script answers to tabs.sendMessage; throw to simulate "no receiving end"
    contentReply: (_msg: unknown): unknown => ({ ok: true }),
    // what the background answers to runtime.sendMessage (popup tests set this)
    backgroundReply: async (_msg: any): Promise<unknown> => undefined,
    chrome: {
      runtime: {
        id: "test-extension-id",
        onMessage: event(),
        async sendMessage(msg: unknown) {
          calls.runtimeMessages.push(msg);
          return mock.backgroundReply(msg);
        },
      },
      storage: { session: area(), local: area(), onChanged: event() },
      declarativeNetRequest: {
        async updateSessionRules(o: { removeRuleIds?: number[]; addRules?: { id: number }[] }) {
          if (dnr.fail) throw new Error("declarativeNetRequest failed");
          const next = dnr.rules.filter((r) => !o.removeRuleIds?.includes(r.id));
          for (const r of o.addRules ?? []) {
            if (next.some((x) => x.id === r.id)) throw new Error(`Rule with id ${r.id} does not have a unique ID.`);
            next.push(structuredClone(r));
          }
          dnr.rules = next;
        },
        async getSessionRules() {
          if (dnr.fail) throw new Error("declarativeNetRequest failed");
          return structuredClone(dnr.rules);
        },
      },
      tabs: {
        onRemoved: event(),
        onUpdated: event(),
        async get(id: number) {
          const t = tabs.get(id);
          if (!t) throw new Error(`No tab with id: ${id}.`);
          return { ...t };
        },
        async query(q: { active?: boolean; currentWindow?: boolean }) {
          return [...tabs.values()].filter((t) => (q.active ? t.active : true)).map((t) => ({ ...t }));
        },
        async sendMessage(tabId: number, msg: unknown) {
          calls.sendMessage.push({ tabId, msg });
          return mock.contentReply(msg);
        },
      },
      scripting: {
        async executeScript(injection: unknown) {
          calls.executeScript.push(injection);
          return [{ result: undefined }];
        },
      },
      permissions: {
        async contains(p: { origins?: string[] }) {
          return (p.origins ?? []).every((o) => granted.has(o));
        },
        async request(p: { origins?: string[] }) {
          calls.request.push(p);
          if (mock.grant) for (const o of p.origins ?? []) granted.add(o);
          return mock.grant;
        },
        async remove(p: { origins?: string[] }) {
          calls.remove.push(p);
          for (const o of p.origins ?? []) granted.delete(o);
          return true;
        },
      },
      extension: {
        async isAllowedFileSchemeAccess() {
          return opts.fileAccess ?? false;
        },
      },
    },
  };
  return mock;
}

export type ChromeMock = ReturnType<typeof createChromeMock>;

export const asChrome = (m: ChromeMock) => m.chrome as unknown as typeof chrome;

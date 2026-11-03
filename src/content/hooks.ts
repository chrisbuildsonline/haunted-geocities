// Observe-only wrappers on the fingerprinting APIs, run in the page's MAIN world while haunted.
// The background injects this with chrome.scripting.executeScript({ world: "MAIN", func, args }),
// which serializes the function: it must stay self-contained (no imports, no outer references).
// All state lives in the closure; nothing is put on the window. Reports go out as a CustomEvent
// of type <nonce>; `<nonce>:ping` makes a second install a no-op and `<nonce>:restore` undoes it.

/** Install the wrappers. `scope` is the window; it is only a parameter so tests can hand in a fake one. */
export function installHooks(nonce: string, scope: any = globalThis): void {
  const ping = { installed: false };
  scope.dispatchEvent(new scope.CustomEvent(`${nonce}:ping`, { detail: ping }));
  if (ping.installed) return;

  type Api = "canvas" | "audio" | "fonts";
  const restores: (() => void)[] = [];
  const seen = new Set<string>();
  const textContexts = new WeakSet<object>();
  const families = new WeakMap<object, Set<string>>();
  let active = true;

  const nativeToString = Function.prototype.toString;

  // Called straight from a wrapper, so the stack is [report, wrapper, the page's caller, ...]:
  // skip those two by position (Chrome may leave the injected func's frames without a url, or
  // give them the site's), then take the first http(s) url.
  const report = (api: Api) => {
    const lines = String(new Error().stack).split("\n");
    if (!/ at |@/.test(lines[0]!)) lines.shift();
    for (const line of lines.slice(2)) {
      const m = /https?:\/\/[^\s()]+/.exec(line);
      if (!m) continue;
      const scriptUrl = m[0].replace(/(:\d+){1,2}$/, "");
      // ponytail: dedupe per api|url in the closure; a script that opens a new url per call is not capped.
      const key = `${api}|${scriptUrl}`;
      if (seen.has(key)) return;
      seen.add(key);
      scope.dispatchEvent(new scope.CustomEvent(nonce, { detail: { api, scriptUrl } }));
      return;
    }
  };

  /** Same this and args, same result, same exception; a failure of ours never reaches the page. */
  const wrap = (orig: Function, qualifies: (self: any, args: any[]) => Api | null, after?: (self: any, args: any[]) => void) => {
    const w = function (this: any, ...args: any[]) {
      if (active) {
        try {
          const api = qualifies(this, args);
          if (api) report(api);
          after?.(this, args);
        } catch {
          // observing must never break the page
        }
      }
      return Reflect.apply(orig, this, args);
    };
    Object.defineProperty(w, "name", { value: orig.name, configurable: true });
    Object.defineProperty(w, "length", { value: orig.length, configurable: true });
    Object.defineProperty(w, "toString", {
      value: function toString() {
        return nativeToString.call(orig);
      },
      configurable: true,
      writable: true,
    });
    return w;
  };

  const patch = (proto: any, key: string, make: (orig: any) => PropertyDescriptor) => {
    const original = proto && Object.getOwnPropertyDescriptor(proto, key);
    if (!original) return;
    Object.defineProperty(proto, key, make(original));
    restores.push(() => Object.defineProperty(proto, key, original));
  };
  const method = (proto: any, key: string, qualifies: Parameters<typeof wrap>[1], after?: Parameters<typeof wrap>[2]) =>
    patch(proto, key, (d) => ({ ...d, value: wrap(d.value, qualifies, after) }));

  const canvas = scope.HTMLCanvasElement?.prototype;
  const ctx2d = scope.CanvasRenderingContext2D?.prototype;
  method(canvas, "toDataURL", () => "canvas");
  method(canvas, "toBlob", () => "canvas");
  method(scope.OfflineAudioContext?.prototype, "startRendering", () => "audio");

  // Text drawn on a context marks it; reading its pixels back after that is canvas fingerprinting.
  for (const draw of ["fillText", "strokeText"]) method(ctx2d, draw, () => null, (self) => textContexts.add(self));
  method(ctx2d, "getImageData", (self) => (textContexts.has(self) ? "canvas" : null));

  // Font probing: one context cycling through 20 or more distinct families, then measuring.
  patch(ctx2d, "font", (d) => ({
    ...d,
    set: wrap(d.set, () => null, (self, [value]) => {
      const family = String(value).replace(/^.*?\d(?:px|pt|em|rem|%|ex|ch)(?:\/\S+)?\s+/i, "");
      families.set(self, (families.get(self) ?? new Set()).add(family));
    }),
  }));
  method(ctx2d, "measureText", (self) => ((families.get(self)?.size ?? 0) >= 20 ? "fonts" : null));

  const onPing = (e: Event) => {
    ((e as CustomEvent).detail as { installed: boolean }).installed = true;
  };
  const onRestore = () => {
    active = false;
    for (const undo of restores) undo();
    scope.removeEventListener(`${nonce}:ping`, onPing);
    scope.removeEventListener(`${nonce}:restore`, onRestore);
  };
  scope.addEventListener(`${nonce}:ping`, onPing);
  scope.addEventListener(`${nonce}:restore`, onRestore);
}

/** Injected on un-haunt, also self-contained. */
export function restoreHooks(nonce: string): void {
  window.dispatchEvent(new CustomEvent(`${nonce}:restore`));
}

// prefers-reduced-motion, read live through a matchMedia change listener.
export type ReducedMotion = { readonly matches: boolean; stop(): void };

export function watchReducedMotion(win: Window, onChange: (reduced: boolean) => void): ReducedMotion {
  const mql = win.matchMedia("(prefers-reduced-motion: reduce)");
  const listener = () => onChange(mql.matches);
  mql.addEventListener("change", listener);
  return {
    get matches() {
      return mql.matches;
    },
    stop: () => mql.removeEventListener("change", listener),
  };
}

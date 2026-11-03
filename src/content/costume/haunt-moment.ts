// "The Webmaster's Ghost wipe" (2500ms) and its reverse (1100ms): Web Animations on transform,
// opacity and clip-path only, all inside the shadow root. Timings from design/DESIGN.md.
import { mapToPx, svgMarkup, WEBMASTER, WEBMASTER_LEGEND } from "./art";
import { MOTION as M, PIXEL } from "./tokens";

export type Moment = { done: Promise<void>; finish(): void };

const settle = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);

const ghostSvg = () => svgMarkup(mapToPx(WEBMASTER, WEBMASTER_LEGEND, PIXEL.spriteScale), 96, 96);

function buildFx(croot: HTMLElement): HTMLElement {
  const fx = croot.ownerDocument.createElement("div");
  fx.id = "fx";
  fx.setAttribute("aria-hidden", "true");
  fx.innerHTML = `<div class="vignette"></div><div class="sweep"><div class="ectoplasm"></div><div class="webmaster">${ghostSvg()}</div></div>`;
  croot.append(fx);
  return fx;
}

const layer = (croot: HTMLElement, id: string) => croot.querySelector(`#${id}`) as HTMLElement;

/** How far the HUD must drop to leave the viewport entirely. */
function hudDrop(hud: HTMLElement): number {
  const vh = hud.ownerDocument.defaultView!.innerHeight;
  return Math.max(hud.offsetHeight, Math.ceil(vh - hud.getBoundingClientRect().top)) + 8;
}

// The reveal edge sits 16px into the ghost, so the costume appears right behind it.
const clipAt = (x: string) => `inset(0 calc(100% - ${x}) 0 0)`;

export function playHaunt(croot: HTMLElement, reduced: boolean): Moment {
  if (reduced) {
    const fade = croot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M.reducedHaunt, easing: "linear" });
    return { done: settle([fade]), finish: () => fade.finish() };
  }
  const fx = buildFx(croot);
  const vignette = fx.querySelector(".vignette") as HTMLElement;
  const hud = layer(croot, "hud");
  const anims: Animation[] = [];
  const run = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => anims.push(el.animate(kf, { fill: "backwards", ...o }));
  const wipe = { delay: 200, duration: 900, easing: M.easeInOut };

  run(vignette, [{ opacity: 0 }, { opacity: 0.4 }], { duration: 200, easing: M.easeOut });
  run(vignette, [{ opacity: 0.4 }, { opacity: 0 }], { delay: 1100, duration: 300, easing: M.easeOut, fill: "forwards" });
  run(fx.querySelector(".sweep")!, [{ transform: "translateX(-96px)" }, { transform: "translateX(100vw)" }], { ...wipe, fill: "both" });
  run(
    fx.querySelector(".webmaster")!,
    ["translateY(0px)", "translateY(-6px)", "translateY(0px)", "translateY(6px)", "translateY(0px)"].map((transform) => ({ transform, easing: "ease-in-out" })),
    { delay: 200, duration: 900 },
  );
  for (const id of ["starfield", "top-bands"]) {
    run(layer(croot, id), [{ clipPath: clipAt("-80px") }, { clipPath: clipAt("100vw - 16px") }], wipe);
  }
  run(hud, [{ transform: `translateY(${hudDrop(hud)}px)` }, { transform: "translateY(0px)" }], { delay: 1400, duration: M.slow, easing: M.easeOut });
  // Odometer: each strip rolls from 0 to its digit, the right-hand digit first, all landing at 2300ms.
  const strips = [...hud.querySelectorAll<HTMLElement>(".strip")];
  strips.forEach((s, i) => {
    const delay = 1700 + (strips.length - 1 - i) * 40;
    run(s, [{ transform: "translateY(0px)" }, { transform: s.style.transform || "translateY(0px)" }], { delay, duration: 2300 - delay, easing: M.easeOut });
  });
  run(layer(croot, "markers"), [{ opacity: 0 }, { opacity: 1 }], { delay: 2300, duration: 200, easing: "linear" });

  return { done: settle(anims).then(() => fx.remove()), finish: () => anims.forEach((a) => a.finish()) };
}

export function playUnhaunt(croot: HTMLElement, reduced: boolean): Promise<void> {
  const run = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => el.animate(kf, { fill: "forwards", ...o });
  if (reduced) return settle([run(croot, [{ opacity: 1 }, { opacity: 0 }], { duration: M.reducedUnhaunt, easing: "linear" })]);
  croot.querySelector("#fx")?.remove();
  croot.classList.add("leaving");
  const fx = buildFx(croot);
  fx.querySelector(".vignette")!.remove();
  const hud = layer(croot, "hud");
  const back = { delay: 500, duration: 600, easing: M.easeInOut };
  return settle([
    run(layer(croot, "markers"), [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear" }),
    run(layer(croot, "lanes"), [{ transform: "translateY(0px)", opacity: 1 }, { transform: "translateY(16px)", opacity: 0 }], { delay: 200, duration: 300, easing: M.easeOut }),
    run(hud, [{ transform: "translateY(0px)" }, { transform: `translateY(${hudDrop(hud)}px)` }], { delay: 300, duration: 300, easing: M.easeOut }),
    run(layer(croot, "show-tab"), [{ opacity: 1 }, { opacity: 0 }], { delay: 300, duration: 300, easing: "linear" }),
    run(fx.querySelector(".sweep")!, [{ transform: "translateX(100vw)" }, { transform: "translateX(-96px)" }], { ...back, fill: "both" }),
    ...["starfield", "top-bands"].map((id) =>
      run(layer(croot, id), [{ clipPath: clipAt("100vw + 80px") }, { clipPath: clipAt("-16px") }], back),
    ),
  ]);
}

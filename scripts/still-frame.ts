// The caption still of `bun run docs:realsite`: which filmed frame of the parade to keep. The six parade lanes
// cross the whole width, so on most frames some ghost covers the page's restyled crypt window. The still is
// the frame where none does (named or filler), with as many named ghosts wholly in the shot as such a frame
// gives, the latest of those (where the caption has come furthest).

export type Box = { left: number; top: number; right: number; bottom: number };
/** A frame with the caption in the shot: its index, the caption's mid-line, every parade ghost and every restyled panel. */
export type Frame = { k: number; mid: number; ghosts: { company?: string; box: Box }[]; panels: Box[] };

/** Room kept between a ghost and a panel: the panel's frame outside its box (16px and a 4px shadow) and the ghost's 8px glow. */
export const CLEAR = 28;

/** The two boxes come closer than `gap`. */
export const overlaps = (a: Box, b: Box, gap = 0) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

const inView = (b: Box, view: { width: number; height: number }) => b.left >= 0 && b.top >= 0 && b.right <= view.width && b.bottom <= view.height;

/** A panel this share of the shot's width or wider is a block across the page, which every lane must cross; only windows are kept clear. */
export const WINDOW_SHARE = 2 / 3;

/**
 * The still, its windows (`panels`) and the named ghosts wholly in it (`shows`); null when every frame has a
 * ghost over a window.
 */
export function pickStill(frames: Frame[], view: { width: number; height: number }): (Frame & { shows: string[] }) | null {
  const clear = frames
    .map((f) => ({ ...f, panels: f.panels.filter((p) => p.right - p.left < WINDOW_SHARE * view.width) }))
    .filter((f) => !f.ghosts.some((g) => f.panels.some((p) => overlaps(g.box, p, CLEAR))))
    .map((f) => ({ ...f, shows: f.ghosts.filter((g) => g.company && inView(g.box, view)).map((g) => g.company!) }));
  if (!clear.length) return null;
  const most = Math.max(...clear.map((f) => f.shows.length));
  return clear.filter((f) => f.shows.length === most).at(-1)!;
}

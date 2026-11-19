// Finds dark patterns on a page: fake scarcity, static countdown text, confirmshaming and
// pre-checked opt-ins. Pure and read-only: it looks at the tree, computed style and attributes,
// and never writes to the page. No Chrome API.
import type { DarkPatternKind } from "../data/types";

export interface DarkPattern {
  kind: DarkPatternKind;
  element: Element;
  /** At most 60 characters. */
  snippet: string;
}

/** A block's shown text: its own text nodes, joined, with where each one starts. */
export interface Flow {
  block: Element;
  nodes: Text[];
  starts: number[];
  text: string;
}

/** Lower number wins when two kinds mark the same element. */
export const PRECEDENCE: Record<DarkPatternKind, number> = { prechecked: 0, confirmshaming: 1, scarcity: 2, countdown: 3, timer: 4 };

const MAX_PATTERNS = 30;

/** One table drives the card, the popup rows and the aria labels. */
export const KIND_INFO: Record<DarkPatternKind, { name: string; title: string; trick: string }> = {
  scarcity: { name: "Fake scarcity", title: "Cursed: Fake scarcity", trick: "A low-stock warning makes you hurry. Many are never true." },
  countdown: { name: "Countdown", title: "Cursed: Countdown", trick: "An offer with a deadline makes you rush. The deadline often comes back." },
  timer: { name: "Ticking timer", title: "Cursed: Ticking timer", trick: "A clock counting down pushes you to decide fast. Many restart when you reload." },
  confirmshaming: { name: "Confirmshaming", title: "Cursed: Confirmshaming", trick: "The decline button is worded to make you feel bad for saying no." },
  prechecked: { name: "Pre-checked opt-in", title: "Cursed: Pre-checked opt-in", trick: "The box was ticked for you, so doing nothing signs you up." },
};

const SCARCITY = [
  /\b(?:only|just)\s+\d{1,4}\s+(?:(?:items?|units?|rooms?|seats?|tickets?|pieces?|spots?|copies|pairs?)\s+)?(?:left|remaining|available|in\s+stock)\b/i,
  /\b\d{1,4}\s+(?:people|others|shoppers|customers)\s+(?:are\s+)?(?:viewing|looking|watching)\b/i,
  /\b(?:low\s+stock|selling\s+fast|almost\s+(?:gone|sold\s+out))\b/i,
];

const COUNTDOWN = [
  /\b(?:offer|sale|deal|discount|price|promo)s?\s+(?:ends?|expires?)\s+(?:in|on|at|soon|today|tonight)\b/i,
  /\b(?:ends?|expires?)\s+in\s+\d{1,3}\s*(?:d|h|m|s|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i,
  /\blimited(?:\s+|-)time\s+(?:offer|deal)\b/i,
  /\b\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?)\s+(?:left|remaining)\b/i,
];

/** A clock-shaped value; the watcher reports it only when it ticks. */
export const CLOCK = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:\d{1,2}\s*d\s*)?\d{1,2}\s*h\s*\d{1,2}\s*m(?:\s*\d{1,2}\s*s)?\b/i;

const OPT_IN_WORDS = /\b(?:newsletters?|offers?|marketing|partners?|e-?mails?|subscribe|coupons)\b/i;

const LEAD = String.raw`(?:no|nope|not\s+now|maybe\s+later|skip)`;
const THANKS = String.raw`(?:(?:no\s+)?thanks?|thank\s+you)?`;
const SEP = String.raw`[\s,.!:;–—-]*`;
const I = String.raw`(?:i|we)(?:['’](?:ll|m|d)|\b)`;
const SHAME =
  "(?:" +
  [
    String.raw`hate\s+(?:saving|savings?|deals?|discounts?|free|bargains?|money|being|getting)`,
    String.raw`(?:like|love|enjoy)\s+(?:paying|missing|losing|wasting|being\s+(?:broke|bored|unhealthy))`,
    String.raw`prefer\s+(?:paying|to\s+pay|full|missing|losing|wasting)`,
    String.raw`(?:pay|paying)\s+(?:full|more|extra)`,
    String.raw`full\s+price`,
    String.raw`rather\s+(?:pay|miss|lose|waste|stay)`,
    String.raw`miss(?:ing)?\s+out`,
    String.raw`(?:don['’]t|do\s+not)\s+(?:like|want|need)\s+(?:to\s+save|saving|deals?|discounts?|savings?|free|bargains?|money)`,
    String.raw`stay\s+(?:broke|uninformed|ignorant)`,
    String.raw`stay\s+in\s+the\s+dark`,
  ].join("|") +
  ")";
const CONFIRM = new RegExp(`^${LEAD}\\b${SEP}${THANKS}${SEP}${I}[^.!?]*?\\b${SHAME}\\b`, "i");

const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head"]);
const BLOCK_TAGS = new Set(
  "address article aside blockquote body caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup legend li main nav ol p pre section summary table tbody td tfoot th thead tr ul label".split(" "),
);

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function snippet(text: string, from: number): string {
  const t = text.slice(from);
  return t.length <= 60 ? t : t.slice(0, 59) + "…";
}

const styleOf = (el: Element) => el.ownerDocument.defaultView!.getComputedStyle(el);

/** True when the element and its whole subtree are ignored. */
function pruned(el: Element, costumeHost: string): boolean {
  const tag = el.tagName.toLowerCase();
  return (
    SKIP_TAGS.has(tag) ||
    tag === costumeHost.toLowerCase() ||
    el.hasAttribute("hidden") ||
    el.getAttribute("aria-hidden") === "true" ||
    (tag === "input" && el.getAttribute("type")?.toLowerCase() === "hidden") ||
    styleOf(el).display === "none"
  );
}

/** True when the element is, or sits inside, a pruned node. */
export function inSkipped(el: Element, costumeHost: string): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) if (pruned(e, costumeHost)) return true;
  return false;
}

const invisible = (el: Element | null) => {
  const v = el ? styleOf(el).visibility : "";
  return v === "hidden" || v === "collapse";
};

/** Visits the shown text nodes under `root` and each <br> in document order, skipping pruned subtrees. */
function walk(root: Node, costumeHost: string, visit: (n: Text | Element) => void) {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 1 | 4, {
    acceptNode(n: Node) {
      if (n.nodeType === 1) {
        const el = n as Element;
        if (pruned(el, costumeHost)) return 2; // FILTER_REJECT
        return el.tagName === "BR" ? 1 : 3; // ACCEPT a <br>, SKIP (but descend) the rest
      }
      return invisible((n as Text).parentElement) ? 3 : 1;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) visit(n as Text | Element);
}

/** The closest ancestor-or-self block element, or <body>. */
export function blockOf(node: Node): Element {
  for (let e: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement; e; e = e.parentElement) {
    if (BLOCK_TAGS.has(e.tagName.toLowerCase())) return e;
  }
  return node.ownerDocument!.body;
}

function flowsOf(root: Node, costumeHost: string): Map<Element, Flow> {
  const flows = new Map<Element, Flow>();
  const flowFor = (block: Element) => {
    let f = flows.get(block);
    if (!f) flows.set(block, (f = { block, nodes: [], starts: [], text: "" }));
    return f;
  };
  walk(root, costumeHost, (n) => {
    const f = flowFor(blockOf(n));
    if (n.nodeType === 1) {
      f.text += " "; // a <br> between nodes is one space
    } else {
      f.nodes.push(n as Text);
      f.starts.push(f.text.length);
      f.text += (n as Text).data;
    }
  });
  return flows;
}

/** A block's shown text. */
export function flowOf(block: Element, costumeHost: string): Flow {
  return flowsOf(block, costumeHost).get(block) ?? { block, nodes: [], starts: [], text: "" };
}

function nodeAt(flow: Flow, index: number): Text {
  let i = flow.starts.length - 1;
  while (i > 0 && flow.starts[i]! > index) i--;
  return flow.nodes[i]!;
}

/** The first match of `re` in the flow, on the smallest element that holds all of it (never above the block). */
export function locate(flow: Flow, re: RegExp): { element: Element; text: string; index: number } | null {
  const m = re.exec(flow.text);
  if (!m) return null;
  const first = nodeAt(flow, m.index);
  const last = nodeAt(flow, m.index + m[0].length - 1);
  const chain = new Set<Element>();
  for (let e: Element | null = first.parentElement; e; e = e.parentElement) {
    chain.add(e);
    if (e === flow.block) break;
  }
  let b: Element = last.parentElement!;
  while (!chain.has(b)) b = b.parentElement!;
  return { element: b, text: m[0], index: m.index };
}

function shownText(el: Element): string {
  let text = "";
  walk(el, "", (n) => (text += n.nodeType === 1 ? " " : (n as Text).data));
  return text;
}

/** The element's collapsed shown text; when it has to be cut at 60 characters, the cut starts at the match. */
export function snippetOf(element: Element, re: RegExp): string {
  const text = collapse(shownText(element));
  return text.length <= 60 ? text : snippet(text, re.exec(text)?.index ?? 0);
}

const byDocumentOrder = (a: DarkPattern, b: DarkPattern) => (a.element === b.element ? 0 : a.element.compareDocumentPosition(b.element) & 4 ? -1 : 1);

/** Keep one pattern per element (lowest PRECEDENCE number), in document order, at most 30. */
function settle(patterns: Iterable<DarkPattern>): DarkPattern[] {
  const byElement = new Map<Element, DarkPattern>();
  for (const p of patterns) {
    const old = byElement.get(p.element);
    if (!old || PRECEDENCE[p.kind] < PRECEDENCE[old.kind]) byElement.set(p.element, p);
  }
  return [...byElement.values()].sort(byDocumentOrder).slice(0, MAX_PATTERNS);
}

export function detectDarkPatterns(root: Document | Element, costumeHost: string): DarkPattern[] {
  const doc = root.ownerDocument ?? (root as Document);
  const found: DarkPattern[] = [];

  for (const input of root.querySelectorAll('input[type="checkbox"]')) {
    if (!input.hasAttribute("checked") || inSkipped(input, costumeHost)) continue;
    const label = input.closest("label") ?? [...doc.querySelectorAll("label[for]")].find((l) => (l as HTMLLabelElement).htmlFor === (input as HTMLInputElement).id && !inSkipped(l, costumeHost));
    const text = collapse(label?.textContent ?? input.getAttribute("aria-label") ?? "");
    if (OPT_IN_WORDS.test(text)) found.push({ kind: "prechecked", element: label ?? input, snippet: snippet(text, 0) });
  }

  for (const c of root.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]')) {
    if (inSkipped(c, costumeHost)) continue;
    const text = collapse(c.tagName === "INPUT" ? (c.getAttribute("value") ?? "") : (c.textContent ?? ""));
    if (text.length <= 80 && CONFIRM.test(text)) found.push({ kind: "confirmshaming", element: c, snippet: snippet(text, 0) });
  }

  for (const flow of flowsOf(root, costumeHost).values()) {
    for (const [kind, patterns] of [["scarcity", SCARCITY], ["countdown", COUNTDOWN]] as const) {
      for (const re of patterns) {
        const hit = locate(flow, re);
        if (!hit) continue;
        found.push({ kind, element: hit.element, snippet: snippetOf(hit.element, re) });
        break;
      }
    }
  }

  return settle(found);
}

/** Static patterns plus the timers the watcher saw: a timer replaces a countdown on the same, an outer or an inner element. */
export function mergeCurses(statics: readonly DarkPattern[], timers: readonly DarkPattern[]): DarkPattern[] {
  const kept = statics.filter((s) => s.kind !== "countdown" || !timers.some((t) => t.element === s.element || s.element.contains(t.element) || t.element.contains(s.element)));
  return settle([...kept, ...timers]);
}
